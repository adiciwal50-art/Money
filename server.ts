import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPER_ADMIN_EMAIL = 'adiciwal50@gmail.com';
const PORT = Number(process.env.PORT) || 3000;

interface FirebaseConfigFile {
  projectId: string;
}

const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
let firebaseProjectId = '';
if (fs.existsSync(configPath)) {
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as FirebaseConfigFile;
  firebaseProjectId = parsed.projectId || '';
}

const adminApp = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseProjectId ? { projectId: firebaseProjectId } : undefined);
const adminAuth = getAuth(adminApp);

// Ephemeral in-memory fallback keys if env secrets are not yet configured
const SESSION_SIGNING_KEY = process.env.SESSION_SIGNING_KEY
  ? crypto.createHash('sha256').update(process.env.SESSION_SIGNING_KEY).digest()
  : crypto.randomBytes(32);

const ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY
  ? crypto.createHash('sha256').update(process.env.DATA_ENCRYPTION_KEY).digest()
  : crypto.randomBytes(32);

// Persistent local credentials store (used when env ADMIN_PORTAL_PASSCODE is unset)
const ADMIN_CREDS_FILE = path.resolve(__dirname, '.admin-credentials.json');

interface StoredAdminCredentials {
  username: string;
  salt: string;
  hashHex: string;
}

function loadStoredAdminCredentials(): StoredAdminCredentials | null {
  try {
    if (!fs.existsSync(ADMIN_CREDS_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(ADMIN_CREDS_FILE, 'utf-8')) as Partial<StoredAdminCredentials>;
    if (
      typeof raw.username === 'string' &&
      raw.username.length >= 4 &&
      typeof raw.salt === 'string' &&
      typeof raw.hashHex === 'string'
    ) {
      return { username: raw.username, salt: raw.salt, hashHex: raw.hashHex };
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoredAdminCredentials(creds: StoredAdminCredentials): void {
  fs.writeFileSync(ADMIN_CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

let claimedAdminCreds: StoredAdminCredentials | null = loadStoredAdminCredentials();

// Brute-force protection map: key -> { count, lockedUntil }
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

function checkRateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = failedAttempts.get(key);
  if (!entry) return { allowed: true, retryAfterSec: 0 };
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  if (entry.lockedUntil <= now && entry.count >= 5) {
    failedAttempts.delete(key);
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFailure(key: string): void {
  const now = Date.now();
  const prev = failedAttempts.get(key) || { count: 0, lockedUntil: 0 };
  const nextCount = prev.count + 1;
  failedAttempts.set(key, {
    count: nextCount,
    lockedUntil: nextCount >= 5 ? now + 5 * 60 * 1000 : 0,
  });
}

function clearFailure(key: string): void {
  failedAttempts.delete(key);
}

function timingSafeTextEqual(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function signAdminToken(uid: string, email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      uid,
      email,
      role: 'super_admin',
      exp: Date.now() + 2 * 60 * 60 * 1000,
    }),
    'utf-8'
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SIGNING_KEY).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminToken(token: string): { uid: string; email: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SIGNING_KEY).update(payload).digest('base64url');
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      uid: string;
      email: string;
      role: string;
      exp: number;
    };
    if (parsed.exp < Date.now() || parsed.role !== 'super_admin' || parsed.email !== SUPER_ADMIN_EMAIL) {
      return null;
    }
    return { uid: parsed.uid, email: parsed.email };
  } catch {
    return null;
  }
}

async function verifyFirebaseBearer(req: express.Request) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;
  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch {
    return null;
  }
}

function sealPayload(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function unsealPayload(sealed: string): string {
  const parts = sealed.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload format');
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function getPublicOrigin(req?: express.Request): string {
  const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (envUrl) {
    return envUrl.replace('://ais-dev-', '://ais-pre-');
  }
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'https';
    const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.get('host') || '';
    if (host) {
      return `${proto}://${host.replace(/^ais-dev-/, 'ais-pre-')}`;
    }
  }
  return '';
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/public-config', (req, res) => {
    res.json({ publicAppUrl: getPublicOrigin(req) });
  });

  // Check whether Super Admin username/password is configured via env or local vault
  app.get('/api/admin/status', async (req, res) => {
    const decoded = await verifyFirebaseBearer(req);
    if (!decoded) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!decoded.email_verified || decoded.email !== SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: 'Super Admin access only' });
      return;
    }
    const envPasscode = (process.env.ADMIN_PORTAL_PASSCODE || '').trim();
    const configured = Boolean(envPasscode) || Boolean(claimedAdminCreds);
    res.json({
      configured,
      source: envPasscode ? 'env' : claimedAdminCreds ? 'claimed' : 'unclaimed',
      superAdminEmail: SUPER_ADMIN_EMAIL,
    });
  });

  // First-run username & password claim when ADMIN_PORTAL_PASSCODE env is not configured
  app.post('/api/admin/claim-passcode', async (req, res) => {
    const decoded = await verifyFirebaseBearer(req);
    if (!decoded || !decoded.email_verified || decoded.email !== SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: 'Only verified Super Admin can claim credentials' });
      return;
    }
    const envPasscode = (process.env.ADMIN_PORTAL_PASSCODE || '').trim();
    if (envPasscode || claimedAdminCreds) {
      res.status(409).json({ error: 'Admin credentials are already configured' });
      return;
    }
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (username.length < 4 || username.length > 64) {
      res.status(400).json({ error: 'অ্যাডমিন ইউজারনেম কমপক্ষে ৪ অক্ষরের হতে হবে' });
      return;
    }
    if (passcode.length < 8 || passcode.length > 128) {
      res.status(400).json({ error: 'অ্যাডমিন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে' });
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
    const nextCreds: StoredAdminCredentials = { username, salt, hashHex: derived };
    saveStoredAdminCredentials(nextCreds);
    claimedAdminCreds = nextCreds;
    const adminToken = signAdminToken(decoded.uid, decoded.email);
    res.json({ ok: true, adminToken });
  });

  // Verify admin username & password and issue short-lived Bearer session token
  app.post('/api/admin/unlock', async (req, res) => {
    const decoded = await verifyFirebaseBearer(req);
    if (!decoded || !decoded.email_verified || decoded.email !== SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: 'Super Admin authentication required' });
      return;
    }
    const rateKey = `admin_${decoded.uid}`;
    const rate = checkRateLimit(rateKey);
    if (!rate.allowed) {
      res.status(429).json({
        error: `অনেকবার ভুল চেষ্টা করা হয়েছে। ${rate.retryAfterSec} সেকেন্ড পর আবার চেষ্টা করুন।`,
      });
      return;
    }

    const usernameInput = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    const envPasscode = (process.env.ADMIN_PORTAL_PASSCODE || '').trim();
    const envUsername = (process.env.ADMIN_PORTAL_USERNAME || '').trim().toLowerCase();
    let valid = false;

    if (envPasscode) {
      const expectedUser = envUsername || SUPER_ADMIN_EMAIL.toLowerCase();
      const userOk = timingSafeTextEqual(usernameInput, expectedUser);
      const passOk = timingSafeTextEqual(passcode, envPasscode);
      valid = userOk && passOk;
    } else if (claimedAdminCreds) {
      const userOk = timingSafeTextEqual(usernameInput, claimedAdminCreds.username);
      const candidateHex = crypto.scryptSync(passcode, claimedAdminCreds.salt, 64).toString('hex');
      const passOk = crypto.timingSafeEqual(
        Buffer.from(candidateHex, 'hex'),
        Buffer.from(claimedAdminCreds.hashHex, 'hex')
      );
      valid = userOk && passOk;
    } else {
      res.status(409).json({ error: 'Admin credentials not claimed yet' });
      return;
    }

    if (!valid) {
      recordFailure(rateKey);
      res.status(401).json({ error: 'ভুল অ্যাডমিন ইউজারনেম অথবা পাসওয়ার্ড' });
      return;
    }

    clearFailure(rateKey);
    const adminToken = signAdminToken(decoded.uid, decoded.email);
    res.json({ ok: true, adminToken });
  });

  // Update admin username & password from inside unlocked Admin Portal
  app.post('/api/admin/change-credentials', async (req, res) => {
    const decoded = await verifyFirebaseBearer(req);
    const adminSession = typeof req.headers['x-admin-session'] === 'string' ? req.headers['x-admin-session'] : '';
    const parsed = verifyAdminToken(adminSession);
    if (!decoded || !parsed || decoded.uid !== parsed.uid || decoded.email !== SUPER_ADMIN_EMAIL) {
      res.status(401).json({ error: 'অ্যাডমিন সেশন বৈধ নয়' });
      return;
    }
    const envPasscode = (process.env.ADMIN_PORTAL_PASSCODE || '').trim();
    if (envPasscode) {
      res.status(400).json({ error: 'সার্ভার Environment Variable থেকে পাসওয়ার্ড নির্ধারিত রয়েছে' });
      return;
    }

    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (username.length < 4 || username.length > 64) {
      res.status(400).json({ error: 'অ্যাডমিন ইউজারনেম কমপক্ষে ৪ অক্ষরের হতে হবে' });
      return;
    }
    if (passcode.length < 8 || passcode.length > 128) {
      res.status(400).json({ error: 'অ্যাডমিন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
    const nextCreds: StoredAdminCredentials = { username, salt, hashHex: derived };
    saveStoredAdminCredentials(nextCreds);
    claimedAdminCreds = nextCreds;
    const nextToken = signAdminToken(decoded.uid, decoded.email);
    res.json({ ok: true, adminToken: nextToken });
  });

  app.get('/api/admin/verify-session', async (req, res) => {
    const decoded = await verifyFirebaseBearer(req);
    const adminSession = typeof req.headers['x-admin-session'] === 'string' ? req.headers['x-admin-session'] : '';
    const parsed = verifyAdminToken(adminSession);
    if (!decoded || !parsed || decoded.uid !== parsed.uid) {
      res.status(401).json({ valid: false });
      return;
    }
    res.json({ valid: true, email: parsed.email });
  });

  // AES-256-GCM encryption for sensitive KYC records
  app.post('/api/crypto/seal', async (req, res) => {
    const decoded = await verifyFirebaseBearer(req);
    if (!decoded) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const payload = typeof req.body?.payload === 'string' ? req.body.payload : '';
    if (!payload || payload.length > 3000) {
      res.status(400).json({ error: 'Invalid payload size' });
      return;
    }
    const sealed = sealPayload(payload);
    res.json({ sealed });
  });

  app.post('/api/crypto/unseal', async (req, res) => {
    const decoded = await verifyFirebaseBearer(req);
    if (!decoded) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const targetUserId = typeof req.body?.userId === 'string' ? req.body.userId : '';
    const isOwner = decoded.uid === targetUserId;
    const adminSession = typeof req.headers['x-admin-session'] === 'string' ? req.headers['x-admin-session'] : '';
    const isVerifiedAdmin =
      decoded.email_verified === true &&
      decoded.email === SUPER_ADMIN_EMAIL &&
      verifyAdminToken(adminSession) !== null;

    if (!isOwner && !isVerifiedAdmin) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const sealed = typeof req.body?.sealed === 'string' ? req.body.sealed : '';
    try {
      const plaintext = unsealPayload(sealed);
      res.json({ plaintext });
    } catch {
      res.status(422).json({ error: 'Unable to decrypt record (key rotated or malformed)' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const distIndexHtml = path.join(distPath, 'index.html');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req, res) => {
      try {
        const origin = getPublicOrigin(req);
        if (origin && fs.existsSync(distIndexHtml)) {
          let html = fs.readFileSync(distIndexHtml, 'utf-8');
          html = html
            .replace(/content="\/og-cover\.jpg"/g, `content="${origin}/og-cover.jpg"`)
            .replace(
              '</head>',
              `  <meta property="og:url" content="${origin}/" />\n    <link rel="canonical" href="${origin}/" />\n  </head>`
            );
          res.type('html').send(html);
          return;
        }
      } catch (err) {
        console.warn('OG HTML rewrite skipped:', err);
      }
      res.sendFile(distIndexHtml);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
