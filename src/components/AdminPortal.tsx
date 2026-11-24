import React, { useEffect, useState } from 'react';
import {
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  Activity,
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  Gift,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Link as LinkIcon,
  Lock,
  LogOut,
  MessageSquare,
  Package,
  Palette,
  Plus,
  PlusCircle,
  Power,
  Search,
  Send,
  Settings,
  Share2,
  ShieldAlert,
  Trash2,
  Unlock,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  compressImageFile,
  DEFAULT_CMS_SETTINGS,
  DEFAULT_OFFER_IMAGE_URL,
  ensureAdminDefaultsSeeded,
  formatBDT,
  generateId,
  getPublicShareOrigin,
  HERO_IMAGE_URL,
  isPreviewHostingUrl,
  logActivity,
} from '../lib/seedAndHelpers';
import {
  AccentColorTheme,
  ActivityLog,
  AppDownloadRecord,
  BgThemeOption,
  CmsSettings,
  KycSubmission,
  PackageItem,
  SupportChatThread,
  SupportMessage,
  TransactionRecord,
  UserPackage,
  UserProfile,
} from '../types';
import { BrandMark } from './BrandLogos';

const SUPER_ADMIN_EMAIL = 'adiciwal50@gmail.com';

type AdminTab = 'analytics' | 'approvals' | 'users' | 'kyc' | 'cms' | 'support_logs';

interface AdminPortalProps {
  firebaseUser: FirebaseUser | null;
  cms: CmsSettings;
  packages: PackageItem[];
  onExitAdmin?: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  firebaseUser,
  cms,
  packages,
  onExitAdmin,
}) => {
  const [adminToken, setAdminToken] = useState<string>('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [passcodeConfigured, setPasscodeConfigured] = useState<boolean | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminFirebasePass, setAdminFirebasePass] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [confirmPasscodeInput, setConfirmPasscodeInput] = useState('');
  const [gateError, setGateError] = useState('');
  const [submittingGate, setSubmittingGate] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminPasscode, setNewAdminPasscode] = useState('');
  const [confirmNewAdminPasscode, setConfirmNewAdminPasscode] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Live collections (only subscribed when unlocked)
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [userPackages, setUserPackages] = useState<UserPackage[]>([]);
  const [kycList, setKycList] = useState<KycSubmission[]>([]);
  const [supportThreads, setSupportThreads] = useState<SupportChatThread[]>([]);
  const [selectedThreadUid, setSelectedThreadUid] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<SupportMessage[]>([]);
  const [adminReply, setAdminReply] = useState('');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [appDownloads, setAppDownloads] = useState<AppDownloadRecord[]>([]);

  // Search & inspect states
  const [userSearch, setUserSearch] = useState('');
  const [inspectUser, setInspectUser] = useState<UserProfile | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [decryptedKycMap, setDecryptedKycMap] = useState<Record<string, string>>({});
  const [rejectReasonMap, setRejectReasonMap] = useState<Record<string, string>>({});

  // CMS editor local state
  const [cmsDraft, setCmsDraft] = useState<CmsSettings>({ ...DEFAULT_CMS_SETTINGS, ...cms });
  const [savingCms, setSavingCms] = useState(false);
  const [cmsSection, setCmsSection] = useState<'design' | 'packages' | 'systems' | 'offers_auth'>('design');

  // Package editor state
  const [editingPkg, setEditingPkg] = useState<Partial<PackageItem> | null>(null);
  const [savingPkg, setSavingPkg] = useState(false);

  // Manual deposit/withdraw confirmation & overrides
  const [editableDepositAmounts, setEditableDepositAmounts] = useState<Record<string, string>>({});
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualUserId, setManualUserId] = useState('');
  const [manualActionType, setManualActionType] = useState<'manual_deposit' | 'manual_withdraw'>('manual_deposit');
  const [manualMethod, setManualMethod] = useState<'bkash' | 'nagad' | 'wallet'>('bkash');
  const [manualAmount, setManualAmount] = useState('');
  const [manualBonus, setManualBonus] = useState('0');
  const [manualTrxId, setManualTrxId] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);

  // Bonus states (individual & bulk)
  const [bonusTargetUser, setBonusTargetUser] = useState<UserProfile | null>(null);
  const [bonusAmountInput, setBonusAmountInput] = useState('');
  const [bonusReasonInput, setBonusReasonInput] = useState('');
  const [sendingBonus, setSendingBonus] = useState(false);
  const [showBulkBonus, setShowBulkBonus] = useState(false);
  const [bulkBonusAmount, setBulkBonusAmount] = useState('');
  const [bulkBonusReason, setBulkBonusReason] = useState('');
  const [sendingBulkBonus, setSendingBulkBonus] = useState(false);

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    setCmsDraft({ ...DEFAULT_CMS_SETTINGS, ...cms });
  }, [cms]);

  const isSuperAdminIdentity =
    Boolean(firebaseUser) &&
    firebaseUser?.emailVerified === true &&
    firebaseUser?.email === SUPER_ADMIN_EMAIL;

  // Check backend passcode status when Super Admin is signed in
  useEffect(() => {
    if (!firebaseUser) {
      setAdminToken('');
      setPasscodeConfigured(null);
      return;
    }

    if (!isSuperAdminIdentity) {
      void logActivity({
        userId: firebaseUser.uid,
        userLabel: firebaseUser.email || 'Unknown',
        action: 'suspicious_admin_probe',
        details: 'অননুমোদিত অ্যাকাউন্ট থেকে অ্যাডমিন পোর্টালে প্রবেশের চেষ্টা',
        severity: 'security',
      });
      return;
    }

    let cancelled = false;
    const checkStatus = async () => {
      setStatusLoading(true);
      setGateError('');
      try {
        const idToken = await firebaseUser.getIdToken();
        const res = await fetch('/api/admin/status', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) throw new Error('অ্যাডমিন স্ট্যাটাস যাচাই ব্যর্থ হয়েছে');
        const data = (await res.json()) as { configured: boolean };
        if (!cancelled) setPasscodeConfigured(data.configured);
      } catch (err) {
        if (!cancelled) setGateError(err instanceof Error ? err.message : 'ত্রুটি হয়েছে');
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    };
    void checkStatus();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, isSuperAdminIdentity]);

  // Bootstrap admin lock doc + default CMS/packages & subscribe to real-time data once unlocked
  useEffect(() => {
    if (!isSuperAdminIdentity || !adminToken || !firebaseUser) return;

    const bootstrap = async () => {
      try {
        await setDoc(
          doc(db, 'admins', firebaseUser.uid),
          {
            uid: firebaseUser.uid,
            email: SUPER_ADMIN_EMAIL,
            role: 'super_admin',
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
        await ensureAdminDefaultsSeeded();
      } catch (err) {
        console.warn('Admin bootstrap note:', err);
      }
    };
    void bootstrap();

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => setUsers(snap.docs.map((d) => d.data() as UserProfile)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubTx = onSnapshot(
      query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(250)),
      (snap) => setTransactions(snap.docs.map((d) => d.data() as TransactionRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    const unsubUserPkgs = onSnapshot(
      collection(db, 'userPackages'),
      (snap) => setUserPackages(snap.docs.map((d) => d.data() as UserPackage)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'userPackages')
    );

    const unsubKyc = onSnapshot(
      collection(db, 'kycSubmissions'),
      (snap) => setKycList(snap.docs.map((d) => d.data() as KycSubmission)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'kycSubmissions')
    );

    const unsubChats = onSnapshot(
      query(collection(db, 'supportChats'), orderBy('updatedAt', 'desc')),
      (snap) => setSupportThreads(snap.docs.map((d) => d.data() as SupportChatThread)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'supportChats')
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(120)),
      (snap) => setActivityLogs(snap.docs.map((d) => d.data() as ActivityLog)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'activityLogs')
    );

    const unsubDownloads = onSnapshot(
      query(collection(db, 'appDownloads'), orderBy('createdAt', 'desc'), limit(120)),
      (snap) => setAppDownloads(snap.docs.map((d) => d.data() as AppDownloadRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'appDownloads')
    );

    return () => {
      unsubUsers();
      unsubTx();
      unsubUserPkgs();
      unsubKyc();
      unsubChats();
      unsubLogs();
      unsubDownloads();
    };
  }, [isSuperAdminIdentity, adminToken, firebaseUser]);

  // Subscribe to selected chat thread messages
  useEffect(() => {
    if (!selectedThreadUid || !adminToken) {
      setThreadMessages([]);
      return;
    }
    const q = query(
      collection(db, 'supportChats', selectedThreadUid, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => setThreadMessages(snap.docs.map((d) => d.data() as SupportMessage)),
      (err) => handleFirestoreError(err, OperationType.LIST, `supportChats/${selectedThreadUid}/messages`)
    );
    return () => unsub();
  }, [selectedThreadUid, adminToken]);

  const handleAdminGoogleSignIn = async () => {
    setGateError('');
    setSubmittingGate(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      setGateError('Google প্রমাণীকরণ ব্যর্থ হয়েছে।');
    } finally {
      setSubmittingGate(false);
    }
  };

  const handleAdminEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError('');
    if (!adminEmail.trim() || !adminFirebasePass) {
      setGateError('অনুগ্রহ করে অ্যাডমিন ইমেইল ও পাসওয়ার্ড দিন।');
      return;
    }
    setSubmittingGate(true);
    try {
      await signInWithEmailAndPassword(auth, adminEmail.trim(), adminFirebasePass);
      setAdminFirebasePass('');
    } catch {
      setGateError('ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।');
    } finally {
      setSubmittingGate(false);
    }
  };

  const handleSendAdminVerification = async () => {
    if (!firebaseUser) return;
    setGateError('');
    try {
      await sendEmailVerification(firebaseUser);
      setVerificationSent(true);
    } catch {
      setGateError('ভেরিফিকেশন ইমেইল পাঠানো যায়নি। নিচের Google বাটন দিয়ে সরাসরি ভেরিফাই করুন।');
    }
  };

  const handleClaimPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setGateError('');
    if (adminUsername.trim().length < 4) {
      setGateError('অ্যাডমিন ইউজারনেম কমপক্ষে ৪ অক্ষরের হতে হবে।');
      return;
    }
    if (passcodeInput.trim().length < 8) {
      setGateError('অ্যাডমিন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।');
      return;
    }
    if (passcodeInput !== confirmPasscodeInput) {
      setGateError('দুটি পাসওয়ার্ড মিলছে না।');
      return;
    }
    setSubmittingGate(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/claim-passcode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          username: adminUsername.trim(),
          passcode: passcodeInput.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; adminToken?: string; error?: string };
      if (!res.ok || !data.adminToken) throw new Error(data.error || 'ইউজার ও পাসওয়ার্ড সেট করা যায়নি');
      setAdminToken(data.adminToken);
      setPasscodeConfigured(true);
      setPasscodeInput('');
      setConfirmPasscodeInput('');
    } catch (err) {
      setGateError(err instanceof Error ? err.message : 'ত্রুটি হয়েছে');
    } finally {
      setSubmittingGate(false);
    }
  };

  const handleUnlockPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setGateError('');
    if (adminUsername.trim().length < 4) {
      setGateError('সঠিক অ্যাডমিন ইউজারনেম দিন।');
      return;
    }
    setSubmittingGate(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/unlock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          username: adminUsername.trim(),
          passcode: passcodeInput,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; adminToken?: string; error?: string };
      if (!res.ok || !data.adminToken) throw new Error(data.error || 'ভুল ইউজারনেম অথবা পাসওয়ার্ড');
      setAdminToken(data.adminToken);
      setPasscodeInput('');
    } catch (err) {
      setGateError(err instanceof Error ? err.message : 'ভুল ইউজারনেম অথবা পাসওয়ার্ড');
    } finally {
      setSubmittingGate(false);
    }
  };

  const handleChangeAdminCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !adminToken) return;
    if (newAdminUsername.trim().length < 4) {
      notify('নতুন ইউজারনেম কমপক্ষে ৪ অক্ষরের হতে হবে।', 'error');
      return;
    }
    if (newAdminPasscode.trim().length < 8) {
      notify('নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।', 'error');
      return;
    }
    if (newAdminPasscode !== confirmNewAdminPasscode) {
      notify('নতুন পাসওয়ার্ড দুটি মিলছে না।', 'error');
      return;
    }
    setSavingCreds(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/change-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'x-admin-session': adminToken,
        },
        body: JSON.stringify({
          username: newAdminUsername.trim(),
          passcode: newAdminPasscode.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; adminToken?: string; error?: string };
      if (!res.ok || !data.adminToken) {
        throw new Error(data.error || 'অ্যাডমিন লগইন তথ্য পরিবর্তন করা যায়নি');
      }
      setAdminToken(data.adminToken);
      setNewAdminUsername('');
      setNewAdminPasscode('');
      setConfirmNewAdminPasscode('');
      notify('অ্যাডমিন ইউজারনেম ও পাসওয়ার্ড সফলভাবে আপডেট হয়েছে!');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ত্রুটি হয়েছে', 'error');
    } finally {
      setSavingCreds(false);
    }
  };

  const handleToggleUserPackageStatus = async (up: UserPackage) => {
    const nextStatus = up.status === 'active' ? 'completed' : 'active';
    try {
      await updateDoc(doc(db, 'userPackages', up.id), {
        status: nextStatus,
      });
      notify(
        nextStatus === 'active'
          ? 'ইউজারের প্যাকেজ পুনরায় সক্রিয় করা হয়েছে।'
          : 'ইউজারের প্যাকেজ সমাপ্ত হিসেবে চিহ্নিত হয়েছে।'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `userPackages/${up.id}`);
    }
  };

  // --- Admin Business Actions ---
  const handleApproveDeposit = async (tx: TransactionRecord, overrideAmount?: number) => {
    try {
      const userSnap = await getDoc(doc(db, 'users', tx.userId));
      if (!userSnap.exists()) {
        notify('ইউজার খুঁজে পাওয়া যায়নি।', 'error');
        return;
      }
      const targetUser = userSnap.data() as UserProfile;
      const confirmedAmount =
        overrideAmount && Number.isFinite(overrideAmount) && overrideAmount > 0
          ? overrideAmount
          : tx.amount;
      const confirmedBonus =
        confirmedAmount !== tx.amount && cms.depositBonusPercent > 0
          ? Math.round((confirmedAmount * cms.depositBonusPercent) / 100)
          : tx.bonusAmount || 0;
      const totalCredit = confirmedAmount + confirmedBonus;
      const batch = writeBatch(db);

      batch.update(doc(db, 'transactions', tx.id), {
        amount: confirmedAmount,
        bonusAmount: confirmedBonus,
        status: 'approved',
        adminNote:
          confirmedAmount !== tx.amount
            ? `অ্যাডমিন যাচাই করে ৳${confirmedAmount} অনুমোদন করেছেন`
            : 'অ্যাডমিন কর্তৃক অনুমোদিত',
        updatedAt: serverTimestamp(),
      });

      const shouldRewardReferrer = Boolean(targetUser.referredBy) && !targetUser.firstDepositRewarded;

      batch.update(doc(db, 'users', targetUser.uid), {
        balance: targetUser.balance + totalCredit,
        totalDeposited: targetUser.totalDeposited + confirmedAmount,
        firstDepositRewarded: targetUser.firstDepositRewarded || shouldRewardReferrer,
        updatedAt: serverTimestamp(),
      });

      if (shouldRewardReferrer && cms.referralEnabled !== false) {
        const refSnap = await getDoc(doc(db, 'users', targetUser.referredBy));
        if (refSnap.exists()) {
          const referrer = refSnap.data() as UserProfile;
          const refBonus = Number(cms.referBonus) || 120;
          const refTxId = generateId('ref');
          batch.update(doc(db, 'users', referrer.uid), {
            balance: referrer.balance + refBonus,
            totalEarned: referrer.totalEarned + refBonus,
            updatedAt: serverTimestamp(),
          });
          batch.set(doc(db, 'transactions', refTxId), {
            id: refTxId,
            userId: referrer.uid,
            userName: referrer.fullName,
            userPhone: referrer.phone || referrer.email,
            type: 'refer_bonus',
            amount: refBonus,
            bonusAmount: 0,
            method: 'system',
            senderNumber: '',
            receiverNumber: '',
            trxId: '',
            status: 'completed',
            adminNote: `${targetUser.fullName}-এর প্রথম ডিপোজিট রেফার বোনাস`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
      void logActivity({
        userId: targetUser.uid,
        userLabel: targetUser.fullName,
        action: 'admin_deposit_approved',
        details: `${formatBDT(totalCredit)} ডিপোজিট অ্যাপ্রুভ করা হয়েছে`,
      });
      notify('ডিপোজিট সফলভাবে কনফার্ম ও ব্যালেন্সে যোগ হয়েছে!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `transactions/${tx.id}`);
    }
  };

  const handleRejectDeposit = async (tx: TransactionRecord) => {
    try {
      await updateDoc(doc(db, 'transactions', tx.id), {
        status: 'rejected',
        adminNote: 'TrxID যাচাইয়ে মেলেনি',
        updatedAt: serverTimestamp(),
      });
      notify('ডিপোজিট রিকোয়েস্ট বাতিল করা হয়েছে।');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `transactions/${tx.id}`);
    }
  };

  const handleApproveWithdraw = async (tx: TransactionRecord) => {
    try {
      const userSnap = await getDoc(doc(db, 'users', tx.userId));
      if (!userSnap.exists()) return;
      const targetUser = userSnap.data() as UserProfile;
      const batch = writeBatch(db);
      batch.update(doc(db, 'transactions', tx.id), {
        status: 'approved',
        adminNote: 'পেমেন্ট প্রেরণ সম্পন্ন',
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', targetUser.uid), {
        heldBalance: Math.max(0, targetUser.heldBalance - tx.amount),
        totalWithdrawn: targetUser.totalWithdrawn + tx.amount,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      notify('উইথড্র অ্যাপ্রুভ ও কমপ্লিট করা হয়েছে!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `transactions/${tx.id}`);
    }
  };

  const handleRejectWithdraw = async (tx: TransactionRecord) => {
    try {
      const userSnap = await getDoc(doc(db, 'users', tx.userId));
      if (!userSnap.exists()) return;
      const targetUser = userSnap.data() as UserProfile;
      const batch = writeBatch(db);
      batch.update(doc(db, 'transactions', tx.id), {
        status: 'rejected',
        adminNote: 'বাতিল ও ব্যালেন্স ফেরত',
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', targetUser.uid), {
        balance: targetUser.balance + tx.amount,
        heldBalance: Math.max(0, targetUser.heldBalance - tx.amount),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      notify('উইথড্র বাতিল করে ইউজারের ব্যালেন্স ফেরত দেওয়া হয়েছে!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `transactions/${tx.id}`);
    }
  };

  const handleDirectManualTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(manualAmount);
    const bonusNum = Math.max(0, Number(manualBonus) || 0);
    if (!manualUserId) {
      notify('অনুগ্রহ করে একজন ইউজার নির্বাচন করুন।', 'error');
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      notify('সঠিক টাকার পরিমাণ লিখুন।', 'error');
      return;
    }

    setSubmittingManual(true);
    try {
      const userSnap = await getDoc(doc(db, 'users', manualUserId));
      if (!userSnap.exists()) {
        notify('নির্বাচিত ইউজার পাওয়া যায়নি।', 'error');
        return;
      }
      const targetUser = userSnap.data() as UserProfile;
      const txId = generateId(manualActionType === 'manual_deposit' ? 'mdep' : 'mwdr');
      const gatewayNum =
        manualMethod === 'bkash'
          ? cms.bkashNumber || cms.paymentNumber
          : manualMethod === 'nagad'
            ? cms.nagadNumber || cms.paymentNumber
            : '';

      if (manualActionType === 'manual_deposit') {
        const totalCredit = amountNum + bonusNum;
        const shouldRewardReferrer =
          Boolean(targetUser.referredBy) && !targetUser.firstDepositRewarded;
        const batch = writeBatch(db);

        batch.set(doc(db, 'transactions', txId), {
          id: txId,
          userId: targetUser.uid,
          userName: targetUser.fullName,
          userPhone: targetUser.phone || targetUser.email,
          type: 'deposit',
          amount: amountNum,
          bonusAmount: bonusNum,
          method: manualMethod,
          senderNumber: targetUser.phone || 'সরাসরি',
          receiverNumber: gatewayNum,
          trxId: manualTrxId.trim() || 'DIRECT-ADMIN',
          status: 'approved',
          adminNote: manualNote.trim() || 'অ্যাডমিন কর্তৃক সরাসরি ম্যানুয়াল ডিপোজিট কনফার্ম',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        batch.update(doc(db, 'users', targetUser.uid), {
          balance: targetUser.balance + totalCredit,
          totalDeposited: targetUser.totalDeposited + amountNum,
          firstDepositRewarded: targetUser.firstDepositRewarded || shouldRewardReferrer,
          updatedAt: serverTimestamp(),
        });

        if (shouldRewardReferrer && cms.referralEnabled !== false) {
          const refSnap = await getDoc(doc(db, 'users', targetUser.referredBy));
          if (refSnap.exists()) {
            const referrer = refSnap.data() as UserProfile;
            const refBonus = Number(cms.referBonus) || 120;
            const refTxId = generateId('ref');
            batch.update(doc(db, 'users', referrer.uid), {
              balance: referrer.balance + refBonus,
              totalEarned: referrer.totalEarned + refBonus,
              updatedAt: serverTimestamp(),
            });
            batch.set(doc(db, 'transactions', refTxId), {
              id: refTxId,
              userId: referrer.uid,
              userName: referrer.fullName,
              userPhone: referrer.phone || referrer.email,
              type: 'refer_bonus',
              amount: refBonus,
              bonusAmount: 0,
              method: 'system',
              senderNumber: '',
              receiverNumber: '',
              trxId: '',
              status: 'completed',
              adminNote: `${targetUser.fullName}-এর প্রথম ডিপোজিট রেফার বোনাস`,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }

        await batch.commit();
        void logActivity({
          userId: targetUser.uid,
          userLabel: targetUser.fullName,
          action: 'admin_manual_deposit',
          details: `${formatBDT(totalCredit)} সরাসরি ডিপোজিট কনফার্ম করা হয়েছে`,
        });
        notify(`${targetUser.fullName}-এর জন্য ${formatBDT(totalCredit)} ডিপোজিট কনফার্ম হয়েছে!`);
      } else {
        if (targetUser.balance < amountNum) {
          notify('ইউজারের অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই!', 'error');
          return;
        }
        const batch = writeBatch(db);
        batch.set(doc(db, 'transactions', txId), {
          id: txId,
          userId: targetUser.uid,
          userName: targetUser.fullName,
          userPhone: targetUser.phone || targetUser.email,
          type: 'withdraw',
          amount: amountNum,
          bonusAmount: 0,
          method: manualMethod,
          senderNumber: '',
          receiverNumber: targetUser.phone || 'সরাসরি',
          trxId: manualTrxId.trim() || 'DIRECT-PAYOUT',
          status: 'approved',
          adminNote: manualNote.trim() || 'অ্যাডমিন কর্তৃক সরাসরি ম্যানুয়াল উত্তোলন কনফার্ম',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'users', targetUser.uid), {
          balance: targetUser.balance - amountNum,
          totalWithdrawn: targetUser.totalWithdrawn + amountNum,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        void logActivity({
          userId: targetUser.uid,
          userLabel: targetUser.fullName,
          action: 'admin_manual_withdraw',
          details: `${formatBDT(amountNum)} সরাসরি উত্তোলন কনফার্ম করা হয়েছে`,
        });
        notify(`${targetUser.fullName}-এর ${formatBDT(amountNum)} উত্তোলন কনফার্ম হয়েছে!`);
      }

      setManualAmount('');
      setManualBonus('0');
      setManualTrxId('');
      setManualNote('');
      setShowManualForm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'transactions/manual');
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleToggleLockUser = async (target: UserProfile) => {
    try {
      const nextLock = !target.isLocked;
      await updateDoc(doc(db, 'users', target.uid), {
        isLocked: nextLock,
        updatedAt: serverTimestamp(),
      });
      void logActivity({
        userId: target.uid,
        userLabel: target.fullName,
        action: nextLock ? 'remote_account_locked' : 'remote_account_unlocked',
        details: nextLock ? 'সুপার অ্যাডমিন দূর থেকে অ্যাকাউন্ট লক করেছেন' : 'অ্যাকাউন্ট আনলক করা হয়েছে',
        severity: 'security',
      });
      notify(nextLock ? 'ইউজার অ্যাকাউন্ট রিমোটলি লক করা হয়েছে।' : 'ইউজার অ্যাকাউন্ট আনলক করা হয়েছে।');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
    }
  };

  const handleRemoteDeleteUser = async (target: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', target.uid), {
        isDeleted: true,
        isLocked: true,
        updatedAt: serverTimestamp(),
      });
      void logActivity({
        userId: target.uid,
        userLabel: target.fullName,
        action: 'remote_account_deleted',
        details: 'সুপার অ্যাডমিন অ্যাকাউন্টটি রিমোটলি ডিলিট/ডিসেবল করেছেন',
        severity: 'security',
      });
      if (inspectUser?.uid === target.uid) setInspectUser(null);
      notify('অ্যাকাউন্ট রিমোটলি ডিলিট ও নিষ্ক্রিয় করা হয়েছে।');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
    }
  };

  const handleAdjustBalance = async (target: UserProfile, delta: number) => {
    if (!Number.isFinite(delta) || delta === 0) return;
    const nextBalance = Math.max(0, target.balance + delta);
    const txId = generateId('adj');
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', target.uid), {
        balance: nextBalance,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'transactions', txId), {
        id: txId,
        userId: target.uid,
        userName: target.fullName,
        userPhone: target.phone || target.email,
        type: 'admin_adjust',
        amount: Math.abs(delta),
        bonusAmount: 0,
        method: 'system',
        senderNumber: '',
        receiverNumber: '',
        trxId: '',
        status: 'completed',
        adminNote: delta > 0 ? 'অ্যাডমিন কর্তৃক যুক্ত' : 'অ্যাডমিন কর্তৃক কর্তন',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setAdjustAmount('');
      setInspectUser({ ...target, balance: nextBalance });
      notify('ব্যালেন্স আপডেট করা হয়েছে!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${target.uid}`);
    }
  };

  const handleGiveUserBonus = async (e: React.FormEvent, targetOverride?: UserProfile) => {
    e.preventDefault();
    const target = targetOverride || bonusTargetUser;
    const amount = Number(bonusAmountInput);
    if (!target || !Number.isFinite(amount) || amount <= 0) {
      notify('সঠিক বোনাসের পরিমাণ লিখুন।', 'error');
      return;
    }
    setSendingBonus(true);
    try {
      const userSnap = await getDoc(doc(db, 'users', target.uid));
      const latestUser = userSnap.exists() ? (userSnap.data() as UserProfile) : target;
      const txId = generateId('bon');
      const note = bonusReasonInput.trim() || 'অ্যাডমিন বিশেষ বোনাস';
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', latestUser.uid), {
        balance: latestUser.balance + amount,
        totalEarned: latestUser.totalEarned + amount,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'transactions', txId), {
        id: txId,
        userId: latestUser.uid,
        userName: latestUser.fullName,
        userPhone: latestUser.phone || latestUser.email,
        type: 'admin_bonus',
        amount,
        bonusAmount: 0,
        method: 'system',
        senderNumber: '',
        receiverNumber: '',
        trxId: '',
        status: 'completed',
        adminNote: note,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      void logActivity({
        userId: latestUser.uid,
        userLabel: latestUser.fullName,
        action: 'admin_bonus_credited',
        details: `${formatBDT(amount)} বোনাস যোগ করা হয়েছে (${note})`,
      });
      if (inspectUser?.uid === latestUser.uid) {
        setInspectUser({
          ...latestUser,
          balance: latestUser.balance + amount,
          totalEarned: latestUser.totalEarned + amount,
        });
      }
      setBonusTargetUser(null);
      setBonusAmountInput('');
      setBonusReasonInput('');
      notify(`${latestUser.fullName}-এর অ্যাকাউন্টে ${formatBDT(amount)} বোনাস যোগ হয়েছে!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${target.uid}`);
    } finally {
      setSendingBonus(false);
    }
  };

  const handleSendBulkBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(bulkBonusAmount);
    const activeUsersList = users.filter((u) => !u.isDeleted);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify('সঠিক বোনাস পরিমাণ দিন।', 'error');
      return;
    }
    if (activeUsersList.length === 0) {
      notify('কোনো সক্রিয় ইউজার নেই।', 'error');
      return;
    }

    setSendingBulkBonus(true);
    const note = bulkBonusReason.trim() || 'সকল সদস্যের জন্য অ্যাডমিন বোনাস';
    try {
      // Chunk 200 users per writeBatch (2 writes per user = 400 ops <= 500 limit)
      for (let i = 0; i < activeUsersList.length; i += 200) {
        const chunk = activeUsersList.slice(i, i + 200);
        const batch = writeBatch(db);
        chunk.forEach((u) => {
          const txId = generateId('bbon');
          batch.update(doc(db, 'users', u.uid), {
            balance: u.balance + amount,
            totalEarned: u.totalEarned + amount,
            updatedAt: serverTimestamp(),
          });
          batch.set(doc(db, 'transactions', txId), {
            id: txId,
            userId: u.uid,
            userName: u.fullName,
            userPhone: u.phone || u.email,
            type: 'admin_bonus',
            amount,
            bonusAmount: 0,
            method: 'system',
            senderNumber: '',
            receiverNumber: '',
            trxId: '',
            status: 'completed',
            adminNote: note,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      void logActivity({
        userId: firebaseUser?.uid || 'admin',
        userLabel: 'সুপার অ্যাডমিন',
        action: 'bulk_bonus_credited',
        details: `${activeUsersList.length} জন ইউজারকে ${formatBDT(amount)} করে বোনাস দেওয়া হয়েছে`,
      });
      setBulkBonusAmount('');
      setBulkBonusReason('');
      setShowBulkBonus(false);
      notify(`মোট ${activeUsersList.length} জন ইউজারের অ্যাকাউন্টে ${formatBDT(amount)} বোনাস যোগ হয়েছে!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users/bulkBonus');
    } finally {
      setSendingBulkBonus(false);
    }
  };

  const handleDecryptKyc = async (kyc: KycSubmission) => {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/crypto/unseal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'x-admin-session': adminToken,
        },
        body: JSON.stringify({ userId: kyc.userId, sealed: kyc.encryptedDetails }),
      });
      const data = (await res.json()) as { plaintext?: string; error?: string };
      if (!res.ok || !data.plaintext) throw new Error(data.error || 'ডিক্রিপ্ট ব্যর্থ');
      setDecryptedKycMap((prev) => ({ ...prev, [kyc.userId]: data.plaintext! }));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ডিক্রিপ্ট করা যায়নি', 'error');
    }
  };

  const handleReviewKyc = async (kyc: KycSubmission, approve: boolean) => {
    const reason = rejectReasonMap[kyc.userId] || 'ডকুমেন্ট অস্পষ্ট অথবা তথ্য মেলেনি';
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'kycSubmissions', kyc.userId), {
        status: approve ? 'verified' : 'rejected',
        rejectionReason: approve ? '' : reason,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', kyc.userId), {
        kycStatus: approve ? 'verified' : 'rejected',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      notify(approve ? 'কেওয়াইসি ভেরিফাই করা হয়েছে!' : 'কেওয়াইসি বাতিল করা হয়েছে।');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `kycSubmissions/${kyc.userId}`);
    }
  };

  const handleCmsImageUpload = async (
    file: File,
    field: 'logoUrl' | 'heroImageUrl' | 'offerImageUrl',
    maxWidth = 720,
    quality = 0.68
  ) => {
    try {
      const compressed = await compressImageFile(file, maxWidth, quality);
      if (compressed.length > 420000) {
        notify('ছবিটি অনেক বড়। অনুগ্রহ করে অপেক্ষাকৃত ছোট ছবি দিন।', 'error');
        return;
      }
      setCmsDraft((prev) => ({ ...prev, [field]: compressed }));
      notify('ছবি লোড হয়েছে! কার্যকর করতে নিচে "সেভ করুন" বাটনে চাপ দিন।');
    } catch {
      notify('ছবিটি প্রসেস করা যায়নি।', 'error');
    }
  };

  const handleSaveCms = async (e: React.FormEvent) => {
    e.preventDefault();
    const merged = { ...DEFAULT_CMS_SETTINGS, ...cmsDraft };
    if (
      merged.logoUrl.length > 450000 ||
      merged.heroImageUrl.length > 450000 ||
      merged.offerImageUrl.length > 450000
    ) {
      notify('একটি ছবির সাইজ নির্ধারিত সীমার চেয়ে বড়। অনুগ্রহ করে ছোট ছবি ব্যবহার করুন।', 'error');
      return;
    }

    setSavingCms(true);
    try {
      const cleanBkash = (merged.bkashNumber || merged.paymentNumber || '01987474190').trim().slice(0, 30);
      const cleanNagad = (merged.nagadNumber || merged.paymentNumber || '01987474190').trim().slice(0, 30);
      const cleanDefaultPay = (merged.paymentNumber || cleanBkash || cleanNagad || '01987474190')
        .trim()
        .slice(0, 30);

      await setDoc(doc(db, 'cms', 'settings'), {
        brandName: (merged.brandName || 'Money Fair').trim().slice(0, 80) || 'Money Fair',
        logoUrl: (merged.logoUrl || '').trim(),
        heroTitle: (merged.heroTitle || '').trim().slice(0, 160),
        heroSubtitle: (merged.heroSubtitle || '').trim().slice(0, 300),
        heroImageUrl: (merged.heroImageUrl || HERO_IMAGE_URL).trim(),
        noticeText: (merged.noticeText || '').trim().slice(0, 400),
        paymentNumber: cleanDefaultPay,
        bkashNumber: cleanBkash,
        nagadNumber: cleanNagad,
        bkashEnabled: Boolean(merged.bkashEnabled),
        nagadEnabled: Boolean(merged.nagadEnabled),
        welcomeBonus: Math.min(10000, Math.max(0, Number(merged.welcomeBonus) || 0)),
        referBonus: Math.min(10000, Math.max(0, Number(merged.referBonus) || 0)),
        depositBonusPercent: Math.min(100, Math.max(0, Number(merged.depositBonusPercent) || 0)),
        minDeposit: Math.max(10, Number(merged.minDeposit) || 10),
        minWithdraw: Math.max(10, Number(merged.minWithdraw) || 10),
        telegramUrl: (merged.telegramUrl || '').trim().slice(0, 300),
        youtubeUrl: (merged.youtubeUrl || '').trim().slice(0, 300),
        facebookUrl: (merged.facebookUrl || '').trim().slice(0, 300),
        offerActive: Boolean(merged.offerActive),
        offerTitle: (merged.offerTitle || '').trim().slice(0, 120),
        offerDescription: (merged.offerDescription || '').trim().slice(0, 400),
        offerImageUrl: (merged.offerImageUrl || DEFAULT_OFFER_IMAGE_URL).trim(),
        offerCtaText: (merged.offerCtaText || '').trim().slice(0, 60),
        offerLink: (merged.offerLink || '').trim().slice(0, 300),
        accentColor: (['amber', 'emerald', 'blue', 'rose'].includes(merged.accentColor)
          ? merged.accentColor
          : 'amber') as AccentColorTheme,
        bgTheme: (['midnight', 'obsidian', 'navy'].includes(merged.bgTheme)
          ? merged.bgTheme
          : 'midnight') as BgThemeOption,
        maintenanceMode: Boolean(merged.maintenanceMode),
        maintenanceMessage: (merged.maintenanceMessage || '').trim().slice(0, 300),
        depositsEnabled: Boolean(merged.depositsEnabled),
        withdrawsEnabled: Boolean(merged.withdrawsEnabled),
        registrationEnabled: Boolean(merged.registrationEnabled),
        dailyClaimEnabled: Boolean(merged.dailyClaimEnabled),
        welcomeBonusEnabled: Boolean(merged.welcomeBonusEnabled),
        referralEnabled: Boolean(merged.referralEnabled),
        kycRequiredForWithdraw: Boolean(merged.kycRequiredForWithdraw),
        showHeroStats: Boolean(merged.showHeroStats),
        showTutorialsSection: Boolean(merged.showTutorialsSection),
        showAppInstallCard: Boolean(merged.showAppInstallCard),
        updatedAt: serverTimestamp(),
      });
      notify('সব ওয়েবসাইট কনফিগারেশন ও ডিজাইন লাইভ আপডেট হয়েছে!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'cms/settings');
    } finally {
      setSavingCms(false);
    }
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPkg) return;
    setSavingPkg(true);
    const id = editingPkg.id || generateId('pkg');
    const isNew = !packages.some((p) => p.id === id);

    try {
      const payload = {
        id,
        name: (editingPkg.name || 'নতুন প্যাকেজ').trim(),
        description: (editingPkg.description || '').trim(),
        price: Number(editingPkg.price) || 499,
        dailyIncome: Number(editingPkg.dailyIncome) || 45,
        durationDays: Number(editingPkg.durationDays) || 30,
        imageUrl: editingPkg.imageUrl || '/src/assets/images/pkg_starter_vault_1795505693930.jpg',
        badgeLabel: (editingPkg.badgeLabel || 'প্যাকেজ').trim(),
        active: editingPkg.active ?? true,
        sortOrder: Number(editingPkg.sortOrder) || packages.length + 1,
        updatedAt: serverTimestamp(),
      };

      if (isNew) {
        await setDoc(doc(db, 'packages', id), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'packages', id), payload);
      }
      setEditingPkg(null);
      notify('প্যাকেজ সফলভাবে সংরক্ষিত হয়েছে!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `packages/${id}`);
    } finally {
      setSavingPkg(false);
    }
  };

  const handleDeletePackage = async (pkgId: string) => {
    try {
      await deleteDoc(doc(db, 'packages', pkgId));
      notify('প্যাকেজ মুছে ফেলা হয়েছে।');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `packages/${pkgId}`);
    }
  };

  const handleAdminSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThreadUid || !firebaseUser || !adminReply.trim()) return;
    const clean = adminReply.trim();
    const msgId = generateId('msg');
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'supportChats', selectedThreadUid), {
        lastMessage: clean.slice(0, 480),
        unreadByAdmin: 0,
        unreadByUser: 1,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'supportChats', selectedThreadUid, 'messages', msgId), {
        id: msgId,
        senderId: firebaseUser.uid,
        senderRole: 'admin',
        text: clean.slice(0, 980),
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setAdminReply('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `supportChats/${selectedThreadUid}/messages`);
    }
  };

  // --- Gate Screens (Before Unlock) ---
  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-[#070B14] text-slate-100 flex items-center justify-center p-4">
        <div className="glass-surface max-w-md w-full rounded-3xl p-7 sm:p-8 space-y-5">
          <div className="text-center space-y-2.5">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-white">সুপার অ্যাডমিন অথেনটিকেশন</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              ধাপ ১: অনুমোদিত সুপার অ্যাডমিন অ্যাকাউন্ট দিয়ে যাচাই করুন। এরপর আপনার অ্যাডমিন ইউজার ও পাসওয়ার্ড দিয়ে প্রবেশ করবেন।
            </p>
          </div>

          <form onSubmit={handleAdminEmailSignIn} className="space-y-3">
            <input
              type="email"
              required
              placeholder="সুপার অ্যাডমিন ইমেইল"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
            />
            <input
              type="password"
              required
              placeholder="অ্যাকাউন্ট পাসওয়ার্ড"
              value={adminFirebasePass}
              onChange={(e) => setAdminFirebasePass(e.target.value)}
              className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
            />
            {gateError && <p className="text-xs text-rose-400">{gateError}</p>}
            <button
              type="submit"
              disabled={submittingGate}
              className="w-full h-11 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-colors"
            >
              {submittingGate ? 'যাচাই চলছে...' : 'ইমেইল দিয়ে প্রবেশ করুন'}
            </button>
          </form>

          <div className="relative flex items-center justify-center">
            <span className="border-t border-slate-800 w-full" />
            <span className="px-3 text-[11px] text-slate-500 bg-[#0c1220] shrink-0">অথবা</span>
            <span className="border-t border-slate-800 w-full" />
          </div>

          <button
            type="button"
            disabled={submittingGate}
            onClick={() => void handleAdminGoogleSignIn()}
            className="w-full h-11 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold text-sm hover:border-amber-500/50 transition-colors"
          >
            সুপার অ্যাডমিন Google দিয়ে যাচাই করুন
          </button>

          {onExitAdmin && (
            <button
              type="button"
              onClick={onExitAdmin}
              className="w-full pt-2 text-xs text-slate-400 hover:text-white inline-flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              ওয়েবসাইটে ফিরে যান
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!isSuperAdminIdentity) {
    const isUnverifiedSuperEmail =
      firebaseUser.email === SUPER_ADMIN_EMAIL && !firebaseUser.emailVerified;

    return (
      <div className="min-h-screen bg-[#070B14] text-slate-100 flex items-center justify-center p-4">
        <div className="glass-surface max-w-md w-full rounded-3xl p-8 space-y-5 text-center border border-rose-500/40">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-7 h-7" />
          </div>
          {isUnverifiedSuperEmail ? (
            <>
              <h1 className="text-xl font-bold text-white">ইমেইল ভেরিফিকেশন প্রয়োজন</h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                নিরাপত্তার জন্য অ্যাডমিন ইমেইল ভেরিফাইড হতে হবে। নিচের Google বাটনে ক্লিক করলে সাথে সাথে ভেরিফিকেশন সম্পন্ন হবে অথবা ভেরিফিকেশন লিংক পাঠাতে পারেন।
              </p>
              {gateError && <p className="text-xs text-rose-400">{gateError}</p>}
              {verificationSent && (
                <p className="text-xs text-emerald-400">
                  আপনার ইনবক্সে ভেরিফিকেশন ইমেইল পাঠানো হয়েছে। লিংক কনফার্ম করে রিফ্রেশ করুন।
                </p>
              )}
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={submittingGate}
                  onClick={() => void handleAdminGoogleSignIn()}
                  className="w-full h-11 rounded-xl bg-amber-500 text-slate-950 text-sm font-bold hover:bg-amber-400"
                >
                  Google দিয়ে ইমেইল ভেরিফাই ও প্রবেশ করুন
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendAdminVerification()}
                  className="w-full h-10 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700"
                >
                  ভেরিফিকেশন ইমেইল পাঠান
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white">প্রবেশাধিকার সংরক্ষিত (403)</h1>
              <p className="text-sm text-slate-300">
                বর্তমান লগইন করা অ্যাকাউন্টটি ({firebaseUser.email || 'অজানা'}) সুপার অ্যাডমিন নয়। অ্যাডমিন অ্যাকাউন্ট দিয়ে লগইন করতে সাইন আউট করুন।
              </p>
              <button
                type="button"
                onClick={() => void signOut(auth)}
                className="w-full h-11 rounded-xl bg-amber-500 text-slate-950 text-sm font-bold hover:bg-amber-400"
              >
                অন্য অ্যাকাউন্ট দিয়ে লগইন করুন
              </button>
            </>
          )}

          <div className="flex items-center justify-center gap-4 pt-1">
            {isUnverifiedSuperEmail && (
              <button
                type="button"
                onClick={() => void signOut(auth)}
                className="text-xs text-slate-400 hover:text-white"
              >
                সাইন আউট
              </button>
            )}
            {onExitAdmin && (
              <button
                type="button"
                onClick={onExitAdmin}
                className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                ওয়েবসাইটে ফিরে যান
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!adminToken) {
    return (
      <div className="min-h-screen bg-[#070B14] text-slate-100 flex items-center justify-center p-4">
        <div className="glass-gold max-w-md w-full rounded-3xl p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">
                {passcodeConfigured === false
                  ? 'অ্যাডমিন ইউজার ও পাসওয়ার্ড সেট করুন'
                  : 'ইউজার ও পাসওয়ার্ড দিয়ে অ্যাডমিন লগইন'}
              </h1>
              <p className="text-xs text-slate-300">যাচাইকৃত: {firebaseUser.email}</p>
            </div>
          </div>

          {statusLoading ? (
            <p className="text-sm text-slate-400">সার্ভার নিরাপত্তা যাচাই চলছে...</p>
          ) : passcodeConfigured === false ? (
            <form onSubmit={handleClaimPasscode} className="space-y-3.5">
              <p className="text-xs text-amber-200 leading-relaxed">
                প্রথমবার ব্যবহারের জন্য আপনার পছন্দের গোপন অ্যাডমিন ইউজারনেম এবং পাসওয়ার্ড তৈরি করুন (সার্ভারে scrypt হ্যাশ হিসেবে সংরক্ষিত থাকবে):
              </p>
              <input
                type="text"
                required
                minLength={4}
                placeholder="অ্যাডমিন ইউজারনেম (কমপক্ষে ৪ অক্ষর)"
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="নতুন অ্যাডমিন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="পাসওয়ার্ডটি আবার লিখুন"
                value={confirmPasscodeInput}
                onChange={(e) => setConfirmPasscodeInput(e.target.value)}
                className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              {gateError && <p className="text-xs text-rose-400">{gateError}</p>}
              <button
                type="submit"
                disabled={submittingGate}
                className="w-full h-11 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-colors"
              >
                {submittingGate ? 'সেট করা হচ্ছে...' : 'ইউজার ও পাসওয়ার্ড সেট করে প্রবেশ করুন'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleUnlockPasscode} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs text-slate-300 block">অ্যাডমিন ইউজারনেম</label>
                <input
                  type="text"
                  required
                  minLength={4}
                  placeholder="আপনার অ্যাডমিন ইউজারনেম লিখুন"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-300 block">অ্যাডমিন পাসওয়ার্ড</label>
                <input
                  type="password"
                  required
                  placeholder="আপনার গোপন অ্যাডমিন পাসওয়ার্ড লিখুন"
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              {gateError && <p className="text-xs text-rose-400">{gateError}</p>}
              <button
                type="submit"
                disabled={submittingGate}
                className="w-full h-11 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-colors"
              >
                {submittingGate ? 'যাচাই চলছে...' : 'অ্যাডমিন প্যানেলে প্রবেশ করুন'}
              </button>
            </form>
          )}

          {onExitAdmin && (
            <button
              type="button"
              onClick={onExitAdmin}
              className="w-full pt-1 text-xs text-slate-400 hover:text-white inline-flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              ওয়েবসাইটে ফিরে যান
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- Unlocked Admin Dashboard Metrics ---
  const pendingDeposits = transactions.filter((t) => t.type === 'deposit' && t.status === 'pending');
  const pendingWithdraws = transactions.filter((t) => t.type === 'withdraw' && t.status === 'pending');
  const pendingDepositSum = pendingDeposits.reduce((acc, t) => acc + (t.amount || 0), 0);
  const pendingWithdrawSum = pendingWithdraws.reduce((acc, t) => acc + (t.amount || 0), 0);
  const pendingKycs = kycList.filter((k) => k.status === 'pending');
  const totalDepositedSum = users.reduce((acc, u) => acc + (u.totalDeposited || 0), 0);
  const totalWithdrawnSum = users.reduce((acc, u) => acc + (u.totalWithdrawn || 0), 0);
  const activeUsers = users.filter((u) => !u.isDeleted);
  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.phone.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.referralCode.toLowerCase().includes(q)
    );
  });

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'analytics', label: 'অ্যানালিটিক্স', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'approvals',
      label: 'ডিপোজিট ও উইথড্র',
      icon: <CreditCard className="w-4 h-4" />,
      badge: pendingDeposits.length + pendingWithdraws.length,
    },
    { id: 'users', label: 'ইউজার ও বোনাস', icon: <Users className="w-4 h-4" /> },
    {
      id: 'kyc',
      label: 'কেওয়াইসি',
      icon: <FileCheck2 className="w-4 h-4" />,
      badge: pendingKycs.length,
    },
    { id: 'cms', label: 'ওয়েবসাইট, প্যাকেজ ও সিস্টেম', icon: <Settings className="w-4 h-4" /> },
    {
      id: 'support_logs',
      label: 'চ্যাট ও লগ',
      icon: <Activity className="w-4 h-4" />,
      badge: supportThreads.reduce((a, t) => a + (t.unreadByAdmin || 0), 0),
    },
  ];

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="lg:w-64 bg-slate-950/90 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 flex flex-col justify-between gap-4">
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="flex items-center gap-2.5">
              <BrandMark className="w-8 h-8" logoUrl={cms.logoUrl} />
              <div>
                <h1 className="text-sm font-bold text-white truncate max-w-[140px]">
                  {cms.brandName || 'Money Fair'} অ্যাডমিন
                </h1>
                <p className="text-[11px] text-amber-400">সম্পূর্ণ ম্যানুয়াল কন্ট্রোল</p>
              </div>
            </div>
            <div className="flex lg:hidden items-center gap-1.5">
              {onExitAdmin && (
                <button
                  type="button"
                  onClick={onExitAdmin}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-[11px] font-semibold"
                >
                  ওয়েবসাইট
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setAdminToken('');
                  void signOut(auth);
                }}
                className="p-2 rounded-lg bg-rose-500/15 text-rose-300"
                title="লক ও সাইন আউট"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[42px] px-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === item.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  {item.label}
                </span>
                {item.badge ? (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono-num ${
                      activeTab === item.id
                        ? 'bg-slate-950 text-amber-400'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>

        <div className="hidden lg:flex flex-col gap-2 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={async () => {
              const url = `${getPublicShareOrigin()}/`;
              try {
                await navigator.clipboard.writeText(url);
                notify(
                  isPreviewHostingUrl()
                    ? 'প্রিভিউ লিংক কপি হয়েছে (বাইরের মোবাইলে Google লগইন ছাড়া চালাতে Deploy বাটনে ক্লিক করে পাওয়া লিংক ব্যবহার করুন)।'
                    : 'সবার মোবাইলে চলবে এমন পাবলিক লিংক কপি হয়েছে!'
                );
              } catch {
                notify('লিংক কপি করা যায়নি।', 'error');
              }
            }}
            className="w-full h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-amber-500/25"
          >
            <Share2 className="w-4 h-4" />
            {isPreviewHostingUrl() ? 'প্রিভিউ লিংক কপি' : 'পাবলিক শেয়ার লিংক কপি'}
          </button>
          {onExitAdmin && (
            <button
              type="button"
              onClick={onExitAdmin}
              className="w-full h-10 rounded-xl bg-slate-800/90 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4" />
              লাইভ ওয়েবসাইট দেখুন
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setAdminToken('');
              void signOut(auth);
            }}
            className="w-full h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-rose-500/20"
          >
            <LogOut className="w-4 h-4" />
            লক ও সাইন আউট
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6">
        {toast && (
          <div
            className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl text-xs sm:text-sm font-semibold shadow-xl border ${
              toast.type === 'error'
                ? 'bg-rose-950/95 border-rose-500/40 text-rose-200'
                : 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* 1. Analytics */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white">রিয়েল-টাইম অ্যানালিটিক্স ও সারসংক্ষেপ</h2>

            {/* Public Mobile-Accessible Share Link Box */}
            <div
              className={`rounded-2xl p-4 sm:p-5 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isPreviewHostingUrl()
                  ? 'bg-rose-500/10 border-rose-500/35'
                  : 'glass-gold border-amber-500/35'
              }`}
            >
              <div className="space-y-1.5 min-w-0">
                <p
                  className={`text-xs font-bold flex items-center gap-1.5 ${
                    isPreviewHostingUrl() ? 'text-rose-300' : 'text-amber-300'
                  }`}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {isPreviewHostingUrl()
                    ? 'প্রিভিউ মোড — অন্যের মোবাইলে Google AI Studio লগইন ছাড়া চালাতে Deploy করুন'
                    : 'সবার মোবাইলে চলবে এমন লাইভ পাবলিক লিংক (কোনো লগইন/কুকি চেক ছাড়াই)'}
                </p>
                <p className="text-xs text-slate-200 font-mono-num truncate">
                  {`${getPublicShareOrigin()}/`}
                </p>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {isPreviewHostingUrl() ? (
                    <>
                      <strong>কেন Google AI Studio লগইন চায়?</strong> আপনি এখন AI Studio প্রিভিউ লিংক (
                      <code>ais-dev-</code> / <code>ais-pre-</code>) ব্যবহার করছেন, যা গুগল প্রাইভেট রাখে।
                      অন্যের মোবাইলে Google লগইন ছাড়াই সরাসরি ওপেন করতে AI Studio-এর উপরে থাকা{' '}
                      <strong>Deploy (রকেট আইকন / Deploy to Cloud Run)</strong> বাটনে ক্লিক করে অ্যাপটি ডিপ্লয় করুন এবং প্রাপ্ত{' '}
                      <code>.a.run.app</code> লিংকটি শেয়ার করুন।
                    </>
                  ) : (
                    <>
                      আপনি এখন ডিপ্লয় করা লাইভ সার্ভারে আছেন। এই লিংকটি অন্য কারও মোবাইলে, মেসেঞ্জারে বা হোয়াটসঅ্যাপে শেয়ার করলে কোনো Google AI Studio লগইন বা কুকি চেক ছাড়াই সরাসরি ওপেন হবে।
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    const url = `${getPublicShareOrigin()}/`;
                    try {
                      await navigator.clipboard.writeText(url);
                      notify(
                        isPreviewHostingUrl()
                          ? 'প্রিভিউ লিংক কপি হয়েছে (পাবলিক শেয়ারের জন্য Deploy-এর পর পাওয়া .a.run.app লিংক ব্যবহার করুন)।'
                          : 'পাবলিক শেয়ার লিংক কপি হয়েছে!'
                      );
                    } catch {
                      notify('লিংক কপি করা যায়নি।', 'error');
                    }
                  }}
                  className="h-9 px-3.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-amber-400"
                >
                  <Copy className="w-3.5 h-3.5" />
                  লিংক কপি করুন
                </button>
                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const url = `${getPublicShareOrigin()}/`;
                      try {
                        await navigator.share({
                          title: cms.brandName || 'Money Fair',
                          text: `${cms.brandName || 'Money Fair'} — স্মার্ট ইনকাম ও ডিজিটাল ওয়ালেট`,
                          url,
                        });
                      } catch {
                        // User cancelled
                      }
                    }}
                    className="h-9 px-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-slate-700"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    শেয়ার
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="glass-surface rounded-2xl p-5 space-y-1">
                <p className="text-xs text-slate-400">মোট ইউজার</p>
                <p className="text-2xl font-bold text-white font-mono-num">{users.length}</p>
              </div>
              <div className="glass-surface rounded-2xl p-5 space-y-1">
                <p className="text-xs text-slate-400">মোট ডিপোজিট</p>
                <p className="text-2xl font-bold text-emerald-400 font-mono-num">
                  {formatBDT(totalDepositedSum)}
                </p>
              </div>
              <div className="glass-surface rounded-2xl p-5 space-y-1">
                <p className="text-xs text-slate-400">মোট উত্তোলন</p>
                <p className="text-2xl font-bold text-amber-400 font-mono-num">
                  {formatBDT(totalWithdrawnSum)}
                </p>
              </div>
              <div className="glass-surface rounded-2xl p-5 space-y-1">
                <p className="text-xs text-slate-400">অপেক্ষমাণ ডিপোজিট / উইথড্র</p>
                <p className="text-2xl font-bold text-white font-mono-num">
                  {pendingDeposits.length} / {pendingWithdraws.length}
                </p>
              </div>
              <div className="glass-surface rounded-2xl p-5 space-y-1">
                <p className="text-xs text-slate-400">মোট অ্যাপ ডাউনলোড / ইনস্টল</p>
                <p className="text-2xl font-bold text-amber-300 font-mono-num">
                  {appDownloads.length}
                </p>
              </div>
              <div className="glass-surface rounded-2xl p-5 space-y-1">
                <p className="text-xs text-slate-400">সক্রিয় ইউজার প্যাকেজ</p>
                <p className="text-2xl font-bold text-white font-mono-num">
                  {userPackages.filter((p) => p.status === 'active').length}
                </p>
              </div>
            </div>

            <div className="glass-surface rounded-3xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">সাম্প্রতিক রিয়েল-টাইম অ্যাক্টিভিটি লগ</h3>
              <div className="divide-y divide-slate-800/80">
                {activityLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <span className="font-semibold text-white">{log.userLabel}</span>
                      <span className="text-slate-400"> · {log.details}</span>
                    </div>
                    <span className="text-slate-500 whitespace-nowrap font-mono-num">
                      {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleTimeString('bn-BD') : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. Approvals & Direct Manual Deposit/Withdraw Control */}
        {activeTab === 'approvals' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">ডিপোজিট ও উত্তোলন (ম্যানুয়াল কন্ট্রোল)</h2>
                <p className="text-xs text-slate-400">
                  সব ডিপোজিট ও উত্তোলনের লাইভ হিসাব দেখুন, কনফার্ম করুন অথবা সরাসরি অ্যাকাউন্টে এন্ট্রি করুন।
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualForm((v) => !v)}
                className="px-4 h-10 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-amber-400 shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                {showManualForm ? 'ফর্ম বন্ধ করুন' : 'সরাসরি ম্যানুয়াল ডিপোজিট / উত্তোলন করুন'}
              </button>
            </div>

            {/* Live Deposit & Withdraw Totals */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="glass-surface rounded-2xl p-4 space-y-1 border border-emerald-500/20">
                <p className="text-[11px] text-slate-400">অপেক্ষমাণ ডিপোজিট (এখন)</p>
                <p className="text-lg font-bold text-emerald-400 font-mono-num">
                  {formatBDT(pendingDepositSum)}
                </p>
                <p className="text-[11px] text-slate-400 font-mono-num">{pendingDeposits.length} টি রিকোয়েস্ট</p>
              </div>
              <div className="glass-surface rounded-2xl p-4 space-y-1 border border-amber-500/20">
                <p className="text-[11px] text-slate-400">অপেক্ষমাণ উত্তোলন (এখন)</p>
                <p className="text-lg font-bold text-amber-400 font-mono-num">
                  {formatBDT(pendingWithdrawSum)}
                </p>
                <p className="text-[11px] text-slate-400 font-mono-num">{pendingWithdraws.length} টি রিকোয়েস্ট</p>
              </div>
              <div className="glass-surface rounded-2xl p-4 space-y-1">
                <p className="text-[11px] text-slate-400">মোট অনুমোদিত ডিপোজিট</p>
                <p className="text-lg font-bold text-white font-mono-num">
                  {formatBDT(totalDepositedSum)}
                </p>
                <p className="text-[11px] text-emerald-400">সর্বমোট জমা</p>
              </div>
              <div className="glass-surface rounded-2xl p-4 space-y-1">
                <p className="text-[11px] text-slate-400">মোট সম্পন্ন উত্তোলন</p>
                <p className="text-lg font-bold text-white font-mono-num">
                  {formatBDT(totalWithdrawnSum)}
                </p>
                <p className="text-[11px] text-amber-300">সর্বমোট পরিশোধ</p>
              </div>
            </div>

            {/* Direct Manual Deposit / Withdraw Form (for users who paid/withdrew directly without online form) */}
            {showManualForm && (
              <form
                onSubmit={handleDirectManualTransaction}
                className="glass-gold rounded-3xl p-5 space-y-4 border border-amber-500/35"
              >
                <h3 className="text-sm font-bold text-white">
                  রিকোয়েস্ট ছাড়া সরাসরি ম্যানুয়াল ডিপোজিট বা উত্তোলন কনফার্ম করুন
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-slate-300">ইউজার নির্বাচন করুন</label>
                    <select
                      required
                      value={manualUserId}
                      onChange={(e) => setManualUserId(e.target.value)}
                      className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                    >
                      <option value="">-- ইউজার বাছাই করুন --</option>
                      {activeUsers.map((u) => (
                        <option key={u.uid} value={u.uid}>
                          {u.fullName} ({u.phone || u.email}) · ৳{u.balance}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300">লেনদেনের ধরন</label>
                    <select
                      value={manualActionType}
                      onChange={(e) =>
                        setManualActionType(e.target.value as 'manual_deposit' | 'manual_withdraw')
                      }
                      className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                    >
                      <option value="manual_deposit">সরাসরি ডিপোজিট কনফার্ম (+)</option>
                      <option value="manual_withdraw">সরাসরি উত্তোলন কনফার্ম (-)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300">পেমেন্ট মাধ্যম</label>
                    <select
                      value={manualMethod}
                      onChange={(e) => setManualMethod(e.target.value as 'bkash' | 'nagad' | 'wallet')}
                      className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                    >
                      <option value="bkash">বিকাশ (bKash)</option>
                      <option value="nagad">নগদ (Nagad)</option>
                      <option value="wallet">সরাসরি ক্যাশ / ওয়ালেট</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300">টাকার পরিমাণ (৳)</label>
                    <input
                      type="number"
                      required
                      min={1}
                      placeholder="যেমন: 1000"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white font-mono-num"
                    />
                  </div>
                  {manualActionType === 'manual_deposit' && (
                    <div className="space-y-1">
                      <label className="text-slate-300">অতিরিক্ত বোনাস (৳ ঐচ্ছিক)</label>
                      <input
                        type="number"
                        min={0}
                        value={manualBonus}
                        onChange={(e) => setManualBonus(e.target.value)}
                        className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white font-mono-num"
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-slate-300">TrxID / রেফারেন্স (ঐচ্ছিক)</label>
                    <input
                      type="text"
                      placeholder="যেমন: BGH77890"
                      value={manualTrxId}
                      onChange={(e) => setManualTrxId(e.target.value)}
                      className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-slate-300">নোট (ঐচ্ছিক)</label>
                    <input
                      type="text"
                      placeholder="অ্যাডমিন কনফার্মেশন নোট"
                      value={manualNote}
                      onChange={(e) => setManualNote(e.target.value)}
                      className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submittingManual}
                  className="px-5 h-10 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400"
                >
                  {submittingManual
                    ? 'প্রসেস হচ্ছে...'
                    : manualActionType === 'manual_deposit'
                      ? 'সরাসরি ডিপোজিট কনফার্ম করুন'
                      : 'সরাসরি উত্তোলন কনফার্ম করুন'}
                </button>
              </form>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Pending Deposits */}
              <div className="glass-surface rounded-3xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-emerald-400">
                    অপেক্ষমাণ ডিপোজিট ({pendingDeposits.length})
                  </h3>
                  <span className="text-xs font-mono-num font-bold text-emerald-300">
                    মোট: {formatBDT(pendingDepositSum)}
                  </span>
                </div>
                {pendingDeposits.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4">কোনো পেন্ডিং ডিপোজিট নেই।</p>
                ) : (
                  <div className="space-y-3">
                    {pendingDeposits.map((tx) => {
                      const overrideStr = editableDepositAmounts[tx.id] ?? String(tx.amount);
                      return (
                        <div
                          key={tx.id}
                          className="rounded-2xl bg-slate-950/80 border border-slate-800 p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5">
                              <p className="text-sm font-bold text-white">
                                {tx.userName}{' '}
                                <span className="text-xs font-normal text-slate-400">
                                  ({tx.userPhone})
                                </span>
                              </p>
                              <p className="text-xs text-slate-300 font-mono-num">
                                মাধ্যম: {tx.method.toUpperCase()} · সেন্ডার: {tx.senderNumber || 'N/A'}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono-num">
                                রিসিভার: {tx.receiverNumber || '-'} · TrxID: {tx.trxId}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-base font-bold text-emerald-400 font-mono-num">
                                {formatBDT(tx.amount)}
                              </p>
                              {tx.bonusAmount > 0 && (
                                <p className="text-[11px] text-amber-300 font-mono-num">
                                  + বোনাস {formatBDT(tx.bonusAmount)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <input
                              type="number"
                              min={1}
                              value={overrideStr}
                              onChange={(e) =>
                                setEditableDepositAmounts((prev) => ({
                                  ...prev,
                                  [tx.id]: e.target.value,
                                }))
                              }
                              title="টাকার পরিমাণ পরিবর্তন করে কনফার্ম করতে চাইলে এডিট করুন"
                              className="w-28 h-9 rounded-xl bg-slate-900 border border-slate-700 px-2.5 text-xs text-white font-mono-num"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                void handleApproveDeposit(tx, Number(overrideStr) || tx.amount)
                              }
                              className="flex-1 min-w-[130px] h-9 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-400"
                            >
                              <Check className="w-3.5 h-3.5" />
                              কনফার্ম করুন
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRejectDeposit(tx)}
                              className="h-9 px-3.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-bold flex items-center justify-center gap-1 hover:bg-rose-500/25"
                            >
                              <X className="w-3.5 h-3.5" />
                              রিজেক্ট
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pending Withdraws */}
              <div className="glass-surface rounded-3xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-amber-400">
                    অপেক্ষমাণ উত্তোলন ({pendingWithdraws.length})
                  </h3>
                  <span className="text-xs font-mono-num font-bold text-amber-300">
                    মোট: {formatBDT(pendingWithdrawSum)}
                  </span>
                </div>
                {pendingWithdraws.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4">কোনো পেন্ডিং উইথড্র নেই।</p>
                ) : (
                  <div className="space-y-3">
                    {pendingWithdraws.map((tx) => (
                      <div
                        key={tx.id}
                        className="rounded-2xl bg-slate-950/80 border border-slate-800 p-4 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-white">{tx.userName}</p>
                            <p className="text-xs text-slate-300 font-mono-num">
                              {tx.method.toUpperCase()} নম্বর: {tx.receiverNumber}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono-num">
                              {tx.createdAt?.toDate
                                ? tx.createdAt.toDate().toLocaleString('bn-BD')
                                : ''}
                            </p>
                          </div>
                          <p className="text-base font-bold text-amber-400 font-mono-num">
                            {formatBDT(tx.amount)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => void handleApproveWithdraw(tx)}
                            className="flex-1 h-9 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-1 hover:bg-amber-400"
                          >
                            <Check className="w-3.5 h-3.5" />
                            উত্তোলন কনফার্ম
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRejectWithdraw(tx)}
                            className="flex-1 h-9 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-bold flex items-center justify-center gap-1 hover:bg-rose-500/25"
                          >
                            <X className="w-3.5 h-3.5" />
                            রিজেক্ট (রিফান্ড)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Full Ledger */}
            <div className="glass-surface rounded-3xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">সাম্প্রতিক সকল লেনদেন</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 pr-3">ইউজার</th>
                      <th className="py-2 pr-3">ধরন</th>
                      <th className="py-2 pr-3">মাধ্যম / TrxID / নোট</th>
                      <th className="py-2 pr-3 text-right">পরিমাণ</th>
                      <th className="py-2 text-right">স্ট্যাটাস</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {transactions.slice(0, 45).map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 pr-3 text-white font-medium">{tx.userName}</td>
                        <td className="py-2.5 pr-3 text-slate-300">{tx.type}</td>
                        <td className="py-2.5 pr-3 text-slate-400 font-mono-num">
                          {tx.method} {tx.trxId ? `· ${tx.trxId}` : tx.receiverNumber || tx.adminNote}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono-num font-bold text-white">
                          {formatBDT(tx.amount)}
                        </td>
                        <td className="py-2.5 text-right">
                          <span
                            className={
                              tx.status === 'pending'
                                ? 'text-amber-400'
                                : tx.status === 'rejected'
                                  ? 'text-rose-400'
                                  : 'text-emerald-400'
                            }
                          >
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. Users, Remote Control & Bonus Management */}
        {activeTab === 'users' && (
          <div className="space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-white">
                ইউজার, বোনাস ও ডিভাইস কন্ট্রোল ({users.length})
              </h2>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowBulkBonus((v) => !v)}
                  className="h-10 px-3.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-emerald-400"
                >
                  <Gift className="w-4 h-4" />
                  সকল ইউজারকে বোনাস দিন
                </button>
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="নাম, মোবাইল বা কোড দিয়ে খুঁজুন"
                    className="w-full h-10 rounded-xl bg-slate-900 border border-slate-800 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {showBulkBonus && (
              <form
                onSubmit={handleSendBulkBonus}
                className="glass-gold rounded-3xl p-5 space-y-3 border border-emerald-500/35"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Gift className="w-4 h-4 text-emerald-400" />
                    সকল সক্রিয় ইউজার ({activeUsers.length} জন)-কে একসাথে বোনাস পাঠান
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowBulkBonus(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="বোনাসের পরিমাণ (৳)"
                    value={bulkBonusAmount}
                    onChange={(e) => setBulkBonusAmount(e.target.value)}
                    className="h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white font-mono-num"
                  />
                  <input
                    type="text"
                    placeholder="কারণ/মেসেজ (যেমন: বিশেষ উৎসব বোনাস)"
                    value={bulkBonusReason}
                    onChange={(e) => setBulkBonusReason(e.target.value)}
                    className="sm:col-span-2 h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sendingBulkBonus}
                  className="px-5 h-10 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400"
                >
                  {sendingBulkBonus ? 'বোনাস পাঠানো হচ্ছে...' : 'সবার অ্যাকাউন্টে বোনাস যোগ করুন'}
                </button>
              </form>
            )}

            <div className="glass-surface rounded-3xl p-5 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 pr-3">নাম ও যোগাযোগ</th>
                    <th className="py-2.5 pr-3">ডিভাইস / স্ট্যাটাস</th>
                    <th className="py-2.5 pr-3 text-right">ব্যালেন্স</th>
                    <th className="py-2.5 pr-3">কেওয়াইসি</th>
                    <th className="py-2.5 text-right">বোনাস ও কন্ট্রোল</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredUsers.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-900/40">
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-white">{u.fullName}</p>
                        <p className="text-slate-400 font-mono-num">{u.phone || u.email}</p>
                      </td>
                      <td className="py-3 pr-3 text-slate-300">
                        <p>{u.deviceInfo}</p>
                        <p className="text-[11px] text-slate-400">
                          {u.appInstalled ? 'PWA ইনস্টলড' : 'ওয়েব ব্রাউজার'} ·{' '}
                          {u.isDeleted ? 'ডিলিটেড' : u.isLocked ? 'লকড' : 'সক্রিয়'}
                        </p>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono-num font-bold text-amber-400">
                        {formatBDT(u.balance)}
                      </td>
                      <td className="py-3 pr-3">{u.kycStatus}</td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setBonusTargetUser(u);
                              setBonusAmountInput('');
                              setBonusReasonInput('');
                            }}
                            className="px-2.5 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 inline-flex items-center gap-1 font-semibold"
                            title="সরাসরি বোনাস দিন"
                          >
                            <Gift className="w-3.5 h-3.5" />
                            বোনাস
                          </button>
                          <button
                            type="button"
                            onClick={() => setInspectUser(u)}
                            className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
                            title="বিস্তারিত ও হিস্ট্রি"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleLockUser(u)}
                            className={`p-2 rounded-lg ${
                              u.isLocked
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                            title={u.isLocked ? 'আনলক করুন' : 'রিমোট লক করুন'}
                          >
                            {u.isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemoteDeleteUser(u)}
                            className="p-2 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                            title="রিমোট ডিলিট"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Individual User Bonus Modal */}
            {bonusTargetUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
                <form
                  onSubmit={(e) => void handleGiveUserBonus(e)}
                  className="glass-surface max-w-md w-full rounded-3xl p-6 space-y-4 border border-emerald-500/35"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Gift className="w-4 h-4 text-emerald-400" />
                      অ্যাকাউন্টে বোনাস যোগ করুন
                    </h3>
                    <button
                      type="button"
                      onClick={() => setBonusTargetUser(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="rounded-xl bg-slate-900/90 p-3 text-xs space-y-0.5">
                    <p className="font-bold text-white">{bonusTargetUser.fullName}</p>
                    <p className="text-slate-400 font-mono-num">
                      {bonusTargetUser.phone || bonusTargetUser.email} · বর্তমান ব্যালেন্স:{' '}
                      {formatBDT(bonusTargetUser.balance)}
                    </p>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div className="space-y-1">
                      <label className="text-slate-300">বোনাস পরিমাণ (৳)</label>
                      <input
                        type="number"
                        required
                        min={1}
                        placeholder="যেমন: 100"
                        value={bonusAmountInput}
                        onChange={(e) => setBonusAmountInput(e.target.value)}
                        className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white font-mono-num"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-300">বোনাস নোট / কারণ (ঐচ্ছিক)</label>
                      <input
                        type="text"
                        placeholder="যেমন: বিশেষ ডিপোজিট / অ্যাক্টিভিটি বোনাস"
                        value={bonusReasonInput}
                        onChange={(e) => setBonusReasonInput(e.target.value)}
                        className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={sendingBonus}
                    className="w-full h-10 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400"
                  >
                    {sendingBonus ? 'বোনাস যোগ হচ্ছে...' : 'অ্যাকাউন্টে বোনাস যোগ করুন'}
                  </button>
                </form>
              </div>
            )}

            {/* Inspect User Modal */}
            {inspectUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
                <div className="glass-surface max-w-xl w-full rounded-3xl p-6 space-y-5 max-h-[88vh] overflow-y-auto border border-slate-700">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-white">{inspectUser.fullName}</h3>
                      <p className="text-xs text-slate-400 font-mono-num">
                        {inspectUser.phone || inspectUser.email} · কোড: {inspectUser.referralCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectUser(null)}
                      className="p-2 text-slate-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-xl bg-slate-900 p-3">
                      <span className="text-slate-400 block">ব্যালেন্স</span>
                      <span className="text-base font-bold text-amber-400 font-mono-num">
                        {formatBDT(inspectUser.balance)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-900 p-3">
                      <span className="text-slate-400 block">ডিপোজিট</span>
                      <span className="text-base font-bold text-white font-mono-num">
                        {formatBDT(inspectUser.totalDeposited)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-900 p-3">
                      <span className="text-slate-400 block">উত্তোলন</span>
                      <span className="text-base font-bold text-white font-mono-num">
                        {formatBDT(inspectUser.totalWithdrawn)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-900 p-3">
                      <span className="text-slate-400 block">মোট আয়</span>
                      <span className="text-base font-bold text-emerald-400 font-mono-num">
                        {formatBDT(inspectUser.totalEarned)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 text-slate-300">
                    <span>ডিভাইস: {inspectUser.deviceInfo}</span>
                    <span>কেওয়াইসি: {inspectUser.kycStatus}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      placeholder="ব্যালেন্স অ্যাডজাস্ট (৳)"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      className="flex-1 min-w-[140px] h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-white font-mono-num"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAdjustBalance(inspectUser, Math.abs(Number(adjustAmount) || 0))}
                      className="h-10 px-3.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold"
                    >
                      + যোগ
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAdjustBalance(inspectUser, -Math.abs(Number(adjustAmount) || 0))}
                      className="h-10 px-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold"
                    >
                      - কর্তন
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBonusTargetUser(inspectUser);
                        setBonusAmountInput('');
                        setBonusReasonInput('');
                      }}
                      className="h-10 px-3.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      বোনাস দিন
                    </button>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-300">ইউজারের সক্রিয় ও কেনা প্যাকেজ</h4>
                    <div className="divide-y divide-slate-800 max-h-40 overflow-y-auto text-xs">
                      {userPackages.filter((up) => up.userId === inspectUser.uid).length === 0 ? (
                        <p className="py-2 text-slate-500">কোনো প্যাকেজ কেনা হয়নি।</p>
                      ) : (
                        userPackages
                          .filter((up) => up.userId === inspectUser.uid)
                          .map((up) => (
                            <div key={up.id} className="py-2 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-white font-semibold">{up.packageName}</p>
                                <p className="text-[11px] text-slate-400 font-mono-num">
                                  দৈনিক {formatBDT(up.dailyIncome)} · {up.daysClaimed}/{up.durationDays} দিন
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleToggleUserPackageStatus(up)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                                  up.status === 'active'
                                    ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                              >
                                {up.status === 'active' ? 'সক্রিয় (সমাপ্ত করুন)' : 'সমাপ্ত (চালু করুন)'}
                              </button>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-300">ইউজারের লেনদেন হিস্ট্রি</h4>
                    <div className="divide-y divide-slate-800 max-h-44 overflow-y-auto text-xs">
                      {transactions
                        .filter((t) => t.userId === inspectUser.uid)
                        .map((t) => (
                          <div key={t.id} className="py-2 flex items-center justify-between">
                            <span className="text-slate-300">
                              {t.type} ({t.status})
                            </span>
                            <span className="font-mono-num font-bold text-white">
                              {formatBDT(t.amount)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. KYC Review */}
        {activeTab === 'kyc' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-white">কেওয়াইসি (KYC) ভেরিফিকেশন রিভিউ</h2>
            {kycList.length === 0 ? (
              <p className="text-sm text-slate-400">কোনো কেওয়াইসি ডকুমেন্ট জমা পড়েনি।</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {kycList.map((k) => (
                  <div key={k.userId} className="glass-surface rounded-3xl p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-white">{k.fullName}</h3>
                        <p className="text-xs text-slate-400 font-mono-num">
                          {k.documentType.toUpperCase()} · {k.maskedNumber}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold ${
                          k.status === 'verified'
                            ? 'text-emerald-400'
                            : k.status === 'rejected'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                        }`}
                      >
                        {k.status}
                      </span>
                    </div>

                    {k.documentImage && (
                      <img
                        src={k.documentImage}
                        alt="KYC Document"
                        className="w-full h-44 object-cover rounded-2xl border border-slate-800"
                      />
                    )}

                    <div className="space-y-2">
                      {decryptedKycMap[k.userId] ? (
                        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-xs text-emerald-300 font-mono-num break-all">
                          ডিক্রিপ্টেড তথ্য: {decryptedKycMap[k.userId]}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleDecryptKyc(k)}
                          className="w-full h-9 rounded-xl bg-slate-800 text-xs font-semibold text-amber-300 hover:bg-slate-700"
                        >
                          AES-256-GCM তথ্য ডিক্রিপ্ট করে দেখুন
                        </button>
                      )}
                    </div>

                    {k.status === 'pending' && (
                      <div className="space-y-2 pt-2 border-t border-slate-800">
                        <input
                          type="text"
                          placeholder="রিজেক্ট করলে কারণ লিখুন (ঐচ্ছিক)"
                          value={rejectReasonMap[k.userId] || ''}
                          onChange={(e) =>
                            setRejectReasonMap((prev) => ({ ...prev, [k.userId]: e.target.value }))
                          }
                          className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-white"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleReviewKyc(k, true)}
                            className="flex-1 h-9 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            ভেরিফাই করুন
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReviewKyc(k, false)}
                            className="flex-1 h-9 rounded-xl bg-rose-500/20 text-rose-300 text-xs font-bold"
                          >
                            বাতিল করুন
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. Full Website, Design, Packages, Payment & System Control */}
        {activeTab === 'cms' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">সম্পূর্ণ ওয়েবসাইট, প্যাকেজ ও সিস্টেম কন্ট্রোল</h2>
                <p className="text-xs text-slate-400">
                  ওয়েবসাইটের নাম, লোগো, ডিজাইন, বিকাশ/নগদ নম্বর, অফার লিংক, প্যাকেজ এবং সব সিস্টেম এখান থেকে নিয়ন্ত্রণ করুন।
                </p>
              </div>
            </div>

            {/* Sub-Navigation Pills */}
            <div className="flex flex-wrap gap-2">
              {[
                {
                  id: 'design' as const,
                  label: 'ব্র্যান্ড, লোগো ও ডিজাইন',
                  icon: <Palette className="w-3.5 h-3.5" />,
                },
                {
                  id: 'packages' as const,
                  label: 'প্যাকেজ কাস্টমাইজ',
                  icon: <Package className="w-3.5 h-3.5" />,
                },
                {
                  id: 'systems' as const,
                  label: 'নম্বর ও সিস্টেম কন্ট্রোল',
                  icon: <Power className="w-3.5 h-3.5" />,
                },
                {
                  id: 'offers_auth' as const,
                  label: 'অফার লিংক, সাপোর্ট ও অ্যাডমিন',
                  icon: <LinkIcon className="w-3.5 h-3.5" />,
                },
              ].map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setCmsSection(sec.id)}
                  className={`h-9 px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                    cmsSection === sec.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {sec.icon}
                  {sec.label}
                </button>
              ))}
            </div>

            {/* Packages Sub-Section */}
            {cmsSection === 'packages' && (
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-white">
                    প্যাকেজ ম্যানেজমেন্ট ({packages.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingPkg({
                        name: '',
                        description: '',
                        price: 499,
                        dailyIncome: 45,
                        durationDays: 30,
                        imageUrl: '/src/assets/images/pkg_starter_vault_1795505693930.jpg',
                        badgeLabel: 'নতুন অফার',
                        active: true,
                        sortOrder: packages.length + 1,
                      })
                    }
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    নতুন প্যাকেজ যোগ করুন
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {packages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className={`glass-surface rounded-2xl p-4 space-y-3 ${
                        !pkg.active ? 'opacity-65 border border-slate-700' : ''
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={pkg.imageUrl}
                          alt={pkg.name}
                          className="w-full h-28 object-cover rounded-xl"
                        />
                        <span
                          className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            pkg.active
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {pkg.active ? 'চালু' : 'বন্ধ'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{pkg.name}</p>
                        <p className="text-xs text-slate-400 font-mono-num">
                          {formatBDT(pkg.price)} · দৈনিক {formatBDT(pkg.dailyIncome)} · {pkg.durationDays} দিন
                        </p>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingPkg(pkg)}
                          className="flex-1 h-8 rounded-lg bg-slate-800 text-xs text-white inline-flex items-center justify-center gap-1 hover:bg-slate-700"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          এডিট
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await updateDoc(doc(db, 'packages', pkg.id), {
                                active: !pkg.active,
                                updatedAt: serverTimestamp(),
                              });
                              notify(pkg.active ? 'প্যাকেজটি পজ করা হয়েছে।' : 'প্যাকেজ চালু করা হয়েছে।');
                            } catch (err) {
                              handleFirestoreError(err, OperationType.UPDATE, `packages/${pkg.id}`);
                            }
                          }}
                          className="h-8 px-2.5 rounded-lg bg-amber-500/15 text-amber-300 text-[11px] font-semibold hover:bg-amber-500/25"
                        >
                          {pkg.active ? 'বন্ধ' : 'চালু'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeletePackage(pkg.id)}
                          className="h-8 px-2.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Package Edit Modal */}
            {editingPkg && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
                <form
                  onSubmit={handleSavePackage}
                  className="glass-surface max-w-md w-full rounded-3xl p-6 space-y-3.5 border border-slate-700 max-h-[90vh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Package className="w-4 h-4 text-amber-400" />
                      প্যাকেজ তথ্য সংরক্ষণ
                    </h3>
                    <button type="button" onClick={() => setEditingPkg(null)} className="text-slate-400">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <input
                    type="text"
                    required
                    placeholder="প্যাকেজের নাম"
                    value={editingPkg.name || ''}
                    onChange={(e) => setEditingPkg({ ...editingPkg, name: e.target.value })}
                    className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-white"
                  />
                  <textarea
                    placeholder="বিবরণ"
                    value={editingPkg.description || ''}
                    onChange={(e) => setEditingPkg({ ...editingPkg, description: e.target.value })}
                    className="w-full h-16 rounded-xl bg-slate-950 border border-slate-800 p-3 text-xs text-white"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400">মূল্য (৳)</label>
                      <input
                        type="number"
                        required
                        min={1}
                        value={editingPkg.price || 0}
                        onChange={(e) => setEditingPkg({ ...editingPkg, price: Number(e.target.value) })}
                        className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-white font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">দৈনিক আয়</label>
                      <input
                        type="number"
                        required
                        min={1}
                        value={editingPkg.dailyIncome || 0}
                        onChange={(e) =>
                          setEditingPkg({ ...editingPkg, dailyIncome: Number(e.target.value) })
                        }
                        className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-white font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">মেয়াদ (দিন)</label>
                      <input
                        type="number"
                        required
                        min={1}
                        value={editingPkg.durationDays || 30}
                        onChange={(e) =>
                          setEditingPkg({ ...editingPkg, durationDays: Number(e.target.value) })
                        }
                        className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-white font-mono-num"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400">ব্যাজ লেবেল</label>
                      <input
                        type="text"
                        placeholder="যেমন: জনপ্রিয় শুরু"
                        value={editingPkg.badgeLabel || ''}
                        onChange={(e) => setEditingPkg({ ...editingPkg, badgeLabel: e.target.value })}
                        className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">ক্রম নম্বর (Sort)</label>
                      <input
                        type="number"
                        value={editingPkg.sortOrder || 1}
                        onChange={(e) =>
                          setEditingPkg({ ...editingPkg, sortOrder: Number(e.target.value) })
                        }
                        className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-white font-mono-num"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>প্যাকেজের ছবি (URL বা আপলোড)</span>
                      <label className="text-amber-400 font-semibold cursor-pointer inline-flex items-center gap-1 hover:underline">
                        <Upload className="w-3 h-3" />
                        ছবি আপলোড
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const compressed = await compressImageFile(file, 640, 0.72);
                              if (compressed.length > 420000) {
                                notify('ছবিটি অনেক বড়। ছোট ছবি দিন।', 'error');
                                return;
                              }
                              setEditingPkg((prev) =>
                                prev ? { ...prev, imageUrl: compressed } : prev
                              );
                            } catch {
                              notify('ছবি আপলোড করা যায়নি।', 'error');
                            }
                          }}
                        />
                      </label>
                    </div>
                    <input
                      type="text"
                      placeholder="ছবির URL"
                      value={editingPkg.imageUrl || ''}
                      onChange={(e) => setEditingPkg({ ...editingPkg, imageUrl: e.target.value })}
                      className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 text-slate-300">
                      <input
                        type="checkbox"
                        checked={editingPkg.active ?? true}
                        onChange={(e) => setEditingPkg({ ...editingPkg, active: e.target.checked })}
                      />
                      প্যাকেজ চালু রাখুন
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={savingPkg}
                    className="w-full h-10 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                  >
                    {savingPkg ? 'সংরক্ষণ হচ্ছে...' : 'প্যাকেজ সেভ করুন'}
                  </button>
                </form>
              </div>
            )}

            {/* Complete Website Live CMS Form */}
            {cmsSection !== 'packages' && (
              <form onSubmit={handleSaveCms} className="glass-surface rounded-3xl p-6 space-y-6">
                {cmsSection === 'design' && (
                  <div className="space-y-6">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Palette className="w-4 h-4 text-amber-400" />
                      ওয়েবসাইটের নাম, লোগো, থিম ও ডিজাইন সাজান
                    </h3>

                    {/* Website Name & Logo */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1.5">
                        <label className="text-slate-300 font-semibold">ওয়েবসাইটের নাম</label>
                        <input
                          type="text"
                          required
                          value={cmsDraft.brandName}
                          onChange={(e) => setCmsDraft({ ...cmsDraft, brandName: e.target.value })}
                          placeholder="যেমন: Money Fair"
                          className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white font-semibold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-slate-300 font-semibold">ওয়েবসাইট লোগো (আপলোড / URL)</label>
                          <div className="flex items-center gap-2">
                            <label className="text-amber-400 cursor-pointer inline-flex items-center gap-1 hover:underline font-semibold">
                              <Upload className="w-3 h-3" />
                              আপলোড
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void handleCmsImageUpload(f, 'logoUrl', 256, 0.78);
                                }}
                              />
                            </label>
                            {cmsDraft.logoUrl && (
                              <button
                                type="button"
                                onClick={() => setCmsDraft({ ...cmsDraft, logoUrl: '' })}
                                className="text-rose-400 hover:underline"
                              >
                                রিসেট
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                            <BrandMark className="w-7 h-7" logoUrl={cmsDraft.logoUrl} />
                          </div>
                          <input
                            type="text"
                            value={cmsDraft.logoUrl}
                            onChange={(e) => setCmsDraft({ ...cmsDraft, logoUrl: e.target.value })}
                            placeholder="লোগো ইমেজ URL বা আপলোড করুন (ফাঁকা = ডিফল্ট)"
                            className="flex-1 h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-slate-300">হোম হিরো শিরোনাম</label>
                        <input
                          type="text"
                          value={cmsDraft.heroTitle}
                          onChange={(e) => setCmsDraft({ ...cmsDraft, heroTitle: e.target.value })}
                          className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                        />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-slate-300">হিরো সাবটাইটেল</label>
                        <input
                          type="text"
                          value={cmsDraft.heroSubtitle}
                          onChange={(e) => setCmsDraft({ ...cmsDraft, heroSubtitle: e.target.value })}
                          className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                        />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <div className="flex items-center justify-between">
                          <label className="text-slate-300 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                            হোমপেজ ব্যানার / হিরো ছবি
                          </label>
                          <div className="flex items-center gap-3">
                            <label className="text-amber-400 cursor-pointer inline-flex items-center gap-1 hover:underline font-semibold">
                              <Upload className="w-3 h-3" />
                              ব্যানার আপলোড
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void handleCmsImageUpload(f, 'heroImageUrl', 720, 0.68);
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setCmsDraft({ ...cmsDraft, heroImageUrl: HERO_IMAGE_URL })
                              }
                              className="text-slate-400 hover:text-white"
                            >
                              ডিফল্ট
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={cmsDraft.heroImageUrl}
                          onChange={(e) => setCmsDraft({ ...cmsDraft, heroImageUrl: e.target.value })}
                          className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                        />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-slate-300">নোটিশ বার লেখা</label>
                        <input
                          type="text"
                          value={cmsDraft.noticeText}
                          onChange={(e) => setCmsDraft({ ...cmsDraft, noticeText: e.target.value })}
                          className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                        />
                      </div>
                    </div>

                    {/* Theme & Accent Color Pickers */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800 text-xs">
                      <div className="space-y-2">
                        <label className="text-slate-300 font-semibold block">ব্যাকগ্রাউন্ড থিম</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'midnight' as const, label: 'ডিপ মিডনাইট', color: '#070B14' },
                            { id: 'obsidian' as const, label: 'ডার্ক অবসিডিয়ান', color: '#050608' },
                            { id: 'navy' as const, label: 'ডিপ নেভি', color: '#081226' },
                          ].map((bg) => (
                            <button
                              key={bg.id}
                              type="button"
                              onClick={() => setCmsDraft({ ...cmsDraft, bgTheme: bg.id })}
                              className={`p-2.5 rounded-xl border text-left space-y-1.5 ${
                                cmsDraft.bgTheme === bg.id
                                  ? 'border-amber-400 bg-slate-900'
                                  : 'border-slate-800 bg-slate-950/60'
                              }`}
                            >
                              <span
                                className="block w-full h-4 rounded-md border border-slate-700"
                                style={{ backgroundColor: bg.color }}
                              />
                              <span className="block text-[11px] font-semibold text-white">
                                {bg.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-slate-300 font-semibold block">বাটন ও অ্যাকসেন্ট রঙ</label>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { id: 'amber' as const, label: 'গোল্ড', swatch: 'bg-amber-400' },
                            { id: 'emerald' as const, label: 'এমারেল্ড', swatch: 'bg-emerald-400' },
                            { id: 'blue' as const, label: 'স্কাই ব্লু', swatch: 'bg-sky-400' },
                            { id: 'rose' as const, label: 'রোজ', swatch: 'bg-rose-500' },
                          ].map((ac) => (
                            <button
                              key={ac.id}
                              type="button"
                              onClick={() => setCmsDraft({ ...cmsDraft, accentColor: ac.id })}
                              className={`p-2.5 rounded-xl border text-center space-y-1.5 ${
                                cmsDraft.accentColor === ac.id
                                  ? 'border-white bg-slate-900'
                                  : 'border-slate-800 bg-slate-950/60'
                              }`}
                            >
                              <span className={`block mx-auto w-5 h-5 rounded-full ${ac.swatch}`} />
                              <span className="block text-[11px] font-semibold text-white">
                                {ac.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Homepage Sections Visibility */}
                    <div className="pt-3 border-t border-slate-800 space-y-2 text-xs">
                      <p className="text-slate-300 font-semibold">ওয়েবসাইটের সেকশন প্রদর্শন কন্ট্রোল</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 flex items-center gap-2.5 cursor-pointer text-slate-200">
                          <input
                            type="checkbox"
                            checked={cmsDraft.showHeroStats}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, showHeroStats: e.target.checked })
                            }
                          />
                          হোমপেজ স্ট্যাটস ও ফিচার কার্ড দেখান
                        </label>
                        <label className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 flex items-center gap-2.5 cursor-pointer text-slate-200">
                          <input
                            type="checkbox"
                            checked={cmsDraft.showAppInstallCard}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, showAppInstallCard: e.target.checked })
                            }
                          />
                          মোবাইল অ্যাপ ডাউনলোড কার্ড দেখান
                        </label>
                        <label className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 flex items-center gap-2.5 cursor-pointer text-slate-200">
                          <input
                            type="checkbox"
                            checked={cmsDraft.showTutorialsSection}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, showTutorialsSection: e.target.checked })
                            }
                          />
                          টিউটোরিয়াল ও গাইড সেকশন দেখান
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {cmsSection === 'systems' && (
                  <div className="space-y-6">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Power className="w-4 h-4 text-amber-400" />
                      বিকাশ-নগদ নম্বর, সীমা ও সব সিস্টেম কন্ট্রোল
                    </h3>

                    {/* Separate bKash & Nagad Numbers */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="space-y-1.5">
                        <label className="text-pink-300 font-semibold">বিকাশ (bKash) পার্সোনাল/এজেন্ট নম্বর</label>
                        <input
                          type="text"
                          required
                          value={cmsDraft.bkashNumber}
                          onChange={(e) =>
                            setCmsDraft({
                              ...cmsDraft,
                              bkashNumber: e.target.value,
                              paymentNumber: e.target.value,
                            })
                          }
                          placeholder="01XXXXXXXXX"
                          className="w-full h-10 rounded-xl bg-slate-950 border border-pink-500/35 px-3 text-pink-300 font-bold font-mono-num"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-orange-300 font-semibold">নগদ (Nagad) পার্সোনাল/এজেন্ট নম্বর</label>
                        <input
                          type="text"
                          required
                          value={cmsDraft.nagadNumber}
                          onChange={(e) => setCmsDraft({ ...cmsDraft, nagadNumber: e.target.value })}
                          placeholder="01XXXXXXXXX"
                          className="w-full h-10 rounded-xl bg-slate-950 border border-orange-500/35 px-3 text-orange-300 font-bold font-mono-num"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-slate-300">ডিফল্ট / ব্যাকআপ পেমেন্ট নম্বর</label>
                        <input
                          type="text"
                          value={cmsDraft.paymentNumber}
                          onChange={(e) => setCmsDraft({ ...cmsDraft, paymentNumber: e.target.value })}
                          className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-amber-400 font-bold font-mono-num"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 text-xs">
                      <label className="inline-flex items-center gap-2 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cmsDraft.bkashEnabled}
                          onChange={(e) =>
                            setCmsDraft({ ...cmsDraft, bkashEnabled: e.target.checked })
                          }
                        />
                        বিকাশ (bKash) গেটওয়ে চালু রাখুন
                      </label>
                      <label className="inline-flex items-center gap-2 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cmsDraft.nagadEnabled}
                          onChange={(e) =>
                            setCmsDraft({ ...cmsDraft, nagadEnabled: e.target.checked })
                          }
                        />
                        নগদ (Nagad) গেটওয়ে চালু রাখুন
                      </label>
                    </div>

                    {/* Financial Limits & Bonuses */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs pt-3 border-t border-slate-800">
                      <div className="space-y-1">
                        <label className="text-slate-300">ওয়েলকাম বোনাস (৳)</label>
                        <input
                          type="number"
                          min={0}
                          value={cmsDraft.welcomeBonus}
                          onChange={(e) =>
                            setCmsDraft({ ...cmsDraft, welcomeBonus: Number(e.target.value) })
                          }
                          className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white font-mono-num"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-300">রেফার বোনাস (৳)</label>
                        <input
                          type="number"
                          min={0}
                          value={cmsDraft.referBonus}
                          onChange={(e) =>
                            setCmsDraft({ ...cmsDraft, referBonus: Number(e.target.value) })
                          }
                          className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white font-mono-num"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-300">ডিপোজিট বোনাস (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={cmsDraft.depositBonusPercent}
                          onChange={(e) =>
                            setCmsDraft({
                              ...cmsDraft,
                              depositBonusPercent: Number(e.target.value),
                            })
                          }
                          className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white font-mono-num"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-300">ন্যূনতম ডিপোজিট</label>
                        <input
                          type="number"
                          min={10}
                          value={cmsDraft.minDeposit}
                          onChange={(e) =>
                            setCmsDraft({ ...cmsDraft, minDeposit: Number(e.target.value) })
                          }
                          className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white font-mono-num"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-300">ন্যূনতম উত্তোলন</label>
                        <input
                          type="number"
                          min={10}
                          value={cmsDraft.minWithdraw}
                          onChange={(e) =>
                            setCmsDraft({ ...cmsDraft, minWithdraw: Number(e.target.value) })
                          }
                          className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white font-mono-num"
                        />
                      </div>
                    </div>

                    {/* Master Website System Switches */}
                    <div className="pt-3 border-t border-slate-800 space-y-3 text-xs">
                      <h4 className="text-sm font-bold text-amber-400">
                        ওয়েবসাইটের সকল সিস্টেম চালু / বন্ধ কন্ট্রোল
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <label className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex items-center gap-2.5 cursor-pointer text-slate-200">
                          <input
                            type="checkbox"
                            checked={cmsDraft.depositsEnabled}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, depositsEnabled: e.target.checked })
                            }
                          />
                          ডিপোজিট সিস্টেম চালু
                        </label>
                        <label className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex items-center gap-2.5 cursor-pointer text-slate-200">
                          <input
                            type="checkbox"
                            checked={cmsDraft.withdrawsEnabled}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, withdrawsEnabled: e.target.checked })
                            }
                          />
                          উত্তোলন (Withdraw) সিস্টেম চালু
                        </label>
                        <label className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex items-center gap-2.5 cursor-pointer text-slate-200">
                          <input
                            type="checkbox"
                            checked={cmsDraft.registrationEnabled}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, registrationEnabled: e.target.checked })
                            }
                          />
                          নতুন রেজিস্ট্রেশন চালু
                        </label>
                        <label className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex items-center gap-2.5 cursor-pointer text-slate-200">
                          <input
                            type="checkbox"
                            checked={cmsDraft.dailyClaimEnabled}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, dailyClaimEnabled: e.target.checked })
                            }
                          />
                          দৈনিক ইনকাম ক্লেইম চালু
                        </label>
                        <label className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex items-center gap-2.5 cursor-pointer text-slate-200">
                          <input
                            type="checkbox"
                            checked={cmsDraft.welcomeBonusEnabled}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, welcomeBonusEnabled: e.target.checked })
                            }
                          />
                          ওয়েলকাম বোনাস ক্লেইম চালু
                        </label>
                        <label className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex items-center gap-2.5 cursor-pointer text-slate-200">
                          <input
                            type="checkbox"
                            checked={cmsDraft.referralEnabled}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, referralEnabled: e.target.checked })
                            }
                          />
                          রেফার ও বোনাস সিস্টেম চালু
                        </label>
                        <label className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex items-center gap-2.5 cursor-pointer text-slate-200">
                          <input
                            type="checkbox"
                            checked={cmsDraft.kycRequiredForWithdraw}
                            onChange={(e) =>
                              setCmsDraft({
                                ...cmsDraft,
                                kycRequiredForWithdraw: e.target.checked,
                              })
                            }
                          />
                          উত্তোলনে KYC ভেরিফিকেশন আবশ্যক
                        </label>
                        <label className="rounded-xl bg-rose-950/40 border border-rose-500/35 p-3 flex items-center gap-2.5 cursor-pointer text-rose-200 font-semibold">
                          <input
                            type="checkbox"
                            checked={cmsDraft.maintenanceMode}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, maintenanceMode: e.target.checked })
                            }
                          />
                          মেইনটেন্যান্স মোড (সাইট সাময়িক বন্ধ)
                        </label>
                      </div>

                      {cmsDraft.maintenanceMode && (
                        <div className="space-y-1">
                          <label className="text-rose-300">মেইনটেন্যান্স নোটিশ মেসেজ</label>
                          <input
                            type="text"
                            value={cmsDraft.maintenanceMessage}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, maintenanceMessage: e.target.value })
                            }
                            className="w-full h-10 rounded-xl bg-slate-950 border border-rose-500/40 px-3 text-white"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {cmsSection === 'offers_auth' && (
                  <div className="space-y-6">
                    {/* Offer & Offer Link */}
                    <div className="space-y-4 text-xs">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-amber-400">
                          ডাইনামিক অফার ব্যানার ও অফার লিংক
                        </h3>
                        <label className="inline-flex items-center gap-2 font-semibold text-white cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cmsDraft.offerActive}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, offerActive: e.target.checked })
                            }
                          />
                          অফার লাইভ চালু রাখুন
                        </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-slate-300">অফারের শিরোনাম</label>
                          <input
                            type="text"
                            placeholder="অফারের শিরোনাম"
                            value={cmsDraft.offerTitle}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, offerTitle: e.target.value })
                            }
                            className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-300">বাটনের লেখা (CTA)</label>
                          <input
                            type="text"
                            placeholder="যেমন: এখনই ডিপোজিট করুন"
                            value={cmsDraft.offerCtaText}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, offerCtaText: e.target.value })
                            }
                            className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                          />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="text-amber-300 font-semibold">
                              অফার লিংক (বাহ্যিক https://... লিংক অথবা অ্যাপের ট্যাব: wallet / packages / profile / support)
                            </label>
                            <div className="flex items-center gap-1.5">
                              {(['wallet', 'packages', 'profile', 'support'] as const).map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setCmsDraft({ ...cmsDraft, offerLink: t })}
                                  className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 hover:text-white"
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                          <input
                            type="text"
                            placeholder="https://... অথবা wallet / packages"
                            value={cmsDraft.offerLink}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, offerLink: e.target.value })
                            }
                            className="w-full h-10 rounded-xl bg-slate-950 border border-amber-500/35 px-3 text-amber-300"
                          />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                          <div className="flex items-center justify-between">
                            <label className="text-slate-300">অফার ছবির URL বা আপলোড</label>
                            <label className="text-amber-400 cursor-pointer inline-flex items-center gap-1 hover:underline font-semibold">
                              <Upload className="w-3 h-3" />
                              ছবি আপলোড
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void handleCmsImageUpload(f, 'offerImageUrl', 720, 0.68);
                                }}
                              />
                            </label>
                          </div>
                          <input
                            type="text"
                            placeholder="অফার ছবির URL"
                            value={cmsDraft.offerImageUrl}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, offerImageUrl: e.target.value })
                            }
                            className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                          />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-slate-300">অফারের বিস্তারিত বিবরণ</label>
                          <textarea
                            placeholder="অফারের বিস্তারিত বিবরণ"
                            value={cmsDraft.offerDescription}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, offerDescription: e.target.value })
                            }
                            className="w-full h-20 rounded-xl bg-slate-950 border border-slate-800 p-3 text-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Social & Support Links */}
                    <div className="space-y-3 pt-4 border-t border-slate-800 text-xs">
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          Telegram, YouTube ও Facebook সাপোর্ট লিংক
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          যে লিংকটি ফাঁকা রাখবেন, ওয়েবসাইটে সেই বাটনটি স্বয়ংক্রিয়ভাবে লুকানো থাকবে।
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-sky-300 font-semibold">Telegram চ্যানেল/সাপোর্ট লিংক</label>
                          <input
                            type="url"
                            placeholder="https://t.me/..."
                            value={cmsDraft.telegramUrl}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, telegramUrl: e.target.value })
                            }
                            className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-rose-300 font-semibold">YouTube টিউটোরিয়াল লিংক</label>
                          <input
                            type="url"
                            placeholder="https://youtube.com/..."
                            value={cmsDraft.youtubeUrl}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, youtubeUrl: e.target.value })
                            }
                            className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-blue-300 font-semibold">Facebook পেজ/গ্রুপ লিংক</label>
                          <input
                            type="url"
                            placeholder="https://facebook.com/..."
                            value={cmsDraft.facebookUrl}
                            onChange={(e) =>
                              setCmsDraft({ ...cmsDraft, facebookUrl: e.target.value })
                            }
                            className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-400">
                    সেভ বাটনে ক্লিক করলে ওয়েবসাইটে তাৎক্ষণিকভাবে সব পরিবর্তন কার্যকর হবে।
                  </p>
                  <button
                    type="submit"
                    disabled={savingCms}
                    className="px-6 h-11 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold text-sm hover:brightness-105"
                  >
                    {savingCms ? 'আপডেট হচ্ছে...' : 'সব ওয়েবসাইট সেটিংস লাইভ সেভ করুন'}
                  </button>
                </div>
              </form>
            )}

            {/* Change Admin Username & Password (shown in offers_auth or below CMS) */}
            {cmsSection === 'offers_auth' && (
              <form
                onSubmit={handleChangeAdminCredentials}
                className="glass-surface rounded-3xl p-6 space-y-4 border border-slate-800"
              >
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-base font-bold text-white">অ্যাডমিন ইউজারনেম ও পাসওয়ার্ড পরিবর্তন</h3>
                    <p className="text-xs text-slate-400">
                      প্যানেল লগইন করার জন্য নতুন ইউজারনেম এবং পাসওয়ার্ড এখান থেকে আপডেট করুন।
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <input
                    type="text"
                    required
                    minLength={4}
                    placeholder="নতুন ইউজারনেম (কমপক্ষে ৪ অক্ষর)"
                    value={newAdminUsername}
                    onChange={(e) => setNewAdminUsername(e.target.value)}
                    className="h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                  />
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)"
                    value={newAdminPasscode}
                    onChange={(e) => setNewAdminPasscode(e.target.value)}
                    className="h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                  />
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="পাসওয়ার্ড আবার লিখুন"
                    value={confirmNewAdminPasscode}
                    onChange={(e) => setConfirmNewAdminPasscode(e.target.value)}
                    className="h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingCreds}
                  className="px-5 h-10 rounded-xl bg-slate-800 border border-amber-500/35 text-amber-300 font-bold text-xs hover:bg-slate-700"
                >
                  {savingCreds ? 'আপডেট হচ্ছে...' : 'অ্যাডমিন লগইন তথ্য আপডেট করুন'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* 6. Live Support Chat + Real-Time Activity Logs + App Downloads */}
        {activeTab === 'support_logs' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white">লাইভ সাপোর্ট চ্যাট, অ্যাপ ডাউনলোড ও অ্যাক্টিভিটি লগ</h2>

            {/* Support Chat Console */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-4 glass-surface rounded-3xl p-4 space-y-2 max-h-[420px] overflow-y-auto">
                <h3 className="text-xs font-bold text-slate-300 px-2">সাপোর্ট ইনবক্স ({supportThreads.length})</h3>
                {supportThreads.map((th) => (
                  <button
                    key={th.userId}
                    type="button"
                    onClick={() => setSelectedThreadUid(th.userId)}
                    className={`w-full text-left p-3 rounded-2xl transition-colors ${
                      selectedThreadUid === th.userId
                        ? 'bg-amber-500/20 border border-amber-500/40'
                        : 'bg-slate-900/60 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{th.userName}</span>
                      {th.unreadByAdmin > 0 && (
                        <span className="text-[10px] font-bold text-amber-400">নতুন</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{th.lastMessage}</p>
                  </button>
                ))}
              </div>

              <div className="lg:col-span-8 glass-surface rounded-3xl p-4 flex flex-col h-[420px]">
                {!selectedThreadUid ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                    <MessageSquare className="w-7 h-7 text-slate-600" />
                    রিপ্লাই দিতে বাম দিক থেকে একটি চ্যাট নির্বাচন করুন
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto space-y-2.5 p-2">
                      {threadMessages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex ${m.senderRole === 'admin' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-xs ${
                              m.senderRole === 'admin'
                                ? 'bg-amber-500 text-slate-950 font-semibold'
                                : 'bg-slate-800 text-white'
                            }`}
                          >
                            {m.text}
                          </div>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={handleAdminSendReply} className="pt-3 border-t border-slate-800 flex gap-2">
                      <input
                        type="text"
                        value={adminReply}
                        onChange={(e) => setAdminReply(e.target.value)}
                        placeholder="ইউজারের সমস্যার উত্তর লিখুন..."
                        className="flex-1 h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-white"
                      />
                      <button
                        type="submit"
                        className="h-10 px-4 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" />
                        পাঠান
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>

            {/* App Downloads + Real-Time Activity Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="glass-surface rounded-3xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-amber-400" />
                  অ্যাপ ডাউনলোড লগ ({appDownloads.length})
                </h3>
                <div className="divide-y divide-slate-800 max-h-72 overflow-y-auto text-xs">
                  {appDownloads.map((dl) => (
                    <div key={dl.id} className="py-2.5 flex items-center justify-between gap-3">
                      <span className="text-slate-200">{dl.platform}</span>
                      <span className="text-slate-400 font-mono-num">
                        {dl.createdAt?.toDate ? dl.createdAt.toDate().toLocaleString('bn-BD') : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-surface rounded-3xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  সকল রিয়েল-টাইম অ্যাক্টিভিটি লগ
                </h3>
                <div className="divide-y divide-slate-800 max-h-72 overflow-y-auto text-xs">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="py-2.5 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-semibold ${
                            log.severity === 'security' ? 'text-rose-400' : 'text-white'
                          }`}
                        >
                          {log.userLabel} · {log.action}
                        </span>
                        <span className="text-slate-500 font-mono-num">
                          {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleTimeString('bn-BD') : ''}
                        </span>
                      </div>
                      <p className="text-slate-400">{log.details}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
