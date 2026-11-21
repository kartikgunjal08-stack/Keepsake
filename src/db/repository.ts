import {getSupabaseAdmin, SupabaseConfigError} from './supabase.ts';
import type {
  GiftConfig,
  GiftThemeId,
  GiftTier,
  OccasionPresetId,
  OpenWhenNote,
  PolaroidMemory,
  QuizQuestion,
  StoredGift,
} from '../types/gift.ts';
import {PLAN_PRICES, type CreatedGiftSummary, type CreatorStatus} from '../utils/merchantConfig.ts';

export class LimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LimitReachedError';
  }
}

function isRlsBlockedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const errObj = error as {code?: string; message?: string};
  return (
    errObj.code === '42501' ||
    String(errObj.message || '').toLowerCase().includes('row-level security')
  );
}

function formatSupabaseRepoError(error: unknown, fallback: string): Error {
  if (isRlsBlockedError(error)) {
    return new Error(
      "Supabase blocked saving because SUPABASE_SERVICE_ROLE_KEY is set to the 'anon' key instead of the 'service_role' secret key. Replace it in AI Studio Secrets with your Supabase service_role secret key.",
      {cause: error},
    );
  }
  return new Error(fallback, {cause: error});
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

interface SupabaseCreatorDbRow {
  creator_id: string;
  email: string;
  display_name: string;
  site_credits: number;
  published_count: number;
  has_unlimited_pass: boolean;
  last_utr_ref: string;
  created_at: string;
  updated_at: string;
}

interface SupabaseGiftDbRow {
  slug: string;
  creator_id: string;
  tier: GiftTier;
  theme: GiftThemeId;
  occasion: OccasionPresetId;
  recipient_name: string;
  sender_name: string;
  headline: string;
  opening_letter: string;
  special_date: string;
  milestone_date_iso: string;
  milestone_label: string;
  song_title: string;
  song_artist: string;
  song_url: string;
  memories: PolaroidMemory[];
  reasons: string[];
  open_when_notes: OpenWhenNote[];
  enable_quiz: boolean;
  quiz: QuizQuestion[];
  scratch_label: string;
  scratch_secret: string;
  passcode_enabled: boolean;
  passcode: string;
  passcode_hint: string;
  custom_slug: string;
  created_at: string;
}

const ALLOWED_THEMES: GiftThemeId[] = [
  'wax-letter',
  'midnight-polaroid',
  'cobalt-zine',
  'blush-atelier',
];
const ALLOWED_OCCASIONS: OccasionPresetId[] = ['birthday', 'anniversary', 'bestie', 'apology'];

export function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 6);
}

function sanitizeGiftPayload(gift: GiftConfig) {
  const theme: GiftThemeId = ALLOWED_THEMES.includes(gift.theme)
    ? gift.theme
    : 'midnight-polaroid';
  const occasion: OccasionPresetId = ALLOWED_OCCASIONS.includes(gift.occasion)
    ? gift.occasion
    : 'birthday';

  return {
    theme,
    occasion,
    recipient_name: String(gift.recipientName || 'Friend').slice(0, 80),
    sender_name: String(gift.senderName || 'Someone').slice(0, 80),
    headline: String(gift.headline || '').slice(0, 200),
    opening_letter: String(gift.openingLetter || '').slice(0, 2000),
    special_date: String(gift.specialDate || '').slice(0, 60),
    milestone_date_iso: String(gift.milestoneDateIso || '').slice(0, 32),
    milestone_label: String(gift.milestoneLabel || '').slice(0, 120),
    song_title: String(gift.songTitle || '').slice(0, 120),
    song_artist: String(gift.songArtist || '').slice(0, 120),
    song_url: String(gift.songUrl || '').slice(0, 400),
    memories: (Array.isArray(gift.memories) ? gift.memories : []).slice(0, 8).map((m) => ({
      id: String(m?.id || '').slice(0, 40),
      imageUrl: String(m?.imageUrl || ''),
      caption: String(m?.caption || '').slice(0, 240),
      dateLabel: String(m?.dateLabel || '').slice(0, 40),
    })),
    reasons: (Array.isArray(gift.reasons) ? gift.reasons : [])
      .slice(0, 5)
      .map((r) => String(r || '').slice(0, 240)),
    open_when_notes: (Array.isArray(gift.openWhenNotes) ? gift.openWhenNotes : [])
      .slice(0, 4)
      .map((n) => ({
        id: String(n?.id || '').slice(0, 40),
        label: String(n?.label || '').slice(0, 120),
        message: String(n?.message || '').slice(0, 600),
      })),
    enable_quiz: Boolean(gift.enableQuiz),
    quiz: (Array.isArray(gift.quiz) ? gift.quiz : []).slice(0, 3).map((q) => ({
      id: String(q?.id || '').slice(0, 40),
      prompt: String(q?.prompt || '').slice(0, 200),
      options: [
        String(q?.options?.[0] || '').slice(0, 100),
        String(q?.options?.[1] || '').slice(0, 100),
        String(q?.options?.[2] || '').slice(0, 100),
      ] as [string, string, string],
      correctIndex: Number(q?.correctIndex) || 0,
      reactionNote: String(q?.reactionNote || '').slice(0, 200),
    })),
    scratch_label: String(gift.scratchLabel || '').slice(0, 140),
    scratch_secret: String(gift.scratchSecret || '').slice(0, 600),
    passcode_enabled: Boolean(gift.passcodeEnabled),
    passcode: String(gift.passcode || '').slice(0, 16),
    passcode_hint: String(gift.passcodeHint || '').slice(0, 140),
    custom_slug: String(gift.customSlug || '').slice(0, 64),
  };
}

async function ensureCreatorRow(
  uid: string,
  email: string,
  displayName: string,
): Promise<SupabaseCreatorDbRow> {
  const supabase = getSupabaseAdmin();
  const cleanEmail = email.slice(0, 200);
  const cleanName = (displayName || 'Creator').slice(0, 100);
  const nowIso = new Date().toISOString();

  const {data: existing, error: selectErr} = await supabase
    .from('creators')
    .select('*')
    .eq('creator_id', uid)
    .maybeSingle<SupabaseCreatorDbRow>();

  if (selectErr) {
    throw selectErr;
  }

  if (!existing) {
    if (cleanEmail) {
      const {data: existingByEmail} = await supabase
        .from('creators')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle<SupabaseCreatorDbRow>();

      if (existingByEmail && existingByEmail.published_count === 0) {
        const {data: migrated, error: migrateErr} = await supabase
          .from('creators')
          .update({
            creator_id: uid,
            email: cleanEmail,
            display_name: cleanName || existingByEmail.display_name,
            updated_at: nowIso,
          })
          .eq('creator_id', existingByEmail.creator_id)
          .select('*')
          .single<SupabaseCreatorDbRow>();

        if (!migrateErr && migrated) {
          return migrated;
        }
      }
    }

    const {error: insertErr} = await supabase.from('creators').upsert(
      {
        creator_id: uid,
        email: cleanEmail,
        display_name: cleanName,
        site_credits: 1,
        published_count: 0,
        has_unlimited_pass: false,
        last_utr_ref: '',
        created_at: nowIso,
        updated_at: nowIso,
      },
      {onConflict: 'creator_id', ignoreDuplicates: true},
    );
    if (insertErr) {
      throw insertErr;
    }

    const {data: created, error: refetchErr} = await supabase
      .from('creators')
      .select('*')
      .eq('creator_id', uid)
      .single<SupabaseCreatorDbRow>();
    if (refetchErr || !created) {
      throw refetchErr || new Error('Creator profile could not be initialized.');
    }
    return created;
  }

  if (existing.email !== cleanEmail || existing.display_name !== cleanName) {
    const {data: updated, error: updateErr} = await supabase
      .from('creators')
      .update({
        email: cleanEmail,
        display_name: cleanName,
        updated_at: nowIso,
      })
      .eq('creator_id', uid)
      .select('*')
      .single<SupabaseCreatorDbRow>();
    if (updateErr || !updated) {
      throw updateErr || new Error('Could not update creator profile.');
    }
    return updated;
  }

  return existing;
}

export async function getOrCreateCreator(
  uid: string,
  email: string,
  displayName: string,
): Promise<CreatorStatus> {
  try {
    const supabase = getSupabaseAdmin();
    const profile = await ensureCreatorRow(uid, email, displayName);

    const {data: giftRows, error: giftsErr} = await supabase
      .from('gifts')
      .select('slug, recipient_name, headline, occasion, theme, tier, created_at')
      .eq('creator_id', uid)
      .order('created_at', {ascending: false});

    if (giftsErr) {
      throw giftsErr;
    }

    const createdGifts: CreatedGiftSummary[] = (giftRows || []).map((g) => ({
      slug: String(g.slug),
      recipientName: String(g.recipient_name || 'Friend'),
      headline: String(g.headline || 'Surprise Website'),
      occasion: (g.occasion as OccasionPresetId) || 'birthday',
      theme: (g.theme as GiftThemeId) || 'midnight-polaroid',
      tier: (g.tier as GiftTier) || 'free',
      createdAtIso: String(g.created_at || ''),
    }));

    return {
      creatorId: profile.creator_id,
      email: profile.email,
      displayName: profile.display_name,
      siteCredits: profile.site_credits,
      publishedCount: profile.published_count,
      hasUnlimitedPass: profile.has_unlimited_pass,
      publishedSlugs: createdGifts.map((g) => g.slug),
      createdGifts,
    };
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      throw error;
    }
    console.error('Supabase error in getOrCreateCreator:', error);
    throw formatSupabaseRepoError(
      error,
      'Could not load creator profile from Supabase. Please try again.',
    );
  }
}

export async function creditSingleSitePurchase(
  uid: string,
  email: string,
  displayName: string,
  utr: string,
): Promise<CreatorStatus> {
  const cleanUtr = utr.trim().slice(0, 40);
  try {
    const supabase = getSupabaseAdmin();
    const profile = await ensureCreatorRow(uid, email, displayName);

    if (profile.last_utr_ref === cleanUtr) {
      return await getOrCreateCreator(uid, email, displayName);
    }

    const {data: claimedByOther, error: claimCheckErr} = await supabase
      .from('creators')
      .select('creator_id')
      .eq('last_utr_ref', cleanUtr)
      .neq('creator_id', uid)
      .maybeSingle();

    if (claimCheckErr) {
      throw claimCheckErr;
    }
    if (claimedByOther) {
      throw new Error('This Payment ID has already been claimed by another account.');
    }

    const {error: updateErr} = await supabase
      .from('creators')
      .update({
        site_credits: profile.site_credits + 1,
        last_utr_ref: cleanUtr,
        updated_at: new Date().toISOString(),
      })
      .eq('creator_id', uid);

    if (updateErr) {
      throw updateErr;
    }

    return await getOrCreateCreator(uid, email, displayName);
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      throw error;
    }
    console.error('Supabase error in creditSingleSitePurchase:', error);
    throw formatSupabaseRepoError(
      error,
      'Could not save single-site credit in Supabase. Please try again.',
    );
  }
}

export async function unlockUnlimitedPass(
  uid: string,
  email: string,
  displayName: string,
  utr: string,
): Promise<CreatorStatus> {
  const cleanUtr = utr.trim().slice(0, 40);
  try {
    const supabase = getSupabaseAdmin();
    const profile = await ensureCreatorRow(uid, email, displayName);

    if (profile.has_unlimited_pass && profile.last_utr_ref === cleanUtr) {
      return await getOrCreateCreator(uid, email, displayName);
    }

    const {data: claimedByOther, error: claimCheckErr} = await supabase
      .from('creators')
      .select('creator_id')
      .eq('last_utr_ref', cleanUtr)
      .neq('creator_id', uid)
      .maybeSingle();

    if (claimCheckErr) {
      throw claimCheckErr;
    }
    if (claimedByOther) {
      throw new Error('This Payment ID has already been claimed by another account.');
    }

    const {error: updateErr} = await supabase
      .from('creators')
      .update({
        has_unlimited_pass: true,
        last_utr_ref: cleanUtr,
        updated_at: new Date().toISOString(),
      })
      .eq('creator_id', uid);

    if (updateErr) {
      throw updateErr;
    }

    return await getOrCreateCreator(uid, email, displayName);
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      throw error;
    }
    console.error('Supabase error in unlockUnlimitedPass:', error);
    throw formatSupabaseRepoError(
      error,
      'Could not activate Infinite Pass in Supabase. Please try again.',
    );
  }
}

export async function publishGift(
  uid: string,
  email: string,
  displayName: string,
  giftInput: GiftConfig,
  preferredSlug?: string,
): Promise<{slug: string; creator: CreatorStatus}> {
  const sanitized = sanitizeGiftPayload(giftInput);
  const rawBase =
    sanitizeSlug(preferredSlug || sanitized.custom_slug || '') ||
    sanitizeSlug(`for-${sanitized.recipient_name || 'friend'}`);

  const baseSlug = rawBase.length >= 2 ? rawBase.slice(0, 56) : `gift-${randomSuffix()}`;

  try {
    const supabase = getSupabaseAdmin();
    const profile = await ensureCreatorRow(uid, email, displayName);

    if (!profile.has_unlimited_pass && profile.site_credits < 1) {
      throw new LimitReachedError(
        `Free limit reached (1 website max). Unlock extra sites for ₹${PLAN_PRICES.single} or Infinite for ₹${PLAN_PRICES.unlimited}.`,
      );
    }

    let finalSlug = baseSlug;
    const {data: existingSlug, error: slugErr} = await supabase
      .from('gifts')
      .select('slug')
      .eq('slug', finalSlug)
      .maybeSingle();

    if (slugErr) {
      throw slugErr;
    }
    if (existingSlug) {
      finalSlug = `${baseSlug.slice(0, 50)}-${randomSuffix()}`;
    }

    const tier: GiftTier = profile.has_unlimited_pass
      ? 'unlimited99'
      : profile.published_count === 0
        ? 'free'
        : 'single9';

    const {error: insertErr} = await supabase.from('gifts').insert({
      slug: finalSlug,
      creator_id: uid,
      tier,
      ...sanitized,
      created_at: new Date().toISOString(),
    });

    if (insertErr) {
      throw insertErr;
    }

    const nextCredits = profile.has_unlimited_pass
      ? profile.site_credits
      : Math.max(0, profile.site_credits - 1);

    const {error: updateErr} = await supabase
      .from('creators')
      .update({
        published_count: profile.published_count + 1,
        site_credits: nextCredits,
        updated_at: new Date().toISOString(),
      })
      .eq('creator_id', uid);

    if (updateErr) {
      throw updateErr;
    }

    const updatedCreator = await getOrCreateCreator(uid, email, displayName);
    return {slug: finalSlug, creator: updatedCreator};
  } catch (error) {
    if (error instanceof LimitReachedError || error instanceof SupabaseConfigError) {
      throw error;
    }
    console.error('Supabase error in publishGift:', error);
    throw formatSupabaseRepoError(
      error,
      'Could not publish surprise website to Supabase. Please try again.',
    );
  }
}

export async function getGiftBySlug(rawSlug: string): Promise<StoredGift | null> {
  const cleanSlug = sanitizeSlug(rawSlug);
  if (!cleanSlug) return null;

  try {
    const supabase = getSupabaseAdmin();
    const {data: row, error} = await supabase
      .from('gifts')
      .select('*')
      .eq('slug', cleanSlug)
      .maybeSingle<SupabaseGiftDbRow>();

    if (error) {
      throw error;
    }
    if (!row) return null;

    return {
      slug: row.slug,
      tier: row.tier,
      theme: row.theme,
      occasion: row.occasion,
      recipientName: row.recipient_name,
      senderName: row.sender_name,
      headline: row.headline,
      openingLetter: row.opening_letter,
      specialDate: row.special_date,
      milestoneDateIso: row.milestone_date_iso,
      milestoneLabel: row.milestone_label,
      songTitle: row.song_title,
      songArtist: row.song_artist,
      songUrl: row.song_url,
      memories: Array.isArray(row.memories) ? row.memories : [],
      reasons: Array.isArray(row.reasons) ? row.reasons : [],
      openWhenNotes: Array.isArray(row.open_when_notes) ? row.open_when_notes : [],
      enableQuiz: Boolean(row.enable_quiz),
      quiz: Array.isArray(row.quiz) ? row.quiz : [],
      scratchLabel: row.scratch_label,
      scratchSecret: row.scratch_secret,
      passcodeEnabled: Boolean(row.passcode_enabled),
      passcode: row.passcode,
      passcodeHint: row.passcode_hint,
      customSlug: row.custom_slug,
      createdAt: String(row.created_at || ''),
    };
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      throw error;
    }
    console.error('Supabase error in getGiftBySlug:', error);
    throw formatSupabaseRepoError(
      error,
      'Could not load surprise website from Supabase. Please try again.',
    );
  }
}

export async function getAllAdminRecords(): Promise<{
  creators: AdminCreatorRow[];
  gifts: AdminGiftRow[];
}> {
  try {
    const supabase = getSupabaseAdmin();
    const [creatorsRes, giftsRes] = await Promise.all([
      supabase.from('creators').select('*').order('updated_at', {ascending: false}),
      supabase.from('gifts').select('*').order('created_at', {ascending: false}),
    ]);

    if (creatorsRes.error) {
      throw creatorsRes.error;
    }
    if (giftsRes.error) {
      throw giftsRes.error;
    }

    return {
      creators: (creatorsRes.data || []).map((c: SupabaseCreatorDbRow) => ({
        creatorId: c.creator_id,
        email: c.email,
        displayName: c.display_name,
        siteCredits: c.site_credits,
        publishedCount: c.published_count,
        hasUnlimitedPass: c.has_unlimited_pass,
        lastUtrRef: c.last_utr_ref,
        createdAtIso: c.created_at,
        updatedAtIso: c.updated_at,
      })),
      gifts: (giftsRes.data || []).map((g: SupabaseGiftDbRow) => ({
        slug: g.slug,
        creatorId: g.creator_id,
        recipientName: g.recipient_name,
        senderName: g.sender_name,
        headline: g.headline,
        occasion: g.occasion,
        theme: g.theme,
        tier: g.tier,
        customSlug: g.custom_slug,
        createdAtIso: g.created_at,
      })),
    };
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      throw error;
    }
    console.error('Supabase error in getAllAdminRecords:', error);
    throw formatSupabaseRepoError(
      error,
      'Could not load admin records from Supabase. Please try again.',
    );
  }
}
