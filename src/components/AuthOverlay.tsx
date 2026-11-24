import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Facebook,
  Gift,
  Lock,
  Phone,
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  User as UserIcon,
  Youtube,
} from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import {
  formatBDT,
  getAccentClasses,
  getBgHex,
  getPublicShareOrigin,
  HERO_IMAGE_URL,
  logActivity,
  normalizeLoginIdentifier,
} from '../lib/seedAndHelpers';
import { CmsSettings, PackageItem } from '../types';
import { BrandMark } from './BrandLogos';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthOverlayProps {
  cms: CmsSettings;
  packages: PackageItem[];
  onAuthCompleted: (meta: { fullName?: string; phone?: string; referralInput?: string }) => void;
  onOpenAdmin?: () => void;
}

export const AuthOverlay: React.FC<AuthOverlayProps> = ({
  cms,
  packages,
  onAuthCompleted,
  onOpenAdmin,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [failedCount, setFailedCount] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);

  const handleSharePublicSite = async () => {
    const shareUrl = `${getPublicShareOrigin()}/`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: cms.brandName,
          text: `${cms.brandName} — স্মার্ট ইনকাম ও ডিজিটাল ওয়ালেট প্ল্যাটফর্ম`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareUrl(true);
      setTimeout(() => setCopiedShareUrl(false), 2200);
    } catch {
      // Ignore clipboard failure
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get('ref');
    if (refParam) {
      setReferralCode(refParam.trim().toUpperCase());
      setMode('register');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const now = Date.now();
    if (lockedUntil > now) {
      const waitSec = Math.ceil((lockedUntil - now) / 1000);
      setErrorMsg(`নিরাপত্তার জন্য সাময়িকভাবে লক করা হয়েছে। ${waitSec} সেকেন্ড পর চেষ্টা করুন।`);
      return;
    }

    const { emailForAuth, phone, isPhoneLogin } = normalizeLoginIdentifier(identifier);
    if (!emailForAuth || (!isPhoneLogin && !emailForAuth.includes('@'))) {
      setErrorMsg('সঠিক মোবাইল নম্বর (01XXXXXXXXX) অথবা ইমেইল লিখুন।');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
      return;
    }
    if (mode === 'register' && fullName.trim().length < 2) {
      setErrorMsg('আপনার পূর্ণ নাম লিখুন।');
      return;
    }

    if (mode === 'register' && !cms.registrationEnabled) {
      setErrorMsg('নতুন রেজিস্ট্রেশন বর্তমানে অ্যাডমিন কর্তৃক সাময়িকভাবে বন্ধ রয়েছে।');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        onAuthCompleted({
          fullName: fullName.trim(),
          phone: phone || identifier.trim(),
          referralInput: referralCode.trim().toUpperCase(),
        });
        await createUserWithEmailAndPassword(auth, emailForAuth, password);
      } else {
        onAuthCompleted({ phone: phone || '' });
        await signInWithEmailAndPassword(auth, emailForAuth, password);
      }
      setFailedCount(0);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const nextFailed = failedCount + 1;
      setFailedCount(nextFailed);

      if (nextFailed >= 5) {
        setLockedUntil(Date.now() + 60 * 1000);
        void logActivity({
          userId: 'anonymous',
          userLabel: identifier.slice(0, 60),
          action: 'failed_login',
          details: 'একাধিকবার ভুল পাসওয়ার্ড দেওয়ায় ১ মিনিটের নিরাপত্তা লক কার্যকর হয়েছে',
          severity: 'security',
        });
      }

      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          'Firebase Console-এ Email/Password লগইন চালু করা হয়নি। এখনই দ্রুত প্রবেশ করতে নিচের Google দিয়ে প্রবেশ করুন বাটনে ক্লিক করুন।'
        );
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg('এই মোবাইল নম্বর বা ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে। লগইন করুন।');
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErrorMsg('মোবাইল/ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।');
      } else {
        setErrorMsg('লগইন/রেজিস্ট্রেশনে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      onAuthCompleted({
        referralInput: referralCode.trim().toUpperCase(),
      });
      await signInWithPopup(auth, googleProvider);
    } catch {
      setErrorMsg('Google সাইন-ইন সম্পন্ন হয়নি। আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  const accent = getAccentClasses(cms.accentColor);
  const bgHex = getBgHex(cms.bgTheme);
  const heroSrc = cms.heroImageUrl?.trim() || HERO_IMAGE_URL;

  return (
    <div className="min-h-screen text-slate-100 flex flex-col" style={{ backgroundColor: bgHex }}>
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 backdrop-blur-md" style={{ backgroundColor: `${bgHex}e6` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <BrandMark className="w-8 h-8" logoUrl={cms.logoUrl} brandName={cms.brandName} />
            <span className="font-display text-lg font-bold tracking-tight text-white">
              {cms.brandName}
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <a href="#auth-card" className={`hover:${accent.text} transition-colors whitespace-nowrap shrink-0`}>
              অ্যাকাউন্ট
            </a>
            <a href="#preview-packages" className={`hover:${accent.text} transition-colors whitespace-nowrap shrink-0`}>
              প্যাকেজসমূহ
            </a>
            <a href="#tutorials" className={`hover:${accent.text} transition-colors whitespace-nowrap shrink-0`}>
              কাজের নিয়ম
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => void handleSharePublicSite()}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="সবার মোবাইলে চলবে এমন পাবলিক লিংক শেয়ার/কপি করুন"
            >
              {copiedShareUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">কপি হয়েছে</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">শেয়ার লিংক</span>
                </>
              )}
            </button>
            {cms.showAppInstallCard && <PWAInstallButton compact />}
            <a
              href="#auth-card"
              className={`px-3.5 sm:px-4 py-2 rounded-xl ${accent.bgSolid} text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0`}
            >
              শুরু করুন
            </a>
          </div>
        </div>
      </header>

      {/* Maintenance Notice Banner */}
      {cms.maintenanceMode && (
        <div className="bg-rose-500/15 border-b border-rose-500/30 py-2.5 px-4">
          <p className="max-w-7xl mx-auto text-xs sm:text-sm text-rose-200 flex items-center justify-center gap-2 text-center">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            {cms.maintenanceMessage || 'সিস্টেম মেইনটেন্যান্স চলছে। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।'}
          </p>
        </div>
      )}

      {/* Live Notice Bar */}
      {cms.noticeText && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 py-2 px-4">
          <p className="max-w-7xl mx-auto text-xs sm:text-sm text-amber-200 text-center truncate">
            {cms.noticeText}
          </p>
        </div>
      )}

      {/* Main Public Landing + Auth Overlay Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 lg:py-12 space-y-12">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left: Hero Showcase */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <p className={`text-xs font-medium ${accent.text} tracking-wide`}>
                সুরক্ষিত ডিজিটাল ইনকাম ভল্ট · তাৎক্ষণিক বিকাশ ও নগদ পেমেন্ট
              </p>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight [text-wrap:balance]">
                {cms.heroTitle}
              </h1>
              <p className="text-base text-slate-300 max-w-2xl leading-relaxed">
                {cms.heroSubtitle}
              </p>
            </div>

            <div className="relative rounded-3xl overflow-hidden border border-slate-800/80 aspect-[16/9] bg-slate-900">
              <img
                src={heroSrc}
                alt={cms.brandName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              {cms.showHeroStats && (
                <div className="absolute inset-0 bg-gradient-to-t from-[#070B14] via-[#070B14]/35 to-transparent flex items-end p-5 sm:p-6">
                  <div className="grid grid-cols-3 gap-4 w-full">
                    <div>
                      <p className="text-xs text-slate-300">ওয়েলকাম বোনাস</p>
                      <p className={`text-lg sm:text-xl font-bold ${accent.text} font-mono-num`}>
                        {formatBDT(cms.welcomeBonus)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-300">রেফার রিওয়ার্ড</p>
                      <p className="text-lg sm:text-xl font-bold text-white font-mono-num">
                        {formatBDT(cms.referBonus)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-300">ডিপোজিট বোনাস</p>
                      <p className="text-lg sm:text-xl font-bold text-emerald-400 font-mono-num">
                        +{cms.depositBonusPercent}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Login & Registration Overlay Card */}
          <div id="auth-card" className="lg:col-span-5 flex">
            <div className="glass-gold w-full rounded-3xl p-6 sm:p-8 flex flex-col justify-between space-y-6 shadow-2xl">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      {mode === 'login' ? 'অ্যাকাউন্টে লগইন করুন' : 'নতুন অ্যাকাউন্ট খুলুন'}
                    </h2>
                    <p className="text-xs text-slate-300 mt-1">
                      {cms.welcomeBonusEnabled
                        ? `সাইন-আপ করলেই পাবেন ${formatBDT(cms.welcomeBonus)} ওয়েলকাম বোনাস`
                        : `${cms.brandName}-এ আপনার অ্যাকাউন্ট পরিচালনা করুন`}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                </div>

                {/* Segmented Switch */}
                <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-950/70 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMsg('');
                    }}
                    className={`min-h-[40px] rounded-lg text-sm font-semibold transition-colors ${
                      mode === 'login'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    লগইন
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setErrorMsg('');
                    }}
                    className={`min-h-[40px] rounded-lg text-sm font-semibold transition-colors ${
                      mode === 'register'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    রেজিস্ট্রেশন
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3.5">
                  {mode === 'register' && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300 block">আপনার পূর্ণ নাম</label>
                      <div className="relative">
                        <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="যেমন: রাফিউল ইসলাম"
                          className="w-full h-11 rounded-xl bg-slate-950/85 border border-slate-800 pl-10 pr-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 block">মোবাইল নম্বর অথবা ইমেইল</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <input
                        type="text"
                        required
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="01XXXXXXXXX অথবা email@example.com"
                        className="w-full h-11 rounded-xl bg-slate-950/85 border border-slate-800 pl-10 pr-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 block">পাসওয়ার্ড</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড"
                        className="w-full h-11 rounded-xl bg-slate-950/85 border border-slate-800 pl-10 pr-11 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1.5 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white"
                        aria-label="পাসওয়ার্ড দেখুন"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {mode === 'register' && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300 block">রেফার কোড (ঐচ্ছিক)</label>
                      <div className="relative">
                        <Gift className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                        <input
                          type="text"
                          value={referralCode}
                          onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                          placeholder="যেমন: MF8A2F (যদি থাকে)"
                          className="w-full h-11 rounded-xl bg-slate-950/85 border border-slate-800 pl-10 pr-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 uppercase font-mono-num"
                        />
                      </div>
                    </div>
                  )}

                  {errorMsg && (
                    <p className="text-xs text-rose-300 bg-rose-500/15 border border-rose-500/30 rounded-xl p-3 leading-relaxed">
                      {errorMsg}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 hover:brightness-105 transition-all disabled:opacity-50"
                  >
                    {loading
                      ? 'প্রক্রিয়াকরণ হচ্ছে...'
                      : mode === 'login'
                        ? 'নিরাপদে লগইন করুন'
                        : 'অ্যাকাউন্ট তৈরি করুন'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleGoogleSignIn()}
                  className="w-full h-11 rounded-xl bg-slate-900/90 border border-slate-700 hover:border-slate-500 text-sm font-medium text-white flex items-center justify-center gap-2.5 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.3 14.8c-.2-.8-.4-1.8-.4-2.8s.2-2 .4-2.8L1.6 6.4C.6 8.1 0 10 0 12s.6 3.9 1.6 5.6l3.7-2.8z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5L1.6 16.1C3.5 20.1 7.4 23 12 23z"
                    />
                  </svg>
                  Google দিয়ে দ্রুত প্রবেশ করুন
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Public Package Preview */}
        <section id="preview-packages" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">স্মার্ট ইনকাম প্যাকেজসমূহ</h2>
              <p className="text-sm text-slate-400">প্রতি ২৪ ঘণ্টায় একবার ডেইলি ক্লেইম করে আয় করুন</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {packages
              .filter((p) => p.active)
              .map((pkg) => (
                <div
                  key={pkg.id}
                  className="glass-surface rounded-2xl overflow-hidden flex flex-col justify-between border border-slate-800"
                >
                  <div className="aspect-[4/3] bg-slate-900 overflow-hidden">
                    <img
                      src={pkg.imageUrl}
                      alt={pkg.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="text-xs text-amber-400 font-medium">{pkg.badgeLabel}</div>
                    <h3 className="text-base font-bold text-white">{pkg.name}</h3>
                    <div className="flex items-center justify-between text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                      <span>মূল্য: <strong className="text-white font-mono-num">{formatBDT(pkg.price)}</strong></span>
                      <span>দৈনিক: <strong className="text-emerald-400 font-mono-num">{formatBDT(pkg.dailyIncome)}</strong></span>
                    </div>
                    <p className="text-xs text-slate-400">মেয়াদ: {pkg.durationDays} দিন</p>
                  </div>
                </div>
              ))}
          </div>
        </section>

        {/* Mobile App Install & Learning Section */}
        {(cms.showAppInstallCard || cms.showTutorialsSection) && (
          <section id="tutorials" className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {cms.showAppInstallCard && (
              <div className={`${cms.showTutorialsSection ? 'lg:col-span-6' : 'lg:col-span-12'} glass-gold rounded-3xl p-6 sm:p-7 flex flex-col justify-between gap-5`}>
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg sm:text-xl font-bold text-white">
                      {cms.brandName} মোবাইল অ্যাপ ডাউনলোড করুন
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      আমাদের ওয়েবসাইটটি সরাসরি আপনার Android বা iPhone মোবাইলে অ্যাপ হিসেবে ইনস্টল করে যেকোনো সময় ব্যবহার করুন।
                    </p>
                  </div>
                </div>
                <div>
                  <PWAInstallButton />
                </div>
              </div>
            )}

            {cms.showTutorialsSection && (
              <div className={`${cms.showAppInstallCard ? 'lg:col-span-6' : 'lg:col-span-12'} glass-surface rounded-3xl p-6 sm:p-7 border border-slate-800 flex flex-col justify-between gap-5`}>
                <div className="space-y-1.5">
                  <h2 className="text-lg sm:text-xl font-bold text-white">কীভাবে কাজ করবেন ও সাপোর্ট নিন</h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    আমাদের অফিশিয়াল ইউটিউব ভিডিও গাইড, ফেসবুক কমিউনিটি এবং টেলিগ্রাম সাপোর্টের সাথে যুক্ত থাকুন।
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {cms.telegramUrl.trim() && (
                    <a
                      href={cms.telegramUrl.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#229ED9]/20 border border-[#229ED9]/45 text-sky-300 text-sm font-semibold hover:bg-[#229ED9]/30 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      Telegram সাপোর্ট
                    </a>
                  )}
                  {cms.youtubeUrl.trim() && (
                    <a
                      href={cms.youtubeUrl.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 text-sm font-semibold hover:bg-rose-600/30 transition-colors"
                    >
                      <Youtube className="w-4 h-4" />
                      YouTube টিউটোরিয়াল
                    </a>
                  )}
                  {cms.facebookUrl.trim() && (
                    <a
                      href={cms.facebookUrl.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-300 text-sm font-semibold hover:bg-blue-600/30 transition-colors"
                    >
                      <Facebook className="w-4 h-4" />
                      Facebook পেজ
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-slate-800/70 py-4 px-4 sm:px-6" style={{ backgroundColor: `${bgHex}e6` }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} {cms.brandName}</span>
          {onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              অ্যাডমিন প্যানেল
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};
