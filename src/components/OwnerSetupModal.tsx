import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  type AdminCreatorRow,
  type AdminGiftRow,
  type AuthUser,
  fetchAllAdminData,
  FOUNDER_ADMIN_EMAIL,
  isFounderUser,
} from '../lib/keepsakeApi';
import {
  DEFAULT_MERCHANT_CONFIG,
  type MerchantConfig,
  PLAN_PRICES,
} from '../utils/merchantConfig';

interface OwnerSetupModalProps {
  isOpen: boolean;
  config: MerchantConfig;
  user: AuthUser | null;
  onRequestSignIn: () => void;
  onSave: (next: MerchantConfig) => void;
  onClose: () => void;
}

type ModalTab = 'payment' | 'data';
type DataViewFilter = 'creators' | 'gifts';

function formatShortDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

function formatPlanLabel(row: AdminCreatorRow): string {
  if (row.hasUnlimitedPass) return `Infinite ₹${PLAN_PRICES.unlimited}`;
  if (row.siteCredits > 0 && row.publishedCount >= 1) {
    return `${row.siteCredits} paid credit${row.siteCredits === 1 ? '' : 's'}`;
  }
  if (row.lastUtrRef) return 'Paid ref logged';
  return 'Free tier';
}

function formatTierLabel(tier: AdminGiftRow['tier']): string {
  if (tier === 'unlimited99') return `Infinite ₹${PLAN_PRICES.unlimited}`;
  if (tier === 'single9') return `Single ₹${PLAN_PRICES.single}`;
  return 'Free';
}

export function OwnerSetupModal({
  isOpen,
  config,
  user,
  onRequestSignIn,
  onSave,
  onClose,
}: OwnerSetupModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('payment');
  const [form, setForm] = useState<MerchantConfig>(config);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState<'single' | 'unlimited' | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const [dataView, setDataView] = useState<DataViewFilter>('creators');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [dataError, setDataError] = useState('');
  const [adminCreators, setAdminCreators] = useState<AdminCreatorRow[]>([]);
  const [adminGifts, setAdminGifts] = useState<AdminGiftRow[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const isFounder = isFounderUser(user);

  useEffect(() => {
    setForm(config);
  }, [config]);

  const loadAdminRecords = useCallback(async () => {
    if (!user || !isFounderUser(user)) return;
    setLoadingData(true);
    setDataError('');
    try {
      const res = await fetchAllAdminData(user);
      setAdminCreators(res.creators);
      setAdminGifts(res.gifts);
      setHasLoadedOnce(true);
    } catch (err) {
      setDataError(
        err instanceof Error
          ? err.message
          : 'Could not load admin records. Please refresh and try again.',
      );
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen && activeTab === 'data' && isFounder && !hasLoadedOnce && !loadingData) {
      void loadAdminRecords();
    }
  }, [isOpen, activeTab, isFounder, hasLoadedOnce, loadingData, loadAdminRecords]);

  useEffect(() => {
    if (!isFounder) {
      setAdminCreators([]);
      setAdminGifts([]);
      setHasLoadedOnce(false);
    }
  }, [isFounder]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredCreators = useMemo(() => {
    if (!normalizedSearch) return adminCreators;
    return adminCreators.filter(
      (c) =>
        c.email.toLowerCase().includes(normalizedSearch) ||
        c.displayName.toLowerCase().includes(normalizedSearch) ||
        c.lastUtrRef.toLowerCase().includes(normalizedSearch) ||
        c.creatorId.toLowerCase().includes(normalizedSearch),
    );
  }, [adminCreators, normalizedSearch]);

  const filteredGifts = useMemo(() => {
    if (!normalizedSearch) return adminGifts;
    return adminGifts.filter(
      (g) =>
        g.slug.toLowerCase().includes(normalizedSearch) ||
        g.recipientName.toLowerCase().includes(normalizedSearch) ||
        g.senderName.toLowerCase().includes(normalizedSearch) ||
        g.headline.toLowerCase().includes(normalizedSearch) ||
        g.creatorId.toLowerCase().includes(normalizedSearch),
    );
  }, [adminGifts, normalizedSearch]);

  const stats = useMemo(() => {
    const infiniteCount = adminCreators.filter((c) => c.hasUnlimitedPass).length;
    const paidRefCount = adminCreators.filter((c) => Boolean(c.lastUtrRef)).length;
    return {
      totalUsers: adminCreators.length,
      totalSites: adminGifts.length,
      infiniteCount,
      paidRefCount,
    };
  }, [adminCreators, adminGifts]);

  if (!isOpen) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const singleRedirectUrl = origin ? `${origin}/?rzp_plan=single` : '/?rzp_plan=single';
  const unlimitedRedirectUrl = origin ? `${origin}/?rzp_plan=unlimited` : '/?rzp_plan=unlimited';

  const shareUrl = (() => {
    if (!origin) return '';
    const url = new URL(origin);
    url.searchParams.set('upi', form.upiId.trim() || DEFAULT_MERCHANT_CONFIG.upiId);
    url.searchParams.set('name', form.payeeName.trim() || DEFAULT_MERCHANT_CONFIG.payeeName);
    if (form.whatsappNumber.trim()) {
      url.searchParams.set('wa', form.whatsappNumber.trim());
    }
    if (form.razorpayUrl9.trim()) {
      url.searchParams.set('rzp1', form.razorpayUrl9.trim());
    }
    if (form.razorpayUrl99.trim()) {
      url.searchParams.set('rzp2', form.razorpayUrl99.trim());
    }
    return url.toString();
  })();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      upiId: form.upiId.trim() || DEFAULT_MERCHANT_CONFIG.upiId,
      payeeName: form.payeeName.trim() || DEFAULT_MERCHANT_CONFIG.payeeName,
      whatsappNumber: form.whatsappNumber.trim(),
      razorpayUrl9: form.razorpayUrl9.trim(),
      razorpayUrl99: form.razorpayUrl99.trim(),
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyRedirect = async (plan: 'single' | 'unlimited', url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedRedirect(plan);
      setTimeout(() => setCopiedRedirect(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleFounderSignIn = () => {
    setDataError('');
    onRequestSignIn();
  };

  const inputClass =
    'mt-1.5 w-full rounded-xl border border-stone-200/90 bg-[#FAF9F7] px-3.5 py-2.5 text-sm text-[#111113] transition-colors focus:border-[#111113] focus:bg-white focus:outline-none';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111113]/65 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-setup-title"
    >
      <div
        className={`w-full ${
          activeTab === 'data' ? 'max-w-3xl' : 'max-w-lg'
        } rounded-[24px] border border-stone-900/10 bg-white shadow-[0_32px_70px_-16px_rgba(17,17,19,0.28)] overflow-hidden transition-[max-width] duration-200`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-900/[0.07] px-6 py-5">
          <div>
            <h2
              id="owner-setup-title"
              className="font-display text-xl font-bold tracking-tight text-[#111113]"
            >
              {activeTab === 'payment'
                ? `Owner Setup · ₹${PLAN_PRICES.single} & ₹${PLAN_PRICES.unlimited} Razorpay & UPI`
                : 'Founder Data Console · All Users & Websites'}
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {activeTab === 'payment'
                ? 'Paste your Razorpay Payment Links & copy Redirect URLs for auto-unlock'
                : 'Creators, UTR/Razorpay references, and published surprise websites'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-100 hover:text-[#111113]"
            aria-label="Close owner setup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Segmented Tab Switcher */}
        <div className="flex items-center justify-between gap-3 border-b border-stone-900/[0.07] bg-[#FAF9F7] px-6 py-3">
          <div className="inline-flex items-center gap-1 rounded-lg bg-stone-200/70 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('payment')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'payment'
                  ? 'bg-white text-[#111113] shadow-sm'
                  : 'text-stone-600 hover:text-[#111113]'
              }`}
            >
              Payment Setup
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('data')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'data'
                  ? 'bg-white text-[#111113] shadow-sm'
                  : 'text-stone-600 hover:text-[#111113]'
              }`}
            >
              All Users &amp; Sites
            </button>
          </div>
        </div>

        {activeTab === 'payment' ? (
          <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[76vh] overflow-y-auto studio-scroll">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="owner-upi" className="block text-xs font-semibold text-stone-700">
                  Your UPI ID
                </label>
                <input
                  id="owner-upi"
                  type="text"
                  value={form.upiId}
                  onChange={(e) => setForm({...form, upiId: e.target.value})}
                  placeholder="name@okaxis"
                  className={`${inputClass} font-mono`}
                />
              </div>

              <div>
                <label htmlFor="owner-name" className="block text-xs font-semibold text-stone-700">
                  Payee Display Name
                </label>
                <input
                  id="owner-name"
                  type="text"
                  value={form.payeeName}
                  onChange={(e) => setForm({...form, payeeName: e.target.value})}
                  placeholder="Keepsake Gifts"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="owner-wa" className="block text-xs font-semibold text-stone-700">
                WhatsApp Number (Optional)
              </label>
              <input
                id="owner-wa"
                type="text"
                value={form.whatsappNumber}
                onChange={(e) => setForm({...form, whatsappNumber: e.target.value})}
                placeholder="9198XXXXXXXX"
                className={`${inputClass} font-mono`}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="rzp-9" className="block text-xs font-semibold text-stone-700">
                  Razorpay ₹{PLAN_PRICES.single} Payment Link
                </label>
                <input
                  id="rzp-9"
                  type="url"
                  value={form.razorpayUrl9}
                  onChange={(e) => setForm({...form, razorpayUrl9: e.target.value})}
                  placeholder="https://rzp.io/rzp/..."
                  className={`${inputClass} text-xs`}
                />
              </div>

              <div>
                <label htmlFor="rzp-99" className="block text-xs font-semibold text-stone-700">
                  Razorpay ₹{PLAN_PRICES.unlimited} Payment Link
                </label>
                <input
                  id="rzp-99"
                  type="url"
                  value={form.razorpayUrl99}
                  onChange={(e) => setForm({...form, razorpayUrl99: e.target.value})}
                  placeholder="https://rzp.io/rzp/..."
                  className={`${inputClass} text-xs`}
                />
              </div>
            </div>

            {/* Razorpay Auto-Unlock Redirect URLs */}
            <div className="rounded-2xl bg-[#111113] p-4 text-white space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <Sparkles className="h-3.5 w-3.5 text-rose-400" />
                Razorpay Auto-Unlock Redirect URLs
              </div>
              <p className="text-[11px] leading-relaxed text-stone-300">
                In Razorpay Dashboard → Payment Link → Redirect URL, paste the matching link below so plans unlock &amp; publish automatically after payment:
              </p>
              <div className="space-y-2 pt-0.5">
                <div className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2">
                  <div className="min-w-0">
                    <span className="block text-[10px] text-stone-400">
                      For ₹{PLAN_PRICES.single} Single Site Link
                    </span>
                    <span className="block truncate font-mono text-[11px] text-white">
                      {singleRedirectUrl}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyRedirect('single', singleRedirectUrl)}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111113] hover:bg-rose-50 whitespace-nowrap shrink-0"
                  >
                    {copiedRedirect === 'single' ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedRedirect === 'single' ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2">
                  <div className="min-w-0">
                    <span className="block text-[10px] text-stone-400">
                      For ₹{PLAN_PRICES.unlimited} Infinite Link
                    </span>
                    <span className="block truncate font-mono text-[11px] text-white">
                      {unlimitedRedirectUrl}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyRedirect('unlimited', unlimitedRedirectUrl)}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111113] hover:bg-rose-50 whitespace-nowrap shrink-0"
                  >
                    {copiedRedirect === 'unlimited' ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedRedirect === 'unlimited' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#F4F1EC] p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111113]">
                  <Link2 className="h-3.5 w-3.5 text-rose-700" />
                  Your Reels Bio Shareable URL
                </span>
                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap shrink-0"
                >
                  {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedLink ? 'Copied URL' : 'Copy Link'}
                </button>
              </div>
              <p className="break-all font-mono text-[11px] text-stone-600">{shareUrl}</p>
            </div>

            <div className="flex items-center justify-between border-t border-stone-900/[0.07] pt-4">
              <span className="text-xs font-medium text-emerald-700">
                {savedNotice ? 'Saved to this browser.' : ''}
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-4 py-2.5 text-xs font-semibold text-stone-600 transition-colors hover:bg-stone-100 hover:text-[#111113] whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#111113] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 whitespace-nowrap shrink-0"
                >
                  Save Payment Config
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-5 max-h-[76vh] overflow-y-auto studio-scroll">
            {!user || !isFounder ? (
              <div className="rounded-2xl border border-stone-200 bg-[#FAF9F7] p-6 space-y-4">
                <div className="space-y-1.5">
                  <h3 className="text-sm font-bold text-[#111113]">
                    {!user
                      ? 'Sign in with your Founder Keepsake account'
                      : `Signed in as ${user.email || 'another account'}`}
                  </h3>
                  <p className="text-xs leading-relaxed text-stone-600">
                    To protect creator privacy, full customer &amp; payment listing is unlocked only for{' '}
                    <span className="font-mono font-semibold text-[#111113]">
                      {FOUNDER_ADMIN_EMAIL}
                    </span>.
                  </p>
                </div>

                {dataError && (
                  <p className="text-xs font-medium text-rose-700">{dataError}</p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleFounderSignIn}
                    disabled={signingIn}
                    className="rounded-xl bg-[#111113] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    {user ? `Switch to ${FOUNDER_ADMIN_EMAIL}` : 'Sign in to Keepsake'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* 4-Metric KPI Strip */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-stone-200/80 bg-[#FAF9F7] px-3.5 py-3">
                    <div className="text-[11px] font-medium text-stone-500">Total Users</div>
                    <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#111113]">
                      {loadingData && !hasLoadedOnce ? '—' : stats.totalUsers}
                    </div>
                  </div>
                  <div className="rounded-xl border border-stone-200/80 bg-[#FAF9F7] px-3.5 py-3">
                    <div className="text-[11px] font-medium text-stone-500">Published Sites</div>
                    <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#111113]">
                      {loadingData && !hasLoadedOnce ? '—' : stats.totalSites}
                    </div>
                  </div>
                  <div className="rounded-xl border border-stone-200/80 bg-[#FAF9F7] px-3.5 py-3">
                    <div className="text-[11px] font-medium text-stone-500">
                      ₹{PLAN_PRICES.unlimited} Infinite Passes
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#111113]">
                      {loadingData && !hasLoadedOnce ? '—' : stats.infiniteCount}
                    </div>
                  </div>
                  <div className="rounded-xl border border-stone-200/80 bg-[#FAF9F7] px-3.5 py-3">
                    <div className="text-[11px] font-medium text-stone-500">Paid UTR / Pay IDs</div>
                    <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#111113]">
                      {loadingData && !hasLoadedOnce ? '—' : stats.paidRefCount}
                    </div>
                  </div>
                </div>

                {/* Filter + Search + Refresh Toolbar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="inline-flex items-center gap-1 self-start rounded-lg bg-stone-100 p-1">
                    <button
                      type="button"
                      onClick={() => setDataView('creators')}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        dataView === 'creators'
                          ? 'bg-white text-[#111113] shadow-sm'
                          : 'text-stone-600 hover:text-[#111113]'
                      }`}
                    >
                      Users ({filteredCreators.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDataView('gifts')}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        dataView === 'gifts'
                          ? 'bg-white text-[#111113] shadow-sm'
                          : 'text-stone-600 hover:text-[#111113]'
                      }`}
                    >
                      Websites ({filteredGifts.length})
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search email, UTR, slug…"
                        aria-label="Search users or websites"
                        className="w-full rounded-xl border border-stone-200 bg-[#FAF9F7] py-2 pl-8 pr-3 text-xs text-[#111113] focus:border-[#111113] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadAdminRecords()}
                      disabled={loadingData}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-[#111113] transition-colors hover:border-[#111113] disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                </div>

                {dataError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 flex items-center justify-between gap-3">
                    <span>{dataError}</span>
                    <button
                      type="button"
                      onClick={() => void loadAdminRecords()}
                      className="font-semibold underline whitespace-nowrap shrink-0"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Loading Skeleton / Data List */}
                {loadingData && !hasLoadedOnce ? (
                  <div className="divide-y divide-stone-200/70 rounded-2xl border border-stone-200/90 bg-white">
                    {[0, 1, 2, 3].map((idx) => (
                      <div key={idx} className="flex items-center justify-between px-4 py-3.5 animate-pulse">
                        <div className="space-y-1.5">
                          <div className="h-3.5 w-44 rounded bg-stone-200" />
                          <div className="h-3 w-28 rounded bg-stone-100" />
                        </div>
                        <div className="h-3.5 w-20 rounded bg-stone-100" />
                      </div>
                    ))}
                  </div>
                ) : dataView === 'creators' ? (
                  filteredCreators.length === 0 ? (
                    <div className="rounded-2xl border border-stone-200/90 bg-[#FAF9F7] px-5 py-8 text-center">
                      <p className="text-sm font-semibold text-[#111113]">
                        {searchQuery ? 'No matching users found' : 'No registered users yet'}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {searchQuery
                          ? 'Try clearing your search filter or refreshing records.'
                          : 'Users appear here automatically once they create a Keepsake account.'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-stone-200/90 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-stone-200/80 bg-[#FAF9F7] text-[11px] font-semibold text-stone-600">
                          <tr>
                            <th className="px-4 py-2.5">User</th>
                            <th className="px-3 py-2.5 text-right">Sites</th>
                            <th className="px-3 py-2.5 text-right">Credits</th>
                            <th className="px-3 py-2.5">Plan Status</th>
                            <th className="px-3 py-2.5">UTR / Payment ID</th>
                            <th className="px-4 py-2.5 text-right">Updated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-200/70">
                          {filteredCreators.map((c) => (
                            <tr key={c.creatorId} className="hover:bg-[#FAF9F7]/70 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-[#111113] truncate max-w-[190px]">
                                  {c.displayName}
                                </div>
                                <div className="text-[11px] text-stone-500 truncate max-w-[190px]">
                                  {c.email || c.creatorId}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-[#111113]">
                                {c.publishedCount}
                              </td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums text-stone-700">
                                {c.hasUnlimitedPass ? '∞' : c.siteCredits}
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span
                                  className={
                                    c.hasUnlimitedPass
                                      ? 'font-semibold text-emerald-700'
                                      : 'text-stone-700'
                                  }
                                >
                                  {formatPlanLabel(c)}
                                </span>
                              </td>
                              <td className="px-3 py-3 font-mono text-[11px] text-stone-600 whitespace-nowrap">
                                {c.lastUtrRef || '—'}
                              </td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums text-[11px] text-stone-500 whitespace-nowrap">
                                {formatShortDate(c.updatedAtIso || c.createdAtIso)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : filteredGifts.length === 0 ? (
                  <div className="rounded-2xl border border-stone-200/90 bg-[#FAF9F7] px-5 py-8 text-center">
                    <p className="text-sm font-semibold text-[#111113]">
                      {searchQuery ? 'No matching websites found' : 'No published websites yet'}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {searchQuery
                        ? 'Try searching by recipient name, sender, or slug.'
                        : 'Every published surprise website appears here with a live link.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-200/70 rounded-2xl border border-stone-200/90 bg-white">
                    {filteredGifts.map((g) => (
                      <div
                        key={g.slug}
                        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between hover:bg-[#FAF9F7]/70 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs font-semibold text-[#111113]">
                            <span className="truncate">
                              For {g.recipientName} from {g.senderName}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                            <span className="font-mono text-stone-700">/?gift={g.slug}</span>
                            <span aria-hidden="true">·</span>
                            <span>{g.occasion}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatTierLabel(g.tier)}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {formatShortDate(g.createdAtIso)}
                            </span>
                          </div>
                        </div>
                        <a
                          href={`/?gift=${encodeURIComponent(g.slug)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 self-start rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#111113] transition-colors hover:border-[#111113] sm:self-auto whitespace-nowrap shrink-0"
                        >
                          Open Site
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
