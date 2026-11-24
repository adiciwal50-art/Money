import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { AccentColorTheme, BgThemeOption, CmsSettings, PackageItem } from '../types';
import { db, handleFirestoreError, OperationType } from './firebase';

export const HERO_IMAGE_URL = '/src/assets/images/hero_fintech_vault_1795505693388.jpg';
export const DEFAULT_OFFER_IMAGE_URL = '/src/assets/images/offer_promo_banner_1795505694209.jpg';

export const DEFAULT_CMS_SETTINGS: CmsSettings = {
  brandName: 'Money Fair',
  logoUrl: '',
  heroTitle: 'ডিজিটাল ইনকাম ভল্টে আপনাকে স্বাগতম',
  heroSubtitle:
    'আধুনিক স্মার্ট প্যাকেজ, দৈনিক অটোমেটেড ইনকাম ক্লেইম এবং তাৎক্ষণিক বিকাশ ও নগদ লেনদেন সুবিধা।',
  heroImageUrl: HERO_IMAGE_URL,
  noticeText:
    'স্বাগতম! নতুন অ্যাকাউন্ট খুললেই ৫০ টাকা ওয়েলকাম বোনাস এবং প্রতিটি সফল রেফারে ১২০ টাকা বোনাস পাচ্ছেন।',
  paymentNumber: '01987474190',
  bkashNumber: '01987474190',
  nagadNumber: '01987474190',
  bkashEnabled: true,
  nagadEnabled: true,
  welcomeBonus: 50,
  referBonus: 120,
  depositBonusPercent: 5,
  minDeposit: 300,
  minWithdraw: 300,
  telegramUrl: 'https://t.me/',
  youtubeUrl: 'https://youtube.com/',
  facebookUrl: 'https://facebook.com/',
  offerActive: true,
  offerTitle: 'বিশেষ ডিপোজিট বোনাস অফার!',
  offerDescription:
    'যেকোনো ডিপোজিটে সাথে সাথে ৫% অতিরিক্ত বোনাস এবং প্রথম রেফার ডিপোজিটে ১২০ টাকা নিশ্চিত রিওয়ার্ড।',
  offerImageUrl: DEFAULT_OFFER_IMAGE_URL,
  offerCtaText: 'এখনই ডিপোজিট করুন',
  offerLink: 'wallet',
  accentColor: 'amber',
  bgTheme: 'midnight',
  maintenanceMode: false,
  maintenanceMessage:
    'সিস্টেম আপগ্রেডের কাজ চলছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
  depositsEnabled: true,
  withdrawsEnabled: true,
  registrationEnabled: true,
  dailyClaimEnabled: true,
  welcomeBonusEnabled: true,
  referralEnabled: true,
  kycRequiredForWithdraw: false,
  showHeroStats: true,
  showTutorialsSection: true,
  showAppInstallCard: true,
};

export const DEFAULT_PACKAGES: Omit<PackageItem, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'pkg_starter_499',
    name: 'স্টার্টার ভল্ট (Starter)',
    description: 'নতুন সদস্যদের জন্য নিরাপদ ও সাশ্রয়ী দৈনিক ইনকাম প্যাকেজ।',
    price: 499,
    dailyIncome: 45,
    durationDays: 30,
    imageUrl: '/src/assets/images/pkg_starter_vault_1795505693930.jpg',
    badgeLabel: 'জনপ্রিয় শুরু',
    active: true,
    sortOrder: 1,
  },
  {
    id: 'pkg_silver_999',
    name: 'সিলভার গ্রোথ (Silver)',
    description: 'নিয়মিত প্রবৃদ্ধির জন্য দ্রুত রিটার্ন ও স্থিতিশীল দৈনিক আয়।',
    price: 999,
    dailyIncome: 95,
    durationDays: 30,
    imageUrl: '/src/assets/images/pkg_silver_growth_1795505693417.jpg',
    badgeLabel: 'স্মার্ট চয়েস',
    active: true,
    sortOrder: 2,
  },
  {
    id: 'pkg_gold_2499',
    name: 'গোল্ড প্রাইম (Gold)',
    description: 'উচ্চতর দৈনিক ইনকাম ও ৩৫ দিনের বর্ধিত মেয়াদের প্রিমিয়াম ভল্ট।',
    price: 2499,
    dailyIncome: 245,
    durationDays: 35,
    imageUrl: '/src/assets/images/pkg_gold_prime_1795505693263.jpg',
    badgeLabel: 'বেস্ট ভ্যালু',
    active: true,
    sortOrder: 3,
  },
  {
    id: 'pkg_platinum_4999',
    name: 'প্লাটিনাম এলিট (Platinum)',
    description: 'সর্বোচ্চ দৈনিক প্রফিট ও ৪০ দিনের ভিআইপি প্রিমিয়াম প্যাকেজ।',
    price: 4999,
    dailyIncome: 520,
    durationDays: 40,
    imageUrl: '/src/assets/images/hero_fintech_vault_1795505693388.jpg',
    badgeLabel: 'ভিআইপি টায়ার',
    active: true,
    sortOrder: 4,
  },
];

export function getBgHex(bgTheme: BgThemeOption | undefined): string {
  switch (bgTheme) {
    case 'obsidian':
      return '#050608';
    case 'navy':
      return '#081226';
    case 'midnight':
    default:
      return '#070B14';
  }
}

export function getAccentClasses(accent: AccentColorTheme | undefined) {
  switch (accent) {
    case 'emerald':
      return {
        text: 'text-emerald-400',
        border: 'border-emerald-500',
        bgSolid: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400',
        bgGrad: 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950',
        badge: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300',
      };
    case 'blue':
      return {
        text: 'text-sky-400',
        border: 'border-sky-500',
        bgSolid: 'bg-sky-500 text-slate-950 hover:bg-sky-400',
        bgGrad: 'bg-gradient-to-r from-sky-500 to-blue-400 text-slate-950',
        badge: 'bg-sky-500/15 border-sky-500/35 text-sky-300',
      };
    case 'rose':
      return {
        text: 'text-rose-400',
        border: 'border-rose-500',
        bgSolid: 'bg-rose-500 text-white hover:bg-rose-400',
        bgGrad: 'bg-gradient-to-r from-rose-500 to-pink-500 text-white',
        badge: 'bg-rose-500/15 border-rose-500/35 text-rose-300',
      };
    case 'amber':
    default:
      return {
        text: 'text-amber-400',
        border: 'border-amber-400',
        bgSolid: 'bg-amber-500 text-slate-950 hover:bg-amber-400',
        bgGrad: 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950',
        badge: 'bg-amber-500/15 border-amber-500/35 text-amber-300',
      };
  }
}

export async function compressImageFile(
  file: File,
  maxWidth = 720,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas error'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Invalid image'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

export function formatBDT(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `৳${safe.toLocaleString('en-US', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function generateId(prefix = 'id'): string {
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function generateReferralCode(seedStr: string): string {
  const clean = seedStr.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'MF';
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${clean}${rand}`;
}

export function normalizeLoginIdentifier(input: string): {
  emailForAuth: string;
  phone: string;
  isPhoneLogin: boolean;
} {
  const trimmed = input.trim();
  const digitsOnly = trimmed.replace(/[\s\-+]/g, '');
  const bdPhoneMatch = digitsOnly.match(/^(?:88)?(01[3-9]\d{8})$/);
  if (bdPhoneMatch) {
    const localPhone = bdPhoneMatch[1];
    return {
      emailForAuth: `${localPhone}@finvault.bd`,
      phone: localPhone,
      isPhoneLogin: true,
    };
  }
  return {
    emailForAuth: trimmed.toLowerCase(),
    phone: '',
    isPhoneLogin: false,
  };
}

export function getDeviceSummary(): string {
  if (typeof navigator === 'undefined') return 'Unknown Device';
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac/i.test(ua)
          ? 'macOS'
          : 'Linux/Web';
  const browser = /Edg/i.test(ua)
    ? 'Edge'
    : /Chrome/i.test(ua)
      ? 'Chrome'
      : /Safari/i.test(ua)
        ? 'Safari'
        : /Firefox/i.test(ua)
          ? 'Firefox'
          : 'Browser';
  return `${isMobile ? 'Mobile' : 'Desktop'} · ${os} · ${browser}`.slice(0, 200);
}

export function isPreviewHostingUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const { host } = window.location;
  return host.startsWith('ais-dev-') || host.startsWith('ais-pre-');
}

export function getPublicShareOrigin(): string {
  if (typeof window === 'undefined') return '';
  const { protocol, host } = window.location;
  const publicHost = host.startsWith('ais-dev-')
    ? host.replace(/^ais-dev-/, 'ais-pre-')
    : host;
  return `${protocol}//${publicHost}`;
}

export async function logActivity(params: {
  userId: string;
  userLabel: string;
  action: string;
  details: string;
  severity?: 'info' | 'warning' | 'security';
}): Promise<void> {
  const logId = generateId('log');
  try {
    await setDoc(doc(db, 'activityLogs', logId), {
      id: logId,
      userId: params.userId.slice(0, 128),
      userLabel: params.userLabel.slice(0, 120),
      action: params.action.slice(0, 80),
      details: params.details.slice(0, 400),
      deviceInfo: getDeviceSummary(),
      severity: params.severity || 'info',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Activity log skipped:', err);
  }
}

export async function recordAppDownloadEvent(userId: string): Promise<void> {
  const dlId = generateId('dl');
  try {
    await setDoc(doc(db, 'appDownloads', dlId), {
      id: dlId,
      userId: userId || 'anonymous',
      platform: getDeviceSummary(),
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown').slice(0, 300),
      createdAt: serverTimestamp(),
    });
    await logActivity({
      userId: userId || 'anonymous',
      userLabel: userId || 'Guest Visitor',
      action: 'app_download',
      details: 'মোবাইল অ্যাপ (PWA) ইনস্টল / ডাউনলোড সম্পন্ন হয়েছে',
      severity: 'info',
    });
  } catch (err) {
    console.warn('App download log skipped:', err);
  }
}

export async function ensureAdminDefaultsSeeded(): Promise<void> {
  try {
    const cmsRef = doc(db, 'cms', 'settings');
    const cmsSnap = await getDoc(cmsRef);
    if (!cmsSnap.exists()) {
      await setDoc(cmsRef, {
        ...DEFAULT_CMS_SETTINGS,
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = cmsSnap.data() as Partial<CmsSettings>;
      const missingNewKeys =
        existing.bkashNumber === undefined ||
        existing.nagadNumber === undefined ||
        existing.logoUrl === undefined ||
        existing.heroImageUrl === undefined ||
        existing.offerLink === undefined ||
        existing.accentColor === undefined ||
        existing.bgTheme === undefined ||
        existing.maintenanceMode === undefined ||
        existing.depositsEnabled === undefined ||
        existing.withdrawsEnabled === undefined ||
        existing.registrationEnabled === undefined ||
        existing.dailyClaimEnabled === undefined ||
        existing.welcomeBonusEnabled === undefined ||
        existing.referralEnabled === undefined ||
        existing.kycRequiredForWithdraw === undefined ||
        existing.showHeroStats === undefined ||
        existing.showTutorialsSection === undefined ||
        existing.showAppInstallCard === undefined;

      if (missingNewKeys || existing.brandName === 'VaultPro Fintech') {
        const merged: CmsSettings = {
          ...DEFAULT_CMS_SETTINGS,
          ...existing,
          brandName:
            existing.brandName === 'VaultPro Fintech' || !existing.brandName
              ? 'Money Fair'
              : existing.brandName,
          bkashNumber: existing.bkashNumber || existing.paymentNumber || DEFAULT_CMS_SETTINGS.bkashNumber,
          nagadNumber: existing.nagadNumber || existing.paymentNumber || DEFAULT_CMS_SETTINGS.nagadNumber,
        };
        await setDoc(cmsRef, {
          ...merged,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'cms/settings');
  }

  try {
    const snap = await getDocs(collection(db, 'packages'));
    if (snap.empty) {
      for (const pkg of DEFAULT_PACKAGES) {
        await setDoc(doc(db, 'packages', pkg.id), {
          ...pkg,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'packages');
  }
}
