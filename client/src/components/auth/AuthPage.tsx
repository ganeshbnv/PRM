import { useState, useLayoutEffect, useRef, FormEvent, useEffect } from 'react';
import axios from 'axios';
import { useAuthStore, AuthUser } from '../../store/auth';

const DOMAIN = 'globalhealthx.co';

interface AuthResponse {
  token: string;
  user: AuthUser;
}

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState('');

  const setAuth = useAuthStore((s) => s.setAuth);

  // Check for ?reset_token=... on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('reset_token');
    if (tok) {
      setResetToken(tok);
      setMode('reset');
      // Clean the token from the URL without reloading
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', clean);
    }
  }, []);

  function switchMode(m: 'login' | 'register') {
    setMode(m);
    setError('');
    setInfo('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      if (mode === 'forgot') {
        const email = `${username.trim()}@${DOMAIN}`;
        await axios.post('/api/auth/forgot-password', { email });
        setInfo('Check your inbox — a reset link has been sent if that address is registered.');
        setUsername('');
        setLoading(false);
        return;
      }

      if (mode === 'reset') {
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }
        const { data } = await axios.post<AuthResponse>('/api/auth/reset-password', {
          token: resetToken,
          password,
        });
        setAuth(data.token, data.user);
        return;
      }

      const email = `${username.trim()}@${DOMAIN}`;
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = mode === 'login' ? { email, password } : { email, name, password };
      const { data } = await axios.post<AuthResponse>(endpoint, payload);
      setAuth(data.token, data.user);
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err)
          ? (err.response?.data as { error?: string })?.error ?? err.message
          : 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Reset password view ────────────────────────────────────────────────────
  if (mode === 'reset') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-4">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 mb-4">
            <span className="text-3xl font-bold text-brand-400">H</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Healix Engage</h1>
        </div>

        <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-2xl p-8 shadow-xl">
          <h2 className="text-lg font-bold text-white mb-1">Choose a new password</h2>
          <p className="text-xs text-gray-400 mb-6">Must be at least 8 characters.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Min. 8 characters"
                className="w-full px-3 py-2.5 rounded-lg bg-surface-elevated border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Repeat new password"
                className="w-full px-3 py-2.5 rounded-lg bg-surface-elevated border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 text-sm"
              />
            </div>

            {error && (
              <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Updating…' : 'Set New Password'}
            </button>
          </form>

          <button
            onClick={() => { setMode('login'); setError(''); setPassword(''); setConfirmPassword(''); }}
            className="mt-4 w-full text-center text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  // ── Forgot password view ────────────────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-4">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 mb-4">
            <span className="text-3xl font-bold text-brand-400">H</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Healix Engage</h1>
        </div>

        <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-2xl p-8 shadow-xl">
          <h2 className="text-lg font-bold text-white mb-1">Forgot your password?</h2>
          <p className="text-xs text-gray-400 mb-6">
            Enter your email and we'll send a reset link to your inbox.
          </p>

          {info ? (
            <div className="px-4 py-4 rounded-lg bg-emerald-900/30 border border-emerald-500/30 text-emerald-300 text-sm leading-relaxed">
              {info}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
                <DomainInput value={username} onChange={setUsername} />
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <button
            onClick={() => { setMode('login'); setError(''); setInfo(''); setUsername(''); }}
            className="mt-4 w-full text-center text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  // ── Login / Register view ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-4">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 mb-4">
          <span className="text-3xl font-bold text-brand-400">H</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Healix Engage</h1>
      </div>

      <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-2xl p-8 shadow-xl">
        <div className="flex rounded-lg bg-surface-elevated p-1 mb-6">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                mode === m ? 'bg-brand-500 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Jane Smith"
                className="w-full px-3 py-2.5 rounded-lg bg-surface-elevated border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
            <DomainInput value={username} onChange={setUsername} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-400">Password</label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder={mode === 'register' ? 'Min. 8 characters' : '••••••••'}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-elevated border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 text-sm"
            />
          </div>

          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-gray-500">
          Access restricted to{' '}
          <span className="text-gray-400 font-medium">@{DOMAIN}</span> accounts only.
        </p>
      </div>
    </div>
  );
}

// ── Domain input — suffix tracks typed text ───────────────────────────────────

function DomainInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const [inputWidth, setInputWidth] = useState(72);

  useLayoutEffect(() => {
    if (mirrorRef.current) {
      setInputWidth(mirrorRef.current.offsetWidth + 4);
    }
  }, [value]);

  return (
    <div className="flex items-center px-3 py-2.5 rounded-lg bg-surface-elevated border border-surface-border focus-within:border-brand-500 transition-colors overflow-hidden relative">
      <span
        ref={mirrorRef}
        aria-hidden
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          whiteSpace: 'pre',
          fontSize: '0.875rem',
          fontFamily: 'inherit',
        }}
      >
        {value || 'yourname'}
      </span>

      <input
        type="text"
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val.includes('@') ? val.split('@')[0] : val.replace(/\s/g, ''));
        }}
        required
        placeholder="yourname"
        style={{ width: inputWidth, minWidth: 4 }}
        className="bg-transparent text-white text-sm outline-none placeholder-gray-500 shrink-0"
      />

      <span className={`text-sm whitespace-nowrap transition-colors ${value ? 'text-white' : 'text-gray-500'}`}>
        @{DOMAIN}
      </span>
    </div>
  );
}
