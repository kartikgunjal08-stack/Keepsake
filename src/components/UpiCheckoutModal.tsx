import {useEffect, useState} from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Infinity as InfinityIcon,
  Loader2,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import {
  type AuthUser,
  createRazorpayOrder,
  createRazorpayPaymentLink,
  fetchPaymentConfig,
  publishGiftToSupabase,
  purchaseSingleSiteCredit,
  purchaseUnlimitedPass,
  signInWithKeepsake,
  signUpWithKeepsake,
  verifyRazorpayPayment,
  verifyRazorpayPaymentLink,
} from '../lib/keepsakeApi';
import type {GiftConfig} from '../types/gift';
import {
  buildUpiUri,
  clearPendingCheckoutDraft,
  type CreatorStatus,
  type MerchantConfig,
  PLAN_PRICES,
  savePendingCheckoutDraft,
} from '../utils/merchantConfig';
import {deriveUniqueCode} from '../utils/storyCardExport';

interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {name?: string; email?: string};
  theme?: {color?: string};
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: {ondismiss?: () => void};
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
      on?: (event: string, cb: (payload: {error?: {description?: string}}) => void) => void;
    };
  }
}

function loadRazorpayCheckoutScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)), {once: true});
      existing.addEventListener('error', () => resolve(false), {once: true});
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface UpiCheckoutModalProps {
  isOpen: boolean;
  initialPublishedSlug: string;
  initialPlan?: CheckoutPlan;
  user: AuthUser | null;
  creatorStatus: CreatorStatus | null;
  gift: GiftConfig;
  merchant: MerchantConfig;
  pendingRazorpayPayment?: {
    paymentId: string;
    plan: 'single9' | 'unlimited99';
    paymentLinkId?: string;
    referenceId?: string;
    linkStatus?: string;
    signature?: string;
  } | null;
  onClose: () => void;
  onSignedIn: (user: AuthUser, status: CreatorStatus) => void;
  onPaymentVerified?: (updatedCreator: CreatorStatus) => void;
  onPublished: (slug: string, updatedCreator: CreatorStatus) => void;
  onClearPendingRazorpay?: () => void;
  onOpenStoryStudio?: (slug: string) => void;
}

type CheckoutPlan = 'single9' | 'unlimited99';

export function UpiCheckoutModal({
  isOpen,
  initialPublishedSlug,
  initialPlan,
  user,
  creatorStatus,
  gift,
  merchant,
  pendingRazorpayPayment,
  onClose,
  onSignedIn,
  onPaymentVerified,
  onPublished,
  onClearPendingRazorpay,
  onOpenStoryStudio,
}: UpiCheckoutModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<CheckoutPlan>(
    () => pendingRazorpayPayment?.plan || initialPlan || 'single9',
  );
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [utrInput, setUtrInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);

  const [publishedSlug, setPublishedSlug] = useState(initialPublishedSlug);
  const [giftQrUrl, setGiftQrUrl] = useState('');
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [razorpayCheckoutReady, setRazorpayCheckoutReady] = useState(false);
  const [gatewayChecked, setGatewayChecked] = useState(false);
  const [showManualVerify, setShowManualVerify] = useState(false);
  const [hostedLinkUrl, setHostedLinkUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPublishedSlug(initialPublishedSlug);
      setErrorMsg('');
      setShowManualVerify(false);
      setHostedLinkUrl('');
      setUtrInput(pendingRazorpayPayment?.paymentId || '');
      if (pendingRazorpayPayment?.plan) {
        setSelectedPlan(pendingRazorpayPayment.plan);
      } else if (initialPlan) {
        setSelectedPlan(initialPlan);
      }
      fetchPaymentConfig().then((cfg) => {
        setRazorpayCheckoutReady(cfg.razorpayCheckoutEnabled);
        setGatewayChecked(true);
      });
    }
  }, [initialPlan, initialPublishedSlug, isOpen, pendingRazorpayPayment]);

  const amountInr = selectedPlan === 'single9' ? PLAN_PRICES.single : PLAN_PRICES.unlimited;
  const upiUri = buildUpiUri(
    merchant,
    amountInr,
    selectedPlan === 'single9'
      ? `Keepsake ₹${PLAN_PRICES.single} Single Website`
      : `Keepsake ₹${PLAN_PRICES.unlimited} Infinite Websites`,
  );
  const razorpayLink = (
    selectedPlan === 'single9' ? merchant.razorpayUrl9 : merchant.razorpayUrl99
  ).trim();

  useEffect(() => {
    if (!isOpen || publishedSlug || !user) return;
    let active = true;
    QRCode.toDataURL(upiUri, {
      width: 220,
      margin: 1,
      color: {dark: '#111113', light: '#ffffff'},
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [upiUri, isOpen, publishedSlug, user]);

  const shareableUrl = publishedSlug
    ? `${window.location.origin}/?gift=${encodeURIComponent(publishedSlug)}`
    : '';

  useEffect(() => {
    if (!shareableUrl) return;
    let active = true;
    QRCode.toDataURL(shareableUrl, {
      width: 200,
      margin: 1,
      color: {dark: '#111113', light: '#ffffff'},
    })
      .then((url) => {
        if (active) setGiftQrUrl(url);
      })
      .catch(() => {
        if (active) setGiftQrUrl('');
      });
    return () => {
      active = false;
    };
  }, [shareableUrl]);

  if (!isOpen) return null;

  const unlockAndPublishForAccount = async (
    signedUser: AuthUser,
    status: CreatorStatus,
    refId: string,
    plan: CheckoutPlan,
  ) => {
    let updatedCreator: CreatorStatus;

    if (
      pendingRazorpayPayment?.paymentLinkId &&
      pendingRazorpayPayment?.signature &&
      pendingRazorpayPayment.paymentId === refId
    ) {
      const verified = await verifyRazorpayPaymentLink(signedUser, {
        plan,
        razorpay_payment_id: pendingRazorpayPayment.paymentId,
        razorpay_payment_link_id: pendingRazorpayPayment.paymentLinkId,
        razorpay_payment_link_reference_id: pendingRazorpayPayment.referenceId || '',
        razorpay_payment_link_status: pendingRazorpayPayment.linkStatus || 'paid',
        razorpay_signature: pendingRazorpayPayment.signature,
      });
      updatedCreator = verified.creator;
    } else if (plan === 'single9') {
      updatedCreator = await purchaseSingleSiteCredit(signedUser, refId, status.siteCredits);
    } else {
      updatedCreator = await purchaseUnlimitedPass(signedUser, refId);
    }

    const pub = await publishGiftToSupabase(signedUser, gift, updatedCreator, gift.customSlug);
    clearPendingCheckoutDraft();
    onClearPendingRazorpay?.();
    setPublishedSlug(pub.slug);
    onPublished(pub.slug, pub.creator);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setErrorMsg('');
    try {
      const result =
        authMode === 'signup'
          ? await signUpWithKeepsake(authName, authEmail, authPassword)
          : await signInWithKeepsake(authEmail, authPassword);
      const {user: signedUser, creator: status} = result;
      onSignedIn(signedUser, status);

      // If returning from a paid Razorpay Payment Link, unlock the plan & publish immediately
      if (pendingRazorpayPayment) {
        setIsProcessing(true);
        await unlockAndPublishForAccount(
          signedUser,
          status,
          pendingRazorpayPayment.paymentId,
          pendingRazorpayPayment.plan,
        );
        return;
      }

      if (status.hasUnlimitedPass || status.siteCredits >= 1) {
        setIsProcessing(true);
        const pub = await publishGiftToSupabase(signedUser, gift, status, gift.customSlug);
        clearPendingCheckoutDraft();
        setPublishedSlug(pub.slug);
        onPublished(pub.slug, pub.creator);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not complete sign in. Please try again.',
      );
    } finally {
      setIsSigningIn(false);
      setIsProcessing(false);
    }
  };

  const handlePayViaHostedLink = async () => {
    if (!user) return;
    setErrorMsg('');
    setHostedLinkUrl('');
    setIsProcessing(true);
    try {
      savePendingCheckoutDraft(selectedPlan, gift);
      const link = await createRazorpayPaymentLink(user, selectedPlan, window.location.origin);
      const inIframe = (() => {
        try {
          return window.self !== window.top;
        } catch {
          return true;
        }
      })();
      if (inIframe) {
        setHostedLinkUrl(link.shortUrl);
        setIsProcessing(false);
      } else {
        window.location.assign(link.shortUrl);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to open Razorpay payment page right now.',
      );
      setIsProcessing(false);
    }
  };

  const handlePayWithRazorpayCheckout = async () => {
    if (!user) return;
    setErrorMsg('');
    setIsProcessing(true);

    try {
      const [loaded, order] = await Promise.all([
        loadRazorpayCheckoutScript(),
        createRazorpayOrder(user, selectedPlan),
      ]);

      if (!loaded || !window.Razorpay) {
        throw new Error('Could not load Razorpay checkout. Please check your connection or use UPI QR below.');
      }

      savePendingCheckoutDraft(selectedPlan, gift);

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: merchant.payeeName || 'Keepsake Gifts',
        description:
          selectedPlan === 'single9'
            ? `1 Extra Surprise Website (₹${PLAN_PRICES.single})`
            : `Infinite Websites Pass (₹${PLAN_PRICES.unlimited})`,
        order_id: order.orderId,
        prefill: {
          name: user.displayName || undefined,
          email: user.email || undefined,
        },
        theme: {color: '#be123c'},
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
          },
        },
        handler: async (response) => {
          try {
            const verified = await verifyRazorpayPayment(user, {
              plan: selectedPlan,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            onPaymentVerified?.(verified.creator);
            const pub = await publishGiftToSupabase(
              user,
              gift,
              verified.creator,
              gift.customSlug,
            );
            clearPendingCheckoutDraft();
            onClearPendingRazorpay?.();
            setPublishedSlug(pub.slug);
            onPublished(pub.slug, pub.creator);
          } catch (verifyErr) {
            setShowManualVerify(true);
            setUtrInput(response.razorpay_payment_id || '');
            setErrorMsg(
              verifyErr instanceof Error
                ? verifyErr.message
                : 'Payment verified, but publishing hit an issue. Click Unlock & Publish below to retry.',
            );
          } finally {
            setIsProcessing(false);
          }
        },
      });

      rzp.on?.('payment.failed', (failPayload) => {
        setErrorMsg(
          failPayload?.error?.description || 'Razorpay payment failed. Please try again.',
        );
        setIsProcessing(false);
      });

      rzp.open();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to start Razorpay checkout right now.',
      );
      setIsProcessing(false);
    }
  };

  const unlockAndPublish = async (utr: string, plan: CheckoutPlan) => {
    if (!user || !creatorStatus) {
      setErrorMsg('Please sign in to your Keepsake account first.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');
    try {
      await unlockAndPublishForAccount(user, creatorStatus, utr, plan);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not complete unlock & publish. Please try again.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(merchant.upiId);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 1800);
    } catch {
      setErrorMsg('Copy failed. Select the UPI ID manually.');
    }
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 1800);
    } catch {
      setErrorMsg('Copy failed. Select the URL manually.');
    }
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = utrInput.trim().replace(/\s+/g, '');
    if (!/^[a-zA-Z0-9_-]{6,40}$/.test(cleaned)) {
      setErrorMsg(
        'Enter a valid Razorpay Payment ID (e.g. pay_...) or 12-digit UPI UTR ID from your payment receipt.',
      );
      return;
    }
    unlockAndPublish(cleaned, selectedPlan);
  };

  const whatsappSendHref = shareableUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        `Hey ${gift.recipientName}, I made a secret surprise page for you${
          gift.passcodeEnabled ? ` (Hint: ${gift.passcodeHint})` : ''
        }: ${shareableUrl}`,
      )}`
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111113]/65 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
    >
      <div className="w-full max-w-xl rounded-[24px] border border-stone-900/10 bg-white shadow-[0_32px_70px_-16px_rgba(17,17,19,0.3)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-900/[0.07] px-6 py-5">
          <div>
            <h2 id="checkout-modal-title" className="font-display text-xl font-bold tracking-tight text-[#111113]">
              {publishedSlug
                ? 'Your Surprise Website Is Live'
                : !user
                  ? pendingRazorpayPayment
                    ? 'Payment Received · Sign In to Publish'
                    : authMode === 'signup'
                      ? 'Create Free Keepsake Account to Publish'
                      : 'Sign in to Keepsake to Publish'
                  : `Choose Your Plan · ₹${PLAN_PRICES.single} or ₹${PLAN_PRICES.unlimited}`}
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {publishedSlug
                ? `Ready to send to ${gift.recipientName} on WhatsApp, IG Story, or QR tag`
                : !user
                  ? `1st website is free · Syncs your links & ₹${PLAN_PRICES.unlimited} Infinite Pass across devices`
                  : `1st free site already used on this account · Pick ₹${PLAN_PRICES.single} once or ₹${PLAN_PRICES.unlimited} forever`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-100 hover:text-[#111113]"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[85vh] overflow-y-auto studio-scroll">
          {publishedSlug ? (
            <div className="space-y-5">
              <div className="rounded-2xl bg-[#ECFDF5] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-emerald-900">
                    Private surprise published for {gift.recipientName}
                  </p>
                  <span className="font-mono text-[11px] font-bold text-emerald-800">
                    Code: {deriveUniqueCode(gift, publishedSlug)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3.5 py-2.5">
                  <span className="font-mono text-xs text-[#111113] truncate">{shareableUrl}</span>
                  <button
                    type="button"
                    onClick={handleCopyShareLink}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap shrink-0"
                  >
                    {copiedShareLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedShareLink ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-[164px_1fr] sm:items-center">
                <div className="flex flex-col items-center rounded-2xl bg-[#F4F1EC] p-3">
                  {giftQrUrl && (
                    <img src={giftQrUrl} alt="QR code for gift link" className="h-36 w-36 rounded-xl bg-white p-1.5 object-contain" />
                  )}
                  <span className="mt-2 text-[11px] font-medium text-stone-500">Print or share QR</span>
                </div>

                <div className="space-y-3.5">
                  <p className="text-sm leading-relaxed text-stone-600">
                    Send the live link on WhatsApp, or open the Story &amp; QR Studio to download a 1080×1920 IG Story or printable QR gift tag.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={shareableUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#111113] px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-stone-800 whitespace-nowrap shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Live Site
                    </a>
                    <a
                      href={whatsappSendHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-800 whitespace-nowrap shrink-0"
                    >
                      <Send className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                    {onOpenStoryStudio && (
                      <button
                        type="button"
                        onClick={() => onOpenStoryStudio(publishedSlug)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-[#111113] transition-colors hover:bg-stone-50 whitespace-nowrap shrink-0"
                      >
                        <ImageIcon className="h-3.5 w-3.5 text-rose-700" />
                        IG Story &amp; QR Studio
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : !user ? (
            /* Step 0: Keepsake Account Gate at Publish Time */
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {pendingRazorpayPayment && (
                <div className="rounded-2xl bg-[#ECFDF5] p-4 space-y-1">
                  <p className="text-xs font-bold text-emerald-900">
                    Razorpay Payment Verified ({pendingRazorpayPayment.paymentId})
                  </p>
                  <p className="text-xs text-emerald-800">
                    Sign in below to unlock your{' '}
                    {pendingRazorpayPayment.plan === 'unlimited99'
                      ? `₹${PLAN_PRICES.unlimited} Infinite Pass`
                      : `₹${PLAN_PRICES.single} Single Website`}{' '}
                    and publish &ldquo;{gift.recipientName}&apos;s&rdquo; site automatically.
                  </p>
                </div>
              )}

              <div className="rounded-2xl bg-[#F4F1EC] p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-rose-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[#111113]">
                      Publish &ldquo;{gift.recipientName}&apos;s&rdquo; Surprise Safely
                    </p>
                    <p className="text-xs leading-relaxed text-stone-600">
                      New accounts get <span className="font-semibold text-[#111113]">1st website 100% free</span>. Signing in saves your links &amp; ₹{PLAN_PRICES.unlimited} Infinite Pass permanently across all devices.
                    </p>
                  </div>
                </div>
              </div>

              <div className="inline-flex w-full rounded-xl bg-[#F4F1EC] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setErrorMsg('');
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    authMode === 'signup'
                      ? 'bg-white text-[#111113] shadow-sm'
                      : 'text-stone-600 hover:text-[#111113]'
                  }`}
                >
                  New Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setErrorMsg('');
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    authMode === 'login'
                      ? 'bg-white text-[#111113] shadow-sm'
                      : 'text-stone-600 hover:text-[#111113]'
                  }`}
                >
                  Already Have Account
                </button>
              </div>

              {authMode === 'signup' && (
                <label className="block">
                  <span className="text-xs font-semibold text-[#111113]">Your Name</span>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="e.g. Aarav Sharma"
                    className="mt-1.5 w-full rounded-xl border border-stone-200/90 bg-[#FAF9F7] px-3.5 py-2.5 text-sm text-[#111113] transition-colors focus:border-[#111113] focus:bg-white focus:outline-none"
                  />
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-[#111113]">Email Address</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-xl border border-stone-200/90 bg-[#FAF9F7] px-3.5 py-2.5 text-sm text-[#111113] transition-colors focus:border-[#111113] focus:bg-white focus:outline-none"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#111113]">Password</span>
                  <div className="relative">
                    <input
                      type={showAuthPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="mt-1.5 w-full rounded-xl border border-stone-200/90 bg-[#FAF9F7] px-3.5 py-2.5 pr-10 text-sm text-[#111113] transition-colors focus:border-[#111113] focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPassword((v) => !v)}
                      aria-label={showAuthPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-[55%] -translate-y-1/2 text-stone-400 hover:text-[#111113]"
                    >
                      {showAuthPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </label>
              </div>

              {errorMsg && (
                <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={isSigningIn || isProcessing}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#111113] px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60 whitespace-nowrap"
              >
                {(isSigningIn || isProcessing) && (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                )}
                {isSigningIn
                  ? authMode === 'signup'
                    ? 'Creating Account...'
                    : 'Signing In...'
                  : isProcessing
                    ? 'Unlocking & Publishing...'
                    : pendingRazorpayPayment
                      ? 'Sign In & Publish Paid Site'
                      : authMode === 'signup'
                        ? 'Create Account & Publish Free'
                        : 'Sign In & Publish'}
              </button>
            </form>
          ) : (
            /* Step 1: Authenticated Checkout — Choose ₹1 Per Site OR ₹2 Infinite */
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSelectedPlan('single9')}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    selectedPlan === 'single9'
                      ? 'border-[#111113] bg-[#111113] text-white'
                      : 'border-stone-200 bg-[#FAF9F7] text-[#111113] hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                      <Sparkles className="h-3.5 w-3.5 text-rose-500" />
                      1 Extra Website
                    </span>
                    <span className="font-mono text-xl font-bold tabular-nums">₹{PLAN_PRICES.single}</span>
                  </div>
                  <p
                    className={`mt-1.5 text-[11px] leading-snug ${
                      selectedPlan === 'single9' ? 'text-stone-300' : 'text-stone-500'
                    }`}
                  >
                    Pay once to unlock &amp; publish this surprise website now.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPlan('unlimited99')}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    selectedPlan === 'unlimited99'
                      ? 'border-rose-700 bg-rose-700 text-white'
                      : 'border-stone-200 bg-[#FAF9F7] text-[#111113] hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                      <InfinityIcon className="h-3.5 w-3.5" />
                      Infinite Forever
                    </span>
                    <span className="font-mono text-xl font-bold tabular-nums">₹{PLAN_PRICES.unlimited}</span>
                  </div>
                  <p
                    className={`mt-1.5 text-[11px] leading-snug ${
                      selectedPlan === 'unlimited99' ? 'text-rose-100' : 'text-stone-500'
                    }`}
                  >
                    Create unlimited websites for friends &amp; partners forever.
                  </p>
                </button>
              </div>

              {/* Primary Multi-Buyer Razorpay In-App Checkout (when RAZORPAY_KEY_ID & SECRET set) */}
              {!gatewayChecked ? (
                <div className="rounded-2xl bg-[#F4F1EC] p-5 text-center text-xs font-medium text-stone-600">
                  Loading secure checkout...
                </div>
              ) : razorpayCheckoutReady ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-[#111113] p-5 text-white space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold">
                          Pay ₹{amountInr} securely via Razorpay
                        </p>
                        <p className="mt-0.5 text-xs text-stone-300">
                          Opens Razorpay&apos;s verified checkout page (UPI, GPay, PhonePe, Cards) and auto-publishes your site on return.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={handlePayViaHostedLink}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-60 whitespace-nowrap shrink-0"
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                        {isProcessing ? 'Opening Razorpay…' : `Pay ₹${amountInr} via Razorpay (rzp.io)`}
                      </button>
                    </div>

                    {hostedLinkUrl && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/10 px-4 py-3">
                        <span className="text-xs text-stone-200">
                          Preview is inside an embedded frame — open Razorpay in a tab to pay safely:
                        </span>
                        <a
                          href={hostedLinkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-[#111113] transition-colors hover:bg-emerald-400 whitespace-nowrap shrink-0"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open Razorpay Checkout
                        </a>
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-white/10 pt-3">
                      <span className="text-[11px] text-stone-400">
                        Prefer in-page popup? (Requires live domain registered in Razorpay)
                      </span>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={handlePayWithRazorpayCheckout}
                        className="text-xs font-semibold text-stone-200 underline underline-offset-4 transition-colors hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        Or Open In-App Popup
                      </button>
                    </div>
                  </div>

                  {errorMsg && <p className="text-xs font-medium text-red-600">{errorMsg}</p>}

                  <div className="border-t border-stone-900/[0.07] pt-3">
                    <button
                      type="button"
                      onClick={() => setShowManualVerify((v) => !v)}
                      className="text-xs font-medium text-stone-500 underline underline-offset-4 hover:text-[#111113]"
                    >
                      {showManualVerify
                        ? 'Hide Payment ID check'
                        : 'Already paid and have a Razorpay Payment ID (pay_...)?'}
                    </button>

                    {showManualVerify && (
                      <form onSubmit={handleVerifySubmit} className="mt-3 space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            id="utr-input"
                            type="text"
                            value={utrInput}
                            onChange={(e) => setUtrInput(e.target.value)}
                            placeholder="pay_Q1a2B3c4D5"
                            className="flex-1 rounded-xl border border-stone-200 bg-[#FAF9F7] px-3.5 py-2.5 font-mono text-sm text-[#111113] placeholder:text-stone-400 focus:border-[#111113] focus:bg-white focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={isProcessing}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-700 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-800 disabled:opacity-60 whitespace-nowrap shrink-0"
                          >
                            {isProcessing ? 'Publishing...' : `Unlock & Publish · ₹${amountInr}`}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {razorpayLink && (
                    <div className="rounded-2xl bg-[#111113] p-4 text-white space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold">
                            Pay ₹{amountInr} with Razorpay
                          </p>
                          <p className="text-[11px] text-stone-300">
                            Auto-unlocks &amp; publishes your site via redirect or Payment ID below
                          </p>
                        </div>
                        <a
                          href={razorpayLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => savePendingCheckoutDraft(selectedPlan, gift)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 whitespace-nowrap shrink-0"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Pay ₹{amountInr} via Razorpay
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-5 rounded-2xl bg-[#F4F1EC] p-4 sm:grid-cols-[170px_1fr] sm:items-center">
                    <div className="flex flex-col items-center justify-center rounded-xl bg-white p-2.5">
                      {qrDataUrl ? (
                        <img
                          src={qrDataUrl}
                          alt={`Scan to pay ₹${amountInr} via UPI`}
                          className="h-36 w-36 object-contain"
                        />
                      ) : (
                        <div className="flex h-36 w-36 items-center justify-center text-xs text-stone-500">
                          QR unavailable
                        </div>
                      )}
                      <span className="mt-1.5 font-mono text-[11px] font-medium tabular-nums text-stone-600">
                        Scan &amp; pay · ₹{amountInr}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-medium text-stone-600 truncate">
                          Pay ₹{amountInr} via UPI ({user.email})
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                          <span className="font-mono text-xs font-medium text-[#111113] truncate">
                            {merchant.upiId}
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyUpi}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap shrink-0"
                          >
                            {copiedUpi ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedUpi ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <a
                          href={upiUri}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#111113] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-stone-800 whitespace-nowrap shrink-0"
                        >
                          <Smartphone className="h-3.5 w-3.5" />
                          Open UPI App (₹{amountInr})
                        </a>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleVerifySubmit} className="space-y-3">
                    <div>
                      <label htmlFor="utr-input" className="block text-xs font-semibold text-stone-700">
                        Enter Razorpay Payment ID (e.g. pay_...) or 12-Digit UPI UTR to Unlock &amp; Publish
                      </label>
                      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                        <input
                          id="utr-input"
                          type="text"
                          value={utrInput}
                          onChange={(e) => setUtrInput(e.target.value)}
                          placeholder="pay_Q1a2B3c4D5 or 432518904412"
                          className="flex-1 rounded-xl border border-stone-200 bg-[#FAF9F7] px-3.5 py-2.5 font-mono text-sm text-[#111113] placeholder:text-stone-400 focus:border-[#111113] focus:bg-white focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={isProcessing}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-800 disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                          {isProcessing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : selectedPlan === 'single9' ? (
                            <Sparkles className="h-4 w-4" />
                          ) : (
                            <InfinityIcon className="h-4 w-4" />
                          )}
                          {isProcessing ? 'Publishing...' : `Unlock & Publish · ₹${amountInr}`}
                        </button>
                      </div>
                      {errorMsg && <p className="mt-1.5 text-xs font-medium text-red-600">{errorMsg}</p>}
                    </div>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
