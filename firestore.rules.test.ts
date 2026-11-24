/**
 * Security Rules Verification Suite (Dirty Dozen Adversarial Payloads)
 * Maps each attack vector from security_spec.md to its expected PERMISSION_DENIED outcome.
 */

export const DIRTY_DOZEN_TESTS = [
  {
    name: '1. Self-Admin Escalation',
    path: '/admins/attacker_uid',
    operation: 'create',
    payload: { uid: 'attacker_uid', email: 'attacker@evil.com', role: 'super_admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Balance Minting on Signup',
    path: '/users/attacker_uid',
    operation: 'create',
    payload: { uid: 'attacker_uid', balance: 999999, welcomeBonusClaimed: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Double Welcome Bonus Claim',
    path: '/users/user_1',
    operation: 'update',
    payload: { welcomeBonusClaimed: true, balance: 150 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Early Daily Package Claim',
    path: '/userPackages/up_1',
    operation: 'update',
    payload: { daysClaimed: 1, status: 'active' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Fake Daily Income Amount',
    path: '/users/user_1',
    operation: 'update',
    payload: { balance: 5000, lastClaimPkgId: 'up_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Shadow Field Injection',
    path: '/users/user_1',
    operation: 'update',
    payload: { kycStatus: 'verified', isVerified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Self-Approving Deposit',
    path: '/transactions/tx_1',
    operation: 'create',
    payload: { id: 'tx_1', userId: 'user_1', type: 'deposit', status: 'approved', amount: 5000 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Cross-User PII Scraping',
    path: '/kycSubmissions/victim_uid',
    operation: 'get',
    payload: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. ID Poisoning',
    path: '/packages/invalid..id',
    operation: 'create',
    payload: { id: 'invalid..id', name: 'Bad' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Spoofed Admin Email (unverified)',
    path: '/cms/settings',
    operation: 'update',
    auth: { email: 'adiciwal50@gmail.com', email_verified: false },
    payload: { paymentNumber: '01700000000' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Tampering Immutable Logs',
    path: '/activityLogs/log_1',
    operation: 'delete',
    payload: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Terminal State Reversal',
    path: '/transactions/tx_approved',
    operation: 'update',
    payload: { status: 'pending', amount: 10000 },
    expected: 'PERMISSION_DENIED',
  },
];
