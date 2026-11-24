import React, { useState } from 'react';
import { doc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { CheckCircle2, Clock, Layers, TrendingUp } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatBDT, generateId, logActivity } from '../lib/seedAndHelpers';
import { PackageItem, UserPackage, UserProfile } from '../types';

interface PackagesTabProps {
  user: UserProfile;
  packages: PackageItem[];
  userPackages: UserPackage[];
  onNavigateWallet: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const PackagesTab: React.FC<PackagesTabProps> = ({
  user,
  packages,
  userPackages,
  onNavigateWallet,
  onNotify,
}) => {
  const [buyingId, setBuyingId] = useState<string | null>(null);

  const handleBuyPackage = async (pkg: PackageItem) => {
    if (buyingId) return;
    if (user.balance < pkg.price) {
      onNotify(
        `আপনার ব্যালেন্স পর্যাপ্ত নয় (${formatBDT(user.balance)})। অনুগ্রহ করে ডিপোজিট করুন।`,
        'error'
      );
      onNavigateWallet();
      return;
    }

    setBuyingId(pkg.id);
    const upId = generateId('up');
    const txId = generateId('tx');
    const now = Date.now();
    const nextClaimDate = new Date(now + 24 * 60 * 60 * 1000);
    const expiresDate = new Date(now + pkg.durationDays * 24 * 60 * 60 * 1000);

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), {
        balance: user.balance - pkg.price,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'userPackages', upId), {
        id: upId,
        userId: user.uid,
        packageId: pkg.id,
        packageName: pkg.name,
        price: pkg.price,
        dailyIncome: pkg.dailyIncome,
        durationDays: pkg.durationDays,
        daysClaimed: 0,
        purchasedAt: serverTimestamp(),
        lastClaimedAt: serverTimestamp(),
        nextClaimAt: Timestamp.fromDate(nextClaimDate),
        expiresAt: Timestamp.fromDate(expiresDate),
        status: 'active',
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'transactions', txId), {
        id: txId,
        userId: user.uid,
        userName: user.fullName,
        userPhone: user.phone || user.email,
        type: 'package_buy',
        amount: pkg.price,
        bonusAmount: 0,
        method: 'wallet',
        senderNumber: '',
        receiverNumber: '',
        trxId: '',
        status: 'completed',
        adminNote: `${pkg.name} ক্রয়`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      void logActivity({
        userId: user.uid,
        userLabel: user.fullName,
        action: 'package_purchase',
        details: `${pkg.name} (${formatBDT(pkg.price)}) প্যাকেজ কেনা হয়েছে`,
      });
      onNotify(`${pkg.name} সফলভাবে সক্রিয় হয়েছে! ২৪ ঘণ্টা পর প্রথম ডেইলি ক্লেইম করতে পারবেন।`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `userPackages/${upId}`);
    } finally {
      setBuyingId(null);
    }
  };

  const activePackages = packages.filter((p) => p.active);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">স্মার্ট ইনকাম প্যাকেজসমূহ</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            বর্তমান ব্যালেন্স: <strong className="text-amber-400 font-mono-num">{formatBDT(user.balance)}</strong>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {activePackages.map((pkg) => {
          const totalReturn = pkg.dailyIncome * pkg.durationDays;
          const activeCount = userPackages.filter(
            (up) => up.packageId === pkg.id && up.status === 'active'
          ).length;

          return (
            <div
              key={pkg.id}
              className="glass-surface rounded-3xl overflow-hidden flex flex-col justify-between border border-slate-800/90"
            >
              <div>
                <div className="relative aspect-[4/3] bg-slate-900 overflow-hidden">
                  <img
                    src={pkg.imageUrl}
                    alt={pkg.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-300">{pkg.badgeLabel}</span>
                    {activeCount > 0 && (
                      <span className="text-[11px] text-emerald-300 font-semibold">
                        সক্রিয়: {activeCount}টি
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{pkg.name}</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{pkg.description}</p>
                  </div>

                  <div className="space-y-2 text-xs pt-3 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">প্যাকেজ মূল্য</span>
                      <span className="font-bold text-white font-mono-num text-sm">
                        {formatBDT(pkg.price)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        দৈনিক আয়
                      </span>
                      <span className="font-bold text-emerald-400 font-mono-num text-sm">
                        {formatBDT(pkg.dailyIncome)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        মেয়াদ
                      </span>
                      <span className="font-semibold text-slate-200 font-mono-num">
                        {pkg.durationDays} দিন
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/70">
                      <span className="text-slate-400">মোট সম্ভাব্য রিটার্ন</span>
                      <span className="font-bold text-amber-300 font-mono-num">
                        {formatBDT(totalReturn)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 pt-0">
                <button
                  type="button"
                  disabled={buyingId === pkg.id}
                  onClick={() => void handleBuyPackage(pkg)}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 hover:brightness-105 transition-all disabled:opacity-50"
                >
                  <Layers className="w-4 h-4" />
                  {buyingId === pkg.id ? 'ক্রয় হচ্ছে...' : `এখনই কিনুন (${formatBDT(pkg.price)})`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Completed / Past Packages Summary */}
      {userPackages.some((up) => up.status === 'completed') && (
        <div className="glass-surface rounded-3xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">সম্পন্ন হওয়া প্যাকেজসমূহ</h3>
          <div className="divide-y divide-slate-800">
            {userPackages
              .filter((up) => up.status === 'completed')
              .map((up) => (
                <div key={up.id} className="py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-white font-medium">{up.packageName}</span>
                  </div>
                  <span className="text-slate-400 font-mono-num">
                    মোট ক্লেইম: {up.daysClaimed}/{up.durationDays} দিন
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
