import QRCode from 'qrcode';
import {type GiftConfig, THEME_OPTIONS} from '../types/gift';

export type StoryLayoutStyle = 'polaroid' | 'ticket' | 'poster';

export interface StoryRenderOptions {
  layout: StoryLayoutStyle;
  uniqueCode: string;
  showCode: boolean;
  showDays: boolean;
  showQr?: boolean;
  shareUrl?: string;
}

export function buildGiftShareUrl(slug: string): string {
  if (typeof window === 'undefined') return `/?gift=${encodeURIComponent(slug)}`;
  return `${window.location.origin}/?gift=${encodeURIComponent(slug)}`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

export function deriveUniqueCode(gift: GiftConfig, publishedSlug?: string): string {
  if (publishedSlug) {
    return publishedSlug.toUpperCase().slice(0, 18);
  }
  const base = (gift.customSlug || gift.recipientName || 'KEEPSAKE')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
  return `KP-${base || 'GIFT'}`;
}

export async function renderStoryCardDataUrl(
  gift: GiftConfig,
  options: StoryRenderOptions,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const theme = THEME_OPTIONS[gift.theme];
  const isDarkTheme = gift.theme === 'midnight-polaroid' || options.layout === 'ticket';

  const bg =
    options.layout === 'ticket'
      ? '#111114'
      : gift.theme === 'midnight-polaroid'
        ? '#121215'
        : gift.theme === 'blush-atelier'
          ? '#FDF4F5'
          : gift.theme === 'cobalt-zine'
            ? '#F6F9FC'
            : '#FAF7F2';

  const ink = isDarkTheme ? '#FAF8F5' : '#161619';
  const muted = isDarkTheme ? 'rgba(250,248,245,0.62)' : 'rgba(22,22,25,0.58)';
  const hairline = isDarkTheme ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.11)';

  // Canvas Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle archival dot/grid texture for poster & ticket layouts
  if (options.layout !== 'polaroid') {
    ctx.fillStyle = isDarkTheme ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)';
    for (let gx = 72; gx <= 1008; gx += 48) {
      for (let gy = 180; gy <= 1680; gy += 48) {
        ctx.fillRect(gx, gy, 2, 2);
      }
    }
  }

  // Outer editorial border (respecting IG Story safe top 160px & bottom 220px zones)
  ctx.strokeStyle = hairline;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(56, 150, 968, 1540);

  // Top Meta Strip
  ctx.fillStyle = theme.accentHex;
  ctx.font = '600 26px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `FOR ${gift.recipientName.toUpperCase()}  ·  ${(gift.specialDate || 'KEEPSAKE').toUpperCase()}`,
    540,
    236,
  );

  // Headline
  ctx.fillStyle = ink;
  ctx.font = '700 64px "Fraunces", Georgia, serif';
  const headLines = wrapText(ctx, gift.headline || `A surprise for ${gift.recipientName}`, 840, 3);
  headLines.forEach((line, i) => {
    ctx.fillText(line, 540, 336 + i * 78);
  });

  // Main Center Visual Block
  const centerY = 580;
  const firstMemory = gift.memories[0];

  if (options.layout === 'polaroid' || options.layout === 'poster') {
    // Polaroid / Editorial Card Frame
    const frameW = 790;
    const frameH = 730;
    const frameX = (1080 - frameW) / 2;

    ctx.save();
    if (options.layout === 'polaroid') {
      ctx.translate(540, centerY + frameH / 2);
      ctx.rotate(-0.022);
      ctx.translate(-540, -(centerY + frameH / 2));
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.fillRect(frameX, centerY, frameW, frameH);
    ctx.shadowColor = 'transparent';

    if (options.layout === 'poster') {
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 2;
      ctx.strokeRect(frameX, centerY, frameW, frameH);
    }

    if (firstMemory?.imageUrl) {
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = firstMemory.imageUrl;
        });
        // Cover-crop cleanly inside 718x520
        const targetW = 718;
        const targetH = 520;
        const targetX = frameX + 36;
        const targetY = centerY + 36;
        const imgRatio = img.width / img.height;
        const boxRatio = targetW / targetH;
        let sx = 0;
        let sy = 0;
        let sw = img.width;
        let sh = img.height;
        if (imgRatio > boxRatio) {
          sw = img.height * boxRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / boxRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, targetX, targetY, targetW, targetH);
      } catch {
        ctx.fillStyle = '#E4E4E7';
        ctx.fillRect(frameX + 36, centerY + 36, 718, 520);
      }
    }

    ctx.fillStyle = '#18181B';
    ctx.font = '600 32px Georgia, serif';
    const capLines = wrapText(ctx, firstMemory?.caption || gift.openingLetter, 690, 2);
    capLines.forEach((line, idx) => {
      ctx.fillText(line, 540, centerY + 625 + idx * 42);
    });
    ctx.restore();
  } else {
    // Ticket Layout: Dark Pass with circular photo + perforated divider
    const cardX = 115;
    const cardW = 850;
    const cardH = 740;

    ctx.fillStyle = '#1B1B20';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cardX, centerY, cardW, cardH, 28);
    ctx.fill();
    ctx.stroke();

    // Accent Top Bar inside ticket
    ctx.fillStyle = theme.accentHex;
    ctx.fillRect(cardX + 48, centerY + 44, 120, 6);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PRIVATE KEEPSAKE PASS', cardX + 48, centerY + 95);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 44px "Fraunces", Georgia, serif';
    ctx.fillText(`To: ${gift.recipientName}`, cardX + 48, centerY + 165);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '500 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`From: ${gift.senderName}`, cardX + 48, centerY + 215);

    // Embedded Letter Snippet
    ctx.fillStyle = 'rgba(255,255,255,0.84)';
    ctx.font = '400 30px Georgia, serif';
    const letterLines = wrapText(ctx, `"${gift.openingLetter}"`, 740, 4);
    letterLines.forEach((line, idx) => {
      ctx.fillText(line, cardX + 48, centerY + 300 + idx * 44);
    });

    // Perforated horizontal line
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.moveTo(cardX + 32, centerY + 530);
    ctx.lineTo(cardX + cardW - 32, centerY + 530);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = theme.accentHex;
    ctx.font = '700 26px "JetBrains Mono", monospace';
    ctx.fillText(
      gift.songTitle ? `TRACK: ${gift.songTitle.toUpperCase()}` : 'SECRET SURPRISE UNLOCKED',
      cardX + 48,
      centerY + 605,
    );

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText(
      gift.passcodeEnabled ? `HINT: ${gift.passcodeHint.toUpperCase()}` : 'TAP LINK TO OPEN SEAL',
      cardX + 48,
      centerY + 655,
    );

    // Optional mini QR on right of stub
    if (options.showQr !== false && options.shareUrl) {
      try {
        const qrUri = await QRCode.toDataURL(options.shareUrl, {
          width: 140,
          margin: 1,
          color: {dark: '#FFFFFF', light: '#1B1B20'},
        });
        const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = qrUri;
        });
        ctx.drawImage(qrImg, cardX + cardW - 185, centerY + 558, 136, 136);
      } catch {
        // Skip QR if generation fails
      }
    }
    ctx.textAlign = 'center';
  }

  const hasSideQr =
    options.layout !== 'ticket' && Boolean(options.showQr && options.shareUrl);

  const hasDays = Boolean(
    options.showDays &&
      gift.milestoneDateIso &&
      !Number.isNaN(Date.parse(gift.milestoneDateIso)),
  );

  if (hasSideQr && options.shareUrl) {
    // Balanced 2-column footer strip: Left = Days + Code, Right = Scannable QR Card
    const hasLeftContent = hasDays || options.showCode;
    const leftCenterX = hasLeftContent ? 395 : 540;

    let leftY = 1405;
    if (hasDays) {
      const startMs = Date.parse(gift.milestoneDateIso);
      const days = Math.max(0, Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24)));
      ctx.fillStyle = theme.accentHex;
      ctx.font = '700 34px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${days.toLocaleString()} DAYS & COUNTING`, leftCenterX, leftY);
      leftY += 68;
    }

    if (options.showCode) {
      const boxW = 490;
      const boxH = 84;
      const boxX = leftCenterX - boxW / 2;
      const boxY = hasDays ? leftY - 34 : 1406;

      ctx.fillStyle = isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
      ctx.strokeStyle = theme.accentHex;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = ink;
      ctx.font = '700 30px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`CODE: ${options.uniqueCode}`, leftCenterX, boxY + 53);
    }

    try {
      const qrUri = await QRCode.toDataURL(options.shareUrl, {
        width: 220,
        margin: 1,
        color: {dark: '#161619', light: '#FFFFFF'},
      });
      const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = qrUri;
      });

      const qrCardW = 166;
      const qrCardH = 192;
      const qrCardX = hasLeftContent ? 730 : (1080 - qrCardW) / 2;
      const qrCardY = 1348;

      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = hairline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(qrCardX, qrCardY, qrCardW, qrCardH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.drawImage(qrImg, qrCardX + 16, qrCardY + 14, 134, 134);

      ctx.fillStyle = '#161619';
      ctx.font = '700 17px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SCAN TO OPEN', qrCardX + qrCardW / 2, qrCardY + 174);
    } catch {
      // Ignore QR draw error
    }
  } else {
    // Centered Days Counter & Unique Code Box
    let nextY = 1405;
    if (hasDays) {
      const startMs = Date.parse(gift.milestoneDateIso);
      const days = Math.max(0, Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24)));
      ctx.fillStyle = theme.accentHex;
      ctx.font = '700 38px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${days.toLocaleString()} DAYS & COUNTING`, 540, nextY);
      nextY += 72;
    }

    if (options.showCode) {
      const boxW = 540;
      const boxH = 88;
      const boxX = (1080 - boxW) / 2;
      const boxY = nextY - 38;

      ctx.fillStyle = isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
      ctx.strokeStyle = theme.accentHex;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = ink;
      ctx.font = '700 32px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`CODE: ${options.uniqueCode}`, 540, boxY + 55);
    }
  }

  // Signature + IG Safe-Zone Footer
  ctx.fillStyle = ink;
  ctx.font = '600 34px "Fraunces", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(`— Sent by ${gift.senderName}`, 540, 1595);

  ctx.fillStyle = muted;
  ctx.font = '500 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Made with Keepsake · Build yours in 3 mins', 540, 1650);

  return canvas.toDataURL('image/png');
}

export async function downloadStoryCardPng(
  gift: GiftConfig,
  options: StoryRenderOptions,
): Promise<void> {
  const dataUrl = await renderStoryCardDataUrl(gift, options);
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.download = `Keepsake-${gift.recipientName.replace(/\s+/g, '-')}-IG-Story.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function generateGiftQrDataUrl(shareUrl: string): Promise<string> {
  if (!shareUrl) return '';
  return QRCode.toDataURL(shareUrl, {
    width: 512,
    margin: 2,
    color: {dark: '#161619', light: '#FFFFFF'},
  });
}

export async function downloadPrintableQrPng(
  gift: GiftConfig,
  shareUrl: string,
  uniqueCode: string,
): Promise<void> {
  const qrDataUrl = await generateGiftQrDataUrl(shareUrl);
  if (!qrDataUrl) return;

  const canvas = document.createElement('canvas');
  canvas.width = 760;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const theme = THEME_OPTIONS[gift.theme];

  // Crisp ivory archival gift tag backdrop
  ctx.fillStyle = '#FAF7F2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(22,22,25,0.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

  // Header
  ctx.fillStyle = theme.accentHex;
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`FOR ${gift.recipientName.toUpperCase()}`, 380, 110);

  ctx.fillStyle = '#161619';
  ctx.font = '700 36px "Fraunces", Georgia, serif';
  ctx.fillText('Scan for Your Surprise', 380, 165);

  // White QR container card
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = 'rgba(22,22,25,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(140, 215, 480, 480, 24);
  ctx.fill();
  ctx.stroke();

  const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = qrDataUrl;
  });
  ctx.drawImage(qrImg, 175, 250, 410, 410);

  // Unique code & sender footer
  ctx.fillStyle = '#161619';
  ctx.font = '700 26px "JetBrains Mono", monospace';
  ctx.fillText(`CODE: ${uniqueCode}`, 380, 765);

  ctx.fillStyle = 'rgba(22,22,25,0.62)';
  ctx.font = '500 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`From ${gift.senderName} · Point phone camera to open`, 380, 825);

  ctx.fillStyle = 'rgba(22,22,25,0.45)';
  ctx.font = '500 18px "JetBrains Mono", monospace';
  ctx.fillText(shareUrl.replace(/^https?:\/\//, '').slice(0, 46), 380, 875);

  const link = document.createElement('a');
  link.download = `Keepsake-${gift.recipientName.replace(/\s+/g, '-')}-Print-QR.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
