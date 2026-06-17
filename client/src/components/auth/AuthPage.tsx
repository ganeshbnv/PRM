import { useState, useLayoutEffect, useRef, FormEvent } from 'react';
import axios from 'axios';
import { useAuthStore, AuthUser } from '../../store/auth';

const DOMAIN = 'globalhealthx.co';

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const email = `${username.trim()}@${DOMAIN}`;
    try {
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-4">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 mb-4">
          <span className="text-3xl font-bold text-brand-400">P</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Jarvis for PRM</h1>
      </div>

      <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-2xl p-8 shadow-xl">
        <div className="flex rounded-lg bg-surface-elevated p-1 mb-6">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
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
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
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
            <div className="px-3 py-2.5 rounded-lg bg-red-900/30 border border-red-700/50 text-red-400 text-sm">
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
      // +4px gives the cursor a little room
      setInputWidth(mirrorRef.current.offsetWidth + 4);
    }
  }, [value]);

  return (
    <div className="flex items-center px-3 py-2.5 rounded-lg bg-surface-elevated border border-surface-border focus-within:border-brand-500 transition-colors overflow-hidden relative">
      {/* Invisible mirror used only to measure typed text width */}
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
        onChange={(e) => onChange(e.target.value.replace(/[@\s]/g, ''))}
        required
        placeholder="yourname"
        style={{ width: inputWidth, minWidth: 4 }}
        className="bg-transparent text-white text-sm outline-none placeholder-gray-500 shrink-0"
      />

      <span className="text-gray-500 text-sm whitespace-nowrap">
        @{DOMAIN}
      </span>
    </div>
  );
}
