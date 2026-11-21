export type GiftThemeId =
  | 'wax-letter'
  | 'midnight-polaroid'
  | 'cobalt-zine'
  | 'blush-atelier';

export type OccasionPresetId = 'birthday' | 'anniversary' | 'bestie' | 'apology';

export type GiftTier = 'free' | 'single9' | 'unlimited99';

export interface PolaroidMemory {
  id: string;
  imageUrl: string;
  caption: string;
  dateLabel: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: [string, string, string];
  correctIndex: number;
  reactionNote: string;
}

export interface OpenWhenNote {
  id: string;
  label: string;
  message: string;
}

export interface GiftConfig {
  theme: GiftThemeId;
  occasion: OccasionPresetId;
  recipientName: string;
  senderName: string;
  headline: string;
  openingLetter: string;
  specialDate: string;
  milestoneDateIso: string;
  milestoneLabel: string;
  songTitle: string;
  songArtist: string;
  songUrl: string;
  memories: PolaroidMemory[];
  reasons: string[];
  openWhenNotes: OpenWhenNote[];
  enableQuiz: boolean;
  quiz: QuizQuestion[];
  scratchLabel: string;
  scratchSecret: string;
  passcodeEnabled: boolean;
  passcode: string;
  passcodeHint: string;
  customSlug: string;
}

export interface StoredGift extends GiftConfig {
  slug: string;
  tier: GiftTier;
  createdAt: string;
}

function makeEditorialSvgDataUri(opts: {
  bg: string;
  accent: string;
  ink: string;
  title: string;
  subtitle: string;
  motif: 'chai' | 'moon' | 'vinyl' | 'train';
}): string {
  const {bg, accent, ink, title, subtitle, motif} = opts;
  let artwork = '';

  if (motif === 'chai') {
    artwork = `
      <circle cx="240" cy="145" r="78" fill="${accent}" opacity="0.16"/>
      <path d="M180 140 L195 215 Q240 228 285 215 L300 140 Z" fill="none" stroke="${ink}" stroke-width="3.5"/>
      <ellipse cx="240" cy="140" rx="60" ry="12" fill="${accent}" opacity="0.35" stroke="${ink}" stroke-width="3"/>
      <path d="M215 102 Q225 85 215 68 M242 96 Q252 76 242 58 M268 104 Q278 88 268 72" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
    `;
  } else if (motif === 'moon') {
    artwork = `
      <circle cx="240" cy="140" r="82" fill="${accent}" opacity="0.18"/>
      <path d="M258 76 A66 66 0 1 0 306 184 A52 52 0 1 1 258 76 Z" fill="${accent}" opacity="0.85"/>
      <circle cx="165" cy="95" r="3" fill="${ink}" opacity="0.5"/>
      <circle cx="322" cy="108" r="2.5" fill="${ink}" opacity="0.5"/>
      <circle cx="182" cy="198" r="2" fill="${ink}" opacity="0.4"/>
    `;
  } else if (motif === 'vinyl') {
    artwork = `
      <circle cx="240" cy="145" r="76" fill="${ink}" opacity="0.9"/>
      <circle cx="240" cy="145" r="56" fill="none" stroke="${bg}" stroke-width="1.2" opacity="0.35"/>
      <circle cx="240" cy="145" r="38" fill="none" stroke="${bg}" stroke-width="1.2" opacity="0.35"/>
      <circle cx="240" cy="145" r="22" fill="${accent}"/>
      <circle cx="240" cy="145" r="5" fill="${bg}"/>
    `;
  } else {
    artwork = `
      <rect x="130" y="95" width="220" height="115" rx="14" fill="none" stroke="${ink}" stroke-width="3"/>
      <rect x="148" y="114" width="84" height="54" rx="6" fill="${accent}" opacity="0.24" stroke="${ink}" stroke-width="2"/>
      <rect x="248" y="114" width="84" height="54" rx="6" fill="${accent}" opacity="0.16" stroke="${ink}" stroke-width="2"/>
      <line x1="110" y1="225" x2="370" y2="225" stroke="${ink}" stroke-width="2.5" stroke-dasharray="8 8"/>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 340" width="480" height="340">
    <rect width="480" height="340" fill="${bg}"/>
    <rect x="18" y="18" width="444" height="304" fill="none" stroke="${ink}" stroke-opacity="0.14" stroke-width="1.5"/>
    ${artwork}
    <text x="240" y="274" text-anchor="middle" font-family="Georgia, serif" font-size="20" font-weight="700" fill="${ink}">${title}</text>
    <text x="240" y="298" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" letter-spacing="1.5" fill="${ink}" opacity="0.65">${subtitle}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const SAMPLE_IMAGES = {
  rooftopChai: makeEditorialSvgDataUri({
    bg: '#F4EFE6',
    accent: '#B91C1C',
    ink: '#1C1917',
    title: 'Tapri Chai & 2 AM Talks',
    subtitle: 'UPLOAD YOUR OWN PHOTO HERE',
    motif: 'chai',
  }),
  midnightMoon: makeEditorialSvgDataUri({
    bg: '#16161A',
    accent: '#F59E0B',
    ink: '#FAF8F5',
    title: '12:00 AM Rooftop Call',
    subtitle: 'REPLACE WITH YOUR MEMORY',
    motif: 'moon',
  }),
  drivePlaylist: makeEditorialSvgDataUri({
    bg: '#EFF4FA',
    accent: '#2563EB',
    ink: '#0F172A',
    title: 'Late Night Drive Playlist',
    subtitle: 'ADD ANY PHONE SNAPSHOT',
    motif: 'vinyl',
  }),
  stationBye: makeEditorialSvgDataUri({
    bg: '#F5F3EE',
    accent: '#059669',
    ink: '#18181B',
    title: 'Last Train Back Home',
    subtitle: 'UPLOAD YOUR PHOTO',
    motif: 'train',
  }),
};

export const THEME_OPTIONS: Record<
  GiftThemeId,
  {name: string; tagline: string; surfaceClass: string; accentHex: string}
> = {
  'wax-letter': {
    name: 'Wax Seal Paper',
    tagline: 'Archival cream paper & crimson seal',
    surfaceClass: 'bg-[#FAF7F2] text-stone-900',
    accentHex: '#B91C1C',
  },
  'midnight-polaroid': {
    name: 'Midnight Polaroid',
    tagline: 'Obsidian dark with warm amber glow',
    surfaceClass: 'bg-[#121215] text-stone-100',
    accentHex: '#F59E0B',
  },
  'blush-atelier': {
    name: 'Blush Atelier',
    tagline: 'Soft rose linen & deep plum ink',
    surfaceClass: 'bg-[#FDF4F5] text-rose-950',
    accentHex: '#BE123C',
  },
  'cobalt-zine': {
    name: 'Cobalt Zine',
    tagline: 'Crisp newsprint & electric blue',
    surfaceClass: 'bg-[#F8FAFC] text-slate-950',
    accentHex: '#2563EB',
  },
};

export const WRITER_HELPERS: Record<OccasionPresetId, string[]> = {
  birthday: [
    'Distance sucks tonight, so I built a tiny corner of the internet to celebrate every stupid and favorite memory we share.',
    'Another year older, still the person I text first whenever literally anything happens—good or chaotic.',
    'You make ordinary Tuesdays feel like Friday nights. Happy birthday to my favorite human.',
  ],
  anniversary: [
    'Two years later, you are still my calmest evening walk and my favorite notification on any screen.',
    'Thank you for choosing patience, laughter, and late-night honesty with me every single month.',
    'No fancy speech needed—just grateful I get to do life alongside you.',
  ],
  bestie: [
    'Zero emotional speeches—just documented proof of why you are stuck with me for life (and owe me momos).',
    'From surviving boring lectures to 2 AM overthinking calls, thank you for never letting me spiral alone.',
    'Half my camera roll is blurry photos of you laughing. Never change.',
  ],
  apology: [
    'A plain sorry text felt too lazy for how badly I messed up yesterday. You deserved listening, not ego.',
    'I hate going to sleep knowing I hurt you. Read this when you have a quiet minute.',
    'No excuses from my side—just genuinely sorry and ready to make it right.',
  ],
};

export const OCCASION_PRESETS: Record<OccasionPresetId, GiftConfig> = {
  birthday: {
    theme: 'midnight-polaroid',
    occasion: 'birthday',
    recipientName: 'Riya',
    senderName: 'Aarav',
    headline: 'Happy 22nd, Riya — open this at 12:00 AM.',
    openingLetter:
      'Distance sucks tonight, so instead of sending a boring WhatsApp paragraph, I put together a tiny private corner of the internet for our favorite moments.',
    specialDate: '20 Nov',
    milestoneDateIso: '2024-03-14',
    milestoneLabel: 'Time we have been unstoppable',
    songTitle: 'Qaafirana',
    songArtist: 'Arijit Singh & Nikhita Gandhi',
    songUrl: 'https://open.spotify.com/search/Qaafirana',
    memories: [
      {
        id: 'm1',
        imageUrl: SAMPLE_IMAGES.rooftopChai,
        caption: 'Two kulhads of adrak chai and three hours of nonstop gossip.',
        dateLabel: 'Oct 2024',
      },
      {
        id: 'm2',
        imageUrl: SAMPLE_IMAGES.midnightMoon,
        caption: 'Still laughing at how we stayed on call till battery hit 1%.',
        dateLabel: 'Jan 2025',
      },
      {
        id: 'm3',
        imageUrl: SAMPLE_IMAGES.drivePlaylist,
        caption: 'Your exact reaction when the chorus dropped on Marine Drive.',
        dateLabel: 'Aug 2025',
      },
    ],
    reasons: [
      'You remember the smallest details people casually mention once.',
      'Your 2 AM voice notes fix every bad week automatically.',
      'You make even waiting in traffic feel like a good memory.',
    ],
    openWhenNotes: [
      {
        id: 'ow1',
        label: 'Open when you miss home',
        message: 'Put on your headphones, make masala chai, and call me—no matter the hour.',
      },
      {
        id: 'ow2',
        label: 'Open when life feels overwhelming',
        message: 'Breathe. You have already survived 100% of the days you thought would break you.',
      },
      {
        id: 'ow3',
        label: 'Open when you need a smile',
        message: 'Remember when you confidently walked into the wrong classroom and stayed for 15 mins?',
      },
    ],
    enableQuiz: true,
    quiz: [
      {
        id: 'q1',
        prompt: 'Who always orders extra fries after saying "I am full"?',
        options: ['Definitely Riya', 'Aarav (rarely)', 'Both of us'],
        correctIndex: 0,
        reactionNote: 'Every single time. Zero regrets.',
      },
      {
        id: 'q2',
        prompt: 'What is our undisputed 2 AM comfort plan?',
        options: ['Overthinking life', 'Chai + Maggi + rant', 'Sleeping early (lie)'],
        correctIndex: 1,
        reactionNote: 'Maggi fixes 90% of hostel problems.',
      },
    ],
    scratchLabel: 'Scratch the foil for your real birthday gift',
    scratchSecret:
      'Check your doorstep at 12:15 PM tomorrow — your favorite dark chocolate bento cake + polaroid print is already ordered!',
    passcodeEnabled: false,
    passcode: '2011',
    passcodeHint: 'Your birthday date (DDMM)',
    customSlug: 'happy-22-riya',
  },
  anniversary: {
    theme: 'blush-atelier',
    occasion: 'anniversary',
    recipientName: 'Ananya',
    senderName: 'Kabir',
    headline: 'Two years of choosing you, every single day.',
    openingLetter:
      'Two years later, you are still my favorite notification, my calmest evening walk, and the only person I want to tell boring Tuesday news to.',
    specialDate: '2 Years',
    milestoneDateIso: '2024-11-20',
    milestoneLabel: 'Every second since day one',
    songTitle: 'Tera Ban Jaunga',
    songArtist: 'Akhil Sachdeva & Tulsi Kumar',
    songUrl: 'https://open.spotify.com/search/Tera%20Ban%20Jaunga',
    memories: [
      {
        id: 'a1',
        imageUrl: SAMPLE_IMAGES.stationBye,
        caption: 'The first goodbye at the station that felt way too short.',
        dateLabel: 'Nov 2024',
      },
      {
        id: 'a2',
        imageUrl: SAMPLE_IMAGES.rooftopChai,
        caption: 'Our unofficial Sunday spot — same table, same order.',
        dateLabel: 'Mar 2025',
      },
      {
        id: 'a3',
        imageUrl: SAMPLE_IMAGES.midnightMoon,
        caption: 'Zero fancy plans, just terrace breeze and quiet peace.',
        dateLabel: 'Sep 2025',
      },
    ],
    reasons: [
      'The way your eyes light up whenever you talk about food or travel.',
      'How safe and effortless silence feels whenever you are around.',
      'You never let me settle for less than my own potential.',
    ],
    openWhenNotes: [
      {
        id: 'aow1',
        label: 'Open when we are apart',
        message: 'Look at the timer above—even miles apart, every second belongs to us.',
      },
      {
        id: 'aow2',
        label: 'Open after a rough day',
        message: 'Today stays outside the door. Come sit, rant for 20 minutes, I am listening.',
      },
    ],
    enableQuiz: true,
    quiz: [
      {
        id: 'aq1',
        prompt: 'Where did we have our longest awkward-turned-best conversation?',
        options: ['Coffee shop corner', 'Metro ride back', 'Campus library'],
        correctIndex: 0,
        reactionNote: 'That iced latte lasted 4 hours.',
      },
    ],
    scratchLabel: 'Scratch to reveal our weekend date plan',
    scratchSecret:
      'This Saturday 6 PM: No phones, sunset walk + dinner at our very first date spot. Dress warm!',
    passcodeEnabled: true,
    passcode: '1402',
    passcodeHint: 'Our special date (DDMM)',
    customSlug: 'two-years-ananya',
  },
  bestie: {
    theme: 'cobalt-zine',
    occasion: 'bestie',
    recipientName: 'Siddharth',
    senderName: 'Rohan',
    headline: 'Official Bestie Audit: 4 years of terrible decisions.',
    openingLetter:
      'Congrats on surviving another year without getting kicked out of the WhatsApp group. Here is documented proof of why you owe me momos.',
    specialDate: 'Bestie Day',
    milestoneDateIso: '2022-08-10',
    milestoneLabel: 'Time surviving each other',
    songTitle: 'Ilahi',
    songArtist: 'Arijit Singh',
    songUrl: 'https://open.spotify.com/search/Ilahi',
    memories: [
      {
        id: 'b1',
        imageUrl: SAMPLE_IMAGES.rooftopChai,
        caption: 'Discussing startup ideas we forgot by Monday morning.',
        dateLabel: 'Sem 3',
      },
      {
        id: 'b2',
        imageUrl: SAMPLE_IMAGES.drivePlaylist,
        caption: 'Goa plan #4 that actually left the group chat.',
        dateLabel: 'Sem 6',
      },
    ],
    reasons: [
      'Always picks up on the second ring during any crisis.',
      'Delivers brutally honest outfit & life checks when needed.',
      'Zero judgment, maximum chaos.',
    ],
    openWhenNotes: [
      {
        id: 'bow1',
        label: 'Open when broke before month-end',
        message: 'Maggi & hostel tapri is on me tonight. Pull up.',
      },
      {
        id: 'bow2',
        label: 'Open before an interview',
        message: 'You are sharper than half the crowd in that room. Go cook.',
      },
    ],
    enableQuiz: true,
    quiz: [
      {
        id: 'bq1',
        prompt: 'Who cancels plans 20 minutes before meetup?',
        options: ['Siddharth always', 'Rohan sometimes', 'Both blame traffic'],
        correctIndex: 0,
        reactionNote: '"Bro just leaving" = still in towel.',
      },
    ],
    scratchLabel: 'Scratch for your unpaid debt voucher',
    scratchSecret:
      'Redeemable once: One plate of steamed momos + cold coffee on me tonight. Screenshot this!',
    passcodeEnabled: false,
    passcode: '0000',
    passcodeHint: 'Our hostel room number',
    customSlug: 'bestie-roast-sid',
  },
  apology: {
    theme: 'wax-letter',
    occasion: 'apology',
    recipientName: 'Meera',
    senderName: 'Dev',
    headline: 'I messed up — please read this before staying mad.',
    openingLetter:
      'A quick "sorry" text felt way too lazy for how badly I handled yesterday. You deserved patience and listening, not ego.',
    specialDate: 'Peace Treaty',
    milestoneDateIso: '2024-06-01',
    milestoneLabel: 'Days you have meant the world',
    songTitle: 'Choo Lo',
    songArtist: 'The Local Train',
    songUrl: 'https://open.spotify.com/search/Choo%20Lo%20The%20Local%20Train',
    memories: [
      {
        id: 'p1',
        imageUrl: SAMPLE_IMAGES.rooftopChai,
        caption: 'Remembering how easy things feel when we actually talk.',
        dateLabel: 'Always',
      },
    ],
    reasons: [
      'You never fake care—when you show up, you show up fully.',
      'Every honest conversation with you makes me a better person.',
    ],
    openWhenNotes: [
      {
        id: 'pow1',
        label: 'Open when you want zero excuses',
        message: 'I was wrong yesterday. Take all the space you need—I am right here when you want to talk.',
      },
    ],
    enableQuiz: false,
    quiz: [],
    scratchLabel: 'Scratch for my peace offering',
    scratchSecret:
      'Zero excuses. Whenever you are ready, I am bringing iced coffee + brownies outside your gate at 5 PM.',
    passcodeEnabled: false,
    passcode: '1234',
    passcodeHint: 'Passcode hint',
    customSlug: 'peace-treaty-meera',
  },
};
