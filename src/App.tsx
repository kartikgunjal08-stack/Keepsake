import {useEffect, useRef, useState} from 'react';
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  LogOut,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
} from 'lucide-react';
import {AuthDialogModal} from './components/AuthDialogModal';
import {GiftExperience} from './components/GiftExperience';
import {OwnerSetupModal} from './components/OwnerSetupModal';
import {StoryCardModal} from './components/StoryCardModal';
import {TotalSitesCorner} from './components/TotalSitesCorner';
import {UpiCheckoutModal} from './components/UpiCheckoutModal';
import {
  type AuthUser,
  fetchGiftBySlug,
  isFounderUser,
  loadOrCreateCreatorProfile,
  publishGiftToSupabase,
  purchaseSingleSiteCredit,
  purchaseUnlimitedPass,
  signOutCreator,
  subscribeToAuthState,
  verifyRazorpayPaymentLink,
} from './lib/keepsakeApi';
import {
  type GiftConfig,
  type GiftThemeId,
  OCCASION_PRESETS,
  type OccasionPresetId,
  type StoredGift,
  THEME_OPTIONS,
  WRITER_HELPERS,
} from './types/gift';
import {compressImageToDataUrl} from './utils/imageCompress';
import {
  clearPendingCheckoutDraft,
  type CreatorStatus,
  loadMerchantConfig,
  loadPendingCheckoutDraft,
  type MerchantConfig,
  PLAN_PRICES,
  saveMerchantConfig,
} from './utils/merchantConfig';
import {deriveUniqueCode} from './utils/storyCardExport';

type EditorTab = 'story' | 'polaroids' | 'cards' | 'quiz' | 'secret';

const FAQ_ITEMS: {question: string; answer: string}[] = [
  {
    question: 'Is it private?',
    answer:
      'Yes. Your surprise website is unlisted—only people who have your exact link or QR code can open it. Nobody can search or browse public gifts, and you can also lock the envelope with a secret passcode and hint.',
  },
  {
    question: 'How long do these sites last?',
    answer:
      'Published surprise pages stay live permanently with zero monthly renewal fees, so your partner or best friend can bookmark the link and revisit it years later.',
  },
  {
    question: 'Can I change my photos later?',
    answer:
      `Once published, a gift link is saved as a permanent snapshot so your recipient’s page never breaks. Test everything in the live preview before publishing—and if you ever want a fresh update later, you can publish a new version with a ₹${PLAN_PRICES.single} credit or your ₹${PLAN_PRICES.unlimited} Infinite Pass.`,
  },
  {
    question: 'What happens after my 1 free website?',
    answer:
      `Your first published surprise site is 100% free when you create a Keepsake account. Whenever you want to create another one later, pay just ₹${PLAN_PRICES.single} for a single website or ₹${PLAN_PRICES.unlimited} once to unlock infinite websites forever.`,
  },
  {
    question: 'Can I share it on Instagram Stories or with a physical gift?',
    answer:
      'Yes. Use the Story Studio to download a 1080×1920 image tailored for Instagram Stories and WhatsApp Status, or download a printable QR Gift Tag to stick inside a greeting card, bouquet, or gift box.',
  },
];

const THEME_SWATCH_BG: Record<GiftThemeId, string> = {
  'wax-letter': '#FAF7F2',
  'midnight-polaroid': '#121215',
  'blush-atelier': '#FDF4F5',
  'cobalt-zine': '#F8FAFC',
};

export default function App() {
  const [giftSlugParam, setGiftSlugParam] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('gift') || '';
  });

  const [loadedGift, setLoadedGift] = useState<StoredGift | null>(null);
  const [loadingGift, setLoadingGift] = useState(false);
  const [giftLoadError, setGiftLoadError] = useState('');

  // Keepsake Supabase Auth & Creator Quota
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [creatorStatus, setCreatorStatus] = useState<CreatorStatus | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Builder State (restores any pending draft saved right before Razorpay checkout redirect)
  const [gift, setGift] = useState<GiftConfig>(() => {
    const draft = loadPendingCheckoutDraft();
    return draft?.gift ? draft.gift : {...OCCASION_PRESETS.birthday};
  });
  const [activeTab, setActiveTab] = useState<EditorTab>('story');
  const [uploadError, setUploadError] = useState('');
  const [publishError, setPublishError] = useState('');
  const [isPublishingFree, setIsPublishingFree] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  // Razorpay Payment Link redirect callback state
  const [pendingRazorpayPayment, setPendingRazorpayPayment] = useState<{
    paymentId: string;
    plan: 'single9' | 'unlimited99';
    paymentLinkId?: string;
    referenceId?: string;
    linkStatus?: string;
    signature?: string;
  } | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get('razorpay_payment_id') || params.get('payment_id') || '';
    const paymentLinkId = params.get('razorpay_payment_link_id') || '';
    const referenceId = params.get('razorpay_payment_link_reference_id') || '';
    const linkStatus = params.get('razorpay_payment_link_status') || '';
    const signature = params.get('razorpay_signature') || '';
    const planParam = params.get('rzp_plan') || '';

    if (linkStatus && linkStatus !== 'paid') {
      return null;
    }

    if (paymentId || linkStatus === 'paid') {
      const draft = loadPendingCheckoutDraft();
      const plan: 'single9' | 'unlimited99' =
        planParam === 'unlimited'
          ? 'unlimited99'
          : planParam === 'single'
            ? 'single9'
            : draft?.plan || 'single9';
      return {
        paymentId: (paymentId || `rzp-${Date.now()}`).slice(0, 40),
        plan,
        ...(paymentLinkId ? {paymentLinkId} : {}),
        ...(referenceId ? {referenceId} : {}),
        ...(linkStatus ? {linkStatus} : {}),
        ...(signature ? {signature} : {}),
      };
    }

    return null;
  });

  // Modals & Owner Config
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPublishedSlug, setModalPublishedSlug] = useState('');
  const [modalInitialPlan, setModalInitialPlan] = useState<'single9' | 'unlimited99'>('single9');
  const [storyStudioOpen, setStoryStudioOpen] = useState(false);
  const [storyStudioSlug, setStoryStudioSlug] = useState<string | undefined>(undefined);
  const [ownerModalOpen, setOwnerModalOpen] = useState(false);
  const [merchantConfig, setMerchantConfig] = useState<MerchantConfig>(() => loadMerchantConfig());

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const builderRef = useRef<HTMLElement | null>(null);
  const processingRzpRef = useRef(false);

  // Clean Razorpay redirect query parameters from URL bar once captured
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const linkStatus = params.get('razorpay_payment_link_status');
    const rzpKeys = [
      'razorpay_payment_id',
      'razorpay_payment_link_id',
      'razorpay_payment_link_reference_id',
      'razorpay_payment_link_status',
      'razorpay_signature',
      'rzp_plan',
      'payment_id',
    ];
    const hasAnyRzpParam = rzpKeys.some((k) => params.has(k));
    if (!hasAnyRzpParam) return;

    if (linkStatus && linkStatus !== 'paid') {
      setPublishError('Razorpay payment was not completed. Please try again.');
      setModalOpen(true);
    }

    const url = new URL(window.location.href);
    rzpKeys.forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, '', url.toString());
  }, []);

  useEffect(() => {
    if (giftSlugParam) return;
    const unsub = subscribeToAuthState(
      async (user) => {
        setAuthUser(user);
        if (user) {
          try {
            const profile = await loadOrCreateCreatorProfile(user);
            setCreatorStatus(profile);
            setPublishError('');
          } catch (err) {
            console.error('Creator profile load failed:', err);
            setCreatorStatus(null);
            setPublishError(
              err instanceof Error
                ? err.message
                : 'Could not sync your Keepsake account with Supabase.',
            );
          }
        } else {
          setCreatorStatus(null);
        }
      },
      () => {
        setAuthReady(true);
      },
    );
    return () => unsub();
  }, [giftSlugParam]);

  // Auto-unlock paid plan & publish saved draft when returning from Razorpay Payment Link
  useEffect(() => {
    if (!pendingRazorpayPayment || !authReady || giftSlugParam) return;

    if (!authUser) {
      setModalPublishedSlug('');
      setModalOpen(true);
      return;
    }

    if (!creatorStatus || processingRzpRef.current) return;
    processingRzpRef.current = true;
    setIsPublishingFree(true);
    setPublishError('');

    (async () => {
      try {
        let updatedCreator: CreatorStatus;
        if (pendingRazorpayPayment.paymentLinkId && pendingRazorpayPayment.signature) {
          const verified = await verifyRazorpayPaymentLink(authUser, {
            plan: pendingRazorpayPayment.plan,
            razorpay_payment_id: pendingRazorpayPayment.paymentId,
            razorpay_payment_link_id: pendingRazorpayPayment.paymentLinkId,
            razorpay_payment_link_reference_id: pendingRazorpayPayment.referenceId || '',
            razorpay_payment_link_status: pendingRazorpayPayment.linkStatus || 'paid',
            razorpay_signature: pendingRazorpayPayment.signature,
          });
          updatedCreator = verified.creator;
        } else if (pendingRazorpayPayment.plan === 'single9') {
          updatedCreator = await purchaseSingleSiteCredit(
            authUser,
            pendingRazorpayPayment.paymentId,
            creatorStatus.siteCredits,
          );
        } else {
          updatedCreator = await purchaseUnlimitedPass(authUser, pendingRazorpayPayment.paymentId);
        }

        const pub = await publishGiftToSupabase(authUser, gift, updatedCreator, gift.customSlug);
        clearPendingCheckoutDraft();
        setPendingRazorpayPayment(null);
        setCreatorStatus(pub.creator);
        setModalPublishedSlug(pub.slug);
        setModalOpen(true);
      } catch (err) {
        setPublishError(
          err instanceof Error
            ? err.message
            : 'Razorpay payment detected, but unlocking failed. Enter Payment ID manually to retry.',
        );
        setModalOpen(true);
        processingRzpRef.current = false;
      } finally {
        setIsPublishingFree(false);
      }
    })();
  }, [pendingRazorpayPayment, authReady, authUser, creatorStatus, gift, giftSlugParam]);

  useEffect(() => {
    if (!giftSlugParam) return;
    let active = true;
    setLoadingGift(true);
    setGiftLoadError('');

    fetchGiftBySlug(giftSlugParam)
      .then((found) => {
        if (!active) return;
        if (!found) {
          setGiftLoadError('This surprise link does not exist or has expired.');
          return;
        }
        setLoadedGift(found);
      })
      .catch((err) => {
        if (active) {
          setGiftLoadError(err instanceof Error ? err.message : 'Unable to load surprise.');
        }
      })
      .finally(() => {
        if (active) setLoadingGift(false);
      });

    return () => {
      active = false;
    };
  }, [giftSlugParam]);

  const handleExitStandalone = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('gift');
    window.history.replaceState({}, '', url.toString());
    setGiftSlugParam('');
    setLoadedGift(null);
    setGiftLoadError('');
  };

  if (giftSlugParam) {
    if (loadingGift) {
      return (
        <div className="min-h-screen bg-[#111113] text-stone-200 flex items-center justify-center p-6">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening your private surprise...
          </div>
        </div>
      );
    }

    if (giftLoadError || !loadedGift) {
      return (
        <div className="min-h-screen bg-[#F7F5F2] text-[#111113] flex items-center justify-center p-6">
          <div className="max-w-md rounded-[24px] border border-stone-900/10 bg-white p-8 text-center space-y-4">
            <h1 className="font-display text-2xl font-bold">Surprise Not Found</h1>
            <p className="text-sm text-stone-600">
              {giftLoadError || 'Check the link with the person who sent it to you.'}
            </p>
            <button
              type="button"
              onClick={handleExitStandalone}
              className="rounded-xl bg-rose-700 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-800 whitespace-nowrap"
            >
              Create Your Own Free Website
            </button>
          </div>
        </div>
      );
    }

    return (
      <GiftExperience
        gift={loadedGift}
        publishedSlug={loadedGift.slug}
        isStandaloneView
        onCreateOwn={handleExitStandalone}
      />
    );
  }

  const isFounder = isFounderUser(authUser);
  const publishedSlugs = creatorStatus?.publishedSlugs ?? [];
  const hasUnlimitedPass = Boolean(creatorStatus?.hasUnlimitedPass);
  const siteCredits = creatorStatus?.siteCredits ?? 1;
  const publishedCount = creatorStatus?.publishedCount ?? 0;

  const canPublishFree = !authUser || (!hasUnlimitedPass && publishedCount === 0 && siteCredits >= 1);
  const hasPaidSingleCredit = Boolean(authUser && !hasUnlimitedPass && publishedCount >= 1 && siteCredits >= 1);
  const needsUpgrade = Boolean(authUser && !hasUnlimitedPass && siteCredits === 0);

  const handleOpenSignInModal = () => {
    setPublishError('');
    setAuthModalOpen(true);
  };

  const handlePublishAction = async () => {
    setPublishError('');

    if (!authUser) {
      setModalPublishedSlug('');
      setModalOpen(true);
      return;
    }

    let activeCreator = creatorStatus;
    if (!activeCreator) {
      setIsPublishingFree(true);
      try {
        activeCreator = await loadOrCreateCreatorProfile(authUser);
        setCreatorStatus(activeCreator);
      } catch (err) {
        setPublishError(
          err instanceof Error
            ? err.message
            : 'Could not connect to Supabase. Please check your Supabase configuration.',
        );
        setIsPublishingFree(false);
        return;
      }
      setIsPublishingFree(false);
    }

    const activeNeedsUpgrade =
      !activeCreator.hasUnlimitedPass && activeCreator.siteCredits === 0;
    if (activeNeedsUpgrade) {
      setModalPublishedSlug('');
      setModalOpen(true);
      return;
    }

    setIsPublishingFree(true);
    try {
      const pub = await publishGiftToSupabase(authUser, gift, activeCreator, gift.customSlug);
      setCreatorStatus(pub.creator);
      setModalPublishedSlug(pub.slug);
      setModalOpen(true);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publishing failed.');
    } finally {
      setIsPublishingFree(false);
    }
  };

  if (fullscreenPreview) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-stone-800 bg-[#111113] px-5 py-3 text-white">
          <span className="text-xs font-medium text-stone-300">
            Fullscreen Receiver Preview · {gift.recipientName}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isPublishingFree}
              onClick={() => {
                setFullscreenPreview(false);
                handlePublishAction();
              }}
              className="rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700 whitespace-nowrap shrink-0"
            >
              {canPublishFree
                ? 'Publish 1st Site Free'
                : needsUpgrade
                  ? `Unlock Site (₹${PLAN_PRICES.single} / ₹${PLAN_PRICES.unlimited})`
                  : 'Publish Website'}
            </button>
            <button
              type="button"
              onClick={() => setFullscreenPreview(false)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-700 px-3.5 py-2 text-xs font-semibold text-stone-200 transition-colors hover:bg-stone-800 whitespace-nowrap shrink-0"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Back to Studio
            </button>
          </div>
        </div>
        <GiftExperience
          gift={gift}
          publishedSlug={modalPublishedSlug || publishedSlugs[publishedSlugs.length - 1]}
          isStandaloneView
        />
      </div>
    );
  }

  const handleSelectOccasion = (id: OccasionPresetId) => {
    setGift({...OCCASION_PRESETS[id]});
    setUploadError('');
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadError('');
    setIsUploadingPhoto(true);

    try {
      const compressedList = await Promise.all(
        files.slice(0, 8 - gift.memories.length).map(async (file, idx) => {
          const dataUrl = await compressImageToDataUrl(file);
          return {
            id: `mem-${Date.now()}-${idx}`,
            imageUrl: dataUrl,
            caption: 'One of my favorite moments with you.',
            dateLabel: '2026',
          };
        }),
      );
      setGift((prev) => ({
        ...prev,
        memories: [...prev.memories, ...compressedList].slice(0, 8),
      }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to process photo.');
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSaveMerchant = (next: MerchantConfig) => {
    saveMerchantConfig(next);
    setMerchantConfig(next);
  };

  const scrollToBuilder = () => {
    builderRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
  };

  const latestPublishedSlug = modalPublishedSlug || publishedSlugs[publishedSlugs.length - 1];
  const currentUniqueCode = deriveUniqueCode(gift, latestPublishedSlug);

  const primaryPublishLabel = isPublishingFree
    ? 'Publishing...'
    : !authUser
      ? 'Publish 1st Website Free'
      : canPublishFree
        ? 'Publish 1st Website Free'
        : hasPaidSingleCredit
          ? `Publish Website (${siteCredits} credit left)`
          : needsUpgrade
            ? `Publish · ₹${PLAN_PRICES.single} or ₹${PLAN_PRICES.unlimited} Infinite`
            : 'Publish New Website';

  const inputBase =
    'mt-1.5 w-full rounded-xl border border-stone-200/90 bg-[#FAF9F7] px-3.5 py-2.5 text-sm text-[#111113] transition-colors focus:border-[#111113] focus:bg-white focus:outline-none';

  return (
    <div className="min-h-screen bg-[#F7F5F2] text-[#111113] flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-stone-900/[0.07] bg-[#F7F5F2]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-3.5">
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-[#111113] whitespace-nowrap shrink-0"
          >
            Keepsake
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600">
            <a
              href="#builder"
              className="hover:text-[#111113] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Studio
            </a>
            <a
              href="#inside"
              className="hover:text-[#111113] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Inside
            </a>
            <a
              href="#pricing"
              className="hover:text-[#111113] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="hover:text-[#111113] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              FAQ
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              disabled={isPublishingFree}
              onClick={handlePublishAction}
              className="rounded-full bg-[#111113] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 whitespace-nowrap shrink-0"
            >
              {canPublishFree
                ? 'Publish 1st Free'
                : needsUpgrade
                  ? `₹${PLAN_PRICES.single} / ₹${PLAN_PRICES.unlimited} Unlock`
                  : 'Publish Website'}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero + All-In-One Studio Workspace */}
        <section ref={builderRef} id="builder" className="mx-auto max-w-6xl px-6 pt-8 pb-14 md:pt-10">
          <div className="grid gap-6 pb-8 lg:grid-cols-[1.22fr_0.78fr] lg:items-end">
            <div className="space-y-3">
              <p className="text-xs font-medium tracking-wide text-stone-500">
                1st website ₹0 · Extra site ₹{PLAN_PRICES.single} · Infinite forever ₹{PLAN_PRICES.unlimited}
              </p>
              <h1 className="text-[clamp(2.2rem,4.1vw,3.55rem)] font-bold leading-[1.06] tracking-[-0.025em] text-[#111113]">
                Turn camera-roll memories into a{' '}
                <em className="font-display italic font-semibold text-rose-700">private mini-website</em>.
              </h1>
              <p className="max-w-xl text-sm sm:text-base leading-relaxed text-stone-600">
                Build an interactive surprise in 3 minutes—wax seal, PIN lock, live timer, Polaroids, quiz &amp; scratch card. Ready in one link or IG Story.
              </p>
            </div>

            {/* Compact Creator Account & Quota Card */}
            <div className="rounded-2xl bg-[#ECE8DF] p-4 text-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  {!authReady ? (
                    <span className="text-stone-500">Checking Keepsake account...</span>
                  ) : !authUser ? (
                    <>
                      <p className="font-bold text-[#111113] truncate">
                        Guest Studio · 1 Free Site Ready
                      </p>
                      <p className="text-[11px] text-stone-600 truncate">
                        Sign in or create a free Keepsake account to save your link
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-[#111113] truncate">
                        {creatorStatus?.displayName || authUser.email}
                      </p>
                      <p className="text-[11px] text-stone-600 truncate">
                        {hasUnlimitedPass
                          ? `₹${PLAN_PRICES.unlimited} Infinite Pass Active`
                          : canPublishFree
                            ? '1 Free Website Available'
                            : hasPaidSingleCredit
                              ? `${siteCredits} Extra Credit Ready`
                              : `Free Limit Used · ₹${PLAN_PRICES.single}/site or ₹${PLAN_PRICES.unlimited} Infinite`}
                      </p>
                    </>
                  )}
                </div>

                {authReady && !authUser && (
                  <button
                    type="button"
                    onClick={handleOpenSignInModal}
                    className="rounded-xl bg-[#111113] px-3.5 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-rose-700 whitespace-nowrap shrink-0"
                  >
                    Sign in to Keepsake
                  </button>
                )}

                {authUser && (
                  <button
                    type="button"
                    onClick={() => signOutCreator()}
                    className="inline-flex items-center gap-1 rounded-xl bg-white/80 px-3 py-2 text-[11px] font-semibold text-stone-700 hover:bg-white hover:text-[#111113] whitespace-nowrap shrink-0"
                  >
                    <LogOut className="h-3 w-3" />
                    Sign out
                  </button>
                )}
              </div>

              {(publishedSlugs.length > 0 || needsUpgrade) && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-900/[0.08] pt-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {publishedSlugs.slice(-2).map((slug) => (
                      <a
                        key={slug}
                        href={`/?gift=${encodeURIComponent(slug)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-rose-700 hover:underline whitespace-nowrap"
                      >
                        /?gift={slug}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                  {needsUpgrade && (
                    <button
                      type="button"
                      onClick={() => {
                        setModalPublishedSlug('');
                        setModalOpen(true);
                      }}
                      className="font-semibold text-rose-700 underline underline-offset-4 hover:text-rose-800 whitespace-nowrap"
                    >
                      Unlock ₹{PLAN_PRICES.single} / ₹{PLAN_PRICES.unlimited}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.15fr_390px] lg:items-start">
            {/* Left Column: Studio Builder Controls */}
            <div className="rounded-[28px] border border-stone-900/[0.08] bg-white p-6 sm:p-8 shadow-[0_14px_45px_-22px_rgba(17,17,19,0.09)] space-y-6">
              {/* 01. Occasion Presets */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold tracking-tight text-[#111113]">
                    01. Pick Occasion Preset
                  </span>
                  <span className="text-[11px] text-stone-500">Auto-fills story &amp; cards</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      ['birthday', 'Birthday'],
                      ['anniversary', 'Anniversary'],
                      ['bestie', 'Bestie Roast'],
                      ['apology', "I'm Sorry"],
                    ] as [OccasionPresetId, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectOccasion(id)}
                      className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all whitespace-nowrap ${
                        gift.occasion === id
                          ? 'bg-[#111113] text-white shadow-xs'
                          : 'bg-[#F4F1EC] text-stone-700 hover:bg-[#EAE5DC] hover:text-[#111113]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 02. Visual Theme Swatch Cards */}
              <div className="space-y-3 border-t border-stone-900/[0.07] pt-6">
                <span className="block text-xs font-bold tracking-tight text-[#111113]">
                  02. Visual Theme
                </span>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {(Object.keys(THEME_OPTIONS) as GiftThemeId[]).map((themeId) => {
                    const t = THEME_OPTIONS[themeId];
                    const active = gift.theme === themeId;
                    const isDarkSwatch = themeId === 'midnight-polaroid';
                    return (
                      <button
                        key={themeId}
                        type="button"
                        onClick={() => setGift((prev) => ({...prev, theme: themeId}))}
                        className={`group rounded-2xl border p-3 text-left transition-all ${
                          active
                            ? 'border-[#111113] bg-[#FAF9F7] ring-1 ring-[#111113]'
                            : 'border-stone-200/80 bg-white hover:border-stone-400'
                        }`}
                      >
                        <div
                          className="mb-2.5 flex h-9 items-center justify-between rounded-xl px-2.5 border border-black/[0.06]"
                          style={{backgroundColor: THEME_SWATCH_BG[themeId]}}
                        >
                          <span
                            className={`font-display text-sm font-bold ${
                              isDarkSwatch ? 'text-stone-100' : 'text-[#111113]'
                            }`}
                          >
                            Aa
                          </span>
                          <span
                            className="h-2.5 w-6 rounded-full"
                            style={{backgroundColor: t.accentHex}}
                          />
                        </div>
                        <span className="block text-xs font-bold text-[#111113] truncate">
                          {t.name}
                        </span>
                        <p className="mt-0.5 text-[11px] text-stone-500 line-clamp-1">{t.tagline}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Segmented Editor Tabs */}
              <div className="border-t border-stone-900/[0.07] pt-6 space-y-5">
                <div className="grid grid-cols-5 gap-1 rounded-2xl bg-[#F2EFE9] p-1.5">
                  {(
                    [
                      ['story', 'Story'],
                      ['polaroids', `Photos (${gift.memories.length})`],
                      ['cards', 'Cards'],
                      ['quiz', 'Song & Quiz'],
                      ['secret', 'Scratch & PIN'],
                    ] as [EditorTab, string][]
                  ).map(([tabId, label]) => (
                    <button
                      key={tabId}
                      type="button"
                      onClick={() => setActiveTab(tabId)}
                      className={`rounded-xl px-2 py-2 text-[11px] font-semibold transition-all truncate ${
                        activeTab === tabId
                          ? 'bg-white text-[#111113] shadow-xs'
                          : 'text-stone-600 hover:text-[#111113]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Tab 1: Story & Milestone Timer */}
                {activeTab === 'story' && (
                  <div className="space-y-4">
                    <div className="grid gap-3.5 sm:grid-cols-3">
                      <div>
                        <label htmlFor="recipient-name" className="block text-xs font-semibold text-stone-700">
                          For (Name)
                        </label>
                        <input
                          id="recipient-name"
                          type="text"
                          value={gift.recipientName}
                          onChange={(e) => setGift({...gift, recipientName: e.target.value})}
                          className={inputBase}
                        />
                      </div>
                      <div>
                        <label htmlFor="sender-name" className="block text-xs font-semibold text-stone-700">
                          From (Your Name)
                        </label>
                        <input
                          id="sender-name"
                          type="text"
                          value={gift.senderName}
                          onChange={(e) => setGift({...gift, senderName: e.target.value})}
                          className={inputBase}
                        />
                      </div>
                      <div>
                        <label htmlFor="special-date" className="block text-xs font-semibold text-stone-700">
                          Occasion Tag
                        </label>
                        <input
                          id="special-date"
                          type="text"
                          value={gift.specialDate}
                          onChange={(e) => setGift({...gift, specialDate: e.target.value})}
                          placeholder="20 Nov / 2 Years"
                          className={inputBase}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="gift-headline" className="block text-xs font-semibold text-stone-700">
                        Main Headline
                      </label>
                      <input
                        id="gift-headline"
                        type="text"
                        value={gift.headline}
                        onChange={(e) => setGift({...gift, headline: e.target.value})}
                        className={inputBase}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <label htmlFor="opening-letter" className="block text-xs font-semibold text-stone-700">
                          Opening Letter
                        </label>
                        <span className="text-[11px] text-stone-500">Tap a starter line if stuck</span>
                      </div>
                      <textarea
                        id="opening-letter"
                        rows={3}
                        value={gift.openingLetter}
                        onChange={(e) => setGift({...gift, openingLetter: e.target.value})}
                        className="w-full rounded-xl border border-stone-200/90 bg-[#FAF9F7] p-3.5 text-sm leading-relaxed text-[#111113] transition-colors focus:border-[#111113] focus:bg-white focus:outline-none"
                      />
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {WRITER_HELPERS[gift.occasion].map((line, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setGift({...gift, openingLetter: line})}
                            className="rounded-lg bg-[#F4F1EC] px-2.5 py-1.5 text-[11px] font-medium text-stone-700 transition-colors hover:bg-[#111113] hover:text-white whitespace-nowrap"
                          >
                            Starter #{i + 1}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3.5 rounded-2xl bg-[#F4F1EC] p-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="milestone-date" className="block text-[11px] font-semibold text-stone-700">
                          Live Ticking Timer Start Date
                        </label>
                        <input
                          id="milestone-date"
                          type="date"
                          value={gift.milestoneDateIso}
                          onChange={(e) => setGift({...gift, milestoneDateIso: e.target.value})}
                          className="mt-1.5 w-full rounded-xl bg-white px-3 py-2 font-mono text-xs text-[#111113] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="milestone-label" className="block text-[11px] font-semibold text-stone-700">
                          Timer Title
                        </label>
                        <input
                          id="milestone-label"
                          type="text"
                          value={gift.milestoneLabel}
                          onChange={(e) => setGift({...gift, milestoneLabel: e.target.value})}
                          placeholder="Time since day one"
                          className="mt-1.5 w-full rounded-xl bg-white px-3 py-2 text-xs text-[#111113] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Polaroids */}
                {activeTab === 'polaroids' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-stone-600">
                        Upload up to 8 photos (compressed automatically for fast loading)
                      </p>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={isUploadingPhoto || gift.memories.length >= 8}
                        onClick={() => photoInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#111113] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        {isUploadingPhoto ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ImagePlus className="h-3.5 w-3.5" />
                        )}
                        {isUploadingPhoto ? 'Optimizing...' : 'Upload Phone Photos'}
                      </button>
                    </div>

                    {uploadError && <p className="text-xs font-medium text-red-600">{uploadError}</p>}

                    <div className="divide-y divide-stone-900/[0.07]">
                      {gift.memories.map((mem, idx) => (
                        <div key={mem.id} className="py-3.5 first:pt-1 last:pb-0 flex gap-3 items-start">
                          <img
                            src={mem.imageUrl}
                            alt={mem.caption}
                            className="h-16 w-20 rounded-xl border border-stone-900/10 object-cover shrink-0 bg-stone-100"
                          />
                          <div className="flex-1 grid gap-2 sm:grid-cols-[110px_1fr]">
                            <input
                              type="text"
                              value={mem.dateLabel}
                              onChange={(e) => {
                                const next = [...gift.memories];
                                next[idx] = {...mem, dateLabel: e.target.value};
                                setGift({...gift, memories: next});
                              }}
                              placeholder="Month / Yr"
                              className="rounded-xl border border-stone-200/90 bg-[#FAF9F7] px-3 py-2 font-mono text-xs focus:border-[#111113] focus:bg-white focus:outline-none"
                            />
                            <input
                              type="text"
                              value={mem.caption}
                              onChange={(e) => {
                                const next = [...gift.memories];
                                next[idx] = {...mem, caption: e.target.value};
                                setGift({...gift, memories: next});
                              }}
                              placeholder="Caption for this memory..."
                              className="rounded-xl border border-stone-200/90 bg-[#FAF9F7] px-3 py-2 text-xs focus:border-[#111113] focus:bg-white focus:outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setGift((prev) => ({
                                ...prev,
                                memories: prev.memories.filter((m) => m.id !== mem.id),
                              }))
                            }
                            className="p-2 text-stone-400 transition-colors hover:text-red-600"
                            aria-label="Remove photo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tab 3: Appreciation Flip Cards & Open When Envelopes */}
                {activeTab === 'cards' && (
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#111113]">
                          Tap-to-Flip Appreciation Cards ({gift.reasons.length}/5)
                        </span>
                        {gift.reasons.length < 5 && (
                          <button
                            type="button"
                            onClick={() =>
                              setGift((prev) => ({
                                ...prev,
                                reasons: [...prev.reasons, 'You make every ordinary day feel worth remembering.'],
                              }))
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Card
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {gift.reasons.map((r, idx) => (
                          <div key={idx} className="flex items-center gap-2.5">
                            <span className="font-mono text-xs text-stone-400 w-5 shrink-0 tabular-nums">
                              0{idx + 1}
                            </span>
                            <input
                              type="text"
                              value={r}
                              onChange={(e) => {
                                const next = [...gift.reasons];
                                next[idx] = e.target.value;
                                setGift({...gift, reasons: next});
                              }}
                              className="flex-1 rounded-xl border border-stone-200/90 bg-[#FAF9F7] px-3 py-2 text-xs focus:border-[#111113] focus:bg-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setGift((prev) => ({
                                  ...prev,
                                  reasons: prev.reasons.filter((_, i) => i !== idx),
                                }))
                              }
                              className="p-1.5 text-stone-400 transition-colors hover:text-red-600"
                              aria-label="Remove reason"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-stone-900/[0.07] pt-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#111113]">
                          &ldquo;Open When...&rdquo; Mood Envelopes ({gift.openWhenNotes.length}/4)
                        </span>
                        {gift.openWhenNotes.length < 4 && (
                          <button
                            type="button"
                            onClick={() =>
                              setGift((prev) => ({
                                ...prev,
                                openWhenNotes: [
                                  ...prev.openWhenNotes,
                                  {
                                    id: `ow-${Date.now()}`,
                                    label: 'Open when you cannot sleep',
                                    message: 'Put down the phone, take 3 deep breaths, and text me if you want company.',
                                  },
                                ],
                              }))
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Envelope
                          </button>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        {gift.openWhenNotes.map((note, idx) => (
                          <div key={note.id} className="rounded-2xl bg-[#F4F1EC] p-3.5 space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={note.label}
                                onChange={(e) => {
                                  const next = [...gift.openWhenNotes];
                                  next[idx] = {...note, label: e.target.value};
                                  setGift({...gift, openWhenNotes: next});
                                }}
                                placeholder="Open when..."
                                className="flex-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#111113] focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setGift((prev) => ({
                                    ...prev,
                                    openWhenNotes: prev.openWhenNotes.filter((n) => n.id !== note.id),
                                  }))
                                }
                                className="p-1.5 text-stone-400 hover:text-red-600"
                                aria-label="Remove envelope"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <textarea
                              rows={2}
                              value={note.message}
                              onChange={(e) => {
                                const next = [...gift.openWhenNotes];
                                next[idx] = {...note, message: e.target.value};
                                setGift({...gift, openWhenNotes: next});
                              }}
                              className="w-full rounded-xl bg-white p-2.5 text-xs text-[#111113] focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 4: Song & Quiz */}
                {activeTab === 'quiz' && (
                  <div className="space-y-5">
                    <div className="grid gap-3.5 sm:grid-cols-3">
                      <div>
                        <label htmlFor="song-title" className="block text-xs font-semibold text-stone-700">
                          Dedication Song
                        </label>
                        <input
                          id="song-title"
                          type="text"
                          value={gift.songTitle}
                          onChange={(e) => setGift({...gift, songTitle: e.target.value})}
                          placeholder="Qaafirana"
                          className={inputBase}
                        />
                      </div>
                      <div>
                        <label htmlFor="song-artist" className="block text-xs font-semibold text-stone-700">
                          Artist
                        </label>
                        <input
                          id="song-artist"
                          type="text"
                          value={gift.songArtist}
                          onChange={(e) => setGift({...gift, songArtist: e.target.value})}
                          placeholder="Arijit Singh"
                          className={inputBase}
                        />
                      </div>
                      <div>
                        <label htmlFor="song-url" className="block text-xs font-semibold text-stone-700">
                          Spotify / YT Link
                        </label>
                        <input
                          id="song-url"
                          type="url"
                          value={gift.songUrl}
                          onChange={(e) => setGift({...gift, songUrl: e.target.value})}
                          placeholder="https://open.spotify.com/..."
                          className={inputBase}
                        />
                      </div>
                    </div>

                    <div className="border-t border-stone-900/[0.07] pt-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="inline-flex items-center gap-2 text-xs font-bold text-[#111113] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={gift.enableQuiz}
                            onChange={(e) => setGift({...gift, enableQuiz: e.target.checked})}
                            className="h-4 w-4 accent-rose-700 rounded"
                          />
                          Include &ldquo;How Well Do You Know Us?&rdquo; Quiz
                        </label>

                        {gift.enableQuiz && gift.quiz.length < 3 && (
                          <button
                            type="button"
                            onClick={() =>
                              setGift((prev) => ({
                                ...prev,
                                quiz: [
                                  ...prev.quiz,
                                  {
                                    id: `q-${Date.now()}`,
                                    prompt: 'What is our favorite food together?',
                                    options: ['Momos & Chai', 'Pizza', 'Biryani'],
                                    correctIndex: 0,
                                    reactionNote: 'Easy win.',
                                  },
                                ],
                              }))
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Question
                          </button>
                        )}
                      </div>

                      {gift.enableQuiz &&
                        gift.quiz.map((q, qIdx) => (
                          <div
                            key={q.id}
                            className="rounded-2xl bg-[#F4F1EC] p-4 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] font-semibold text-stone-500">
                                Question {qIdx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setGift((prev) => ({
                                    ...prev,
                                    quiz: prev.quiz.filter((item) => item.id !== q.id),
                                  }))
                                }
                                className="text-xs text-stone-500 hover:text-red-600"
                              >
                                Remove
                              </button>
                            </div>
                            <input
                              type="text"
                              value={q.prompt}
                              onChange={(e) => {
                                const next = [...gift.quiz];
                                next[qIdx] = {...q, prompt: e.target.value};
                                setGift({...gift, quiz: next});
                              }}
                              className="w-full rounded-xl bg-white px-3 py-2 text-xs text-[#111113] focus:outline-none"
                            />
                            <div className="grid gap-2 sm:grid-cols-3">
                              {q.options.map((opt, optIdx) => (
                                <div key={optIdx} className="flex items-center gap-1.5">
                                  <input
                                    type="radio"
                                    name={`correct-${q.id}`}
                                    checked={q.correctIndex === optIdx}
                                    onChange={() => {
                                      const next = [...gift.quiz];
                                      next[qIdx] = {...q, correctIndex: optIdx};
                                      setGift({...gift, quiz: next});
                                    }}
                                    aria-label={`Mark option ${optIdx + 1} correct`}
                                  />
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => {
                                      const nextOpts = [...q.options] as [string, string, string];
                                      nextOpts[optIdx] = e.target.value;
                                      const next = [...gift.quiz];
                                      next[qIdx] = {...q, options: nextOpts};
                                      setGift({...gift, quiz: next});
                                    }}
                                    className="w-full rounded-xl bg-white px-2.5 py-1.5 text-xs text-[#111113] focus:outline-none"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Tab 5: Secret Scratch & Passcode */}
                {activeTab === 'secret' && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="scratch-label" className="block text-xs font-semibold text-stone-700">
                        Scratch-Off Card Title
                      </label>
                      <input
                        id="scratch-label"
                        type="text"
                        value={gift.scratchLabel}
                        onChange={(e) => setGift({...gift, scratchLabel: e.target.value})}
                        className={inputBase}
                      />
                    </div>

                    <div>
                      <label htmlFor="scratch-secret" className="block text-xs font-semibold text-stone-700">
                        Hidden Reveal Message (Shown after rubbing foil)
                      </label>
                      <textarea
                        id="scratch-secret"
                        rows={3}
                        value={gift.scratchSecret}
                        onChange={(e) => setGift({...gift, scratchSecret: e.target.value})}
                        className="mt-1.5 w-full rounded-xl border border-stone-200/90 bg-[#FAF9F7] p-3.5 text-sm text-[#111113] transition-colors focus:border-[#111113] focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div className="rounded-2xl bg-[#F4F1EC] p-4 space-y-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 text-xs font-bold text-[#111113] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={gift.passcodeEnabled}
                            onChange={(e) => setGift({...gift, passcodeEnabled: e.target.checked})}
                            className="h-4 w-4 accent-rose-700 rounded"
                          />
                          Lock Envelope with Secret Passcode
                        </label>
                        <span className="font-mono text-[11px] font-medium text-stone-500">
                          Included Free &amp; Unlimited
                        </span>
                      </div>

                      {gift.passcodeEnabled && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label htmlFor="pin-code" className="block text-[11px] font-semibold text-stone-700">
                              4-Digit Code
                            </label>
                            <input
                              id="pin-code"
                              type="text"
                              maxLength={8}
                              value={gift.passcode}
                              onChange={(e) => setGift({...gift, passcode: e.target.value})}
                              className="mt-1.5 w-full rounded-xl bg-white px-3 py-2 font-mono text-xs text-[#111113] focus:outline-none"
                            />
                          </div>
                          <div>
                            <label htmlFor="pin-hint" className="block text-[11px] font-semibold text-stone-700">
                              Hint Shown to Recipient
                            </label>
                            <input
                              id="pin-hint"
                              type="text"
                              value={gift.passcodeHint}
                              onChange={(e) => setGift({...gift, passcodeHint: e.target.value})}
                              className="mt-1.5 w-full rounded-xl bg-white px-3 py-2 text-xs text-[#111113] focus:outline-none"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label htmlFor="custom-slug" className="block text-[11px] font-semibold text-stone-700">
                          Custom Link Ending
                        </label>
                        <input
                          id="custom-slug"
                          type="text"
                          value={gift.customSlug}
                          onChange={(e) => setGift({...gift, customSlug: e.target.value})}
                          placeholder="happy-22-riya"
                          className="mt-1.5 w-full rounded-xl bg-white px-3 py-2 font-mono text-xs text-[#111113] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {publishError && <p className="text-xs font-medium text-red-600">{publishError}</p>}

              {/* Publish Bar */}
              <div className="flex flex-col gap-3 border-t border-stone-900/[0.07] pt-6 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  disabled={isPublishingFree}
                  onClick={handlePublishAction}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-rose-800 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {primaryPublishLabel}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <span className="text-xs text-stone-500">
                  {!authUser
                    ? 'Create a free Keepsake account when ready to publish (1st site free)'
                    : canPublishFree
                      ? 'Your 1st website is completely free'
                      : hasPaidSingleCredit
                        ? `You have ${siteCredits} site credit ready`
                        : needsUpgrade
                          ? `₹${PLAN_PRICES.single} for 1 site · ₹${PLAN_PRICES.unlimited} once for infinite sites`
                          : `₹${PLAN_PRICES.unlimited} Infinite Pass active`}
                </span>
              </div>
            </div>

            {/* Right Column: Live Interactive 2026 iPhone Stage */}
            <div className="lg:sticky lg:top-20 space-y-3.5">
              <div className="rounded-[36px] bg-[#ECE8DF] p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-xs font-bold text-[#111113]">
                    Live Receiver Preview
                  </span>
                  <div className="flex items-center gap-3.5">
                    <button
                      type="button"
                      onClick={() => {
                        setStoryStudioSlug(latestPublishedSlug);
                        setStoryStudioOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 hover:text-rose-700 whitespace-nowrap shrink-0"
                    >
                      <ImageIcon className="h-3.5 w-3.5 text-rose-700" />
                      Story Card
                    </button>
                    <button
                      type="button"
                      onClick={() => setFullscreenPreview(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap shrink-0"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      Fullscreen
                    </button>
                  </div>
                </div>

                <div className="relative mx-auto w-full max-w-[356px] overflow-hidden rounded-[42px] border-[7px] border-[#111113] bg-[#111113] shadow-[0_28px_60px_-16px_rgba(17,17,19,0.28)]">
                  <div className="pointer-events-none absolute top-2.5 left-1/2 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-[#111113]/95" />
                  <div className="h-[600px] overflow-y-auto rounded-[35px] bg-white pt-4 studio-scroll">
                    <GiftExperience gift={gift} publishedSlug={latestPublishedSlug} />
                  </div>
                </div>
              </div>

              {/* Obsidian Story Card & QR Studio Dock */}
              <div className="flex w-full items-center justify-between gap-3 rounded-2xl bg-[#111113] px-4 py-3.5 text-white">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    IG Story Card · <span className="font-mono text-rose-400">{currentUniqueCode}</span>
                  </p>
                  <p className="text-[11px] text-stone-400 truncate">
                    1080×1920 Story PNG + QR Gift Tag
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStoryStudioSlug(latestPublishedSlug);
                    setStoryStudioOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-[#111113] transition-colors hover:bg-rose-50 whitespace-nowrap shrink-0"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-rose-700" />
                  Story Studio
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Asymmetric Bento: What's Inside Every Keepsake */}
        <section id="inside" className="border-t border-stone-900/[0.07] bg-white py-14">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[#111113] md:text-4xl">
                Seven interactive moments—built to get screenshotted.
              </h2>
              <p className="text-sm leading-relaxed text-stone-600">
                Not a boring greeting card template. Every Keepsake website unfolds step by step on your friend&apos;s or partner&apos;s phone.
              </p>
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {/* Wide Obsidian Bento Tile */}
              <div className="lg:col-span-2 flex flex-col justify-between rounded-[28px] bg-[#111113] p-7 text-white">
                <div className="space-y-4">
                  <p className="text-xs font-medium text-stone-400">
                    Included on every theme · Free &amp; Paid
                  </p>
                  <h3 className="font-display text-2xl font-bold leading-snug text-white">
                    Wax seal lock, live milestone timer, vinyl song &amp; foil scratch reveal.
                  </h3>
                  <div className="grid gap-3 pt-2 sm:grid-cols-2 text-xs text-stone-300">
                    <div className="border-t border-white/10 pt-3">
                      <span className="font-semibold text-white">01. Sealed Envelope + PIN</span>
                      <p className="mt-1 text-stone-400">
                        Lock the site behind a secret date or inside joke with a custom hint.
                      </p>
                    </div>
                    <div className="border-t border-white/10 pt-3">
                      <span className="font-semibold text-white">02. Polaroids &amp; Open-When Notes</span>
                      <p className="mt-1 text-stone-400">
                        Swipeable photo stack, flip cards, and mood envelopes they can save for later.
                      </p>
                    </div>
                    <div className="border-t border-white/10 pt-3">
                      <span className="font-semibold text-white">03. Live Ticking Counter &amp; Song</span>
                      <p className="mt-1 text-stone-400">
                        Counts every second since day one alongside a spinning vinyl dedication.
                      </p>
                    </div>
                    <div className="border-t border-white/10 pt-3">
                      <span className="font-semibold text-white">04. Foil Scratch Card &amp; Quiz</span>
                      <p className="mt-1 text-stone-400">
                        They physically rub off metallic foil with their thumb to reveal your real gift.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-white/10 pt-5">
                  <span className="mr-2 text-xs text-stone-400">Load preset in studio:</span>
                  {(
                    [
                      ['birthday', 'Birthday'],
                      ['anniversary', 'Anniversary'],
                      ['bestie', 'Bestie Roast'],
                      ['apology', "I'm Sorry"],
                    ] as [OccasionPresetId, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        handleSelectOccasion(id);
                        scrollToBuilder();
                      }}
                      className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-600 whitespace-nowrap"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Crimson Story & QR Bento Tile */}
              <div className="flex flex-col justify-between rounded-[28px] bg-rose-700 p-7 text-white">
                <div className="space-y-3">
                  <p className="text-xs font-medium text-rose-200">
                    Instagram Story &amp; Physical QR
                  </p>
                  <h3 className="font-display text-2xl font-bold leading-snug text-white">
                    Post to Story or stick a QR inside a gift box.
                  </h3>
                  <p className="text-xs leading-relaxed text-rose-100">
                    Export a 1080×1920 IG Story card with safe-zone margins, unique gift code, and scannable QR—or print a gift tag for bouquets &amp; letters.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStoryStudioSlug(latestPublishedSlug);
                    setStoryStudioOpen(true);
                  }}
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-xs font-semibold text-[#111113] transition-colors hover:bg-rose-50 whitespace-nowrap"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-rose-700" />
                  Open Story &amp; QR Studio
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing: 1st Site Free -> ₹1 Per Extra Site OR ₹2 Infinite Forever */}
        <section id="pricing" className="border-t border-stone-900/[0.07] py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl space-y-2.5">
              <h2 className="text-2xl font-bold tracking-tight text-[#111113] md:text-4xl">
                1st website free. Then ₹{PLAN_PRICES.single} per site—or ₹{PLAN_PRICES.unlimited} forever.
              </h2>
              <p className="text-sm leading-relaxed text-stone-600">
                Zero monthly subscriptions. Try your first surprise site free with a Keepsake account, pay just ₹{PLAN_PRICES.single} whenever you need another site, or unlock infinite websites forever for ₹{PLAN_PRICES.unlimited}.
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {/* Free Plan */}
              <div className="flex flex-col justify-between rounded-[24px] border border-stone-900/[0.08] bg-white p-7">
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-stone-500">Try the full experience</p>
                    <div className="mt-1.5 flex items-baseline justify-between">
                      <h3 className="text-xl font-bold text-[#111113]">1st Website</h3>
                      <span className="font-mono text-3xl font-bold tabular-nums text-[#111113]">₹0</span>
                    </div>
                  </div>
                  <ul className="divide-y divide-stone-900/[0.07] text-sm text-stone-700">
                    <li className="py-2.5">Publish 1 complete surprise website</li>
                    <li className="py-2.5">All 4 themes, passcode lock &amp; 8 photos</li>
                    <li className="py-2.5">Live milestone clock &amp; Open-When notes</li>
                    <li className="py-2.5">IG Story Card PNG &amp; Print QR Tag</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (canPublishFree) {
                      scrollToBuilder();
                    } else {
                      setModalPublishedSlug('');
                      setModalOpen(true);
                    }
                  }}
                  className="mt-6 w-full rounded-xl bg-[#F4F1EC] py-3 text-xs font-semibold text-[#111113] transition-colors hover:bg-[#EAE5DC] whitespace-nowrap"
                >
                  {canPublishFree ? 'Build Your 1 Free Website' : 'Free Site Used (1/1)'}
                </button>
              </div>

              {/* ₹1 Per Extra Site */}
              <div className="flex flex-col justify-between rounded-[24px] border border-stone-900/[0.08] bg-white p-7">
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-stone-500">Pay only when you need one</p>
                    <div className="mt-1.5 flex items-baseline justify-between">
                      <h3 className="text-xl font-bold text-[#111113]">Single Website</h3>
                      <span className="font-mono text-3xl font-bold tabular-nums text-[#111113]">
                        ₹{PLAN_PRICES.single}
                      </span>
                    </div>
                  </div>
                  <ul className="divide-y divide-stone-900/[0.07] text-sm text-stone-700">
                    <li className="py-2.5 font-medium text-[#111113]">1 extra surprise website credit</li>
                    <li className="py-2.5">Razorpay Payment Link or instant UPI</li>
                    <li className="py-2.5">Custom URL slug, quiz &amp; scratch card</li>
                    <li className="py-2.5">Saved permanently to your Keepsake account</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (hasUnlimitedPass) {
                      scrollToBuilder();
                    } else {
                      setModalInitialPlan('single9');
                      setModalPublishedSlug('');
                      setModalOpen(true);
                    }
                  }}
                  className="mt-6 w-full rounded-xl bg-[#111113] py-3 text-xs font-semibold text-white transition-colors hover:bg-stone-800 whitespace-nowrap"
                >
                  {hasUnlimitedPass
                    ? 'Included in Your Infinite Pass'
                    : `Publish 1 Site · ₹${PLAN_PRICES.single}`}
                </button>
              </div>

              {/* ₹2 Infinite Websites Plan — Dark Obsidian Anchor */}
              <div className="flex flex-col justify-between rounded-[24px] bg-[#111113] p-7 text-white shadow-[0_24px_50px_-18px_rgba(17,17,19,0.45)]">
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-semibold text-rose-400">Best value · One-time unlock</p>
                    <div className="mt-1.5 flex items-baseline justify-between">
                      <h3 className="text-xl font-bold text-white">Infinite Forever</h3>
                      <span className="font-mono text-3xl font-bold tabular-nums text-white">
                        ₹{PLAN_PRICES.unlimited}
                      </span>
                    </div>
                  </div>
                  <ul className="divide-y divide-white/10 text-sm text-stone-300">
                    <li className="py-2.5 font-medium text-white">
                      Create infinite surprise websites forever
                    </li>
                    <li className="py-2.5">Birthdays, anniversaries, besties &amp; apologies</li>
                    <li className="py-2.5">Synced across all devices via Keepsake Auth</li>
                    <li className="py-2.5">QR gift tags, WhatsApp &amp; IG Story exports</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (hasUnlimitedPass) {
                      scrollToBuilder();
                    } else {
                      setModalInitialPlan('unlimited99');
                      setModalPublishedSlug('');
                      setModalOpen(true);
                    }
                  }}
                  className="mt-6 w-full rounded-xl bg-rose-600 py-3 text-xs font-semibold text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
                >
                  {hasUnlimitedPass
                    ? 'Infinite Pass Active — Create Website'
                    : `Unlock Infinite Websites · ₹${PLAN_PRICES.unlimited}`}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Frequently Asked Questions */}
        <section id="faq" className="border-t border-stone-900/[0.07] bg-white py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div className="space-y-2.5">
                <h2 className="text-2xl font-bold tracking-tight text-[#111113] md:text-4xl">
                  Frequently Asked Questions
                </h2>
                <p className="text-sm leading-relaxed text-stone-600">
                  Everything you need to know about privacy, link permanence, photos, and pricing before publishing.
                </p>
              </div>

              <div className="divide-y divide-stone-900/[0.08] border-y border-stone-900/[0.08]">
                {FAQ_ITEMS.map((item, idx) => {
                  const isOpen = openFaqIdx === idx;
                  return (
                    <div key={item.question}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                        className="flex w-full items-center justify-between gap-4 py-5 text-left"
                      >
                        <span className="text-sm font-bold text-[#111113]">
                          {item.question}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-stone-500 transition-transform duration-200 shrink-0 ${
                            isOpen ? 'rotate-180 text-[#111113]' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <p className="pb-5 pr-8 text-sm leading-relaxed text-stone-600">
                          {item.answer}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-stone-900/[0.07] bg-[#F7F5F2] pt-9 pb-20 sm:pb-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-stone-500">
            <span className="font-display font-bold text-[#111113]">Keepsake</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>
              1st website free · ₹{PLAN_PRICES.single} per extra site or ₹{PLAN_PRICES.unlimited} infinite forever · Zero AI API cost
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs font-medium text-stone-600">
            <a href="#builder" className="hover:text-[#111113] whitespace-nowrap">
              Studio
            </a>
            <a href="#pricing" className="hover:text-[#111113] whitespace-nowrap">
              Pricing
            </a>
            <a href="#faq" className="hover:text-[#111113] whitespace-nowrap">
              FAQ
            </a>
            {isFounder && (
              <button
                type="button"
                onClick={() => setOwnerModalOpen(true)}
                className="hover:text-[#111113] underline underline-offset-4 whitespace-nowrap"
              >
                Founder Console
              </button>
            )}
          </div>
        </div>
      </footer>

      <TotalSitesCorner
        user={authUser}
        authReady={authReady}
        creatorStatus={creatorStatus}
        isSigningIn={false}
        onSignIn={handleOpenSignInModal}
        onOpenStoryStudio={(slug) => {
          setStoryStudioSlug(slug);
          setStoryStudioOpen(true);
        }}
        onOpenUpgrade={() => {
          setModalPublishedSlug('');
          setModalOpen(true);
        }}
      />

      <AuthDialogModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(user, creator) => {
          setAuthUser(user);
          setCreatorStatus(creator);
          setPublishError('');
        }}
      />

      <UpiCheckoutModal
        isOpen={modalOpen}
        initialPublishedSlug={modalPublishedSlug}
        initialPlan={modalInitialPlan}
        user={authUser}
        creatorStatus={creatorStatus}
        gift={gift}
        merchant={merchantConfig}
        pendingRazorpayPayment={pendingRazorpayPayment}
        onClose={() => setModalOpen(false)}
        onSignedIn={(user, status) => {
          setAuthUser(user);
          setCreatorStatus(status);
          setPublishError('');
        }}
        onPaymentVerified={(updatedCreator) => {
          setCreatorStatus(updatedCreator);
        }}
        onPublished={(slug, updatedCreator) => {
          setModalPublishedSlug(slug);
          setCreatorStatus(updatedCreator);
        }}
        onClearPendingRazorpay={() => setPendingRazorpayPayment(null)}
        onOpenStoryStudio={(slug) => {
          setModalOpen(false);
          setStoryStudioSlug(slug);
          setStoryStudioOpen(true);
        }}
      />

      <StoryCardModal
        isOpen={storyStudioOpen}
        gift={gift}
        publishedSlug={storyStudioSlug || latestPublishedSlug}
        availableSlugs={publishedSlugs}
        onPublishToGetUrl={() => {
          setStoryStudioOpen(false);
          handlePublishAction();
        }}
        onClose={() => setStoryStudioOpen(false)}
      />

      {isFounder && (
        <OwnerSetupModal
          isOpen={ownerModalOpen}
          config={merchantConfig}
          user={authUser}
          onRequestSignIn={() => setAuthModalOpen(true)}
          onSave={handleSaveMerchant}
          onClose={() => setOwnerModalOpen(false)}
        />
      )}
    </div>
  );
}
