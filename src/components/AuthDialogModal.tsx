import {useState} from 'react';
import {Eye, EyeOff, Loader2, ShieldCheck, X} from 'lucide-react';
import {type AuthUser, signInWithKeepsake, signUpWithKeepsake} from '../lib/keepsakeApi';
import type {CreatorStatus} from '../utils/merchantConfig';

interface AuthDialogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser, creator: CreatorStatus) => void;
}

export function AuthDialogModal({isOpen, onClose, onSuccess}: AuthDialogModalProps) {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res =
        mode === 'signup'
          ? await signUpWithKeepsake(name, email, password)
          : await signInWithKeepsake(email, password);
      onSuccess(res.user, res.creator);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not complete sign in. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'mt-1.5 w-full rounded-xl border border-stone-200/90 bg-[#FAF9F7] px-3.5 py-2.5 text-sm text-[#111113] transition-colors focus:border-[#111113] focus:bg-white focus:outline-none';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111113]/65 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keepsake-auth-title"
    >
      <div className="w-full max-w-md rounded-[24px] border border-stone-900/10 bg-white shadow-[0_32px_70px_-16px_rgba(17,17,19,0.3)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-900/[0.07] px-6 py-5">
          <div>
            <h2
              id="keepsake-auth-title"
              className="font-display text-xl font-bold tracking-tight text-[#111113]"
            >
              {mode === 'signup' ? 'Create your Keepsake account' : 'Sign in to Keepsake'}
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              1st website 100% free · Saved across all your devices
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-100 hover:text-[#111113]"
            aria-label="Close sign in dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="inline-flex w-full rounded-xl bg-[#F4F1EC] p-1">
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg('');
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                mode === 'signup'
                  ? 'bg-white text-[#111113] shadow-sm'
                  : 'text-stone-600 hover:text-[#111113]'
              }`}
            >
              New Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg('');
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-[#111113] shadow-sm'
                  : 'text-stone-600 hover:text-[#111113]'
              }`}
            >
              Sign In
            </button>
          </div>

          {mode === 'signup' && (
            <label className="block">
              <span className="text-xs font-semibold text-[#111113]">Your Name</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aarav Sharma"
                className={inputClass}
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-[#111113]">Email Address</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-[#111113]">Password</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-[#111113]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          {errorMsg && (
            <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#111113] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60 whitespace-nowrap"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting
              ? mode === 'signup'
                ? 'Creating account...'
                : 'Signing in...'
              : mode === 'signup'
                ? 'Create Free Keepsake Account'
                : 'Sign In to Keepsake'}
          </button>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-stone-500">
            <ShieldCheck className="h-3.5 w-3.5 text-rose-700 shrink-0" />
            Secured directly by Keepsake &amp; Supabase
          </p>
        </form>
      </div>
    </div>
  );
}
