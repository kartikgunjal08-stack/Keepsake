import type {GiftConfig, GiftThemeId, GiftTier, OccasionPresetId} from '../types/gift';

export const PLAN_PRICES = {
  single: 1,
  unlimited: 2,
} as const;

export interface MerchantConfig {
  upiId: string;
  payeeName: string;
  whatsappNumber: string;
  razorpayUrl9: string;
  razorpayUrl99: string;
}

export interface CreatedGiftSummary {
  slug: string;
  recipientName: string;
  headline: string;
  occasion: OccasionPresetId;
  theme: GiftThemeId;
  tier: GiftTier;
  createdAtIso: string;
}

export interface CreatorStatus {
  creatorId: string;
  email: string;
  displayName: string;
  siteCredits: number;
  publishedCount: number;
  hasUnlimitedPass: boolean;
  publishedSlugs: string[];
  createdGifts: CreatedGiftSummary[];
}

export interface PendingCheckoutDraft {
  plan: 'single9' | 'unlimited99';
  gift: GiftConfig;
  savedAt: number;
}

const STORAGE_KEY = 'keepsake_merchant_config_v4';
const PENDING_CHECKOUT_KEY = 'keepsake_pending_razorpay_v1';

const hasImportMetaEnv =
  typeof import.meta !== 'undefined' &&
  typeof (import.meta as unknown as {env?: unknown}).env === 'object' &&
  (import.meta as unknown as {env?: unknown}).env !== null;

export const DEFAULT_MERCHANT_CONFIG: MerchantConfig = {
  upiId: (hasImportMetaEnv ? import.meta.env.VITE_MERCHANT_UPI : undefined) || 'yourname@okaxis',
  payeeName: (hasImportMetaEnv ? import.meta.env.VITE_MERCHANT_NAME : undefined) || 'Keepsake Gifts',
  whatsappNumber: (hasImportMetaEnv ? import.meta.env.VITE_MERCHANT_WA : undefined) || '',
  razorpayUrl9: (hasImportMetaEnv ? import.meta.env.VITE_RAZORPAY_SINGLE_URL : undefined) || '',
  razorpayUrl99: (hasImportMetaEnv ? import.meta.env.VITE_RAZORPAY_UNLIMITED_URL : undefined) || '',
};

export function loadMerchantConfig(): MerchantConfig {
  let config: MerchantConfig = {...DEFAULT_MERCHANT_CONFIG};

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      config = {...config, ...JSON.parse(saved)};
    }
  } catch {
    // Ignore storage access errors
  }

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const upi = params.get('upi');
    const name = params.get('name');
    const wa = params.get('wa');
    const rzp1 = params.get('rzp1');
    const rzp2 = params.get('rzp2');
    if (upi) config.upiId = upi;
    if (name) config.payeeName = name;
    if (wa) config.whatsappNumber = wa;
    if (rzp1) config.razorpayUrl9 = rzp1;
    if (rzp2) config.razorpayUrl99 = rzp2;
  }

  return config;
}

export function saveMerchantConfig(config: MerchantConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage errors
  }
}

export function savePendingCheckoutDraft(plan: 'single9' | 'unlimited99', gift: GiftConfig): void {
  try {
    const payload: PendingCheckoutDraft = {
      plan,
      gift,
      savedAt: Date.now(),
    };
    localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadPendingCheckoutDraft(): PendingCheckoutDraft | null {
  try {
    const raw = localStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCheckoutDraft;
    // Expire drafts older than 2 hours
    if (!parsed || Date.now() - parsed.savedAt > 2 * 60 * 60 * 1000) {
      localStorage.removeItem(PENDING_CHECKOUT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingCheckoutDraft(): void {
  try {
    localStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function buildUpiUri(
  config: MerchantConfig,
  amountInr: number = PLAN_PRICES.unlimited,
  note = 'Keepsake Surprise Website',
): string {
  const pa = encodeURIComponent(config.upiId.trim() || DEFAULT_MERCHANT_CONFIG.upiId);
  const pn = encodeURIComponent(config.payeeName.trim() || 'Keepsake');
  const tn = encodeURIComponent(note);
  return `upi://pay?pa=${pa}&pn=${pn}&am=${amountInr}&cu=INR&tn=${tn}`;
}
