import {useState} from 'react';
import type {AuthUser} from '../lib/keepsakeApi';
import {
  Check,
  ChevronUp,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  Loader2,
  X,
} from 'lucide-react';
import {THEME_OPTIONS} from '../types/gift';
import {PLAN_PRICES, type CreatorStatus} from '../utils/merchantConfig';

interface TotalSitesCornerProps {
  user: AuthUser | null;
  authReady: boolean;
  creatorStatus: CreatorStatus | null;
  isSigningIn: boolean;
  onSignIn: () => void;
  onOpenStoryStudio: (slug: string) => void;
  onOpenUpgrade: () => void;
}

const OCCASION_LABELS: Record<string, string> = {
  birthday: 'Birthday',
  anniversary: 'Anniversary',
  bestie: 'Bestie Roast',
  apology: "I'm Sorry",
};

const TIER_LABELS: Record<string, string> = {
  free: '₹0 Free',
  single9: `₹${PLAN_PRICES.single} Site`,
  unlimited99: `₹${PLAN_PRICES.unlimited} Infinite`,
};

function formatShortDate(iso: string): string {
  if (!iso) return 'Saved';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 'Saved';
  return new Date(parsed).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function TotalSitesCorner({
  user,
  authReady,
  creatorStatus,
  isSigningIn,
  onSignIn,
  onOpenStoryStudio,
  onOpenUpgrade,
}: TotalSitesCornerProps) {
  const [open, setOpen] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const createdGifts = creatorStatus?.createdGifts ?? [];
  const totalMade = creatorStatus
    ? Math.max(creatorStatus.publishedCount, createdGifts.length)
    : 0;

  const handleCopyLink = async (slug: string) => {
    try {
      const shareUrl = `${window.location.origin}/?gift=${encodeURIComponent(slug)}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2.5 sm:bottom-5 sm:right-5">
      {open && (
        <div
          className="w-[350px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[24px] border border-stone-900/10 bg-white shadow-[0_28px_64px_-16px_rgba(17,17,19,0.3)]"
          role="dialog"
          aria-label="Total websites you made"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-stone-900/[0.07] bg-[#F4F1EC] px-5 py-4">
            <div>
              <p className="text-[11px] font-medium text-stone-500">
                {user ? creatorStatus?.displayName || user.email : 'Your Keepsake Counter'}
              </p>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold tabular-nums text-[#111113]">
                  {totalMade}
                </span>
                <span className="text-xs font-semibold text-stone-700">
                  {totalMade === 1 ? 'Website Made' : 'Websites Made Total'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-white hover:text-[#111113]"
              aria-label="Close websites counter"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-[360px] overflow-y-auto p-5 studio-scroll">
            {!authReady ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your count...
              </div>
            ) : !user ? (
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-stone-600">
                  Sign in to your Keepsake account to view every surprise website you&apos;ve ever published, your total count, and quick links on any device.
                </p>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={onSignIn}
                  className="w-full rounded-xl bg-[#111113] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60 whitespace-nowrap"
                >
                  {isSigningIn ? 'Opening Sign In...' : 'Sign in / Create Account'}
                </button>
              </div>
            ) : createdGifts.length === 0 ? (
              <div className="space-y-3 py-2 text-center">
                <p className="text-xs leading-relaxed text-stone-600">
                  You haven&apos;t published a website yet. Your{' '}
                  <span className="font-semibold text-[#111113]">1st website is 100% free</span>
                  —hit Publish whenever your preview is ready.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stone-900/[0.07]">
                {createdGifts.map((item) => {
                  const themeName = THEME_OPTIONS[item.theme]?.name || 'Custom';
                  const occasionLabel = OCCASION_LABELS[item.occasion] || item.occasion;
                  const tierLabel = TIER_LABELS[item.tier] || 'Saved';
                  const isCopied = copiedSlug === item.slug;

                  return (
                    <div key={item.slug} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-[#111113]">
                            For {item.recipientName}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-stone-500">
                            {occasionLabel}
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            {themeName}
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            {tierLabel}
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            {formatShortDate(item.createdAtIso)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`/?gift=${encodeURIComponent(item.slug)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-[#111113] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-rose-700 whitespace-nowrap shrink-0"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(item.slug)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#F4F1EC] px-2.5 py-1.5 text-[11px] font-semibold text-[#111113] transition-colors hover:bg-[#EAE5DC] whitespace-nowrap shrink-0"
                        >
                          {isCopied ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          {isCopied ? 'Copied' : 'Copy URL'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            onOpenStoryStudio(item.slug);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#F4F1EC] px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 whitespace-nowrap shrink-0"
                        >
                          <ImageIcon className="h-3 w-3" />
                          Story &amp; QR
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Quota Summary */}
          {user && creatorStatus && (
            <div className="flex items-center justify-between gap-2 border-t border-stone-900/[0.07] bg-[#FAF9F7] px-5 py-3 text-[11px]">
              <span className="font-medium text-stone-600">
                {creatorStatus.hasUnlimitedPass
                  ? `₹${PLAN_PRICES.unlimited} Infinite Pass Active`
                  : creatorStatus.siteCredits > 0
                    ? `${creatorStatus.siteCredits} credit ready`
                    : '0 credits left'}
              </span>
              {!creatorStatus.hasUnlimitedPass && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenUpgrade();
                  }}
                  className="font-semibold text-rose-700 hover:underline whitespace-nowrap shrink-0"
                >
                  Unlock ₹{PLAN_PRICES.single} / ₹{PLAN_PRICES.unlimited}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Corner Pill-Free Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="inline-flex items-center gap-2.5 rounded-2xl border border-white/10 bg-[#111113] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_14px_34px_-10px_rgba(17,17,19,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-rose-700 whitespace-nowrap shrink-0"
      >
        <Layers className="h-3.5 w-3.5 text-rose-400 shrink-0" />
        <span>My Sites</span>
        <span aria-hidden="true" className="text-white/40">
          ·
        </span>
        <span className="font-mono font-bold tabular-nums">
          {authReady ? totalMade : '—'}
        </span>
        <ChevronUp
          className={`h-3.5 w-3.5 text-stone-400 transition-transform duration-200 shrink-0 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
    </div>
  );
}
