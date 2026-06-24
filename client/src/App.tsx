import { useState, useEffect, useRef } from 'react';
import {
  SquareKanban, CircleDot, UserCog, FolderGit2, NotebookPen, OctagonAlert,
  PanelLeftClose, PanelLeft, Menu,
  Settings, Layers, X, ChevronDown, LayoutDashboard,
  Sun, Moon,
} from 'lucide-react';
import { FilterBar } from './components/common/FilterBar';
import { WikiModule } from './components/wiki/WikiModule';
import { BoardsModule } from './components/boards/BoardsModule';
import { BugsModule } from './components/bugs/BugsModule';
import { EngineersModule } from './components/engineers/EngineersModule';
import { ReposModule } from './components/repos/ReposModule';
import { RisksModule } from './components/risks/RisksModule';
import { AuthPage } from './components/auth/AuthPage';
import { SettingsModal } from './components/settings/SettingsModal';
import { api } from './api/client';
import { useFilterStore } from './store/filters';
import { useAuthStore } from './store/auth';
import type { AuthUser } from './store/auth';
import { useThemeStore } from './store/theme';
import { cn } from './utils/cn';

type Tab = 'boards' | 'bugs' | 'engineers' | 'repos' | 'wiki' | 'risks';

const NAV_ITEMS: {
  id: Tab;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
  iconBg: string;
  activeBg: string;
  barColor: string;
}[] = [
  { id: 'boards',    label: 'Boards',    icon: SquareKanban,  description: 'Sprints & kanban',  color: 'text-violet-400',  iconBg: 'bg-violet-500/10',  activeBg: 'bg-violet-500/15',  barColor: 'from-violet-400 to-purple-500'  },
  { id: 'bugs',      label: 'Bugs',      icon: CircleDot,     description: 'Issue tracking',    color: 'text-rose-400',    iconBg: 'bg-rose-500/10',    activeBg: 'bg-rose-500/15',    barColor: 'from-rose-400 to-red-500'       },
  { id: 'engineers', label: 'Engineers', icon: UserCog,       description: 'Team directory',    color: 'text-sky-400',     iconBg: 'bg-sky-500/10',     activeBg: 'bg-sky-500/15',     barColor: 'from-sky-400 to-blue-500'       },
  { id: 'repos',     label: 'Repos',     icon: FolderGit2,    description: 'Codebase & PRs',    color: 'text-emerald-400', iconBg: 'bg-emerald-500/10', activeBg: 'bg-emerald-500/15', barColor: 'from-emerald-400 to-green-500'  },
  { id: 'wiki',      label: 'Wiki',      icon: NotebookPen,   description: 'Docs & knowledge',  color: 'text-amber-400',   iconBg: 'bg-amber-500/10',   activeBg: 'bg-amber-500/15',   barColor: 'from-amber-400 to-orange-500'   },
  { id: 'risks',     label: 'Risks',     icon: OctagonAlert,  description: 'Risk register',     color: 'text-red-400',     iconBg: 'bg-red-500/10',     activeBg: 'bg-red-500/15',     barColor: 'from-red-400 to-rose-500'       },
];

// ── Tech Stack ────────────────────────────────────────────────────────────────

const TECH_STACK = [
  {
    category: 'User Interface (Frontend)',
    emoji: '🖥️',
    summary: 'Everything you see and click on is built with these tools.',
    items: [
      {
        name: 'React',
        badge: 'v18',
        color: '#61dafb',
        dot: 'bg-sky-400',
        tagline: 'The building blocks of every screen',
        plain: 'Think of React as LEGO for websites. Every button, card, and panel is a separate "piece" that snaps together. When something changes — like marking a bug as fixed — only that one piece updates instead of reloading the whole page. This makes the app feel instant.',
        detail: 'A JavaScript library by Meta that uses a component model and a virtual DOM for high-performance UI updates.',
      },
      {
        name: 'TypeScript',
        badge: 'v5',
        color: '#3178c6',
        dot: 'bg-blue-500',
        tagline: 'Spell-check for code',
        plain: 'Imagine writing an email and having a spell-checker that also checks grammar and logic before you send it. TypeScript does exactly that for our code — it catches mistakes before they ever reach you, so the app behaves predictably.',
        detail: 'A strongly-typed superset of JavaScript that catches type errors at compile time, reducing runtime bugs.',
      },
      {
        name: 'Vite',
        badge: 'v5',
        color: '#646cff',
        dot: 'bg-violet-400',
        tagline: 'The engine that starts the app instantly',
        plain: 'When a developer makes a change to the app — say, tweaking a button colour — Vite applies that change in under a second without restarting anything. It\'s the difference between waiting 30 seconds and seeing your update immediately.',
        detail: 'A next-generation frontend build tool that leverages native ES modules and esbuild for near-instant dev server starts and hot module replacement.',
      },
      {
        name: 'Tailwind CSS',
        badge: 'v3',
        color: '#38bdf8',
        dot: 'bg-cyan-400',
        tagline: 'The design system keeping everything consistent',
        plain: 'Tailwind is a giant collection of ready-made styling rules — colours, spacing, shadows, rounded corners. Instead of inventing styles from scratch, developers pick from this consistent kit, which is why every screen looks like it belongs to the same product.',
        detail: 'A utility-first CSS framework that enables rapid, consistent UI development without writing custom stylesheets.',
      },
      {
        name: 'Tiptap (Rich Editor)',
        badge: 'v2',
        color: '#6366f1',
        dot: 'bg-indigo-400',
        tagline: 'The word-processor inside Wiki pages',
        plain: 'The Wiki editor works like a mini version of Google Docs or Microsoft Word — bold text, headings, tables, checklists, code blocks. Tiptap is the engine that powers all of those formatting tools. It also tracks every edit so version history works.',
        detail: 'A headless, extensible rich-text editor framework built on ProseMirror, supporting custom extensions, collaborative editing, and structured content.',
      },
      {
        name: 'Lucide Icons',
        badge: '',
        color: '#f59e0b',
        dot: 'bg-amber-400',
        tagline: 'Every icon you see',
        plain: 'Every small symbol in the app — the folder icon, the bug icon, the save button — comes from Lucide. It\'s a carefully designed set of thousands of icons that all share the same visual style, so nothing looks out of place.',
        detail: 'A community-maintained, MIT-licensed icon library with 1,400+ consistent SVG icons, consumed as React components.',
      },
    ],
  },
  {
    category: 'Application Server (Backend)',
    emoji: '⚙️',
    summary: 'The "behind the scenes" software that handles your requests, applies rules, and talks to the database.',
    items: [
      {
        name: 'Node.js',
        badge: 'v20 LTS',
        color: '#84cc16',
        dot: 'bg-lime-400',
        tagline: 'The runtime that powers our servers',
        plain: 'Node.js is the engine that runs our server software, similar to how a car engine powers the vehicle. When you create a Wiki page or load your sprint board, Node.js receives that request, figures out what you need, and sends back the right information — all in milliseconds.',
        detail: 'An event-driven, non-blocking JavaScript runtime built on V8, ideal for I/O-heavy services. Runs the Healix Engage server (port 3001) and Wiki server (port 3002).',
      },
      {
        name: 'Express',
        badge: 'v4',
        color: '#94a3b8',
        dot: 'bg-gray-400',
        tagline: 'The traffic director for incoming requests',
        plain: 'Imagine a hotel receptionist who greets every visitor and sends them to the right floor. Express does exactly that for web requests — "you\'re asking for wiki pages? Go here. You\'re submitting a bug? Go there." Every feature has its own clearly defined route.',
        detail: 'A minimal, unopinionated Node.js web framework providing routing, middleware, and request/response handling.',
      },
      {
        name: 'Next.js',
        badge: 'v14',
        color: '#ffffff',
        dot: 'bg-white',
        tagline: 'The framework powering the pm-tracker login',
        plain: 'Next.js adds a set of superpowers to React — it handles the login flow, protects private pages (so you can\'t access them without signing in), and can render pages on the server for faster initial load. It runs the separate project-management tracker.',
        detail: 'A full-stack React framework with built-in routing, SSR/SSG, API routes, and middleware. Hosts the pm-tracker on port 3000 with NextAuth for authentication.',
      },
      {
        name: 'JSON Web Tokens (JWT)',
        badge: '',
        color: '#f97316',
        dot: 'bg-orange-400',
        tagline: 'Your digital ID badge',
        plain: 'When you log in, the server hands you a small encrypted "badge" (a JWT). Every time your browser talks to the server after that, it shows this badge. The server reads the badge to know who you are — without needing to look you up in the database every single time.',
        detail: 'Stateless authentication tokens signed with a secret key. The Wiki server issues short-lived access tokens and longer-lived refresh tokens for seamless session management.',
      },
    ],
  },
  {
    category: 'Database & Storage',
    emoji: '🗄️',
    summary: 'Where all the data — pages, bugs, sprints, users — is stored safely and retrieved quickly.',
    items: [
      {
        name: 'PostgreSQL',
        badge: 'v16',
        color: '#336791',
        dot: 'bg-blue-700',
        tagline: 'The main filing cabinet',
        plain: 'PostgreSQL is like a giant, hyper-organised filing cabinet. Every wiki page, every bug report, every team member profile lives here in structured tables — rows and columns — so any piece of information can be found in milliseconds, even with millions of records. We run two separate instances: one for the project tracker and one for the Wiki.',
        detail: 'A robust, ACID-compliant relational database. Two instances: pm-tracker on port 5432 and the Wiki on port 5433, both running inside Docker containers.',
      },
      {
        name: 'Prisma ORM',
        badge: 'v5',
        color: '#2d3748',
        dot: 'bg-slate-600',
        tagline: 'The translator between code and database',
        plain: 'Developers speak JavaScript; databases speak SQL. Prisma is the translator in between. Instead of writing complex database queries by hand, a developer just writes something like "give me all pages in this space" and Prisma converts that into the correct database instruction automatically — and catches errors before they happen.',
        detail: 'A type-safe ORM that generates a query client from your schema, handles migrations, and provides an intuitive API for database access.',
      },
      {
        name: 'Redis',
        badge: 'v7',
        color: '#dc2626',
        dot: 'bg-red-500',
        tagline: 'The speed-memory for frequently used data',
        plain: 'If PostgreSQL is the filing cabinet, Redis is the notepad on your desk. Rather than opening the cabinet every single time to look up the same information, the most-used data gets jotted on the notepad (Redis) for instant access. This dramatically speeds up responses for common queries.',
        detail: 'An in-memory data store used for caching, session storage, and pub/sub messaging. Runs on port 6379.',
      },
      {
        name: 'Docker',
        badge: '',
        color: '#2496ed',
        dot: 'bg-blue-500',
        tagline: 'The container that makes setup identical everywhere',
        plain: 'Docker packages the databases and their settings into sealed "containers" — like shipping containers for software. This guarantees the database behaves exactly the same on every developer\'s laptop and on the production server, eliminating the classic "it works on my machine" problem.',
        detail: 'Used via docker-compose to run isolated PostgreSQL and Redis instances, ensuring reproducible environments across development and production.',
      },
    ],
  },
  {
    category: 'External Data & Integrations',
    emoji: '🔌',
    summary: 'Services this app connects to in order to pull live project data.',
    items: [
      {
        name: 'Azure DevOps (ADO)',
        badge: 'REST API',
        color: '#0078d4',
        dot: 'bg-blue-500',
        tagline: 'Where your real project data comes from',
        plain: 'Azure DevOps is Microsoft\'s project management platform used by GlobalHealthX. This app connects to it via a secure API (like a digital handshake) to pull in live sprints, work items, bugs, pull requests, and team data — so everything you see is always up to date from the source of truth.',
        detail: 'Microsoft\'s DevOps platform. The Healix Engage server authenticates with a Personal Access Token (PAT), calling the ADO REST API to fetch organisations, projects, sprints, work items, repositories, and team members.',
      },
      {
        name: 'Microsoft Graph API',
        badge: 'v1.0',
        color: '#0078d4',
        dot: 'bg-sky-600',
        tagline: 'Pulls in your Microsoft account details',
        plain: 'Microsoft Graph is like a single master key to all Microsoft 365 services — Teams, Outlook, Azure AD, SharePoint. The pm-tracker uses it to let you sign in with your existing Microsoft work account, so you don\'t need a separate password.',
        detail: 'Used in the pm-tracker for OAuth2 sign-in via Microsoft accounts (Azure AD), fetching user profiles and account information.',
      },
    ],
  },
  {
    category: 'Developer Infrastructure',
    emoji: '🛠️',
    summary: 'The tools and practices that keep development fast, safe, and reliable.',
    items: [
      {
        name: 'Zustand',
        badge: 'v4',
        color: '#f97316',
        dot: 'bg-orange-400',
        tagline: 'The app\'s shared memory',
        plain: 'When you select a project in the filter bar, every screen needs to know about it. Zustand is the shared memory that holds that information and automatically tells all the relevant parts of the app to update — without passing information manually from screen to screen.',
        detail: 'A lightweight, hook-based state management library for React. Used for global auth state, filter state, and cross-component data sharing.',
      },
      {
        name: 'Axios',
        badge: 'v1',
        color: '#5a29e4',
        dot: 'bg-purple-500',
        tagline: 'The messenger between browser and server',
        plain: 'Every time the app needs to load data or save something, it sends a request to the server. Axios is the reliable messenger that handles those requests, automatically retries if the network hiccups, and attaches your login token so the server knows it\'s really you.',
        detail: 'A promise-based HTTP client used in the Healix Engage client and Wiki module to communicate with backend APIs, with interceptors for auth token injection and refresh.',
      },
      {
        name: 'Socket.IO',
        badge: 'v4',
        color: '#25c2a0',
        dot: 'bg-teal-400',
        tagline: 'Live updates without refreshing',
        plain: 'With normal web requests, you have to refresh the page to get new data. Socket.IO opens a persistent two-way connection — like a phone line that stays open. This means if a colleague edits a Wiki page, your browser can receive that update instantly without you doing anything.',
        detail: 'A WebSocket library providing real-time, bidirectional communication between the Wiki server and clients for live collaboration and notifications.',
      },
      {
        name: 'date-fns',
        badge: 'v3',
        color: '#f472b6',
        dot: 'bg-pink-400',
        tagline: 'Makes dates and times human-readable',
        plain: 'Computers store dates as cryptic numbers (like 1718530800000). date-fns converts those into readable phrases like "2 hours ago", "Last Monday", or "June 16, 2026". Every timestamp you see in the app goes through this library.',
        detail: 'A modern JavaScript date utility library with 200+ pure functions for formatting, parsing, comparing, and manipulating dates.',
      },
    ],
  },
];

function TechStackModal({ onClose }: { onClose: () => void }) {
  const [activeCat, setActiveCat] = useState(0);
  const [activeItem, setActiveItem] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const cat = TECH_STACK[activeCat];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-[5%]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full h-full bg-surface-card border border-white/10 rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-pop-up">

        {/* ── Top header bar ── */}
        <div className="flex-shrink-0 flex items-center gap-4 px-6 py-4 border-b border-surface-border bg-gradient-to-r from-surface-elevated to-surface-card">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
              <Layers size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base leading-tight">Tech Stack</h2>
              <p className="text-gray-500 text-label leading-tight">
                {TECH_STACK.reduce((n, c) => n + c.items.length, 0)} technologies across {TECH_STACK.length} layers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <span className="flex items-center gap-1.5 text-label bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              All systems live
            </span>
            <span className="text-label bg-white/5 border border-white/8 text-gray-500 rounded-full px-2.5 py-1">
              GlobalHealthX · Internal
            </span>
          </div>

          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body: left nav + right content ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: category nav */}
          <nav className="flex-shrink-0 w-60 border-r border-white/6 flex flex-col bg-surface-elevated py-3 overflow-y-auto">
            <p className="px-4 mb-2 text-label text-gray-600 uppercase tracking-widest font-semibold">Layers</p>
            {TECH_STACK.map((c, i) => (
              <button
                key={c.category}
                onClick={() => { setActiveCat(i); setActiveItem(null); }}
                className={cn(
                  'w-full text-left flex items-start gap-3 px-4 py-3 transition-all relative',
                  activeCat === i
                    ? 'bg-white/6 text-white'
                    : 'text-gray-500 hover:bg-white/4 hover:text-gray-300',
                )}
              >
                {activeCat === i && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full bg-brand-500" />
                )}
                <span className="text-xl leading-none mt-0.5 flex-shrink-0">{c.emoji}</span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold leading-snug">{c.category}</div>
                  <div className="text-label text-gray-600 mt-0.5 leading-snug">{c.items.length} technologies</div>
                </div>
              </button>
            ))}

            {/* Footer */}
            <div className="mt-auto px-4 pt-4 pb-2 border-t border-white/5">
              <p className="text-label text-gray-700 leading-relaxed">
                No data leaves<br />the org's infrastructure
              </p>
            </div>
          </nav>

          {/* Right: content */}
          <div className="flex-1 overflow-hidden flex flex-col">

            {/* Category header */}
            <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className="text-3xl leading-none">{cat.emoji}</span>
                <div>
                  <h3 className="text-white font-bold text-sm">{cat.category}</h3>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{cat.summary}</p>
                </div>
              </div>
            </div>

            {/* Tech cards grid */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {cat.items.map((item) => {
                  const isOpen = activeItem === item.name;
                  return (
                    <div
                      key={item.name}
                      className={cn(
                        'rounded-xl border transition-all duration-200 overflow-hidden',
                        isOpen
                          ? 'border-white/15 bg-white/[0.04] col-span-1 sm:col-span-2'
                          : 'border-white/7 bg-white/[0.025] hover:border-white/12 hover:bg-white/[0.04]',
                      )}
                    >
                      {/* Card header — always visible */}
                      <button
                        onClick={() => setActiveItem(isOpen ? null : item.name)}
                        className="w-full text-left flex items-center gap-3.5 p-4"
                      >
                        {/* Colour swatch */}
                        <div
                          className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-lg font-bold shadow-inner"
                          style={{ background: `${item.color}18`, border: `1.5px solid ${item.color}35` }}
                        >
                          <span className={cn('w-3 h-3 rounded-full flex-shrink-0', item.dot)} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-100">{item.name}</span>
                            {item.badge && (
                              <span className="text-label px-1.5 py-0.5 rounded-md font-mono leading-none"
                                style={{ background: `${item.color}15`, color: item.color, border: `1px solid ${item.color}30` }}>
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-label text-gray-500 mt-0.5 leading-snug">{item.tagline}</p>
                        </div>

                        <ChevronDown
                          size={14}
                          className={cn('text-gray-600 flex-shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
                        />
                      </button>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div className="px-4 pb-5 pt-1 space-y-3 border-t border-white/6">

                          {/* Plain English */}
                          <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-200">
                            <div className="flex items-center gap-2 mb-2.5">
                              <span className="text-base">💬</span>
                              <span className="text-label font-bold text-emerald-700 uppercase tracking-widest">Plain English</span>
                              <span className="ml-1 text-label text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">Anyone can understand this</span>
                            </div>
                            <p className="text-sm text-gray-700 leading-[1.7]">{item.plain}</p>
                          </div>

                          {/* Technical detail */}
                          <div className="rounded-xl p-4 bg-blue-50 border border-blue-200">
                            <div className="flex items-center gap-2 mb-2.5">
                              <span className="text-base">🔬</span>
                              <span className="text-label font-bold text-blue-700 uppercase tracking-widest">Technical Detail</span>
                              <span className="ml-1 text-label text-blue-700 bg-blue-100 border border-blue-200 rounded-full px-2 py-0.5">For engineers</span>
                            </div>
                            <p className="text-xs text-gray-600 leading-[1.7]">{item.detail}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className={cn(
      'rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center font-semibold text-white flex-shrink-0',
      size === 'sm' ? 'w-6 h-6 text-label' : 'w-8 h-8 text-xs',
    )}>
      {initials}
    </span>
  );
}

export default function App() {
  const { token, user, setAuth } = useAuthStore();

  useEffect(() => {
    if (!token) return;
    api.getMe()
      .then((fresh) => setAuth(token, fresh))
      .catch(() => {});
  }, [token]);

  if (!token || !user) return <AuthPage />;
  return <Dashboard user={user} />;
}

const VALID_TABS: Tab[] = ['boards', 'bugs', 'engineers', 'repos', 'wiki', 'risks'];

function getTabFromHash(): Tab {
  const hash = window.location.hash.slice(1) as Tab;
  return VALID_TABS.includes(hash) ? hash : 'boards';
}

function Dashboard({ user }: { user: AuthUser }) {
  const { clearAuth } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const [tab, setTab] = useState<Tab>(getTabFromHash);
  const [collapsed, setCollapsed] = useState(false);
  const [showTechStack, setShowTechStack] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [conn, setConn] = useState<{ ok: boolean; label: string } | null>(null);

  const { filters } = useFilterStore();

  useEffect(() => {
    api.ping()
      .then((r) => setConn({ ok: true, label: `${r.org} · ${r.projectCount} projects` }))
      .catch(() => setConn({ ok: false, label: 'Connection failed' }));
  }, []);

  useEffect(() => {
    if (!showProfileMenu) return;
    function handler(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfileMenu]);

  // Sync tab → URL hash
  useEffect(() => {
    if (window.location.hash.slice(1) !== tab) {
      window.location.hash = tab;
    }
  }, [tab]);

  // Browser back/forward → sync hash → tab
  useEffect(() => {
    function handlePopState() { setTab(getTabFromHash()); }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const hasProject = !!filters.project;
  const activeItem = NAV_ITEMS.find(n => n.id === tab)!;
  const Icon = activeItem.icon;
  const nopad = tab === 'wiki' || tab === 'boards';

  return (
    <div className="h-screen flex overflow-hidden bg-surface">

      {/* ── Mobile overlay ── */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={cn(
        'flex flex-col flex-shrink-0 border-r border-gray-200 bg-white transition-all duration-200',
        // Mobile: fixed drawer sliding in from left
        'fixed inset-y-0 left-0 z-40 w-[260px]',
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: relative, no translate, width driven by collapsed state
        'md:relative md:inset-auto md:translate-x-0 md:z-auto',
        collapsed ? 'md:w-[60px]' : 'md:w-[220px]',
      )}>

        {/* ── Logo + collapse ── */}
        <div className={cn(
          'flex items-center border-b border-gray-200 flex-shrink-0 min-h-[52px]',
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-3.5',
        )}>
          {/* Wordmark */}
          <div className="relative flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-md shadow-brand-500/20">
              <span className="text-white font-black text-label tracking-tighter select-none">H</span>
            </div>
            {/* Live dot */}
            {conn?.ok && (
              <span className="absolute -bottom-[3px] -right-[3px] w-[9px] h-[9px] rounded-full bg-emerald-500 border-[1.5px] border-surface-card" />
            )}
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 font-bold text-sm leading-none tracking-tight whitespace-nowrap">Healix Engage</p>
              <p className="text-gray-500 text-[10px] leading-none mt-[5px] whitespace-nowrap">Jarvis Intelligence</p>
            </div>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {!collapsed && (
            <p className="px-2 mb-2 text-label font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 select-none">
              Modules
            </p>
          )}
          <div className="space-y-[2px]">
            {NAV_ITEMS.map((item) => {
              const ItemIcon = item.icon;
              const isActive = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setTab(item.id); setMobileNavOpen(false); }}
                  title={collapsed ? `${item.label} — ${item.description}` : undefined}
                  className={cn(
                    'w-full flex items-center rounded-lg transition-all duration-150 group relative select-none',
                    collapsed ? 'justify-center px-0 py-[9px]' : 'gap-2.5 px-2 py-[9px]',
                    isActive
                      ? item.activeBg
                      : 'hover:bg-gray-100',
                  )}
                >
                  {/* Active indicator — module-coloured gradient bar */}
                  {isActive && (
                    <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] rounded-r-full bg-gradient-to-b ${item.barColor}`} />
                  )}

                  {/* Icon container */}
                  <div className={cn(
                    'w-[28px] h-[28px] flex items-center justify-center rounded-[7px] flex-shrink-0 transition-all duration-150',
                    isActive
                      ? cn(item.iconBg, item.color)
                      : 'text-gray-500 group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-300',
                  )}>
                    <ItemIcon size={15} strokeWidth={isActive ? 2.2 : 1.8} />
                  </div>

                  {!collapsed && (
                    <>
                      <span className={cn(
                        'flex-1 text-left text-sm font-medium leading-none tracking-[-0.01em]',
                        isActive ? cn(item.color, 'font-semibold') : 'text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-gray-200',
                      )}>
                        {item.label}
                      </span>
                      {item.id === 'risks' && (
                        <RisksBadge project={filters.project} collapsed={false} />
                      )}
                    </>
                  )}

                  {collapsed && item.id === 'risks' && (
                    <RisksBadge project={filters.project} collapsed={true} />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── Bottom dock ── */}
        <div className="flex-shrink-0 border-t border-gray-200 px-2 pt-2 pb-2.5">

          <div className={cn('flex mb-1', collapsed ? 'justify-center' : 'justify-end px-1')}>
            <button
              onClick={() => setCollapsed(p => !p)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
            >
              {collapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
            </button>
          </div>

        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <header className="flex-shrink-0 flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 border-b border-gray-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-none z-10">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <Menu size={18} />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0', activeItem.iconBg)}>
              <Icon size={13} className={activeItem.color} />
            </div>
            <h1 className={cn('font-semibold text-sm truncate', activeItem.color)}>{activeItem.label}</h1>
            <span className="text-gray-400 text-xs hidden sm:block">/ {activeItem.description}</span>
          </div>

          <div className="flex-1" />


          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors">
            <Settings size={14} />
          </button>

          {/* Profile / sign out */}
          <div ref={profileMenuRef} className="relative flex-shrink-0">
            <button
              onClick={() => setShowProfileMenu(p => !p)}
              className={cn(
                'rounded-full transition-all',
                showProfileMenu ? 'ring-2 ring-brand-400' : 'hover:ring-2 hover:ring-brand-400',
              )}
            >
              <Avatar name={user.name} size="sm" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[140px]">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-800 truncate">{user.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
                </div>
                <button
                  onClick={clearAuth}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>

          {showSettings && (
            <SettingsModal currentUser={user} onClose={() => setShowSettings(false)} />
          )}

          {/* Tech Stack icon */}
          <button
            onClick={() => setShowTechStack(true)}
            title="View Tech Stack"
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
              showTechStack
                ? 'bg-brand-500/20 text-brand-400'
                : 'text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10',
            )}
          >
            <Layers size={15} />
          </button>
        </header>

        {showTechStack && <TechStackModal onClose={() => setShowTechStack(false)} />}

        {/* Filter bar — hidden on Wiki and Boards (boards has its own unified filter bar) */}
        {tab !== 'wiki' && tab !== 'boards' && <FilterBar activeTab={tab} />}

        {/* Content */}
        {tab === 'boards' ? (
          <main className="flex-1 overflow-hidden">
            <BoardsModule />
          </main>
        ) : !hasProject ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600/30 to-violet-600/30 border border-brand-500/20 flex items-center justify-center mx-auto mb-5">
                <LayoutDashboard size={28} className="text-brand-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">No project selected</h2>
              <p className="text-gray-500 text-sm leading-relaxed">Choose a project from the filter bar above to load boards, bugs, team members, and more.</p>
            </div>
          </div>
        ) : (
          <main className={cn('flex-1 overflow-hidden', !nopad && 'overflow-y-auto p-3 sm:p-6')}>
            {tab === 'bugs'      && <BugsModule />}
            {tab === 'engineers' && <EngineersModule />}
            {tab === 'repos'     && <ReposModule />}
            {tab === 'wiki'      && <WikiModule />}
            {tab === 'risks'     && <RisksModule />}
          </main>
        )}
      </div>
    </div>
  );
}

function RisksBadge({ project, collapsed }: { project: string; collapsed: boolean }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!project) return;
    api.getRisks(project).then((r) => {
      setCount(r.filter((risk) => risk.severity === 'critical' || risk.severity === 'high').length);
    }).catch(() => {});
  }, [project]);
  if (!count) return null;
  return (
    <span className={cn(
      'flex-shrink-0 rounded-full bg-red-500 text-white font-bold leading-none flex items-center justify-center',
      collapsed ? 'w-4 h-4 text-label absolute top-1 right-1' : 'px-1.5 py-0.5 text-label',
    )}>
      {count}
    </span>
  );
}
