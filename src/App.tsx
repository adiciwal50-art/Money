import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Home,
  Layers,
  Lock,
  MessageSquare,
  User as UserIcon,
  Wallet,
  WifiOff,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AdminPortal } from './components/AdminPortal';
import { AuthOverlay } from './components/AuthOverlay';
import { BrandMark } from './components/BrandLogos';
import { DashboardTab } from './components/DashboardTab';
import { PackagesTab } from './components/PackagesTab';
import { ProfileKycTab } from './components/ProfileKycTab';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SupportTab } from './components/SupportTab';
import { WalletTab } from './components/WalletTab';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  DEFAULT_CMS_SETTINGS,
  DEFAULT_PACKAGES,
  formatBDT,
  generateReferralCode,
  getAccentClasses,
  getBgHex,
  getDeviceSummary,
  logActivity,
} from './lib/seedAndHelpers';
import {
  CmsSettings,
  KycSubmission,
  PackageItem,
  TransactionRecord,
  UserPackage,
  UserProfile,
} from './types';

type UserTab = 'dashboard' | 'packages' | 'wallet' | 'profile' | 'support';

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState(
    () => typeof window !== 'undefined' && window.location.pathname.startsWith('/admin-portal')
  );

  const isOnline = useOnlineStatus();
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const [cms, setCms] = useState<CmsSettings>(DEFAULT_CMS_SETTINGS);
  const [packages, setPackages] = useState<PackageItem[]>(
    DEFAULT_PACKAGES.map((p) => ({ ...p }))
  );
  const [userPackages, setUserPackages] = useState<UserPackage[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [kycRecord, setKycRecord] = useState<KycSubmission | null>(null);

  const [activeTab, setActiveTab] = useState<UserTab>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    const candidate = tabParam || path;
    if (
      candidate === 'packages' ||
      candidate === 'wallet' ||
      candidate === 'profile' ||
      candidate === 'support' ||
      candidate === 'dashboard'
    ) {
      return candidate;
    }
    return 'dashboard';
  });
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const pendingAuthMeta = useRef<{
    fullName?: string;
    phone?: string;
    referralInput?: string;
  }>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const onPopState = () => {
      setIsAdminRoute(window.location.pathname.startsWith('/admin-portal'));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openAdminPortal = () => {
    window.history.pushState({}, '', '/admin-portal');
    setIsAdminRoute(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exitAdminPortal = () => {
    window.history.pushState({}, '', '/');
    setIsAdminRoute(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Auth listener with mobile WebView failsafe timeout
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      setAuthReady(true);
    }, 2000);
    const unsub = onAuthStateChanged(auth, (u) => {
      clearTimeout(fallbackTimer);
      setFirebaseUser(u);
      setAuthReady(true);
    });
    return () => {
      clearTimeout(fallbackTimer);
      unsub();
    };
  }, []);

  useEffect(() => {
    const title = cms.brandName || 'Money Fair';
    document.title = title;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.setAttribute('content', `${title} — স্মার্ট ইনকাম ও ডিজিটাল ভল্ট`);
    }
  }, [cms.brandName]);

  // Public CMS & Packages real-time subscriptions
  useEffect(() => {
    const unsubCms = onSnapshot(
      doc(db, 'cms', 'settings'),
      (snap) => {
        if (snap.exists()) {
          const loaded = { ...DEFAULT_CMS_SETTINGS, ...(snap.data() as Partial<CmsSettings>) };
          if (loaded.brandName === 'VaultPro Fintech') {
            loaded.brandName = 'Money Fair';
          }
          setCms(loaded);
        }
      },
      (err) => {
        console.warn('CMS read fallback active:', err.message);
      }
    );

    const unsubPkgs = onSnapshot(
      query(collection(db, 'packages'), orderBy('sortOrder', 'asc')),
      (snap) => {
        if (!snap.empty) {
          setPackages(snap.docs.map((d) => d.data() as PackageItem));
        }
      },
      (err) => {
        console.warn('Packages read fallback active:', err.message);
      }
    );

    return () => {
      unsubCms();
      unsubPkgs();
    };
  }, []);

  // Authenticated User Profile + User Collections (only on non-admin routes)
  useEffect(() => {
    if (isAdminRoute || !authReady || !firebaseUser) {
      setUserProfile(null);
      setUserPackages([]);
      setTransactions([]);
      setKycRecord(null);
      return;
    }

    const uid = firebaseUser.uid;
    let unsubPkgs: (() => void) | undefined;
    let unsubTx: (() => void) | undefined;
    let unsubKyc: (() => void) | undefined;

    const ensureUserProfile = async () => {
      const userRef = doc(db, 'users', uid);
      try {
        const snap = await getDoc(userRef);
        const isStandalone =
          (typeof window.matchMedia === 'function' &&
            window.matchMedia('(display-mode: standalone)').matches) ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true;

        if (!snap.exists()) {
          const meta = pendingAuthMeta.current;
          const displayName =
            meta.fullName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'সম্মানিত সদস্য';
          const cleanEmail = firebaseUser.email || '';
          const phoneFromEmail = cleanEmail.endsWith('@finvault.bd')
            ? cleanEmail.replace('@finvault.bd', '')
            : '';
          const phone = meta.phone || phoneFromEmail;

          // Validate referral code if supplied
          let referrerUid = '';
          const refInput = (meta.referralInput || '').trim().toUpperCase();
          if (refInput && /^[a-zA-Z0-9_-]{4,20}$/.test(refInput)) {
            const refSnap = await getDoc(doc(db, 'referralCodes', refInput));
            if (refSnap.exists()) {
              const refData = refSnap.data() as { ownerUid: string };
              if (refData.ownerUid && refData.ownerUid !== uid) {
                referrerUid = refData.ownerUid;
              }
            }
          }

          const myRefCode = generateReferralCode(displayName + uid.slice(0, 4));
          const batch = writeBatch(db);
          batch.set(userRef, {
            uid,
            fullName: displayName.slice(0, 95),
            phone: phone.slice(0, 28),
            email: cleanEmail.slice(0, 115),
            balance: 0,
            heldBalance: 0,
            totalDeposited: 0,
            totalWithdrawn: 0,
            totalEarned: 0,
            welcomeBonusClaimed: false,
            referralCode: myRefCode,
            referredBy: referrerUid,
            firstDepositRewarded: false,
            kycStatus: 'unverified',
            kycMaskedId: '',
            isLocked: false,
            isDeleted: false,
            deviceInfo: getDeviceSummary(),
            appInstalled: isStandalone,
            lastClaimPkgId: '',
            lastLoginAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(doc(db, 'referralCodes', myRefCode), {
            code: myRefCode,
            ownerUid: uid,
            createdAt: serverTimestamp(),
          });
          await batch.commit();

          void logActivity({
            userId: uid,
            userLabel: displayName,
            action: 'user_registered',
            details: referrerUid
              ? `নতুন অ্যাকাউন্ট খোলা হয়েছে (রেফারার: ${referrerUid.slice(0, 8)})`
              : 'নতুন অ্যাকাউন্ট খোলা হয়েছে',
          });
        } else {
          const existingData = snap.data() as UserProfile;
          if (!existingData.isLocked && !existingData.isDeleted) {
            await updateDoc(userRef, {
              deviceInfo: getDeviceSummary(),
              appInstalled: existingData.appInstalled || isStandalone,
              lastLoginAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            void logActivity({
              userId: uid,
              userLabel: existingData.fullName,
              action: 'user_login',
              details: 'সফলভাবে অ্যাকাউন্টে লগইন সম্পন্ন',
            });
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
      }
    };

    void ensureUserProfile();

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfile);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    unsubPkgs = onSnapshot(
      query(collection(db, 'userPackages'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserPackage);
        list.sort((a, b) => (b.purchasedAt?.toMillis?.() || 0) - (a.purchasedAt?.toMillis?.() || 0));
        setUserPackages(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'userPackages')
    );

    unsubTx = onSnapshot(
      query(collection(db, 'transactions'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as TransactionRecord);
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setTransactions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    unsubKyc = onSnapshot(
      doc(db, 'kycSubmissions', uid),
      (snap) => {
        setKycRecord(snap.exists() ? (snap.data() as KycSubmission) : null);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `kycSubmissions/${uid}`)
    );

    return () => {
      unsubUser();
      unsubPkgs?.();
      unsubTx?.();
      unsubKyc?.();
    };
  }, [isAdminRoute, authReady, firebaseUser]);

  // Secret Admin Route
  if (isAdminRoute) {
    if (!authReady) {
      return (
        <div className="min-h-screen bg-[#070B14] flex items-center justify-center text-slate-400 text-sm">
          লোড হচ্ছে...
        </div>
      );
    }
    return (
      <AdminPortal
        firebaseUser={firebaseUser}
        cms={cms}
        packages={packages}
        onExitAdmin={exitAdminPortal}
      />
    );
  }

  const bgHex = getBgHex(cms.bgTheme);
  const accent = getAccentClasses(cms.accentColor);

  // Initial Auth Loading
  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-300" style={{ backgroundColor: bgHex }}>
        <BrandMark className="w-12 h-12" logoUrl={cms.logoUrl} brandName={cms.brandName} />
        <p className="text-sm">{cms.brandName} লোড হচ্ছে...</p>
      </div>
    );
  }

  // Public Landing + Auth Overlay when signed out
  if (!firebaseUser) {
    return (
      <>
        <AuthOverlay
          cms={cms}
          packages={packages}
          onAuthCompleted={(meta) => {
            pendingAuthMeta.current = meta;
          }}
          onOpenAdmin={openAdminPortal}
        />
        {!isOnline && (
          <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-lg">
            <WifiOff className="w-4 h-4" />
            অফলাইন মোড সক্রিয়
          </div>
        )}
      </>
    );
  }

  // Maintenance Mode Gate for regular logged-in users
  if (cms.maintenanceMode) {
    return (
      <div className="min-h-screen text-slate-100 flex items-center justify-center p-4" style={{ backgroundColor: bgHex }}>
        <div className="glass-surface max-w-md w-full rounded-3xl p-8 text-center space-y-5 border border-amber-500/35">
          <div className="mx-auto flex justify-center">
            <BrandMark className="w-14 h-14" logoUrl={cms.logoUrl} brandName={cms.brandName} />
          </div>
          <h1 className="text-xl font-bold text-white">{cms.brandName} — সাময়িক রক্ষণাবেক্ষণ</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            {cms.maintenanceMessage || 'সিস্টেম আপগ্রেডের কাজ চলছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।'}
          </p>
          <div className="flex flex-col gap-2.5">
            {cms.telegramUrl && (
              <a
                href={cms.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-11 rounded-xl bg-[#229ED9] text-white font-semibold text-sm flex items-center justify-center"
              >
                টেলিগ্রাম সাপোর্টে যোগাযোগ করুন
              </a>
            )}
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="w-full h-11 rounded-xl bg-slate-800 text-slate-200 font-semibold text-sm hover:bg-slate-700"
            >
              লগআউট করুন
            </button>
          </div>
          <button
            type="button"
            onClick={openAdminPortal}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors pt-2"
          >
            <Lock className="w-3.5 h-3.5" />
            অ্যাডমিন কন্ট্রোল
          </button>
        </div>
      </div>
    );
  }

  // Waiting for user profile document creation
  if (!userProfile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-300" style={{ backgroundColor: bgHex }}>
        <BrandMark className="w-12 h-12" logoUrl={cms.logoUrl} brandName={cms.brandName} />
        <p className="text-sm">আপনার সুরক্ষিত ওয়ালেট প্রস্তুত করা হচ্ছে...</p>
      </div>
    );
  }

  // Remote Lock / Remote Delete Enforcement
  if (userProfile.isLocked || userProfile.isDeleted) {
    return (
      <div className="min-h-screen text-slate-100 flex items-center justify-center p-4" style={{ backgroundColor: bgHex }}>
        <div className="glass-surface max-w-md w-full rounded-3xl p-8 text-center space-y-5 border border-rose-500/40">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-400">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-white">
            {userProfile.isDeleted ? 'অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে' : 'অ্যাকাউন্ট সাময়িকভাবে লক করা হয়েছে'}
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            নিরাপত্তাজনিত কারণে অ্যাডমিন আপনার অ্যাকাউন্টটি নিয়ন্ত্রণ করেছেন। বিস্তারিত জানতে সাপোর্ট টিমের সাথে যোগাযোগ করুন।
          </p>
          <div className="flex flex-col gap-2.5">
            {cms.telegramUrl && (
              <a
                href={cms.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-11 rounded-xl bg-[#229ED9] text-white font-semibold text-sm flex items-center justify-center"
              >
                টেলিগ্রাম সাপোর্টে যোগাযোগ করুন
              </a>
            )}
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="w-full h-11 rounded-xl bg-slate-800 text-slate-200 font-semibold text-sm hover:bg-slate-700"
            >
              লগআউট করুন
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navTabs: { id: UserTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'হোম', icon: <Home className="w-5 h-5" /> },
    { id: 'packages', label: 'প্যাকেজ', icon: <Layers className="w-5 h-5" /> },
    { id: 'wallet', label: 'ওয়ালেট', icon: <Wallet className="w-5 h-5" /> },
    { id: 'profile', label: 'প্রোফাইল', icon: <UserIcon className="w-5 h-5" /> },
    { id: 'support', label: 'সাপোর্ট', icon: <MessageSquare className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen text-slate-100 pb-20 md:pb-10" style={{ backgroundColor: bgHex }}>
      {/* Top Bar (3-zone contract) */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 backdrop-blur-md" style={{ backgroundColor: `${bgHex}e6` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 text-left"
          >
            <BrandMark className="w-8 h-8" logoUrl={cms.logoUrl} brandName={cms.brandName} />
            <span className="font-display text-base sm:text-lg font-bold text-white">
              {cms.brandName}
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`whitespace-nowrap shrink-0 pb-1 border-b-2 transition-colors ${
                  activeTab === t.id
                    ? `${accent.text} ${accent.border}`
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {cms.showAppInstallCard && <PWAInstallButton userId={userProfile.uid} compact />}
            <button
              type="button"
              onClick={() => setActiveTab('wallet')}
              className={`px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-bold font-mono-num whitespace-nowrap shrink-0 transition-colors ${accent.badge}`}
            >
              {formatBDT(userProfile.balance)}
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-16 right-4 z-50 px-4 py-3 rounded-2xl text-xs sm:text-sm font-semibold shadow-xl border ${
            toast.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/40 text-rose-200'
              : 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 'dashboard' && (
              <DashboardTab
                user={userProfile}
                cms={cms}
                userPackages={userPackages}
                onNavigateTab={setActiveTab}
                onNotify={showToast}
              />
            )}
            {activeTab === 'packages' && (
              <PackagesTab
                user={userProfile}
                packages={packages}
                userPackages={userPackages}
                onNavigateWallet={() => setActiveTab('wallet')}
                onNotify={showToast}
              />
            )}
            {activeTab === 'wallet' && (
              <WalletTab
                user={userProfile}
                cms={cms}
                transactions={transactions}
                onNotify={showToast}
              />
            )}
            {activeTab === 'profile' && (
              <ProfileKycTab
                user={userProfile}
                cms={cms}
                kycRecord={kycRecord}
                onNotify={showToast}
              />
            )}
            {activeTab === 'support' && <SupportTab user={userProfile} cms={cms} />}
          </motion.div>
        </AnimatePresence>

        <footer className="mt-10 pt-4 border-t border-slate-800/70 flex items-center justify-between gap-4 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} {cms.brandName}</span>
          <button
            type="button"
            onClick={openAdminPortal}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            অ্যাডমিন কন্ট্রোল
          </button>
        </footer>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (<= 60px height to respect 15% mobile sticky cap) */}
      <nav
        aria-label="মোবাইল নেভিগেশন"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#070B14]/92 backdrop-blur-md border-t border-slate-800/90 pb-safe"
      >
        <div className="grid grid-cols-5 h-14 items-center">
          {navTabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.icon}
                <span className="text-[10px] font-semibold tracking-tight">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed bottom-16 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-lg">
          <WifiOff className="w-4 h-4" />
          অফলাইন মোড — ক্যাশড ডাটা প্রদর্শিত হচ্ছে
        </div>
      )}
    </div>
  );
}
