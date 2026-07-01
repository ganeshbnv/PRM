import { useState, useLayoutEffect, useRef, FormEvent, useEffect } from 'react';
import axios from 'axios';
import { Mail, Lock, User, Stethoscope, Activity, Heart, ArrowRight, Zap } from 'lucide-react';
import { useAuthStore, AuthUser } from '../../store/auth';

const DOMAIN = 'globalhealthx.co';

interface AuthResponse { token: string; user: AuthUser; }
type Mode = 'login' | 'register' | 'forgot' | 'reset';

// ── Keyframes injected once — scoped to avoid polluting global CSS ─────────────
const AUTH_CSS = `
@keyframes prm-orb-a {
  0%,100%{transform:translate(0,0) scale(1);}
  33%{transform:translate(70px,-55px) scale(1.1);}
  66%{transform:translate(-45px,45px) scale(0.92);}
}
@keyframes prm-orb-b {
  0%,100%{transform:translate(0,0) scale(1);}
  50%{transform:translate(-85px,55px) scale(1.14);}
}
@keyframes prm-orb-c {
  0%,100%{transform:translate(0,0) scale(1);}
  40%{transform:translate(55px,65px) scale(0.89);}
  80%{transform:translate(-35px,-48px) scale(1.07);}
}
@keyframes prm-ecg {
  from{stroke-dashoffset:900;}
  to{stroke-dashoffset:0;}
}
@keyframes prm-fade-up {
  from{opacity:0;transform:translateY(22px);}
  to{opacity:1;transform:translateY(0);}
}
@keyframes prm-dot-pulse {
  0%,100%{opacity:0.4;transform:scale(1);}
  50%{opacity:1;transform:scale(1.25);}
}
.prm-orb-a{animation:prm-orb-a 20s ease-in-out infinite;}
.prm-orb-b{animation:prm-orb-b 25s ease-in-out infinite;}
.prm-orb-c{animation:prm-orb-c 17s ease-in-out infinite;}
.prm-ecg-line{stroke-dasharray:900;animation:prm-ecg 2.8s cubic-bezier(0.4,0,0.2,1) 0.4s both;}
.prm-f1{animation:prm-fade-up 0.55s cubic-bezier(0.16,1,0.3,1) 0.05s both;}
.prm-f2{animation:prm-fade-up 0.55s cubic-bezier(0.16,1,0.3,1) 0.18s both;}
.prm-f3{animation:prm-fade-up 0.55s cubic-bezier(0.16,1,0.3,1) 0.31s both;}
.prm-f4{animation:prm-fade-up 0.55s cubic-bezier(0.16,1,0.3,1) 0.44s both;}
.prm-f5{animation:prm-fade-up 0.55s cubic-bezier(0.16,1,0.3,1) 0.57s both;}
.prm-live-dot{animation:prm-dot-pulse 2s ease-in-out infinite;}
`;

function useInjectCSS() {
  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'prm-auth-css';
    el.textContent = AUTH_CSS;
    document.head.appendChild(el);
    return () => document.getElementById('prm-auth-css')?.remove();
  }, []);
}

// ── Brand Panel (left) ─────────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div
      className="hidden lg:flex flex-col"
      style={{
        width: '52%', flexShrink: 0, position: 'relative',
        background: '#04091C', overflow: 'hidden',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Animated colour orbs — no blur for crispness */}
      <div className="prm-orb-a" style={{ position:'absolute', top:'-120px', right:'-80px', width:480, height:480, borderRadius:'50%', background:'radial-gradient(circle,rgba(76,110,245,0.44) 0%,transparent 68%)', pointerEvents:'none' }} />
      <div className="prm-orb-b" style={{ position:'absolute', bottom:'-140px', left:'-100px', width:520, height:520, borderRadius:'50%', background:'radial-gradient(circle,rgba(13,148,136,0.38) 0%,transparent 68%)', pointerEvents:'none' }} />
      <div className="prm-orb-c" style={{ position:'absolute', top:'38%', left:'30%', width:340, height:340, borderRadius:'50%', background:'radial-gradient(circle,rgba(124,58,237,0.34) 0%,transparent 68%)', pointerEvents:'none' }} />

      {/* Dot-grid overlay */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(circle,rgba(255,255,255,0.07) 1px,transparent 1px)', backgroundSize:'28px 28px', pointerEvents:'none' }} />

      {/* Top edge glow */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,transparent,rgba(76,110,245,0.75),rgba(13,148,136,0.6),transparent)', pointerEvents:'none' }} />

      {/* Content — 3 sections distributed via space-between */}
      <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', height:'100%', padding:'36px 44px', justifyContent:'space-between' }}>

        {/* ── SECTION 1: Logo ── */}
        <div className="prm-f1" style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,#4c6ef5,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 28px rgba(76,110,245,0.55)', flexShrink:0 }}>
            <span style={{ color:'#fff', fontWeight:900, fontSize:21, letterSpacing:-1 }}>H</span>
          </div>
          <div>
            <div style={{ color:'#ffffff', fontWeight:800, fontSize:16, letterSpacing:-0.2, lineHeight:1.1 }}>Healix Engage</div>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}>
              <span className="prm-live-dot" style={{ width:6, height:6, borderRadius:'50%', background:'#4ade80', display:'inline-block', flexShrink:0 }} />
              <span style={{ color:'rgba(255,255,255,0.45)', fontSize:11, letterSpacing:0.4 }}>Global HealthX · Live</span>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Hero headline + ECG ── */}
        <div>
          <div className="prm-f2" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(76,110,245,0.18)', border:'1px solid rgba(76,110,245,0.4)', borderRadius:100, padding:'5px 14px', marginBottom:16 }}>
            <Stethoscope size={12} style={{ color:'#818cf8' }} />
            <span style={{ color:'#a5b4fc', fontSize:10.5, fontWeight:700, letterSpacing:1.3, textTransform:'uppercase' }}>Patient Relationship Management</span>
          </div>

          <div className="prm-f3">
            <h1 style={{ color:'#ffffff', fontSize:36, fontWeight:900, lineHeight:1.1, letterSpacing:-1.2, margin:0 }}>
              Infinite Care.
              <br />
              <span style={{ background:'linear-gradient(135deg,#818cf8 0%,#38bdf8 45%,#34d399 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
                Every Patient.
              </span>
              <br />
              Every Moment.
            </h1>
            <p style={{ color:'rgba(255,255,255,0.55)', fontSize:13, lineHeight:1.65, margin:'14px 0 0', fontWeight:400, maxWidth:380 }}>
              Seamless patient communication, care coordination, and real-time insights — built for the future of healthcare.
            </p>
          </div>

          {/* ECG line */}
          <div className="prm-f4" style={{ marginTop:20 }}>
            <svg viewBox="0 0 500 60" style={{ width:'100%', maxWidth:420, height:30, overflow:'visible', display:'block' }}>
              <path
                className="prm-ecg-line"
                d="M 0,30 L 70,30 L 90,30 L 100,4 L 113,56 L 122,4 L 132,56 L 142,30 L 180,30 L 195,30 L 205,14 L 214,46 L 222,30 L 340,30 L 355,30 L 362,18 L 370,42 L 376,30 L 500,30"
                fill="none"
                stroke="rgba(76,110,245,0.85)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="500" cy="30" r="3" fill="#4c6ef5" opacity="0.95" />
            </svg>
          </div>
        </div>

        {/* ── SECTION 3: Feature cards + quote ── */}
        <div>
          <div className="prm-f5" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
            {[
              { icon: <Activity size={15} />, color:'#818cf8', bg:'rgba(76,110,245,0.14)', border:'rgba(76,110,245,0.32)', title:'Care Teams', desc:'5 teams in sync' },
              { icon: <Zap size={15} />,      color:'#34d399', bg:'rgba(13,148,136,0.14)', border:'rgba(13,148,136,0.32)', title:'Real-time', desc:'Instant updates' },
              { icon: <Heart size={15} />,    color:'#f472b6', bg:'rgba(236,72,153,0.14)', border:'rgba(236,72,153,0.32)', title:'Patient-First', desc:'277+ work items' },
            ].map(f => (
              <div key={f.title} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'12px' }}>
                <div style={{ width:30, height:30, borderRadius:8, background:f.bg, border:`1px solid ${f.border}`, display:'flex', alignItems:'center', justifyContent:'center', color:f.color, marginBottom:8 }}>
                  {f.icon}
                </div>
                <div style={{ color:'#ffffff', fontSize:12.5, fontWeight:700, lineHeight:1.2 }}>{f.title}</div>
                <div style={{ color:'rgba(255,255,255,0.4)', fontSize:10.5, marginTop:2, lineHeight:1.4 }}>{f.desc}</div>
              </div>
            ))}
          </div>

          <div style={{ borderLeft:'2px solid rgba(76,110,245,0.55)', paddingLeft:14 }}>
            <p style={{ color:'rgba(255,255,255,0.36)', fontSize:11.5, lineHeight:1.6, margin:0, fontStyle:'italic' }}>
              "Healthcare is not just about treating illness — it's about building relationships that last a lifetime."
            </p>
            <p style={{ color:'rgba(255,255,255,0.22)', fontSize:10.5, margin:'4px 0 0' }}>Global HealthX · Patient Engagement Platform</p>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Shared form input with icon ───────────────────────────────────────────────
function IconInput({ icon, error, ...props }: { icon: React.ReactNode; error?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position:'relative' }}>
      <div style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color: focused ? '#4c6ef5' : '#9ca3af', transition:'color 0.15s', pointerEvents:'none' }}>
        {icon}
      </div>
      <input
        {...props}
        onFocus={e => { setFocused(true); props.onFocus?.(e); }}
        onBlur={e => { setFocused(false); props.onBlur?.(e); }}
        style={{
          width:'100%', padding:'12px 14px 12px 44px',
          background:'#f9fafb', border:`1.5px solid ${error ? '#fca5a5' : focused ? '#4c6ef5' : '#e5e7eb'}`,
          borderRadius:11, fontSize:14, color:'#111827', outline:'none',
          transition:'border-color 0.15s, box-shadow 0.15s',
          boxShadow: focused ? '0 0 0 3px rgba(76,110,245,0.12)' : 'none',
        }}
      />
    </div>
  );
}

// ── Domain input with icon ─────────────────────────────────────────────────────
function DomainInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const [inputWidth, setInputWidth] = useState(72);
  const [focused, setFocused] = useState(false);

  useLayoutEffect(() => {
    if (mirrorRef.current) setInputWidth(mirrorRef.current.offsetWidth + 4);
  }, [value]);

  return (
    <div
      style={{
        display:'flex', alignItems:'center',
        padding:'12px 14px 12px 44px',
        background:'#f9fafb', border:`1.5px solid ${focused ? '#4c6ef5' : '#e5e7eb'}`,
        borderRadius:11, transition:'border-color 0.15s, box-shadow 0.15s',
        boxShadow: focused ? '0 0 0 3px rgba(76,110,245,0.12)' : 'none',
        position:'relative', overflow:'hidden',
      }}
    >
      {/* Icon */}
      <div style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color: focused ? '#4c6ef5' : '#9ca3af', transition:'color 0.15s', pointerEvents:'none' }}>
        <Mail size={16} />
      </div>
      {/* Mirror */}
      <span ref={mirrorRef} aria-hidden style={{ position:'absolute', opacity:0, pointerEvents:'none', whiteSpace:'pre', fontSize:14, fontFamily:'inherit' }}>
        {value || 'yourname'}
      </span>
      <input
        type="text"
        value={value}
        onChange={e => { const v = e.target.value; onChange(v.includes('@') ? v.split('@')[0] : v.replace(/\s/g, '')); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required
        placeholder="yourname"
        style={{ width:inputWidth, minWidth:4, background:'transparent', fontSize:14, color:'#111827', outline:'none', border:'none', padding:0, flexShrink:0 }}
      />
      <span style={{ fontSize:14, color: value ? '#374151' : '#9ca3af', whiteSpace:'nowrap' }}>@{DOMAIN}</span>
    </div>
  );
}

// ── Submit button ──────────────────────────────────────────────────────────────
function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="submit"
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width:'100%', padding:'13px 0', border:'none', borderRadius:12, cursor: loading ? 'not-allowed' : 'pointer',
        background: loading ? '#c7d2fe' : 'linear-gradient(135deg, #4c6ef5 0%, #7c3aed 100%)',
        color:'#ffffff', fontSize:15, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        boxShadow: loading ? 'none' : hovered ? '0 6px 24px rgba(76,110,245,0.5)' : '0 4px 14px rgba(76,110,245,0.35)',
        transform: hovered && !loading ? 'translateY(-1px)' : 'translateY(0)',
        transition:'all 0.2s',
      }}
    >
      {loading ? 'Please wait…' : <>{label}<ArrowRight size={16}/></>}
    </button>
  );
}

// ── Error box ──────────────────────────────────────────────────────────────────
function ErrorBox({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div style={{ padding:'11px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, color:'#b91c1c', fontSize:13, lineHeight:1.5 }}>
      {msg}
    </div>
  );
}

// ── Info box ───────────────────────────────────────────────────────────────────
function InfoBox({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div style={{ padding:'11px 14px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, color:'#15803d', fontSize:13, lineHeight:1.5 }}>
      {msg}
    </div>
  );
}

// ── Right-side wrapper ────────────────────────────────────────────────────────
function FormPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#ffffff', overflowY:'auto', padding:'40px 24px' }}>
      {/* Mobile-only logo */}
      <div className="lg:hidden" style={{ textAlign:'center', marginBottom:28 }}>
        <div style={{ width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,#4c6ef5,#7c3aed)', display:'inline-flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 20px rgba(76,110,245,0.3)', marginBottom:10 }}>
          <span style={{ color:'#fff', fontWeight:900, fontSize:24 }}>H</span>
        </div>
        <div style={{ fontSize:20, fontWeight:800, color:'#111827' }}>Healix Engage</div>
      </div>
      <div style={{ width:'100%', maxWidth:380 }}>
        {children}
      </div>
      {/* Bottom note */}
      <p style={{ marginTop:32, fontSize:12, color:'#9ca3af', textAlign:'center' }}>
        Access restricted to <strong style={{ color:'#6b7280' }}>@{DOMAIN}</strong> accounts only.
      </p>
    </div>
  );
}

// ── Auth tab switcher ──────────────────────────────────────────────────────────
function TabSwitcher({ mode, onSwitch }: { mode: 'login' | 'register'; onSwitch: (m: 'login' | 'register') => void }) {
  return (
    <div style={{ display:'flex', background:'#f3f4f6', borderRadius:12, padding:4, marginBottom:28 }}>
      {(['login', 'register'] as const).map(m => (
        <button
          key={m}
          type="button"
          onClick={() => onSwitch(m)}
          style={{
            flex:1, padding:'9px 0', borderRadius:9, fontSize:14, fontWeight:600,
            background: mode === m ? '#4c6ef5' : 'transparent',
            color: mode === m ? '#ffffff' : '#6b7280',
            border:'none', cursor:'pointer', transition:'all 0.18s',
            boxShadow: mode === m ? '0 2px 8px rgba(76,110,245,0.3)' : 'none',
          }}
        >
          {m === 'login' ? 'Sign In' : 'Register'}
        </button>
      ))}
    </div>
  );
}

// ── Form section label ─────────────────────────────────────────────────────────
function FieldLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
      <label style={{ fontSize:13, fontWeight:600, color:'#374151' }}>{children}</label>
      {right}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AuthPage() {
  useInjectCSS();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState('');

  const setAuth = useAuthStore(s => s.setAuth);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('reset_token');
    if (tok) {
      setResetToken(tok);
      setMode('reset');
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
  }, []);

  function switchMode(m: 'login' | 'register') {
    setMode(m); setError(''); setInfo('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);

    try {
      if (mode === 'forgot') {
        await axios.post('/api/auth/forgot-password', { email: `${username.trim()}@${DOMAIN}` });
        setInfo('Check your inbox — a reset link has been sent if that address is registered.');
        setUsername('');
        return;
      }

      if (mode === 'reset') {
        if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
        const { data } = await axios.post<AuthResponse>('/api/auth/reset-password', { token: resetToken, password });
        setAuth(data.token, data.user);
        return;
      }

      const email = `${username.trim()}@${DOMAIN}`;
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload  = mode === 'login' ? { email, password } : { email, name, password };
      const { data } = await axios.post<AuthResponse>(endpoint, payload);
      setAuth(data.token, data.user);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error ?? err.message
        : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Reset mode ───────────────────────────────────────────────────────────────
  if (mode === 'reset') {
    return (
      <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
        <BrandPanel />
        <FormPanel>
          <div style={{ marginBottom:28 }}>
            <h2 style={{ fontSize:26, fontWeight:800, color:'#111827', letterSpacing:-0.5, margin:'0 0 6px' }}>Set a new password</h2>
            <p style={{ fontSize:14, color:'#6b7280', lineHeight:1.6, margin:0 }}>Must be at least 8 characters.</p>
          </div>
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <FieldLabel>New Password</FieldLabel>
              <IconInput icon={<Lock size={16}/>} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="Min. 8 characters" />
            </div>
            <div>
              <FieldLabel>Confirm Password</FieldLabel>
              <IconInput icon={<Lock size={16}/>} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} placeholder="Repeat new password" />
            </div>
            <ErrorBox msg={error} />
            <SubmitButton loading={loading} label="Set New Password" />
          </form>
          <button type="button" onClick={() => { setMode('login'); setError(''); setPassword(''); setConfirmPassword(''); }}
            style={{ marginTop:20, display:'block', width:'100%', textAlign:'center', background:'none', border:'none', color:'#9ca3af', fontSize:13, cursor:'pointer', padding:'6px 0' }}>
            ← Back to Sign In
          </button>
        </FormPanel>
      </div>
    );
  }

  // ── Forgot mode ───────────────────────────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
        <BrandPanel />
        <FormPanel>
          <div style={{ marginBottom:28 }}>
            <h2 style={{ fontSize:26, fontWeight:800, color:'#111827', letterSpacing:-0.5, margin:'0 0 6px' }}>Forgot your password?</h2>
            <p style={{ fontSize:14, color:'#6b7280', lineHeight:1.6, margin:0 }}>Enter your email and we'll send a reset link to your inbox.</p>
          </div>
          {info ? (
            <InfoBox msg={info} />
          ) : (
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <FieldLabel>Email</FieldLabel>
                <DomainInput value={username} onChange={setUsername} />
              </div>
              <ErrorBox msg={error} />
              <SubmitButton loading={loading} label="Send Reset Link" />
            </form>
          )}
          <button type="button" onClick={() => { setMode('login'); setError(''); setInfo(''); setUsername(''); }}
            style={{ marginTop:20, display:'block', width:'100%', textAlign:'center', background:'none', border:'none', color:'#9ca3af', fontSize:13, cursor:'pointer', padding:'6px 0' }}>
            ← Back to Sign In
          </button>
        </FormPanel>
      </div>
    );
  }

  // ── Login / Register ──────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      <BrandPanel />
      <FormPanel>
        {/* Heading */}
        <div style={{ marginBottom:28 }}>
          <h2 style={{ fontSize:26, fontWeight:800, color:'#111827', letterSpacing:-0.5, margin:'0 0 4px' }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p style={{ fontSize:14, color:'#6b7280', margin:0 }}>
            {mode === 'login' ? 'Sign in to your Global HealthX workspace.' : 'Join your Global HealthX care team.'}
          </p>
        </div>

        {/* Tab switcher */}
        <TabSwitcher mode={mode as 'login' | 'register'} onSwitch={switchMode} />

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {mode === 'register' && (
            <div>
              <FieldLabel>Full Name</FieldLabel>
              <IconInput icon={<User size={16}/>} type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Jane Smith" />
            </div>
          )}

          <div>
            <FieldLabel>Email</FieldLabel>
            <DomainInput value={username} onChange={setUsername} />
          </div>

          <div>
            <FieldLabel
              right={
                mode === 'login' ? (
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
                    style={{ fontSize:12.5, fontWeight:600, color:'#4c6ef5', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                    Forgot password?
                  </button>
                ) : undefined
              }
            >
              Password
            </FieldLabel>
            <IconInput
              icon={<Lock size={16}/>}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder={mode === 'register' ? 'Min. 8 characters' : '••••••••'}
            />
          </div>

          <ErrorBox msg={error} />

          <SubmitButton loading={loading} label={mode === 'login' ? 'Sign In' : 'Create Account'} />
        </form>

        {/* Switch mode hint */}
        <p style={{ marginTop:20, textAlign:'center', fontSize:13, color:'#9ca3af' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            style={{ color:'#4c6ef5', fontWeight:600, background:'none', border:'none', cursor:'pointer', padding:0, fontSize:13 }}>
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </p>
      </FormPanel>
    </div>
  );
}
