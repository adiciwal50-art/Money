import React, { useState } from 'react';
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { ArrowDownLeft, ArrowUpRight, History, Wallet } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatBDT, generateId, logActivity } from '../lib/seedAndHelpers';
import { CmsSettings, TransactionRecord, UserProfile } from '../types';
import { BkashLogo, NagadLogo } from './BrandLogos';
import { PaymentGatewayModal } from './PaymentGatewayModal';

interface WalletTabProps {
  user: UserProfile;
  cms: CmsSettings;
  transactions: TransactionRecord[];
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const WalletTab: React.FC<WalletTabProps> = ({
  user,
  cms,
  transactions,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');
  const [depositAmount, setDepositAmount] = useState('500');
  const [gatewayOpen, setGatewayOpen] = useState(false);

  const [withdrawMethod, setWithdrawMethod] = useState<'bkash' | 'nagad'>(
    cms.bkashEnabled ? 'bkash' : 'nagad'
  );
  const [withdrawNumber, setWithdrawNumber] = useState(user.phone || '');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'deposit' | 'withdraw' | 'bonus'>('all');

  const parsedDeposit = Number(depositAmount) || 0;
  const depositBonus = Math.round((parsedDeposit * (cms.depositBonusPercent || 0)) / 100);

  const handleOpenGateway = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cms.depositsEnabled) {
      onNotify('ডিপোজিট সিস্টেম সাময়িকভাবে বন্ধ রয়েছে।', 'error');
      return;
    }
    if (parsedDeposit < cms.minDeposit) {
      onNotify(`ন্যূনতম ডিপোজিট ${formatBDT(cms.minDeposit)}।`, 'error');
      return;
    }
    setGatewayOpen(true);
  };

  const handleSubmitDeposit = async (payload: {
    method: 'bkash' | 'nagad';
    senderNumber: string;
    trxId: string;
    amount: number;
    bonusAmount: number;
  }) => {
    const txId = generateId('dep');
    const receiverNumber =
      payload.method === 'bkash'
        ? cms.bkashNumber?.trim() || cms.paymentNumber
        : cms.nagadNumber?.trim() || cms.paymentNumber;

    try {
      await setDoc(doc(db, 'transactions', txId), {
        id: txId,
        userId: user.uid,
        userName: user.fullName,
        userPhone: user.phone || user.email,
        type: 'deposit',
        amount: payload.amount,
        bonusAmount: payload.bonusAmount,
        method: payload.method,
        senderNumber: payload.senderNumber,
        receiverNumber,
        trxId: payload.trxId,
        status: 'pending',
        adminNote: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      void logActivity({
        userId: user.uid,
        userLabel: user.fullName,
        action: 'deposit_request',
        details: `${payload.method.toUpperCase()} মাধ্যমে ${formatBDT(payload.amount)} ডিপোজিট রিকোয়েস্ট (TrxID: ${payload.trxId})`,
      });
      onNotify('ডিপোজিট রিকোয়েস্ট পাঠানো হয়েছে! অ্যাডমিন যাচাই করে ব্যালেন্স যুক্ত করবেন।');
      setSubTab('history');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `transactions/${txId}`);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cms.withdrawsEnabled) {
      onNotify('উত্তোলন সিস্টেম সাময়িকভাবে বন্ধ রয়েছে।', 'error');
      return;
    }
    if (cms.kycRequiredForWithdraw && user.kycStatus !== 'verified') {
      onNotify('টাকা উত্তোলনের আগে প্রোফাইল থেকে KYC ভেরিফিকেশন সম্পন্ন করুন।', 'error');
      return;
    }
    const amount = Number(withdrawAmount) || 0;
    const cleanPhone = withdrawNumber.trim();
    if (!/^01[3-9]\d{8}$/.test(cleanPhone)) {
      onNotify('সঠিক ১১ সংখ্যার বিকাশ/নগদ নম্বর দিন।', 'error');
      return;
    }
    if (amount < cms.minWithdraw) {
      onNotify(`ন্যূনতম উত্তোলন ${formatBDT(cms.minWithdraw)}।`, 'error');
      return;
    }
    if (amount > user.balance) {
      onNotify('আপনার অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই।', 'error');
      return;
    }

    setSubmittingWithdraw(true);
    const txId = generateId('wd');
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), {
        balance: user.balance - amount,
        heldBalance: user.heldBalance + amount,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'transactions', txId), {
        id: txId,
        userId: user.uid,
        userName: user.fullName,
        userPhone: user.phone || user.email,
        type: 'withdraw',
        amount,
        bonusAmount: 0,
        method: withdrawMethod,
        senderNumber: '',
        receiverNumber: cleanPhone,
        trxId: '',
        status: 'pending',
        adminNote: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      void logActivity({
        userId: user.uid,
        userLabel: user.fullName,
        action: 'withdraw_request',
        details: `${withdrawMethod.toUpperCase()} নম্বরে (${cleanPhone}) ${formatBDT(amount)} উত্তোলন আবেদন`,
      });
      setWithdrawAmount('');
      onNotify('উইথড্র আবেদন গৃহীত হয়েছে! ব্যালেন্স হোল্ড করা হয়েছে।');
      setSubTab('history');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `transactions/${txId}`);
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  const filteredTx = transactions.filter((tx) => {
    if (historyFilter === 'all') return true;
    if (historyFilter === 'deposit') return tx.type === 'deposit';
    if (historyFilter === 'withdraw') return tx.type === 'withdraw';
    return (
      tx.type === 'welcome_bonus' ||
      tx.type === 'refer_bonus' ||
      tx.type === 'daily_claim' ||
      tx.type === 'admin_bonus'
    );
  });

  const typeLabel = (t: TransactionRecord['type']) => {
    switch (t) {
      case 'deposit':
        return 'ডিপোজিট';
      case 'withdraw':
        return 'উত্তোলন';
      case 'welcome_bonus':
        return 'ওয়েলকাম বোনাস';
      case 'refer_bonus':
        return 'রেফার বোনাস';
      case 'package_buy':
        return 'প্যাকেজ ক্রয়';
      case 'daily_claim':
        return 'ডেইলি ক্লেইম';
      case 'admin_bonus':
        return 'অ্যাডমিন বোনাস';
      case 'admin_adjust':
        return 'অ্যাডমিন অ্যাডজাস্ট';
    }
  };

  const statusLabel = (s: TransactionRecord['status']) => {
    switch (s) {
      case 'pending':
        return { text: 'অপেক্ষমাণ', cls: 'text-amber-400' };
      case 'approved':
      case 'completed':
        return { text: 'সফল', cls: 'text-emerald-400' };
      case 'rejected':
        return { text: 'বাতিল (রিফান্ড)', cls: 'text-rose-400' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Balance Summary Strip */}
      <div className="glass-gold rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/35 flex items-center justify-center text-amber-400">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-300">মূল ওয়ালেট ব্যালেন্স</p>
            <p className="text-2xl font-bold text-white font-mono-num">{formatBDT(user.balance)}</p>
          </div>
        </div>
        <div className="text-right text-xs">
          <p className="text-slate-400">হোল্ডকৃত উত্তোলন</p>
          <p className="text-base font-semibold text-amber-300 font-mono-num">
            {formatBDT(user.heldBalance)}
          </p>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="grid grid-cols-3 p-1 rounded-2xl bg-slate-900 border border-slate-800 max-w-lg">
        <button
          type="button"
          onClick={() => setSubTab('deposit')}
          className={`min-h-[42px] rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            subTab === 'deposit' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          ডিপোজিট
        </button>
        <button
          type="button"
          onClick={() => setSubTab('withdraw')}
          className={`min-h-[42px] rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            subTab === 'withdraw' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          উত্তোলন
        </button>
        <button
          type="button"
          onClick={() => setSubTab('history')}
          className={`min-h-[42px] rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            subTab === 'history' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          হিস্ট্রি
        </button>
      </div>

      {/* Deposit Panel */}
      {subTab === 'deposit' && (
        !cms.depositsEnabled ? (
          <div className="glass-surface rounded-3xl p-6 max-w-xl border border-amber-500/30 text-sm text-amber-200">
            ডিপোজিট সিস্টেম বর্তমানে অ্যাডমিন কর্তৃক সাময়িকভাবে বন্ধ রাখা হয়েছে।
          </div>
        ) : (
          <form onSubmit={handleOpenGateway} className="glass-surface rounded-3xl p-6 max-w-xl space-y-5">
            <div>
              <h3 className="text-lg font-bold text-white">ওয়ালেটে টাকা যোগ করুন</h3>
              <p className="text-xs text-slate-400 mt-1">
                ন্যূনতম ডিপোজিট {formatBDT(cms.minDeposit)} · প্রতিটি ডিপোজিটে{' '}
                <strong className="text-emerald-400">{cms.depositBonusPercent}% বোনাস</strong>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-300 block">দ্রুত পরিমাণ বেছে নিন</label>
              <div className="grid grid-cols-4 gap-2">
                {[499, 999, 2499, 4999].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDepositAmount(String(preset))}
                    className={`h-10 rounded-xl border text-xs font-bold font-mono-num transition-colors ${
                      Number(depositAmount) === preset
                        ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                        : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {formatBDT(preset)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 block">ডিপোজিট পরিমাণ (টাকা)</label>
              <input
                type="number"
                min={cms.minDeposit}
                required
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full h-12 rounded-xl bg-slate-950 border border-slate-800 px-4 text-base font-bold text-white font-mono-num focus:outline-none focus:border-amber-500"
              />
            </div>

            {parsedDeposit > 0 && (
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-4 flex items-center justify-between text-xs">
                <span className="text-emerald-200">
                  ডিপোজিট বোনাস ({cms.depositBonusPercent}%): <strong className="font-mono-num">+{formatBDT(depositBonus)}</strong>
                </span>
                <span className="text-white font-bold font-mono-num">
                  মোট পাবেন: {formatBDT(parsedDeposit + depositBonus)}
                </span>
              </div>
            )}

            <button
              type="submit"
              className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold text-sm hover:brightness-105 transition-all"
            >
              পেমেন্ট গেটওয়েতে এগিয়ে যান (bKash / Nagad)
            </button>
          </form>
        )
      )}

      {/* Withdraw Panel */}
      {subTab === 'withdraw' && (
        !cms.withdrawsEnabled ? (
          <div className="glass-surface rounded-3xl p-6 max-w-xl border border-amber-500/30 text-sm text-amber-200">
            উত্তোলন সিস্টেম বর্তমানে অ্যাডমিন কর্তৃক সাময়িকভাবে বন্ধ রাখা হয়েছে।
          </div>
        ) : (
          <form onSubmit={handleWithdrawSubmit} className="glass-surface rounded-3xl p-6 max-w-xl space-y-5">
            <div>
              <h3 className="text-lg font-bold text-white">টাকা উত্তোলন (Withdraw)</h3>
              <p className="text-xs text-slate-400 mt-1">
                ন্যূনতম উত্তোলন {formatBDT(cms.minWithdraw)} · আবেদন বাতিল হলে ব্যালেন্স স্বয়ংক্রিয়ভাবে ফেরত আসবে।
              </p>
            </div>

            {cms.kycRequiredForWithdraw && user.kycStatus !== 'verified' && (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-200">
                উত্তোলন করার জন্য আপনার অ্যাকাউন্ট KYC ভেরিফায়েড হতে হবে। প্রোফাইল ট্যাব থেকে KYC সাবমিট করুন।
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {cms.bkashEnabled && (
                <button
                  type="button"
                  onClick={() => setWithdrawMethod('bkash')}
                  className={`min-h-[52px] rounded-2xl border p-3 flex items-center justify-center transition-all ${
                    withdrawMethod === 'bkash'
                      ? 'border-[#E2136E] bg-[#E2136E]/15'
                      : 'border-slate-800 bg-slate-900/70'
                  }`}
                >
                  <BkashLogo />
                </button>
              )}
              {cms.nagadEnabled && (
                <button
                  type="button"
                  onClick={() => setWithdrawMethod('nagad')}
                  className={`min-h-[52px] rounded-2xl border p-3 flex items-center justify-center transition-all ${
                    withdrawMethod === 'nagad'
                      ? 'border-[#F7941D] bg-[#F7941D]/15'
                      : 'border-slate-800 bg-slate-900/70'
                  }`}
                >
                  <NagadLogo />
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 block">আপনার পার্সোনাল {withdrawMethod === 'bkash' ? 'বিকাশ' : 'নগদ'} নম্বর</label>
              <input
                type="tel"
                required
                placeholder="01XXXXXXXXX"
                value={withdrawNumber}
                onChange={(e) => setWithdrawNumber(e.target.value)}
                className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white font-mono-num focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 block">উত্তোলনের পরিমাণ (টাকা)</label>
              <input
                type="number"
                required
                min={cms.minWithdraw}
                placeholder={String(cms.minWithdraw)}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white font-mono-num focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={submittingWithdraw || (cms.kycRequiredForWithdraw && user.kycStatus !== 'verified')}
              className="w-full h-12 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {submittingWithdraw ? 'আবেদন পাঠানো হচ্ছে...' : 'উইথড্র রিকোয়েস্ট পাঠান'}
            </button>
          </form>
        )
      )}

      {/* Payment History */}
      {subTab === 'history' && (
        <div className="glass-surface rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-white">পেমেন্ট ও আয় হিস্ট্রি</h3>
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
              {(['all', 'deposit', 'withdraw', 'bonus'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setHistoryFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    historyFilter === f
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {f === 'all' ? 'সব' : f === 'deposit' ? 'ডিপোজিট' : f === 'withdraw' ? 'উইথড্র' : 'বোনাস/আয়'}
                </button>
              ))}
            </div>
          </div>

          {filteredTx.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">এখনো কোনো লেনদেনের তথ্য নেই।</p>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {filteredTx.map((tx) => {
                const st = statusLabel(tx.status);
                const isCredit =
                  tx.type === 'deposit' ||
                  tx.type === 'welcome_bonus' ||
                  tx.type === 'refer_bonus' ||
                  tx.type === 'daily_claim' ||
                  tx.type === 'admin_bonus' ||
                  (tx.type === 'admin_adjust' && !tx.adminNote.includes('কর্তন'));
                return (
                  <div key={tx.id} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {typeLabel(tx.type)}
                        {tx.method !== 'system' && tx.method !== 'wallet'
                          ? ` · ${tx.method.toUpperCase()}`
                          : ''}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {tx.trxId ? `TrxID: ${tx.trxId}` : tx.adminNote || tx.receiverNumber || 'সিস্টেম'}
                        {' · '}
                        {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString('bn-BD') : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-bold font-mono-num ${
                          isCredit ? 'text-emerald-400' : 'text-slate-100'
                        }`}
                      >
                        {isCredit ? '+' : '-'}
                        {formatBDT(tx.amount)}
                      </p>
                      <p className={`text-[11px] font-semibold ${st.cls}`}>{st.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <PaymentGatewayModal
        open={gatewayOpen}
        onClose={() => setGatewayOpen(false)}
        amount={parsedDeposit}
        cms={cms}
        onSubmitDeposit={handleSubmitDeposit}
      />
    </div>
  );
};
