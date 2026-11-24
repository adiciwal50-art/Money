import React, { useEffect, useState } from 'react';
import { Check, Copy, Lock, ShieldCheck, X } from 'lucide-react';
import { CmsSettings } from '../types';
import { formatBDT } from '../lib/seedAndHelpers';
import { BkashLogo, NagadLogo } from './BrandLogos';

interface PaymentGatewayModalProps {
  open: boolean;
  onClose: () => void;
  amount: number;
  cms: CmsSettings;
  onSubmitDeposit: (payload: {
    method: 'bkash' | 'nagad';
    senderNumber: string;
    trxId: string;
    amount: number;
    bonusAmount: number;
  }) => Promise<void>;
}

export const PaymentGatewayModal: React.FC<PaymentGatewayModalProps> = ({
  open,
  onClose,
  amount,
  cms,
  onSubmitDeposit,
}) => {
  const [method, setMethod] = useState<'bkash' | 'nagad'>(cms.bkashEnabled ? 'bkash' : 'nagad');
  const [senderNumber, setSenderNumber] = useState('');
  const [trxId, setTrxId] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (method === 'bkash' && !cms.bkashEnabled && cms.nagadEnabled) {
      setMethod('nagad');
    } else if (method === 'nagad' && !cms.nagadEnabled && cms.bkashEnabled) {
      setMethod('bkash');
    }
  }, [cms.bkashEnabled, cms.nagadEnabled, method]);

  if (!open) return null;

  const targetNumber =
    method === 'bkash'
      ? cms.bkashNumber?.trim() || cms.paymentNumber
      : cms.nagadNumber?.trim() || cms.paymentNumber;

  const noGatewayActive = !cms.bkashEnabled && !cms.nagadEnabled;
  const bonusAmount = Math.round((amount * (cms.depositBonusPercent || 0)) / 100);
  const totalCredit = amount + bonusAmount;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (noGatewayActive) {
      setErrorMsg('বর্তমানে বিকাশ ও নগদ পেমেন্ট সাময়িকভাবে বন্ধ রয়েছে।');
      return;
    }
    const cleanPhone = senderNumber.trim();
    const cleanTrx = trxId.trim().toUpperCase();
    if (!/^01[3-9]\d{8}$/.test(cleanPhone)) {
      setErrorMsg('সঠিক ১১ সংখ্যার বিকাশ/নগদ সেন্ডার নম্বর দিন (যেমন 01XXXXXXXXX)।');
      return;
    }
    if (cleanTrx.length < 6 || cleanTrx.length > 40) {
      setErrorMsg('সঠিক ট্রানজেকশন আইডি (TrxID) লিখুন।');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmitDeposit({
        method,
        senderNumber: cleanPhone,
        trxId: cleanTrx,
        amount,
        bonusAmount,
      });
      setSenderNumber('');
      setTrxId('');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="glass-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-5 border border-slate-700/60 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">সুরক্ষিত পেমেন্ট গেটওয়ে</h3>
              <p className="text-xs text-slate-400">বিকাশ ও নগদ সেন্ড মানি ভেরিফিকেশন</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
            aria-label="বন্ধ করুন"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">মোট ডিপোজিট</p>
            <p className="text-2xl font-bold text-white font-mono-num">{formatBDT(amount)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-amber-400">ডিপোজিট বোনাস (+{cms.depositBonusPercent}%)</p>
            <p className="text-sm font-semibold text-emerald-400 font-mono-num">
              মোট যুক্ত হবে: {formatBDT(totalCredit)}
            </p>
          </div>
        </div>

        {noGatewayActive ? (
          <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4 text-xs text-rose-300">
            বর্তমানে বিকাশ ও নগদ উভয় পেমেন্ট মাধ্যম অ্যাডমিন কর্তৃক সাময়িকভাবে বন্ধ রয়েছে।
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 block">পেমেন্ট মাধ্যম নির্বাচন করুন</label>
              <div className="grid grid-cols-2 gap-3">
                {cms.bkashEnabled && (
                  <button
                    type="button"
                    onClick={() => setMethod('bkash')}
                    className={`min-h-[54px] rounded-2xl border p-3 flex items-center justify-center transition-all ${
                      method === 'bkash'
                        ? 'border-[#E2136E] bg-[#E2136E]/15 shadow-sm'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <BkashLogo />
                  </button>
                )}
                {cms.nagadEnabled && (
                  <button
                    type="button"
                    onClick={() => setMethod('nagad')}
                    className={`min-h-[54px] rounded-2xl border p-3 flex items-center justify-center transition-all ${
                      method === 'nagad'
                        ? 'border-[#F7941D] bg-[#F7941D]/15 shadow-sm'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <NagadLogo />
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-4 space-y-2.5">
              <p className="text-xs text-amber-200 leading-relaxed">
                ১. আপনার {method === 'bkash' ? 'বিকাশ (bKash)' : 'নগদ (Nagad)'} অ্যাপ থেকে{' '}
                <strong className="text-white">Send Money</strong> অপশনে নিচের নম্বরে{' '}
                <strong className="text-white font-mono-num">{formatBDT(amount)}</strong> পাঠান:
              </p>
              <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-950/90 border border-slate-800 px-3.5 py-2.5">
                <span className="text-lg font-bold tracking-wider text-amber-400 font-mono-num">
                  {targetNumber}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'কপি হয়েছে' : 'নম্বর কপি'}
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">আপনার সেন্ডার নম্বর</label>
                <input
                  type="tel"
                  required
                  placeholder="01XXXXXXXXX"
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                  className="w-full h-11 rounded-xl bg-slate-950/80 border border-slate-800 px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 font-mono-num"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">ট্রানজেকশন আইডি (TrxID)</label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: BGH7X92KLP"
                  value={trxId}
                  onChange={(e) => setTrxId(e.target.value)}
                  className="w-full h-11 rounded-xl bg-slate-950/80 border border-slate-800 px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 font-mono-num uppercase"
                />
              </div>

              {errorMsg && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 hover:brightness-105 transition-all disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                {submitting ? 'যাচাইয়ের জন্য পাঠানো হচ্ছে...' : 'ডিপোজিট রিকোয়েস্ট নিশ্চিত করুন'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
