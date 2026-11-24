import React, { useState } from 'react';
import { Check, CheckCircle2, Copy, Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { getPublicShareOrigin } from '../lib/seedAndHelpers';

interface PWAInstallButtonProps {
  userId?: string;
  compact?: boolean;
  label?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  userId,
  compact = false,
  label,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isInIframe, install } =
    usePWAInstall(userId);
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isInstalled) {
    if (compact) return null;
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 text-xs sm:text-sm font-semibold text-emerald-300">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        মোবাইল অ্যাপ ইনস্টল করা আছে
      </div>
    );
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuide(true);
      }
      return;
    }
    setShowGuide(true);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getPublicShareOrigin());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const buttonText = label || (compact ? 'অ্যাপ ডাউনলোড' : 'মোবাইল অ্যাপ ডাউনলোড করুন');

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
        }`}
      >
        <Download className="w-4 h-4" />
        {buttonText}
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="glass-surface w-full max-w-md rounded-3xl p-6 space-y-5 border border-amber-500/30 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Money Fair মোবাইল অ্যাপ ইনস্টল করুন
                  </h3>
                  <p className="text-xs text-slate-400">
                    কোনো APK ছাড়াই সরাসরি আপনার ফোনের হোম স্ক্রিনে অ্যাপ সেটআপ করুন
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                aria-label="বন্ধ করুন"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-4 space-y-2">
                <p className="text-xs font-bold text-amber-300">iPhone / iPad (Safari ব্রাউজার)</p>
                <ol className="text-xs sm:text-sm text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>
                    Safari ব্রাউজারের নিচের <strong>Share (শেয়ার)</strong> আইকনে ট্যাপ করুন।
                  </li>
                  <li>
                    নিচে স্ক্রল করে <strong>Add to Home Screen</strong> নির্বাচন করুন।
                  </li>
                  <li>
                    উপরে ডানদিকে <strong>Add</strong> চাপলেই ফোনে Money Fair অ্যাপ তৈরি হয়ে যাবে।
                  </li>
                </ol>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-4 space-y-2">
                <p className="text-xs font-bold text-amber-300">
                  {isAndroid
                    ? 'Android (Google Chrome / ব্রাউজার)'
                    : 'মোবাইল / ডেস্কটপ ব্রাউজার'}
                </p>
                <ol className="text-xs sm:text-sm text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>
                    ব্রাউজারের উপরের ডানদিকের <strong>⋮ (তিন ডট মেনু)</strong> বাটনে ট্যাপ করুন।
                  </li>
                  <li>
                    তালিকা থেকে <strong>Install app</strong> অথবা{' '}
                    <strong>Add to Home screen</strong> অপশনে ট্যাপ করুন।
                  </li>
                  <li>
                    <strong>Install</strong> নিশ্চিত করলেই ফোনের মেনুতে সরাসরি Money Fair অ্যাপ যুক্ত হয়ে যাবে।
                  </li>
                </ol>
              </div>
            )}

            {isInIframe && (
              <p className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 leading-relaxed">
                টিপস: আপনি যদি ইন-অ্যাপ ব্রাউজার বা প্রিভিউ মোডে থাকেন, তবে নিচ থেকে ওয়েবসাইটের লিংক কপি করে Chrome বা Safari-তে খুললে সরাসরি ১-ক্লিকে ইনস্টল অপশন পাবেন।
              </p>
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="flex-1 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    লিংক কপি হয়েছে
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    অ্যাপ লিংক কপি করুন
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-5 h-10 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400"
              >
                বুঝেছি
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
