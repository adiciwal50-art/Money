export interface TimestampLike {
  toDate: () => Date;
  toMillis: () => number;
  seconds: number;
  nanoseconds: number;
}

export type AccentColorTheme = 'amber' | 'emerald' | 'blue' | 'rose';
export type BgThemeOption = 'midnight' | 'obsidian' | 'navy';

export interface CmsSettings {
  brandName: string;
  logoUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string;
  noticeText: string;
  paymentNumber: string;
  bkashNumber: string;
  nagadNumber: string;
  bkashEnabled: boolean;
  nagadEnabled: boolean;
  welcomeBonus: number;
  referBonus: number;
  depositBonusPercent: number;
  minDeposit: number;
  minWithdraw: number;
  telegramUrl: string;
  youtubeUrl: string;
  facebookUrl: string;
  offerActive: boolean;
  offerTitle: string;
  offerDescription: string;
  offerImageUrl: string;
  offerCtaText: string;
  offerLink: string;
  accentColor: AccentColorTheme;
  bgTheme: BgThemeOption;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  depositsEnabled: boolean;
  withdrawsEnabled: boolean;
  registrationEnabled: boolean;
  dailyClaimEnabled: boolean;
  welcomeBonusEnabled: boolean;
  referralEnabled: boolean;
  kycRequiredForWithdraw: boolean;
  showHeroStats: boolean;
  showTutorialsSection: boolean;
  showAppInstallCard: boolean;
  updatedAt?: TimestampLike;
}

export interface PackageItem {
  id: string;
  name: string;
  description: string;
  price: number;
  dailyIncome: number;
  durationDays: number;
  imageUrl: string;
  badgeLabel: string;
  active: boolean;
  sortOrder: number;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
}

export type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface UserProfile {
  uid: string;
  fullName: string;
  phone: string;
  email: string;
  balance: number;
  heldBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalEarned: number;
  welcomeBonusClaimed: boolean;
  referralCode: string;
  referredBy: string;
  firstDepositRewarded: boolean;
  kycStatus: KycStatus;
  kycMaskedId: string;
  isLocked: boolean;
  isDeleted: boolean;
  deviceInfo: string;
  appInstalled: boolean;
  lastClaimPkgId: string;
  lastLoginAt?: TimestampLike;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
}

export interface UserPackage {
  id: string;
  userId: string;
  packageId: string;
  packageName: string;
  price: number;
  dailyIncome: number;
  durationDays: number;
  daysClaimed: number;
  purchasedAt?: TimestampLike;
  lastClaimedAt?: TimestampLike;
  nextClaimAt?: TimestampLike;
  expiresAt?: TimestampLike;
  status: 'active' | 'completed';
  updatedAt?: TimestampLike;
}

export type TxType =
  | 'deposit'
  | 'withdraw'
  | 'welcome_bonus'
  | 'refer_bonus'
  | 'package_buy'
  | 'daily_claim'
  | 'admin_adjust'
  | 'admin_bonus';

export type TxMethod = 'bkash' | 'nagad' | 'wallet' | 'system';
export type TxStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface TransactionRecord {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  type: TxType;
  amount: number;
  bonusAmount: number;
  method: TxMethod;
  senderNumber: string;
  receiverNumber: string;
  trxId: string;
  status: TxStatus;
  adminNote: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
}

export interface KycSubmission {
  userId: string;
  fullName: string;
  documentType: 'nid' | 'passport' | 'driving_license';
  maskedNumber: string;
  encryptedDetails: string;
  documentImage: string;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason: string;
  submittedAt?: TimestampLike;
  updatedAt?: TimestampLike;
}

export interface SupportChatThread {
  userId: string;
  userName: string;
  userContact: string;
  lastMessage: string;
  unreadByAdmin: number;
  unreadByUser: number;
  updatedAt?: TimestampLike;
}

export interface SupportMessage {
  id: string;
  senderId: string;
  senderRole: 'user' | 'admin';
  text: string;
  createdAt?: TimestampLike;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userLabel: string;
  action: string;
  details: string;
  deviceInfo: string;
  severity: 'info' | 'warning' | 'security';
  createdAt?: TimestampLike;
}

export interface AppDownloadRecord {
  id: string;
  userId: string;
  platform: string;
  userAgent: string;
  createdAt?: TimestampLike;
}
