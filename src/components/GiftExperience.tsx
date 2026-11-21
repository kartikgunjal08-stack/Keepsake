import {useEffect, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Lock,
  Mail,
  MailOpen,
  Music,
  RotateCcw,
} from 'lucide-react';
import {type GiftConfig, THEME_OPTIONS} from '../types/gift';
import {deriveUniqueCode} from '../utils/storyCardExport';
import {ScratchCard} from './ScratchCard';
import {StoryCardModal} from './StoryCardModal';

interface GiftExperienceProps {
  gift: GiftConfig;
  publishedSlug?: string;
  isStandaloneView?: boolean;
  onCreateOwn?: () => void;
}

function computeElapsed(isoDate: string) {
  const start = Date.parse(isoDate);
  if (Number.isNaN(start)) return null;
  const diff = Math.max(0, Date.now() - start);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  return {days, hours, mins, secs};
}

export function GiftExperience({
  gift,
  publishedSlug,
  isStandaloneView = false,
  onCreateOwn,
}: GiftExperienceProps) {
  const [envelopeOpened, setEnvelopeOpened] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [flippedReasons, setFlippedReasons] = useState<Record<number, boolean>>({});
  const [openedEnvelopes, setOpenedEnvelopes] = useState<Record<string, boolean>>({});
  const [vinylSpinning, setVinylSpinning] = useState(true);
  const [storyModalOpen, setStoryModalOpen] = useState(false);

  const [elapsed, setElapsed] = useState(() => computeElapsed(gift.milestoneDateIso));
  const uniqueCode = deriveUniqueCode(gift, publishedSlug);

  const theme = THEME_OPTIONS[gift.theme];
  const isDark = gift.theme === 'midnight-polaroid';

  useEffect(() => {
    setActivePhotoIdx(0);
    setQuizAnswers({});
    setFlippedReasons({});
    setOpenedEnvelopes({});
    setPasscodeInput('');
    setPasscodeError('');
  }, [gift.occasion, gift.theme]);

  useEffect(() => {
    setElapsed(computeElapsed(gift.milestoneDateIso));
    if (!gift.milestoneDateIso) return;
    const timer = window.setInterval(() => {
      setElapsed(computeElapsed(gift.milestoneDateIso));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [gift.milestoneDateIso]);

  const handleOpenEnvelope = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (gift.passcodeEnabled) {
      if (passcodeInput.trim() !== gift.passcode.trim()) {
        setPasscodeError('Wrong code — check the hint below.');
        return;
      }
    }
    setPasscodeError('');
    setEnvelopeOpened(true);
  };

  const memories = gift.memories.length > 0 ? gift.memories : [];
  const currentMemory = memories[activePhotoIdx] || memories[0];

  const handlePrevPhoto = () => {
    setActivePhotoIdx((prev) => (prev === 0 ? memories.length - 1 : prev - 1));
  };

  const handleNextPhoto = () => {
    setActivePhotoIdx((prev) => (prev === memories.length - 1 ? 0 : prev + 1));
  };

  const cardSurface = isDark
    ? 'border-stone-800 bg-stone-900/95 text-stone-100'
    : 'border-stone-200 bg-white text-stone-900';

  const subtlePanel = isDark
    ? 'border-stone-800 bg-stone-950/70'
    : 'border-stone-200 bg-stone-50/90';

  const mutedText = isDark ? 'text-stone-400' : 'text-stone-500';
  const bodyText = isDark ? 'text-stone-300' : 'text-stone-700';

  return (
    <div
      className={`min-h-full w-full transition-colors duration-200 ${theme.surfaceClass} ${
        isStandaloneView ? 'min-h-screen py-8 px-4 sm:py-12' : 'p-4'
      }`}
    >
      <div className={`mx-auto w-full ${isStandaloneView ? 'max-w-md' : 'max-w-full'} space-y-5`}>
        <AnimatePresence mode="wait">
          {!envelopeOpened ? (
            /* Stage 1: Sealed Wax Envelope / Passcode Gate */
            <motion.div
              key="envelope-closed"
              initial={{opacity: 0, y: 10}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, scale: 0.96}}
              transition={{duration: 0.25}}
              className={`relative overflow-hidden rounded-[24px] border p-7 text-center space-y-6 shadow-sm ${cardSurface} ${
                isStandaloneView ? 'mt-8' : 'my-4'
              }`}
            >
              {/* Subtle top envelope hairline */}
              <div
                className="pointer-events-none mx-auto h-px w-24 opacity-35"
                style={{backgroundColor: theme.accentHex}}
              />

              <div className="space-y-1.5">
                <p className={`font-mono text-[11px] tracking-wider ${mutedText}`}>
                  Private Keepsake · {gift.specialDate || 'For You'}
                </p>
                <h2 className="font-display text-3xl font-bold tracking-tight">
                  For {gift.recipientName || 'You'}
                </h2>
                <p className={`text-xs ${mutedText}`}>
                  Handcrafted by {gift.senderName || 'Someone special'}
                </p>
              </div>

              {/* Wax Seal Visual Button */}
              <div className="py-2 flex justify-center">
                <motion.button
                  type="button"
                  whileHover={{scale: 1.04}}
                  whileTap={{scale: 0.94}}
                  onClick={() => (!gift.passcodeEnabled ? handleOpenEnvelope() : undefined)}
                  className="relative flex h-24 w-24 items-center justify-center rounded-full shadow-[0_14px_30px_-8px_rgba(0,0,0,0.35)]"
                  style={{backgroundColor: theme.accentHex}}
                  aria-label="Open surprise envelope"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/45 text-white font-display text-2xl italic font-semibold">
                    {(gift.senderName || 'K').charAt(0).toUpperCase()}
                  </span>
                </motion.button>
              </div>

              {gift.passcodeEnabled ? (
                <form onSubmit={handleOpenEnvelope} className="space-y-3 text-left">
                  <div className="space-y-1 text-center">
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold">
                      <Lock className="h-3.5 w-3.5" style={{color: theme.accentHex}} />
                      Passcode Locked
                    </p>
                    <p className={`text-xs ${mutedText}`}>Hint: {gift.passcodeHint || 'Special date'}</p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={8}
                      value={passcodeInput}
                      onChange={(e) => setPasscodeInput(e.target.value)}
                      placeholder="Enter code"
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-center font-mono text-sm tracking-widest focus:outline-none ${
                        isDark
                          ? 'border-stone-700 bg-stone-950 text-white placeholder:text-stone-600'
                          : 'border-stone-300 bg-stone-50 text-stone-900 placeholder:text-stone-400'
                      }`}
                    />
                    <button
                      type="submit"
                      className="rounded-xl px-4 py-2.5 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      style={{backgroundColor: theme.accentHex}}
                    >
                      Unlock
                    </button>
                  </div>
                  {passcodeError && (
                    <p className="text-center text-xs font-medium text-red-500">{passcodeError}</p>
                  )}
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => handleOpenEnvelope()}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-95"
                  style={{backgroundColor: theme.accentHex}}
                >
                  Tap Wax Seal to Open
                </button>
              )}
            </motion.div>
          ) : (
            /* Stage 2–7: Full Interactive Surprise Flow */
            <motion.div
              key="envelope-opened"
              initial={{opacity: 0, y: 12}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: 0.2}}
              className="space-y-5"
            >
              {/* Top Utility Bar */}
              <div className="flex items-center justify-between text-[11px]">
                <span className={`font-mono tracking-wide ${mutedText}`}>
                  For {gift.recipientName} · {gift.specialDate}
                </span>
                <button
                  type="button"
                  onClick={() => setEnvelopeOpened(false)}
                  className={`inline-flex items-center gap-1 hover:underline ${mutedText}`}
                >
                  <RotateCcw className="h-3 w-3" />
                  Lock envelope
                </button>
              </div>

              {/* Opening Letter */}
              <div className={`rounded-[24px] border p-6 space-y-4 ${cardSurface}`}>
                <h2 className="font-display text-2xl font-bold leading-snug tracking-tight">
                  {gift.headline}
                </h2>
                <p className={`text-sm leading-relaxed ${bodyText}`}>{gift.openingLetter}</p>
                <p className="font-display text-sm italic font-semibold" style={{color: theme.accentHex}}>
                  — {gift.senderName}
                </p>
              </div>

              {/* Live Milestone Clock */}
              {elapsed && (
                <div className={`rounded-[24px] border p-4 text-center space-y-2.5 ${cardSurface}`}>
                  <p className={`font-mono text-[10px] tracking-wider ${mutedText}`}>
                    {gift.milestoneLabel || 'Time Since Our Day One'}
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      [elapsed.days, 'Days'],
                      [elapsed.hours, 'Hrs'],
                      [elapsed.mins, 'Mins'],
                      [elapsed.secs, 'Secs'],
                    ].map(([val, label]) => (
                      <div key={String(label)} className={`rounded-lg border py-2 ${subtlePanel}`}>
                        <div className="font-mono text-lg font-bold tabular-nums leading-none">
                          {String(val).padStart(2, '0')}
                        </div>
                        <div className={`mt-1 text-[10px] uppercase tracking-wide ${mutedText}`}>
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Spinning Vinyl Dedication Song */}
              {gift.songTitle.trim() && (
                <div
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 ${cardSurface}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => setVinylSpinning((s) => !s)}
                      aria-label="Toggle vinyl spin"
                      className={`relative flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-white shrink-0 ${
                        vinylSpinning ? 'animate-[spin_6s_linear_infinite]' : ''
                      }`}
                    >
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded-full"
                        style={{backgroundColor: theme.accentHex}}
                      >
                        <Music className="h-2.5 w-2.5 text-white" />
                      </span>
                    </button>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{gift.songTitle}</p>
                      <p className={`truncate text-[11px] ${mutedText}`}>
                        {gift.songArtist || 'Our track'}
                      </p>
                    </div>
                  </div>
                  {gift.songUrl.trim() && (
                    <a
                      href={gift.songUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 whitespace-nowrap shrink-0"
                      style={{backgroundColor: theme.accentHex}}
                    >
                      Listen
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}

              {/* Polaroid Memory Deck */}
              {currentMemory && (
                <div className={`rounded-2xl border p-4 space-y-3 ${cardSurface}`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-[11px] tabular-nums ${mutedText}`}>
                      Memory {activePhotoIdx + 1} / {memories.length}
                    </span>
                    {memories.length > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handlePrevPhoto}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-current/15 hover:opacity-75"
                          aria-label="Previous memory"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleNextPhoto}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-current/15 hover:opacity-75"
                          aria-label="Next memory"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentMemory.id}
                      initial={{opacity: 0, rotate: activePhotoIdx % 2 === 0 ? -1.5 : 1.5}}
                      animate={{opacity: 1, rotate: activePhotoIdx % 2 === 0 ? -0.6 : 0.6}}
                      exit={{opacity: 0}}
                      transition={{duration: 0.2}}
                      className="rounded-lg bg-white p-2.5 pb-4 text-stone-900 shadow-sm border border-stone-200"
                    >
                      <div className="aspect-[4/3] w-full overflow-hidden rounded-sm bg-stone-100">
                        <img
                          src={currentMemory.imageUrl}
                          alt={currentMemory.caption || 'Memory snapshot'}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="mt-3 px-1 space-y-1">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-stone-400">
                          {currentMemory.dateLabel}
                        </p>
                        <p className="font-display text-sm font-semibold text-stone-900">
                          {currentMemory.caption}
                        </p>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}

              {/* Appreciation Flip Cards */}
              {gift.reasons.length > 0 && (
                <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
                  <div>
                    <p className={`font-mono text-[10px] uppercase tracking-widest ${mutedText}`}>
                      Tap Each Card
                    </p>
                    <h3 className="font-display text-lg font-bold">
                      Things I Never Say Enough
                    </h3>
                  </div>
                  <div className="grid gap-2.5">
                    {gift.reasons.map((reason, idx) => {
                      const isFlipped = !!flippedReasons[idx];
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            setFlippedReasons((prev) => ({...prev, [idx]: !prev[idx]}))
                          }
                          className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                            isFlipped
                              ? cardSurface
                              : subtlePanel
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="font-mono text-[11px] font-bold tabular-nums"
                              style={{color: theme.accentHex}}
                            >
                              0{idx + 1}
                            </span>
                            <span className={`text-[10px] font-medium ${mutedText}`}>
                              {isFlipped ? 'Revealed' : 'Tap to flip'}
                            </span>
                          </div>
                          {isFlipped && (
                            <p className="mt-2 font-display text-sm leading-relaxed font-medium">
                              {reason}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Open When Mood Envelopes */}
              {gift.openWhenNotes.length > 0 && (
                <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
                  <div>
                    <p className={`font-mono text-[10px] uppercase tracking-widest ${mutedText}`}>
                      Keep This Link Saved
                    </p>
                    <h3 className="font-display text-lg font-bold">Open When...</h3>
                  </div>
                  <div className="divide-y divide-current/10">
                    {gift.openWhenNotes.map((note) => {
                      const isOpen = !!openedEnvelopes[note.id];
                      return (
                        <div key={note.id} className="py-2.5 first:pt-0 last:pb-0">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenedEnvelopes((prev) => ({...prev, [note.id]: !prev[note.id]}))
                            }
                            className="flex w-full items-center justify-between gap-3 py-1 text-left"
                          >
                            <span className="inline-flex items-center gap-2 text-xs font-semibold">
                              {isOpen ? (
                                <MailOpen className="h-4 w-4 shrink-0" style={{color: theme.accentHex}} />
                              ) : (
                                <Mail className="h-4 w-4 shrink-0 opacity-60" />
                              )}
                              {note.label}
                            </span>
                            <span className={`text-[11px] shrink-0 ${mutedText}`}>
                              {isOpen ? 'Close' : 'Open'}
                            </span>
                          </button>
                          {isOpen && (
                            <p className={`mt-1.5 pl-6 text-xs leading-relaxed ${bodyText}`}>
                              {note.message}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mini-Quiz */}
              {gift.enableQuiz && gift.quiz.length > 0 && (
                <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                  <div>
                    <p className={`font-mono text-[10px] uppercase tracking-widest ${mutedText}`}>
                      Quick Check
                    </p>
                    <h3 className="font-display text-lg font-bold">How well do you know us?</h3>
                  </div>

                  <div className="space-y-4">
                    {gift.quiz.map((q, qIdx) => {
                      const picked = quizAnswers[q.id];
                      const hasPicked = picked !== undefined;
                      const isRight = picked === q.correctIndex;

                      return (
                        <div
                          key={q.id}
                          className="space-y-2 border-t border-current/10 pt-3 first:border-t-0 first:pt-0"
                        >
                          <p className="text-xs font-semibold">
                            {qIdx + 1}. {q.prompt}
                          </p>
                          <div className="grid gap-1.5">
                            {q.options.map((opt, optIdx) => {
                              const selected = picked === optIdx;
                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  onClick={() =>
                                    setQuizAnswers((prev) => ({...prev, [q.id]: optIdx}))
                                  }
                                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                                    selected
                                      ? optIdx === q.correctIndex
                                        ? 'border-emerald-600 bg-emerald-600/15 font-semibold'
                                        : 'border-red-500 bg-red-500/15 font-semibold'
                                      : 'border-current/15 hover:border-current/35'
                                  }`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                          {hasPicked && (
                            <p
                              className={`text-[11px] font-medium ${
                                isRight ? 'text-emerald-600' : 'text-amber-600'
                              }`}
                            >
                              {isRight ? 'Spot on! ' : 'Nice try — '}
                              {q.reactionNote}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Scratch-Off Secret Reveal */}
              <div className={`rounded-2xl border p-5 ${cardSurface}`}>
                <ScratchCard
                  label={gift.scratchLabel}
                  secretText={gift.scratchSecret}
                  accentColor={theme.accentHex}
                  isDarkSurface={isDark}
                />
              </div>

              {/* Instagram Story Card Studio Launcher */}
              <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className={`font-mono text-[10px] uppercase tracking-widest ${mutedText}`}>
                      Instagram Story Card · {uniqueCode}
                    </p>
                    <h3 className="font-display text-base font-bold">
                      Share This Surprise on Your Story
                    </h3>
                    <p className={`text-xs leading-relaxed ${mutedText}`}>
                      Download a custom 1080×1920 keepsake card with your headline, name, and code.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStoryModalOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 whitespace-nowrap"
                  style={{backgroundColor: theme.accentHex}}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Open Story Card Studio
                </button>
              </div>

              {/* Subtle Organic Viral Loop Footer */}
              {isStandaloneView && (
                <div className="pt-2 pb-6 text-center space-y-2">
                  <p className={`text-[11px] ${mutedText}`}>
                    Made with <span className="font-semibold">Keepsake</span>
                  </p>
                  {onCreateOwn && (
                    <button
                      type="button"
                      onClick={onCreateOwn}
                      className="text-xs font-semibold underline underline-offset-4 hover:opacity-80"
                      style={{color: theme.accentHex}}
                    >
                      Create a surprise link like this in 3 mins
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <StoryCardModal
        isOpen={storyModalOpen}
        gift={gift}
        publishedSlug={publishedSlug}
        onClose={() => setStoryModalOpen(false)}
      />
    </div>
  );
}
