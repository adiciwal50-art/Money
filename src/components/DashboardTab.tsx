import React, { useEffect, useState } from 'react';
import { serverTimestamp, Timestamp, writeBatch, doc } from 'firebase/firestore';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Facebook,
  Gift,
  Layers,
  Share2,
  Smartphone,
  Sparkles,
  MessageSquare,
  Youtube,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatBDT, generateId, logActivity } from '../lib/seedAndHelpers';
import { CmsSettings, UserPackage, UserProfile } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface DashboardTabProps {
  user: UserProfile;
  cms: CmsSettings;
  userPackages: UserPackage[];
  onNavigateTab: (tab: 'dashboard' | 'packages' | 'wallet' | 'profile' | 'support') => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return '00:00:00';
  const totalSec = Math.floor(msRemaining / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  user,
  cms,
  userPackages,
  onNavigateTab,
  onNotify,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [claimingWelcome, setClaimingWelcome] = useState(false);
  const [claimingPkgId, setClaimingPkgId] = useState<string | null>(null);
  const [offerModalOpen, setOfferModalOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Show dynamic CMS offer modal gently after 10s dwell if active & not dismissed in session
  useEffect(() => {
    if (!cms.offerActive) return;
    const key = `offer_dismissed_${cms.offerTitle}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      // Ignore storage restrictions
    }
    const timer = setTimeout(() => {
      setOfferModalOpen(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, [cms.offerActive, cms.offerTitle]);

  const dismissOfferModal = () => {
    try {
      sessionStorage.setItem(`offer_dismissed_${cms.offerTitle}`, '1');
    } catch {
      // Ignore storage restrictions
    }
    setOfferModalOpen(false);
  };

  const handleClaimWelcomeBonus = async () => {
    if (user.welcomeBonusClaimed || claimingWelcome) return;
    setClaimingWelcome(true);
    const bonus = Number(cms.welcomeBonus) || 50;
    const txId = generateId('tx');

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), {
        welcomeBonusClaimed: true,
        balance: user.balance + bonus,
        totalEarned: user.totalEarned + bonus,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'transactions', txId), {
        id: txId,
        userId: user.uid,
        userName: user.fullName,
        userPhone: user.phone || user.email,
        type: 'welcome_bonus',
        amount: bonus,
        bonusAmount: 0,
        method: 'system',
        senderNumber: '',
        receiverNumber: '',
        trxId: '',
        status: 'completed',
        adminNote: 'ওয়েলকাম বোনাস ক্লেইম',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      void logActivity({
        userId: user.uid,
        userLabel: user.fullName,
        action: 'welcome_bonus_claimed',
        details: `${formatBDT(bonus)} ওয়েলকাম বোনাস ক্লেইম করা হয়েছে`,
      });
      onNotify(`${formatBDT(bonus)} ওয়েলকাম বোনাস আপনার ব্যালেন্সে যুক্ত হয়েছে!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setClaimingWelcome(false);
    }
  };

  const handleDailyClaim = async (up: UserPackage) => {
    if (!cms.dailyClaimEnabled) {
      onNotify('ডেইলি ক্লেইম সিস্টেম বর্তমানে অ্যাডমিন কর্তৃক সাময়িকভাবে বন্ধ রয়েছে।', 'error');
      return;
    }
    if (claimingPkgId) return;
    const nextClaimMs = up.nextClaimAt ? up.nextClaimAt.toMillis() : 0;
    if (nextClaimMs > nowMs) {
      onNotify('২৪ ঘণ্টার সময় পূর্ণ হলে ডেইলি ক্লেইম করতে পারবেন।', 'error');
      return;
    }

    setClaimingPkgId(up.id);
    const txId = generateId('tx');
    const nextClaimDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const nextDays = up.daysClaimed + 1;
    const isCompleted = nextDays >= up.durationDays;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'userPackages', up.id), {
        daysClaimed: nextDays,
        lastClaimedAt: serverTimestamp(),
        nextClaimAt: Timestamp.fromDate(nextClaimDate),
        status: isCompleted ? 'completed' : 'active',
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', user.uid), {
        balance: user.balance + up.dailyIncome,
        totalEarned: user.totalEarned + up.dailyIncome,
        lastClaimPkgId: up.id,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'transactions', txId), {
        id: txId,
        userId: user.uid,
        userName: user.fullName,
        userPhone: user.phone || user.email,
        type: 'daily_claim',
        amount: up.dailyIncome,
        bonusAmount: 0,
        method: 'system',
        senderNumber: '',
        receiverNumber: '',
        trxId: '',
        status: 'completed',
        adminNote: `${up.packageName} - দিন ${nextDays}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      void logActivity({
        userId: user.uid,
        userLabel: user.fullName,
        action: 'daily_claim',
        details: `${up.packageName} থেকে ${formatBDT(up.dailyIncome)} ডেইলি ক্লেইম সম্পন্ন`,
      });
      onNotify(`${formatBDT(up.dailyIncome)} দৈনিক আয় ব্যালেন্সে যোগ হয়েছে!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `userPackages/${up.id}`);
    } finally {
      setClaimingPkgId(null);
    }
  };

  const activePackages = userPackages.filter((p) => p.status === 'active');

  return (
    <div className="space-y-6">
      {/* Live Notice Bar */}
      {cms.noticeText && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs sm:text-sm text-amber-100 leading-relaxed">{cms.noticeText}</p>
        </div>
      )}

      {/* Welcome Bonus Claim Card */}
      {cms.welcomeBonusEnabled && !user.welcomeBonusClaimed && (
        <div className="glass-gold rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/25 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
              <Gift className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">
                {formatBDT(cms.welcomeBonus)} ওয়েলকাম বোনাস অপেক্ষা করছে!
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                নতুন মেম্বার হিসেবে এক ক্লিকেই আপনার মূল ওয়ালেট ব্যালেন্সে {formatBDT(cms.welcomeBonus)} যোগ করে নিন।
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={claimingWelcome}
            onClick={() => void handleClaimWelcomeBonus()}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold text-sm hover:brightness-105 transition-all whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {claimingWelcome ? 'যোগ হচ্ছে...' : `${formatBDT(cms.welcomeBonus)} বোনাস ক্লেইম করুন`}
          </button>
        </div>
      )}

      {/* Wallet Hero Card + Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 glass-gold rounded-3xl p-6 flex flex-col justify-between gap-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-amber-200/80">মোট ব্যবহারযোগ্য ব্যালেন্স</p>
              <p className="text-3xl sm:text-4xl font-bold text-white font-mono-num mt-1">
                {formatBDT(user.balance)}
              </p>
              {user.heldBalance > 0 && (
                <p className="text-xs text-amber-300 mt-1 font-mono-num">
                  উইথড্র হোল্ড ব্যালেন্স: {formatBDT(user.heldBalance)}
                </p>
              )}
            </div>
            <div className="text-right text-xs text-slate-300">
              <span className="block text-slate-400">কেওয়াইসি (KYC)</span>
              <span
                className={`font-semibold ${
                  user.kycStatus === 'verified'
                    ? 'text-emerald-400'
                    : user.kycStatus === 'pending'
                      ? 'text-amber-400'
                      : user.kycStatus === 'rejected'
                        ? 'text-rose-400'
                        : 'text-slate-300'
                }`}
              >
                {user.kycStatus === 'verified'
                  ? 'ভেরিফায়েড'
                  : user.kycStatus === 'pending'
                    ? 'যাচাই চলছে'
                    : user.kycStatus === 'rejected'
                      ? 'বাতিল হয়েছে'
                      : 'ভেরিফায়েড নয়'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => onNavigateTab('wallet')}
              className="min-h-[48px] rounded-2xl bg-amber-500 text-slate-950 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:bg-amber-400 transition-colors"
            >
              <ArrowDownLeft className="w-4 h-4" />
              ডিপোজিট
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('wallet')}
              className="min-h-[48px] rounded-2xl bg-slate-900/90 border border-slate-700 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:border-slate-500 transition-colors"
            >
              <ArrowUpRight className="w-4 h-4" />
              উইথড্র
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('profile')}
              className="min-h-[48px] rounded-2xl bg-slate-900/90 border border-slate-700 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:border-slate-500 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              রেফার
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 grid grid-cols-2 gap-4">
          <div className="glass-surface rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-xs text-slate-400">মোট আয়</span>
            <span className="text-xl font-bold text-emerald-400 font-mono-num">
              {formatBDT(user.totalEarned)}
            </span>
          </div>
          <div className="glass-surface rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-xs text-slate-400">সক্রিয় প্যাকেজ</span>
            <span className="text-xl font-bold text-white font-mono-num">
              {activePackages.length} টি
            </span>
          </div>
          <div className="glass-surface rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-xs text-slate-400">মোট ডিপোজিট</span>
            <span className="text-xl font-bold text-white font-mono-num">
              {formatBDT(user.totalDeposited)}
            </span>
          </div>
          <div className="glass-surface rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-xs text-slate-400">মোট উত্তোলন</span>
            <span className="text-xl font-bold text-white font-mono-num">
              {formatBDT(user.totalWithdrawn)}
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Featured Offer Banner */}
      {cms.offerActive && (
        <div className="relative rounded-3xl overflow-hidden border border-amber-500/30 bg-slate-900">
          <div className="grid grid-cols-1 md:grid-cols-12 items-stretch">
            <div className="md:col-span-5 aspect-[16/9] md:aspect-auto bg-slate-950 overflow-hidden">
              <img
                src={cms.offerImageUrl}
                alt={cms.offerTitle}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="md:col-span-7 p-5 sm:p-6 flex flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-amber-400">বিশেষ অফার</p>
                <h3 className="text-lg sm:text-xl font-bold text-white">{cms.offerTitle}</h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {cms.offerDescription}
                </p>
              </div>
              <div>
                {cms.offerLink && /^https?:\/\//i.test(cms.offerLink.trim()) ? (
                  <a
                    href={cms.offerLink.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs sm:text-sm font-bold hover:bg-amber-400 transition-colors"
                  >
                    {cms.offerCtaText || 'অফার গ্রহণ করুন'}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const target = cms.offerLink?.trim();
                      if (
                        target === 'packages' ||
                        target === 'wallet' ||
                        target === 'profile' ||
                        target === 'support' ||
                        target === 'dashboard'
                      ) {
                        onNavigateTab(target);
                      } else {
                        onNavigateTab('wallet');
                      }
                    }}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs sm:text-sm font-bold hover:bg-amber-400 transition-colors"
                  >
                    {cms.offerCtaText || 'অফার গ্রহণ করুন'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Packages & 24-Hour Daily Claim */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">আপনার সক্রিয় প্যাকেজ ও ডেইলি ক্লেইম</h2>
            <p className="text-xs text-slate-400">প্রতি ২৪ ঘণ্টা পরপর দৈনিক আয় ক্লেইম করুন</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('packages')}
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 whitespace-nowrap"
          >
            সব প্যাকেজ দেখুন
          </button>
        </div>

        {activePackages.length === 0 ? (
          <div className="glass-surface rounded-3xl p-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-amber-400">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white">এখনো কোনো প্যাকেজ সক্রিয় নেই</h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              প্যাকেজ সেকশন থেকে ৪৯৯ টাকা বা আপনার পছন্দের যেকোনো প্যাকেজ কিনে দৈনিক আয় শুরু করুন।
            </p>
            <button
              type="button"
              onClick={() => onNavigateTab('packages')}
              className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-sm font-bold hover:bg-amber-400 transition-colors"
            >
              প্যাকেজ কিনুন
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePackages.map((up) => {
              const nextClaimMs = up.nextClaimAt ? up.nextClaimAt.toMillis() : 0;
              const remainingMs = Math.max(0, nextClaimMs - nowMs);
              const readyToClaim = remainingMs === 0;
              const progressPct = Math.min(100, Math.round((up.daysClaimed / up.durationDays) * 100));
              const daysLeft = Math.max(0, up.durationDays - up.daysClaimed);

              return (
                <div key={up.id} className="glass-surface rounded-3xl p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-white">{up.packageName}</h3>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono-num">
                        দৈনিক আয়: <strong className="text-emerald-400">{formatBDT(up.dailyIncome)}</strong> · বাকি {daysLeft} দিন
                      </p>
                    </div>
                    <span className="text-xs font-mono-num text-amber-300">
                      {up.daysClaimed} / {up.durationDays} দিন
                    </span>
                  </div>

                  {/* Validity Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>মেয়াদ অগ্রগতি</span>
                      <span className="font-mono-num">{progressPct}%</span>
                    </div>
                  </div>

                  {/* 24-Hour Countdown & Claim CTA */}
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Clock className="w-4 h-4 text-amber-400" />
                      {readyToClaim ? (
                        <span className="text-emerald-400 font-semibold">ক্লেইমের জন্য প্রস্তুত</span>
                      ) : (
                        <span className="font-mono-num">পরবর্তী ক্লেইম: {formatCountdown(remainingMs)}</span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={!readyToClaim || claimingPkgId === up.id}
                      onClick={() => void handleDailyClaim(up)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                        readyToClaim
                          ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                          : 'bg-slate-800 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {claimingPkgId === up.id
                        ? 'যোগ হচ্ছে...'
                        : `ডেইলি ক্লেইম (+${formatBDT(up.dailyIncome)})`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Mobile App Download / PWA Install Card */}
      {cms.showAppInstallCard && (
        <section className="glass-surface rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-amber-500/25">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {cms.brandName} মোবাইল অ্যাপ ডাউনলোড করুন
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                আমাদের ওয়েবসাইটটি সরাসরি আপনার Android বা iPhone মোবাইলে অ্যাপ হিসেবে ডাউনলোড করে দ্রুত ব্যবহার করুন।
              </p>
            </div>
          </div>
          <PWAInstallButton userId={user.uid} />
        </section>
      )}

      {/* YouTube, Facebook Guide & Live Support */}
      {cms.showTutorialsSection && (
        <section className="glass-surface rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white">কীভাবে কাজ করবেন তা শিখুন ও সহায়তা নিন</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              ইউটিউব ভিডিও, ফেসবুক গাইডলাইন বা সরাসরি লাইভ সাপোর্ট চ্যাট ব্যবহার করুন
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigateTab('support')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-semibold hover:bg-amber-500/25 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              লাইভ সাপোর্ট
            </button>
            {cms.youtubeUrl.trim() && (
              <a
                href={cms.youtubeUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/25 transition-colors"
              >
                <Youtube className="w-4 h-4" />
                YouTube
              </a>
            )}
            {cms.facebookUrl.trim() && (
              <a
                href={cms.facebookUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-semibold hover:bg-blue-500/25 transition-colors"
              >
                <Facebook className="w-4 h-4" />
                Facebook
              </a>
            )}
          </div>
        </section>
      )}

      {/* Dynamic Offer Popup Modal (triggered after 10s dwell) */}
      {offerModalOpen && cms.offerActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="glass-surface max-w-md w-full rounded-3xl overflow-hidden border border-amber-500/35 shadow-2xl">
            <div className="relative aspect-[16/9] bg-slate-950">
              <img
                src={cms.offerImageUrl}
                alt={cms.offerTitle}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={dismissOfferModal}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                aria-label="অফার বন্ধ করুন"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <h3 className="text-xl font-bold text-white">{cms.offerTitle}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{cms.offerDescription}</p>
              <div className="flex items-center gap-3">
                {cms.offerLink && /^https?:\/\//i.test(cms.offerLink.trim()) ? (
                  <a
                    href={cms.offerLink.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={dismissOfferModal}
                    className="flex-1 h-11 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm flex items-center justify-center hover:bg-amber-400 transition-colors"
                  >
                    {cms.offerCtaText || 'ডিপোজিট করুন'}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      dismissOfferModal();
                      const target = cms.offerLink?.trim();
                      if (
                        target === 'packages' ||
                        target === 'wallet' ||
                        target === 'profile' ||
                        target === 'support' ||
                        target === 'dashboard'
                      ) {
                        onNavigateTab(target);
                      } else {
                        onNavigateTab('wallet');
                      }
                    }}
                    className="flex-1 h-11 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-colors"
                  >
                    {cms.offerCtaText || 'ডিপোজিট করুন'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismissOfferModal}
                  className="px-4 h-11 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium hover:text-white"
                >
                  পরে দেখব
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
