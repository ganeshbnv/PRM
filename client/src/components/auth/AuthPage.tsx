import { useState, FormEvent } from 'react';
import axios from 'axios';
import { useAuthStore, AuthUser } from '../../store/auth';

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setAuth = useAuthStore((s) => s.setAuth);

  const DOMAIN = 'globalhealthx.co';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const resolvedEmail = mode === 'register' ? `${username.trim()}@${DOMAIN}` : email;

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = mode === 'login'
        ? { email: resolvedEmail, password }
        : { email: resolvedEmail, name, password };
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
      {/* Logo / brand */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 mb-4">
          <span className="text-3xl font-bold text-brand-400">P</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Jarvis for PRM</h1>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-2xl p-8 shadow-xl">
        {/* Mode toggle */}
        <div className="flex rounded-lg bg-surface-elevated p-1 mb-6">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                mode === m
                  ? 'bg-brand-500 text-white shadow'
                  : 'text-gray-400 hover:text-white'
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
            {mode === 'register' ? (
              <div className="flex rounded-lg overflow-hidden border border-surface-border focus-within:border-brand-500 transition-colors">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[@\s]/g, ''))}
                  required
                  placeholder="yourname"
                  className="flex-1 min-w-0 px-3 py-2.5 bg-surface-elevated text-white placeholder-gray-500 focus:outline-none text-sm"
                />
                <span className="flex items-center px-3 bg-surface-elevated text-gray-500 text-sm font-medium whitespace-nowrap select-none">
                  @globalhealthx.co
                </span>
              </div>
            ) : (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@globalhealthx.co"
                className="w-full px-3 py-2.5 rounded-lg bg-surface-elevated border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 text-sm"
              />
            )}
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

        {/* Domain restriction notice */}
        <p className="mt-5 text-center text-xs text-gray-500">
          Access restricted to{' '}
          <span className="text-gray-400 font-medium">@globalhealthx.co</span> accounts only.
        </p>
      </div>
    </div>
  );
}
