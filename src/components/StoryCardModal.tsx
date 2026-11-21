import {useEffect, useState} from 'react';
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Loader2,
  QrCode,
  Sparkles,
  X,
} from 'lucide-react';
import type {GiftConfig} from '../types/gift';
import {
  buildGiftShareUrl,
  deriveUniqueCode,
  downloadPrintableQrPng,
  downloadStoryCardPng,
  generateGiftQrDataUrl,
  renderStoryCardDataUrl,
  type StoryLayoutStyle,
} from '../utils/storyCardExport';

interface StoryCardModalProps {
  isOpen: boolean;
  gift: GiftConfig;
  publishedSlug?: string;
  availableSlugs?: string[];
  onPublishToGetUrl?: () => void;
  onClose: () => void;
}

const LAYOUT_LABELS: {id: StoryLayoutStyle; title: string; subtitle: string}[] = [
  {id: 'polaroid', title: 'Polaroid Frame', subtitle: 'Tilted photo + caption'},
  {id: 'ticket', title: 'Midnight Pass', subtitle: 'Dark stub + letter + QR'},
  {id: 'poster', title: 'Editorial Poster', subtitle: 'Clean archival frame'},
];

export function StoryCardModal({
  isOpen,
  gift,
  publishedSlug,
  availableSlugs = [],
  onPublishToGetUrl,
  onClose,
}: StoryCardModalProps) {
  const [layout, setLayout] = useState<StoryLayoutStyle>('polaroid');
  const [showCode, setShowCode] = useState(true);
  const [showDays, setShowDays] = useState(true);
  const [showQr, setShowQr] = useState(true);

  const [selectedSlug, setSelectedSlug] = useState<string>(
    () => publishedSlug || availableSlugs[availableSlugs.length - 1] || '',
  );
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [isDownloadingQr, setIsDownloadingQr] = useState(false);
  const [qrDownloadedNotice, setQrDownloadedNotice] = useState(false);

  const [previewUrl, setPreviewUrl] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadedNotice, setDownloadedNotice] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const nextSlug = publishedSlug || availableSlugs[availableSlugs.length - 1] || '';
    setSelectedSlug(nextSlug);
  }, [isOpen, publishedSlug, availableSlugs]);

  const activeSlug = selectedSlug.trim() || undefined;
  const uniqueCode = deriveUniqueCode(gift, activeSlug);
  const shareUrl = activeSlug ? buildGiftShareUrl(activeSlug) : undefined;

  const suggestedCaption = `Made a private surprise for ${gift.recipientName} · ${gift.headline} (Code: ${uniqueCode})${shareUrl ? ` — ${shareUrl}` : ''}`;

  useEffect(() => {
    if (!isOpen || !shareUrl) {
      setQrDataUrl('');
      return;
    }
    let active = true;
    setIsGeneratingQr(true);

    generateGiftQrDataUrl(shareUrl)
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      })
      .finally(() => {
        if (active) setIsGeneratingQr(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, shareUrl]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setIsRendering(true);

    renderStoryCardDataUrl(gift, {
      layout,
      uniqueCode,
      showCode,
      showDays,
      showQr: Boolean(showQr && shareUrl),
      shareUrl,
    })
      .then((url) => {
        if (active) setPreviewUrl(url);
      })
      .finally(() => {
        if (active) setIsRendering(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, gift, layout, uniqueCode, showCode, showDays, showQr, shareUrl]);

  if (!isOpen) return null;

  const handleRegenerateQr = async () => {
    if (!shareUrl) return;
    setIsGeneratingQr(true);
    try {
      const url = await generateGiftQrDataUrl(shareUrl);
      setQrDataUrl(url);
    } finally {
      setIsGeneratingQr(false);
    }
  };

  const handleDownloadQrTag = async () => {
    if (!shareUrl) return;
    setIsDownloadingQr(true);
    try {
      await downloadPrintableQrPng(gift, shareUrl, uniqueCode);
      setQrDownloadedNotice(true);
      setTimeout(() => setQrDownloadedNotice(false), 2400);
    } finally {
      setIsDownloadingQr(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadStoryCardPng(gift, {
        layout,
        uniqueCode,
        showCode,
        showDays,
        showQr: Boolean(showQr && shareUrl),
        shareUrl,
      });
      setDownloadedNotice(true);
      setTimeout(() => setDownloadedNotice(false), 2400);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(uniqueCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(suggestedCaption);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111113]/65 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-card-modal-title"
    >
      <div className="w-full max-w-4xl rounded-[24px] border border-stone-900/10 bg-white shadow-[0_32px_70px_-16px_rgba(17,17,19,0.3)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-900/[0.07] px-6 py-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111113] text-white shrink-0">
              <ImageIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 id="story-card-modal-title" className="font-display text-lg font-bold tracking-tight text-[#111113]">
                Instagram Story &amp; QR Studio
              </h2>
              <p className="text-xs text-stone-500">
                1080×1920 Story PNG · Printable QR gift tag for physical bouquets &amp; letters
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-100 hover:text-[#111113]"
            aria-label="Close Story Studio"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-[290px_1fr] max-h-[85vh] overflow-y-auto studio-scroll">
          {/* Left: Live 9:16 Phone Preview */}
          <div className="flex flex-col items-center justify-center rounded-2xl bg-[#F4F1EC] p-5">
            <div className="relative aspect-[9/16] w-full max-w-[244px] overflow-hidden rounded-[32px] border-[6px] border-[#111113] bg-[#111113] shadow-[0_20px_40px_-12px_rgba(17,17,19,0.3)]">
              <div className="pointer-events-none absolute top-2 left-1/2 z-10 h-3.5 w-16 -translate-x-1/2 rounded-full bg-[#111113]/90" />
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`Instagram Story card for ${gift.recipientName}`}
                  className="h-full w-full rounded-[26px] object-contain bg-white"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-stone-400">
                  Generating card...
                </div>
              )}
              {isRendering && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#111113]/40 backdrop-blur-[1px]">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>
            <span className="mt-3 font-mono text-[11px] text-stone-500 tabular-nums">
              1080 × 1920 px · 9:16 Safe Zones
            </span>
          </div>

          {/* Right: Customization, Published QR Code & Download Controls */}
          <div className="flex flex-col justify-between space-y-5">
            <div className="space-y-5">
              {/* Core Details Strip */}
              <div className="rounded-2xl bg-[#F4F1EC] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="block text-[11px] font-medium text-stone-500">
                      Unique Gift Code
                    </span>
                    <span className="font-mono text-base font-bold text-[#111113] tabular-nums">
                      {uniqueCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-[#111113] shadow-xs transition-colors hover:bg-stone-50 whitespace-nowrap shrink-0"
                  >
                    {copiedCode ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-rose-700" />
                    )}
                    {copiedCode ? 'Copied Code' : 'Copy Code'}
                  </button>
                </div>

                <div className="grid gap-2 border-t border-stone-900/[0.08] pt-3 sm:grid-cols-2 text-xs">
                  <div>
                    <span className="block text-[11px] text-stone-500">Recipient</span>
                    <span className="font-semibold text-[#111113]">{gift.recipientName}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-stone-500">Headline</span>
                    <span className="font-semibold text-[#111113] line-clamp-1">
                      {gift.headline}
                    </span>
                  </div>
                </div>
              </div>

              {/* Published Gift URL QR Code Generator */}
              <div className="space-y-3 border-t border-stone-900/[0.07] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-rose-700 shrink-0" />
                    <span className="text-xs font-bold text-[#111113]">
                      Published Gift QR Code (Physical Gifts)
                    </span>
                  </div>
                  {availableSlugs.length > 1 && (
                    <select
                      value={selectedSlug}
                      onChange={(e) => setSelectedSlug(e.target.value)}
                      aria-label="Choose published gift link"
                      className="rounded-xl border border-stone-200 bg-[#FAF9F7] px-2.5 py-1.5 font-mono text-[11px] text-[#111113] focus:border-[#111113] focus:outline-none"
                    >
                      {availableSlugs.map((slug) => (
                        <option key={slug} value={slug}>
                          /?gift={slug}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {shareUrl ? (
                  <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center">
                    <div className="flex h-28 w-28 items-center justify-center rounded-2xl border border-stone-900/10 bg-white p-2 shrink-0">
                      {isGeneratingQr ? (
                        <Loader2 className="h-5 w-5 animate-spin text-stone-500" />
                      ) : qrDataUrl ? (
                        <img
                          src={qrDataUrl}
                          alt={`QR code for ${shareUrl}`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-[11px] text-stone-400">QR unavailable</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-[#F4F1EC] px-3 py-2">
                        <span className="font-mono text-[11px] text-stone-700 truncate">
                          {shareUrl}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyUrl}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap shrink-0"
                        >
                          {copiedUrl ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          {copiedUrl ? 'Copied' : 'Copy'}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isDownloadingQr || !qrDataUrl}
                          onClick={handleDownloadQrTag}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#111113] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          {isDownloadingQr ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : qrDownloadedNotice ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {qrDownloadedNotice ? 'Saved Print QR' : 'Download Print QR Tag'}
                        </button>

                        <button
                          type="button"
                          disabled={isGeneratingQr}
                          onClick={handleRegenerateQr}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#111113] transition-colors hover:bg-stone-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          <QrCode className="h-3.5 w-3.5 text-rose-700" />
                          {isGeneratingQr ? 'Generating...' : 'Regenerate QR'}
                        </button>
                      </div>
                      <p className="text-[11px] text-stone-500">
                        Tape this printed QR tag inside a greeting card, gift box, or bouquet.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-[#F4F1EC] px-4 py-3.5">
                    <p className="text-xs text-stone-600">
                      Publish your surprise website first to generate a live, scannable QR code for physical gifts.
                    </p>
                    {onPublishToGetUrl && (
                      <button
                        type="button"
                        onClick={onPublishToGetUrl}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-800 whitespace-nowrap shrink-0"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Publish for Live QR
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Card Layout Picker */}
              <div className="space-y-2 border-t border-stone-900/[0.07] pt-4">
                <p className="text-xs font-semibold text-stone-700">Story Card Style</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {LAYOUT_LABELS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLayout(item.id)}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        layout === item.id
                          ? 'border-[#111113] bg-[#111113] text-white'
                          : 'border-stone-200 bg-[#FAF9F7] text-[#111113] hover:border-stone-300 hover:bg-white'
                      }`}
                    >
                      <p className="text-xs font-bold">{item.title}</p>
                      <p
                        className={`mt-0.5 text-[11px] ${
                          layout === item.id ? 'text-stone-300' : 'text-stone-500'
                        }`}
                      >
                        {item.subtitle}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2 border-t border-stone-900/[0.07] pt-4">
                <p className="text-xs font-semibold text-stone-700">Card Elements</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCode}
                      onChange={(e) => setShowCode(e.target.checked)}
                      className="h-4 w-4 accent-rose-700 rounded"
                    />
                    Stamp Code ({uniqueCode})
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDays}
                      onChange={(e) => setShowDays(e.target.checked)}
                      className="h-4 w-4 accent-rose-700 rounded"
                    />
                    Show Days &amp; Counting
                  </label>
                  <label
                    className={`inline-flex items-center gap-2 text-xs font-medium ${
                      shareUrl ? 'text-stone-800 cursor-pointer' : 'text-stone-400 cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!shareUrl}
                      checked={Boolean(showQr && shareUrl)}
                      onChange={(e) => setShowQr(e.target.checked)}
                      className="h-4 w-4 accent-rose-700 rounded"
                    />
                    Embed Scannable QR on Card
                  </label>
                </div>
              </div>
            </div>

            {/* Download & Caption Actions */}
            <div className="space-y-2 border-t border-stone-900/[0.07] pt-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={isDownloading || isRendering}
                  onClick={handleDownload}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-800 disabled:opacity-60 whitespace-nowrap"
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : downloadedNotice ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {downloadedNotice
                    ? 'Downloaded 1080×1920 Story PNG'
                    : 'Download Story Card (PNG)'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyCaption}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs font-semibold text-[#111113] transition-colors hover:bg-stone-50 whitespace-nowrap shrink-0"
                >
                  {copiedCaption ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedCaption ? 'Caption Copied' : 'Copy Story Caption'}
                </button>
              </div>
              <p className="text-[11px] text-stone-500">
                Top and bottom margins stay clear of Instagram&apos;s username bar and reply box.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
