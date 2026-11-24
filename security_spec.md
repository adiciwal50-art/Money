# Security Specification & Invariants

## 1. Data Invariants
1. **Default Deny**: All unmapped paths under `/databases/{database}/documents` are denied.
2. **Wallet Integrity**: Users cannot arbitrarily increment their own `balance` or `heldBalance`. Balance increases occur strictly via:
   - Single-use welcome bonus claim matching `cms/settings.welcomeBonus`.
   - Atomic 24-hour daily claim verified against an active `userPackages/{pkgId}` document (`get` & `getAfter`).
   - Super Admin approval of deposits, referral bonuses, or manual adjustments.
3. **Withdrawal Hold & Refund**: Creating a withdrawal request requires atomically deducting `amount` from `balance` and adding it to `heldBalance`.
4. **PII Isolation**: User profiles (`users/{userId}`) and encrypted KYC submissions (`kycSubmissions/{userId}`) are readable only by the owning UID or the verified Super Admin.
5. **Single Super Admin Lock**: Only the designated verified Super Admin email (`adiciwal50@gmail.com`) or single bootstrapped `/admins/{uid}` record can perform administrative mutations.
6. **Immutable Audit Logs**: `activityLogs` and `appDownloads` cannot be updated or deleted by any client.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Admin Escalation**: Creating `/admins/{attackerUid}` with a non-super-admin email or `email_verified: false`. -> `PERMISSION_DENIED`
2. **Balance Minting on Signup**: Creating `/users/{uid}` with `balance: 999999`. -> `PERMISSION_DENIED`
3. **Double Welcome Bonus Claim**: Updating `/users/{uid}` with `welcomeBonusClaimed: true` when it was already `true`. -> `PERMISSION_DENIED`
4. **Early Daily Package Claim**: Claiming `/userPackages/{id}` before `nextClaimAt <= request.time`. -> `PERMISSION_DENIED`
5. **Fake Daily Income Amount**: Updating `/users/{uid}` balance by `5000` while claiming a `45` BDT package. -> `PERMISSION_DENIED`
6. **Shadow Field Injection**: Updating `/users/{uid}` with extra field `isVerified: true` or `kycStatus: 'verified'`. -> `PERMISSION_DENIED`
7. **Self-Approving Deposit**: Creating `/transactions/{id}` with `type: 'deposit', status: 'approved'`. -> `PERMISSION_DENIED`
8. **Cross-User PII Scraping**: Listing `/users` or reading `/kycSubmissions/{victimUid}` as a regular user. -> `PERMISSION_DENIED`
9. **ID Poisoning**: Creating `/packages/../../etc/passwd` or a 500-char document ID. -> `PERMISSION_DENIED`
10. **Spoofed Admin Email**: Token with `email: 'adiciwal50@gmail.com'` and `email_verified: false`. -> `PERMISSION_DENIED`
11. **Tampering Immutable Logs**: Updating or deleting `/activityLogs/{logId}`. -> `PERMISSION_DENIED`
12. **Terminal State Reversal**: User updating `/transactions/{txId}` after status is `'approved'` or `'rejected'`. -> `PERMISSION_DENIED`
