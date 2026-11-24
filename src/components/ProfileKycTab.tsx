import React, { useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  Check,
  Copy,
  FileCheck2,
  KeyRound,
  LogOut,
  Share2,
  Shield,
  Smartphone,
  Upload,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatBDT, getPublicShareOrigin, logActivity } from '../lib/seedAndHelpers';
import { CmsSettings, KycSubmission, UserProfile } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface ProfileKycTabProps {
  user: UserProfile;
  cms: CmsSettings;
  kycRecord: KycSubmission | null;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 900;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas error'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Invalid image'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

export const ProfileKycTab: React.FC<ProfileKycTabProps> = ({
  user,
  cms,
  kycRecord,
  onNotify,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // KYC form state
  const [kycName, setKycName] = useState(user.fullName);
  const [docType, setDocType] = useState<'nid' | 'passport' | 'driving_license'>('nid');
  const [docNumber, setDocNumber] = useState('');
  const [docAddress, setDocAddress] = useState('');
  const [docImage, setDocImage] = useState('');
  const [submittingKyc, setSubmittingKyc] = useState(false);

  // Security password change
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  const referralLink = `${getPublicShareOrigin()}/?ref=${user.referralCode}`;

  const copyText = async (text: string, which: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'code') {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
      onNotify('কপি করা হয়েছে!');
    } catch {
      onNotify('কপি করতে ব্যর্থ হয়েছে।', 'error');
    }
  };

  const handleShareReferral = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: cms.brandName,
          text: `${cms.brandName}-এ যোগ দিন এবং ${formatBDT(cms.welcomeBonus)} বোনাস নিন! রেফার কোড: ${user.referralCode}`,
          url: referralLink,
        });
      } catch {
        void copyText(referralLink, 'link');
      }
    } else {
      void copyText(referralLink, 'link');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      if (compressed.length > 420000) {
        onNotify('ছবির সাইজ অনেক বড়। অনুগ্রহ করে ছোট ছবি নির্বাচন করুন।', 'error');
        return;
      }
      setDocImage(compressed);
    } catch {
      onNotify('ছবি প্রসেস করতে সমস্যা হয়েছে।', 'error');
    }
  };

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docNumber.trim() || docNumber.trim().length < 5) {
      onNotify('সঠিক ডকুমেন্ট নম্বর লিখুন।', 'error');
      return;
    }
    if (!docImage) {
      onNotify('অনুগ্রহ করে ডকুমেন্টের স্পষ্ট ছবি আপলোড করুন।', 'error');
      return;
    }
    setSubmittingKyc(true);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const sealRes = await fetch('/api/crypto/seal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken || ''}`,
        },
        body: JSON.stringify({
          payload: JSON.stringify({
            docNumber: docNumber.trim(),
            address: docAddress.trim(),
            submittedBy: user.phone || user.email,
          }),
        }),
      });
      if (!sealRes.ok) {
        throw new Error('এনক্রিপশন সম্পন্ন করা যায়নি');
      }
      const { sealed } = (await sealRes.json()) as { sealed: string };
      const cleanNum = docNumber.trim();
      const masked =
        cleanNum.length > 4
          ? `${'*'.repeat(Math.min(8, cleanNum.length - 4))}${cleanNum.slice(-4)}`
          : '****';

      const batch = writeBatch(db);
      batch.set(doc(db, 'kycSubmissions', user.uid), {
        userId: user.uid,
        fullName: kycName.trim(),
        documentType: docType,
        maskedNumber: masked,
        encryptedDetails: sealed,
        documentImage: docImage,
        status: 'pending',
        rejectionReason: '',
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', user.uid), {
        kycStatus: 'pending',
        kycMaskedId: masked,
        fullName: kycName.trim(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      void logActivity({
        userId: user.uid,
        userLabel: kycName.trim(),
        action: 'kyc_submitted',
        details: `AES-256-GCM এনক্রিপ্টকৃত ${docType.toUpperCase()} ডকুমেন্ট জমা দেওয়া হয়েছে`,
      });
      onNotify('আপনার কেওয়াইসি তথ্য এনক্রিপ্ট করে যাচাইয়ের জন্য পাঠানো হয়েছে!');
    } catch (err) {
      if (err instanceof Error && err.message.includes('এনক্রিপশন')) {
        onNotify(err.message, 'error');
      } else {
        handleFirestoreError(err, OperationType.WRITE, `kycSubmissions/${user.uid}`);
      }
    } finally {
      setSubmittingKyc(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) return;

    const hasPasswordProvider = currentUser.providerData.some((p) => p.providerId === 'password');
    if (!hasPasswordProvider) {
      onNotify('আপনি Google অ্যাকাউন্ট দিয়ে লগইন করেছেন; পাসওয়ার্ড পরিবর্তন Google থেকে নিয়ন্ত্রিত।', 'error');
      return;
    }

    if (newPass.length < 6) {
      onNotify('নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।', 'error');
      return;
    }

    setChangingPass(true);
    try {
      const cred = EmailAuthProvider.credential(currentUser.email, currentPass);
      await reauthenticateWithCredential(currentUser, cred);
      await updatePassword(currentUser, newPass);
      setCurrentPass('');
      setNewPass('');
      void logActivity({
        userId: user.uid,
        userLabel: user.fullName,
        action: 'password_changed',
        details: 'ইউজার পাসওয়ার্ড সফলভাবে পরিবর্তন করেছেন',
        severity: 'security',
      });
      onNotify('পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!');
    } catch {
      onNotify('বর্তমান পাসওয়ার্ড সঠিক নয় অথবা সেশন মেয়াদ শেষ হয়েছে।', 'error');
    } finally {
      setChangingPass(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Smart Referral Card */}
      {cms.referralEnabled && (
        <div className="glass-gold rounded-3xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">স্মার্ট রেফার ও ইনকাম সিস্টেম</h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                আপনার রেফার লিংকে কেউ যুক্ত হয়ে প্রথমবার ডিপোজিট করলে আপনি সাথে সাথে{' '}
                <strong className="text-amber-300 font-mono-num">{formatBDT(cms.referBonus)}</strong> বোনাস পাবেন!
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleShareReferral()}
              className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs sm:text-sm inline-flex items-center gap-2 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              <Share2 className="w-4 h-4" />
              লিংক শেয়ার করুন
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400">আপনার রেফার কোড</p>
                <p className="text-base font-bold text-amber-400 font-mono-num tracking-wider">
                  {user.referralCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyText(user.referralCode, 'code')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium inline-flex items-center gap-1 hover:bg-slate-700"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                কপি
              </button>
            </div>

            <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400">রেফার লিংক</p>
                <p className="text-xs text-slate-200 truncate font-mono-num">{referralLink}</p>
              </div>
              <button
                type="button"
                onClick={() => void copyText(referralLink, 'link')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium inline-flex items-center gap-1 hover:bg-slate-700 shrink-0"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                কপি
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* KYC Verification Section */}
        <div className="lg:col-span-7 glass-surface rounded-3xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">অ্যাকাউন্ট ভেরিফিকেশন (KYC)</h3>
                <p className="text-xs text-slate-400">AES-256-GCM এনক্রিপ্টেড আইডেন্টিটি ভেরিফিকেশন</p>
              </div>
            </div>
            <span
              className={`text-xs font-bold ${
                user.kycStatus === 'verified'
                  ? 'text-emerald-400'
                  : user.kycStatus === 'pending'
                    ? 'text-amber-400'
                    : user.kycStatus === 'rejected'
                      ? 'text-rose-400'
                      : 'text-slate-400'
              }`}
            >
              {user.kycStatus === 'verified'
                ? 'Verified'
                : user.kycStatus === 'pending'
                  ? 'Pending'
                  : user.kycStatus === 'rejected'
                    ? 'Rejected'
                    : 'Unverified'}
            </span>
          </div>

          {user.kycStatus === 'verified' ? (
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-5 space-y-1.5">
              <p className="text-sm font-bold text-emerald-300">আপনার অ্যাকাউন্ট সম্পূর্ণ ভেরিফায়েড!</p>
              <p className="text-xs text-slate-300">
                ভেরিফায়েড আইডি: <span className="font-mono-num">{user.kycMaskedId}</span>
              </p>
            </div>
          ) : user.kycStatus === 'pending' ? (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-5 space-y-1.5">
              <p className="text-sm font-bold text-amber-300">আপনার ডকুমেন্ট যাচাই প্রক্রিয়াধীন রয়েছে</p>
              <p className="text-xs text-slate-300">
                জমাকৃত আইডি: <span className="font-mono-num">{user.kycMaskedId}</span> · অনুমোদনের সাথে সাথে স্ট্যাটাস আপডেট হবে।
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitKyc} className="space-y-4">
              {user.kycStatus === 'rejected' && kycRecord?.rejectionReason && (
                <div className="rounded-2xl bg-rose-500/10 border border-rose-500/25 p-3.5 text-xs text-rose-300">
                  আগের আবেদন বাতিল হয়েছে: {kycRecord.rejectionReason}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 block">পূর্ণ নাম (ডকুমেন্ট অনুযায়ী)</label>
                  <input
                    type="text"
                    required
                    value={kycName}
                    onChange={(e) => setKycName(e.target.value)}
                    className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 block">ডকুমেন্টের ধরন</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as 'nid' | 'passport' | 'driving_license')}
                    className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="nid">জাতীয় পরিচয়পত্র (NID)</option>
                    <option value="passport">পাসপোর্ট (Passport)</option>
                    <option value="driving_license">ড্রাইভিং লাইসেন্স</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 block">ডকুমেন্ট নম্বর</label>
                  <input
                    type="text"
                    required
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    placeholder="এনআইডি / পাসপোর্ট নম্বর"
                    className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white font-mono-num focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 block">ঠিকানা</label>
                  <input
                    type="text"
                    required
                    value={docAddress}
                    onChange={(e) => setDocAddress(e.target.value)}
                    placeholder="জেলা / শহর"
                    className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300 block">ডকুমেন্টের ছবি আপলোড করুন</label>
                <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-5 cursor-pointer hover:border-amber-500/60 transition-colors">
                  <Upload className="w-5 h-5 text-amber-400" />
                  <span className="text-xs text-slate-300">
                    {docImage ? 'ছবি সংযুক্ত হয়েছে (পরিবর্তন করতে ক্লিক করুন)' : 'গ্যালারি বা ক্যামেরা থেকে ছবি নির্বাচন করুন'}
                  </span>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
                {docImage && (
                  <img
                    src={docImage}
                    alt="KYC Preview"
                    className="h-28 rounded-xl object-cover border border-slate-800"
                  />
                )}
              </div>

              <button
                type="submit"
                disabled={submittingKyc}
                className="w-full h-11 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {submittingKyc ? 'এনক্রিপ্ট ও সাবমিট হচ্ছে...' : 'কেওয়াইসি ভেরিফিকেশন সাবমিট করুন'}
              </button>
            </form>
          )}
        </div>

        {/* Security & Device Session Section */}
        <div className="lg:col-span-5 space-y-5">
          <div className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">নিরাপত্তা ও পাসওয়ার্ড পরিবর্তন</h3>
                <p className="text-xs text-slate-400">সক্রিয় সেশন সুরক্ষা</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <input
                type="password"
                required
                placeholder="বর্তমান পাসওয়ার্ড"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              <input
                type="password"
                required
                placeholder="নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={changingPass}
                className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {changingPass ? 'আপডেট হচ্ছে...' : 'পাসওয়ার্ড পরিবর্তন করুন'}
              </button>
            </form>
          </div>

          <div className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-white">
              <Smartphone className="w-4 h-4 text-amber-400" />
              ডিভাইস ও অ্যাপ ইনফো
            </div>
            <div className="text-xs text-slate-400 space-y-1.5">
              <p>নাম: <strong className="text-slate-200">{user.fullName}</strong></p>
              <p>যোগাযোগ: <strong className="text-slate-200 font-mono-num">{user.phone || user.email}</strong></p>
              <p>বর্তমান ডিভাইস: <strong className="text-slate-200">{user.deviceInfo}</strong></p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {cms.showAppInstallCard && <PWAInstallButton userId={user.uid} />}
              <button
                type="button"
                onClick={() => void signOut(auth)}
                className="flex-1 min-h-[42px] px-4 rounded-xl border border-rose-500/35 bg-rose-500/10 text-rose-300 text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-rose-500/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                লগআউট
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
              <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              সকল সংবেদনশীল তথ্য রিয়েল-টাইম ক্লাউড সিকিউরিটি দ্বারা সুরক্ষিত।
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
