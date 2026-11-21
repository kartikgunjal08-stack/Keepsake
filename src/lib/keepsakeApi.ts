import type {
  GiftConfig,
  GiftThemeId,
  GiftTier,
  OccasionPresetId,
  StoredGift,
} from '../types/gift';
import type {CreatedGiftSummary, CreatorStatus} from '../utils/merchantConfig';

export const FOUNDER_ADMIN_EMAIL = 'kartikgunjal08@gmail.com';
const SESSION_STORAGE_KEY = 'keepsake_supabase_session_v1';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
}

export interface AdminCreatorRow {
  creatorId: string;
  email: string;
  displayName: string;
  siteCredits: number;
  publishedCount: number;
  hasUnlimitedPass: boolean;
  lastUtrRef: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface AdminGiftRow extends CreatedGiftSummary {
  creatorId: string;
  senderName: string;
  customSlug: string;
}

export function isFounderUser(user: AuthUser | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      (user.email || '').toLowerCase() === FOUNDER_ADMIN_EMAIL.toLowerCase(),
  );
}

export function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

const authListeners = new Set<(user: AuthUser | null) => void>();

function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.accessToken || !parsed?.user?.uid) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!session) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // Ignore storage quota errors
  }
  const nextUser = session?.user || null;
  authListeners.forEach((cb) => cb(nextUser));
}

let refreshPromise: Promise<StoredSession | null> | null = null;

async function refreshStoredSession(current: StoredSession): Promise<StoredSession | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({refreshToken: current.refreshToken}),
      });
      if (!res.ok) {
        writeStoredSession(null);
        return null;
      }
      const data = (await res.json()) as {
        session: {accessToken: string; refreshToken: string; expiresAt: number};
        user: AuthUser;
      };
      const updated: StoredSession = {
        accessToken: data.session.accessToken,
        refreshToken: data.session.refreshToken,
        expiresAt: data.session.expiresAt,
        user: data.user,
      };
      writeStoredSession(updated);
      return updated;
    } catch {
      return current;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function getValidAccessToken(): Promise<string> {
  let session = readStoredSession();
  if (!session) {
    throw new Error('Please sign in to your Keepsake account first.');
  }
  if (Date.now() >= session.expiresAt - 60_000 && session.refreshToken) {
    session = await refreshStoredSession(session);
  }
  if (!session?.accessToken) {
    throw new Error('Your session expired. Please sign in again.');
  }
  return session.accessToken;
}

export function subscribeToAuthState(
  onChange: (user: AuthUser | null) => void,
  onReady?: () => void,
): () => void {
  authListeners.add(onChange);

  const init = async () => {
    let session = readStoredSession();
    if (session && Date.now() >= session.expiresAt - 60_000 && session.refreshToken) {
      session = await refreshStoredSession(session);
    }
    onChange(session?.user || null);
    onReady?.();
  };
  void init();

  return () => {
    authListeners.delete(onChange);
  };
}

export async function signUpWithKeepsake(
  name: string,
  email: string,
  password: string,
): Promise<{user: AuthUser; creator: CreatorStatus}> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({name, email, password}),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    session?: {accessToken: string; refreshToken: string; expiresAt: number};
    user?: AuthUser;
    creator?: CreatorStatus;
  };
  if (!res.ok || !payload.session || !payload.user || !payload.creator) {
    throw new Error(payload.error || 'Could not create your Keepsake account.');
  }

  writeStoredSession({
    accessToken: payload.session.accessToken,
    refreshToken: payload.session.refreshToken,
    expiresAt: payload.session.expiresAt,
    user: payload.user,
  });

  return {user: payload.user, creator: payload.creator};
}

export async function signInWithKeepsake(
  email: string,
  password: string,
): Promise<{user: AuthUser; creator: CreatorStatus}> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password}),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    session?: {accessToken: string; refreshToken: string; expiresAt: number};
    user?: AuthUser;
    creator?: CreatorStatus;
  };
  if (!res.ok || !payload.session || !payload.user || !payload.creator) {
    throw new Error(payload.error || 'Invalid email or password.');
  }

  writeStoredSession({
    accessToken: payload.session.accessToken,
    refreshToken: payload.session.refreshToken,
    expiresAt: payload.session.expiresAt,
    user: payload.user,
  });

  return {user: payload.user, creator: payload.creator};
}

export async function signOutCreator(): Promise<void> {
  writeStoredSession(null);
}

async function authedFetch<T>(_user: AuthUser, url: string, init?: RequestInit): Promise<T> {
  let token = await getValidAccessToken();
  const perform = async (bearer: string) =>
    fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
        Authorization: `Bearer ${bearer}`,
      },
    });

  let res = await perform(token);
  if (res.status === 401) {
    const current = readStoredSession();
    if (current?.refreshToken) {
      const refreshed = await refreshStoredSession(current);
      if (refreshed?.accessToken) {
        token = refreshed.accessToken;
        res = await perform(token);
      }
    }
  }

  const payload = (await res.json().catch(() => ({}))) as {error?: string} & T;
  if (!res.ok) {
    if (res.status === 401) {
      writeStoredSession(null);
    }
    throw new Error(payload.error || 'Request could not be completed. Please try again.');
  }
  return payload;
}

export async function loadOrCreateCreatorProfile(user: AuthUser): Promise<CreatorStatus> {
  const data = await authedFetch<{creator: CreatorStatus}>(user, '/api/creator', {
    method: 'GET',
  });
  return data.creator;
}

export async function purchaseSingleSiteCredit(
  user: AuthUser,
  utr: string,
  _currentCredits: number,
): Promise<CreatorStatus> {
  const data = await authedFetch<{creator: CreatorStatus}>(user, '/api/creator/purchase-single', {
    method: 'POST',
    body: JSON.stringify({utr: utr.trim().slice(0, 40)}),
  });
  return data.creator;
}

export async function purchaseUnlimitedPass(user: AuthUser, utr: string): Promise<CreatorStatus> {
  const data = await authedFetch<{creator: CreatorStatus}>(user, '/api/creator/unlock-unlimited', {
    method: 'POST',
    body: JSON.stringify({utr: utr.trim().slice(0, 40)}),
  });
  return data.creator;
}

export async function publishGiftToSupabase(
  user: AuthUser,
  gift: GiftConfig,
  _creator: CreatorStatus,
  preferredSlug?: string,
): Promise<{slug: string; creator: CreatorStatus}> {
  return authedFetch<{slug: string; creator: CreatorStatus}>(user, '/api/gifts', {
    method: 'POST',
    body: JSON.stringify({gift, preferredSlug}),
  });
}

export async function fetchGiftBySlug(rawSlug: string): Promise<StoredGift | null> {
  const cleanSlug = sanitizeSlug(rawSlug);
  if (!cleanSlug) return null;

  const res = await fetch(`/api/gifts/${encodeURIComponent(cleanSlug)}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error('Could not load surprise website.');
  }
  const json = (await res.json()) as {gift?: StoredGift};
  return json.gift || null;
}

export async function fetchAllAdminData(
  user: AuthUser,
): Promise<{creators: AdminCreatorRow[]; gifts: AdminGiftRow[]}> {
  if (!isFounderUser(user)) {
    throw new Error('Founder sign-in required to view all user data.');
  }

  return authedFetch<{creators: AdminCreatorRow[]; gifts: AdminGiftRow[]}>(
    user,
    '/api/admin/records',
    {method: 'GET'},
  );
}

export interface PaymentGatewayConfig {
  razorpayCheckoutEnabled: boolean;
  keyId: string | null;
}

export async function fetchPaymentConfig(): Promise<PaymentGatewayConfig> {
  try {
    const res = await fetch('/api/payments/config');
    if (!res.ok) return {razorpayCheckoutEnabled: false, keyId: null};
    return (await res.json()) as PaymentGatewayConfig;
  } catch {
    return {razorpayCheckoutEnabled: false, keyId: null};
  }
}

export async function createRazorpayOrder(
  user: AuthUser,
  plan: 'single9' | 'unlimited99',
): Promise<{orderId: string; amount: number; currency: string; keyId: string}> {
  return authedFetch<{orderId: string; amount: number; currency: string; keyId: string}>(
    user,
    '/api/razorpay/order',
    {
      method: 'POST',
      body: JSON.stringify({plan}),
    },
  );
}

export async function verifyRazorpayPayment(
  user: AuthUser,
  payload: {
    plan: 'single9' | 'unlimited99';
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  },
): Promise<{creator: CreatorStatus; paymentId: string}> {
  return authedFetch<{creator: CreatorStatus; paymentId: string}>(
    user,
    '/api/razorpay/verify',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function createRazorpayPaymentLink(
  user: AuthUser,
  plan: 'single9' | 'unlimited99',
  origin: string,
): Promise<{shortUrl: string; paymentLinkId?: string; referenceId?: string}> {
  return authedFetch<{shortUrl: string; paymentLinkId?: string; referenceId?: string}>(
    user,
    '/api/razorpay/payment-link',
    {
      method: 'POST',
      body: JSON.stringify({plan, origin}),
    },
  );
}

export async function verifyRazorpayPaymentLink(
  user: AuthUser,
  payload: {
    plan: 'single9' | 'unlimited99';
    razorpay_payment_id: string;
    razorpay_payment_link_id: string;
    razorpay_payment_link_reference_id: string;
    razorpay_payment_link_status: string;
    razorpay_signature: string;
  },
): Promise<{creator: CreatorStatus; paymentId: string}> {
  return authedFetch<{creator: CreatorStatus; paymentId: string}>(
    user,
    '/api/razorpay/verify-link',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export type {GiftThemeId, GiftTier, OccasionPresetId};
