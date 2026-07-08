import { useState, useEffect, useRef } from 'react';
import {
  SquareKanban, CircleDot, UserCog, FolderGit2, NotebookPen, OctagonAlert,
  PanelLeftClose, PanelLeft, Menu,
  Settings, Layers, X, ChevronDown, LayoutDashboard,
  Sun, Moon, Shield,
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
import { AuditLogModal } from './components/settings/AuditLogModal';
import { api } from './api/client';
import { useFilterStore } from './store/filters';
import { useAuthStore } from './store/auth';
import type { AuthUser } from './store/auth';
import { useThemeStore } from './store/theme';
import { cn } from './utils/cn';
import { AIChatPanel } from './components/common/AIChatPanel';

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
    category: 'Frontend',
    emoji: '🖥️',
    color: '#61dafb',
    port: 'Port 5175',
    status: 'live',
    summary: 'Everything you see and click on — the browser-side application served by Vite and rendered by React.',
    items: [
      {
        name: 'React',
        badge: 'v18',
        color: '#61dafb',
        tagline: 'The building blocks of every screen',
        plain: 'Think of React as LEGO for websites. Every button, card, and panel is a separate "piece" that snaps together. When something changes — like marking a bug as fixed — only that one piece updates instead of reloading the whole page. This makes the app feel instant.',
        detail: 'A JavaScript library by Meta using a component model and virtual DOM for high-performance UI updates. Every module (Boards, Bugs, Engineers, Repos, Wiki, Risks) is a self-contained React component tree.',
      },
      {
        name: 'TypeScript',
        badge: 'v5',
        color: '#3178c6',
        tagline: 'Spell-check for the entire codebase',
        plain: 'TypeScript checks the logic of every line of code before the app runs — like a grammar checker for programming. It catches mistakes at write-time, so bugs that would only surface in production get caught immediately during development.',
        detail: 'Strongly-typed superset of JavaScript covering both the client (src/) and server (src/). Shared type definitions across the API boundary prevent mismatches between what the server sends and what the client expects.',
      },
      {
        name: 'Vite',
        badge: 'v5',
        color: '#646cff',
        tagline: 'Sub-second hot reload during development',
        plain: 'When a developer changes a button colour or fixes a bug, Vite applies that change in under a second — no full page reload, no waiting. In production it bundles everything into tiny optimised files that load fast for every user.',
        detail: 'Next-gen build tool leveraging native ES modules and esbuild. Dev server on port 5175 with `host: true` (LAN + tunnel accessible). Proxies /api → Express :3001 and /wiki-api → Wiki server :3002.',
      },
      {
        name: 'Tailwind CSS',
        badge: 'v3',
        color: '#38bdf8',
        tagline: 'The design system keeping everything consistent',
        plain: 'Instead of writing custom CSS files, every element in the app uses Tailwind\'s pre-built design tokens — the same spacing, the same rounded corners, the same shadows everywhere. That\'s why every screen feels like one cohesive product.',
        detail: 'Utility-first CSS framework with a custom config (tailwind.config.js) extending the brand palette (brand-*, surface-*). Dark mode enabled via the "dark" class strategy. index.css contains critical global overrides including the text-white → dark-text remap for light mode.',
      },
      {
        name: 'Tiptap',
        badge: 'v2',
        color: '#6366f1',
        tagline: 'The word-processor powering Wiki pages',
        plain: 'The Wiki editor works just like Google Docs — bold, headings, tables, checklists, code blocks. You can see every past version and restore any of them. Tiptap is the engine that makes all of that possible inside the browser.',
        detail: 'Headless rich-text editor built on ProseMirror. Powers the Wiki module with extensions for slash commands, tables, code highlighting, version history, and real-time collaborative cursors via Socket.IO.',
      },
      {
        name: 'Lucide Icons',
        badge: '1400+ icons',
        color: '#f59e0b',
        tagline: 'Every icon you see in the interface',
        plain: 'Every small symbol — the folder icon, the bug dot, the settings gear — comes from Lucide. It\'s a single, carefully designed icon set so every symbol shares the same visual weight and style across the entire application.',
        detail: 'MIT-licensed SVG icon library consumed as React components (lucide-react). Tree-shaken at build time so only used icons are included in the bundle.',
      },
    ],
  },
  {
    category: 'Backend API',
    emoji: '⚙️',
    color: '#84cc16',
    port: 'Port 3001',
    status: 'live',
    summary: 'The Express server that handles all authenticated API requests, enforces access control, and orchestrates data from ADO and Ollama.',
    items: [
      {
        name: 'Node.js',
        badge: 'v20 LTS',
        color: '#84cc16',
        tagline: 'The runtime that powers both servers',
        plain: 'Node.js is the engine that runs our server code — like a car engine. When you load your sprint board, Node.js receives the request, talks to Azure DevOps, and sends back the formatted data in milliseconds. It runs both the main API server and the Wiki server.',
        detail: 'Event-driven, non-blocking runtime built on V8. Runs the Healix Engage API (port 3001) with ts-node-dev for live TypeScript reloading, and the Wiki server (port 3002).',
      },
      {
        name: 'Express',
        badge: 'v4',
        color: '#94a3b8',
        tagline: 'Routes every request to the right handler',
        plain: 'Express is like a hotel switchboard — every incoming request gets routed to the right handler. "/api/boards" goes to the boards service, "/api/ai/chat" goes to the AI service. Each route has middleware that checks you\'re logged in before letting through.',
        detail: 'Minimal Node.js web framework. Routes: /api/auth (login/register/reset), /api/users (admin-only user management), /api/ai/chat (contextual AI), /api/* (ADO data, protected by requireAuth middleware). Serves the standalone password-reset HTML page at /reset-password.',
      },
      {
        name: 'JWT Authentication',
        badge: '7-day tokens',
        color: '#f97316',
        tagline: 'Your encrypted digital ID badge',
        plain: 'When you log in, the server creates a small encrypted token — like a hotel key card. Every request after that carries this token. The server reads it to know who you are and what you\'re allowed to do, without checking a database every time.',
        detail: 'jsonwebtoken library. Tokens signed with JWT_SECRET (env var), expire in 7 days. requireAuth middleware validates tokens on every /api route. requireAdmin additionally checks role === "admin" for user management endpoints.',
      },
      {
        name: 'bcrypt',
        badge: '12 rounds',
        color: '#e879f9',
        tagline: 'Makes passwords impossible to reverse-engineer',
        plain: 'Your password is never stored as plain text. bcrypt scrambles it through a one-way mathematical process 4,096 times over. Even if someone stole the database, they could not work backwards to find your actual password — it would take centuries to brute-force.',
        detail: 'bcryptjs with salt rounds = 12. Used on register, password reset, and admin-invite flows. Cost factor 12 gives ~300ms hash time — slow enough to deter attacks, fast enough for users.',
      },
      {
        name: 'File-backed Stores',
        badge: 'JSON',
        color: '#34d399',
        tagline: 'Zero-dependency user and token persistence',
        plain: 'User accounts and password-reset tokens are saved in simple JSON files on disk. This means the server can restart — which it does frequently during development — and nobody loses their account or a pending reset link.',
        detail: 'server/data/users.json (user accounts, roles, password hashes) and server/data/reset-tokens.json (one-time-use reset tokens, 30 min TTL). ensureSuperAdmin() runs at every boot to guarantee ganesh.bandi@globalhealthx.co always has role: "admin".',
      },
    ],
  },
  {
    category: 'AI & Intelligence',
    emoji: '🤖',
    color: '#818cf8',
    port: 'Port 11434',
    status: 'live',
    summary: 'Local LLM inference via Ollama powers the contextual AI chat panel and the daily morning digest analysis — no data leaves the device.',
    items: [
      {
        name: 'Ollama',
        badge: 'Local LLM',
        color: '#818cf8',
        tagline: 'Runs AI models entirely on your Mac',
        plain: 'Ollama runs powerful AI models directly on your laptop, like having ChatGPT built into the machine but without sending anything to the cloud. All analysis — sprint summaries, AI chat answers, code insights — is computed locally. Your patient management data never leaves your infrastructure.',
        detail: 'Local inference server on port 11434. Exposes /api/chat endpoint. Used by both aiInsights.ts (sprint analysis) and aiChat.ts (contextual Q&A). AbortSignal.timeout(120_000) ensures long queues don\'t stall the UI. think: false disables chain-of-thought for faster responses.',
      },
      {
        name: 'qwen3.5:4b',
        badge: '4.7B params',
        color: '#a78bfa',
        tagline: 'The AI model answering your questions',
        plain: 'qwen3.5:4b is a 4.7 billion parameter language model — a compact but highly capable AI that understands project management context well. It reads live ADO data and formulates actionable answers in plain English, typically in 2–5 seconds.',
        detail: 'Alibaba Cloud Qwen 3.5 series, quantised to Q4_K_M (3.4 GB). Also available: qwen3:8B, llama3:8B, gemma:9B. Model selected via OLLAMA_MODEL env var. Temperature 0.55 for AI chat (factual), 0.4 for sprint analysis (consistent).',
      },
      {
        name: 'Healix AI Chat',
        badge: 'Context-aware',
        color: '#38bdf8',
        tagline: 'The floating AI assistant on every screen',
        plain: 'The Sparkles button in the bottom-right opens a chat panel that knows which section you\'re in. Ask it anything about the current view — "who has the most active work?" on Boards, "any critical risks?" on Risks — and it pulls live ADO data before answering.',
        detail: 'POST /api/ai/chat. Section-aware context fetching: boards → work items + sprint stats, engineers → commit/PR activity, repos → repo list, risks → risk register. Data fetches capped at 8 s (withTimeout) so ADO latency never blocks Ollama. Returns {answer, section, sources}.',
      },
      {
        name: 'Morning Digest AI',
        badge: 'Daily 7 AM IST',
        color: '#f472b6',
        tagline: 'AI-written sprint briefing emailed every morning',
        plain: 'Every weekday morning at 7 AM, the system automatically fetches all sprint data, sends it to the AI model, and emails you a rich HTML briefing with a burndown chart, velocity trends, team workload analysis, and three specific actions to take today.',
        detail: 'scripts/morning-digest.mjs — ESM Node script. LaunchAgent (com.prm.morning-digest) triggers it via StartCalendarInterval at 07:00 IST. Weekend guard (getDay check) exits silently on Sat/Sun to prevent launchd catch-up misfires. Sends via osascript + Microsoft Outlook.',
      },
    ],
  },
  {
    category: 'Data & Storage',
    emoji: '🗄️',
    color: '#336791',
    port: 'Ports 5432 / 5433 / 6379',
    status: 'live',
    summary: 'Persistent data stores for the Wiki and pm-tracker. The Healix Engage API itself uses flat JSON files and ADO as source of truth.',
    items: [
      {
        name: 'PostgreSQL',
        badge: 'v16',
        color: '#336791',
        tagline: 'The relational database for Wiki and pm-tracker',
        plain: 'PostgreSQL is a hyper-organised filing cabinet. Every Wiki page, every user profile in the pm-tracker lives here in structured tables. We run two separate instances so the Wiki and the project tracker never interfere with each other.',
        detail: 'Two Dockerised instances: pm-tracker on port 5432, Wiki on port 5433. ACID-compliant, handles concurrent writes safely. Schema managed by Prisma migrations. Row-level data versioning for Wiki page history.',
      },
      {
        name: 'Prisma ORM',
        badge: 'Wiki + pm-tracker only',
        color: '#5a67d8',
        tagline: 'Type-safe database access — Wiki & pm-tracker, NOT this app',
        plain: 'Prisma is used by the Wiki server and the pm-tracker to talk to their PostgreSQL databases. This app (Healix Engage PRM) does not use Prisma — it stores users in a flat JSON file and reads all project data live from Azure DevOps. No local relational database here.',
        detail: 'Used in wiki/server/prisma (Wiki pages, spaces, version history) and pm-tracker (users, projects). NOT present in the Healix Engage PRM server — which uses server/data/users.json + server/data/reset-tokens.json for persistence and ADO REST API as its source of truth.',
      },
      {
        name: 'Redis',
        badge: 'v7',
        color: '#dc2626',
        tagline: 'In-memory cache for lightning-fast responses',
        plain: 'Redis is the notepad on your desk. Rather than opening the filing cabinet every time to look up the same information, frequently-used data is kept in Redis for near-instant retrieval. ADO API responses are cached here to avoid redundant network calls.',
        detail: 'In-memory key-value store on port 6379. Used for ADO response caching in the Healix Engage server (cache.ts service, TTL-based). Also used in the Wiki server for session data and rate limiting.',
      },
      {
        name: 'Docker',
        badge: 'docker-compose',
        color: '#2496ed',
        tagline: 'Identical database environments everywhere',
        plain: 'Docker packages both databases into sealed containers. A developer on any machine, or a production server, gets exactly the same PostgreSQL and Redis setup — eliminating the "works on my machine" problem entirely.',
        detail: 'docker-compose.yml at repo root orchestrates PostgreSQL (×2) and Redis. Named volumes ensure data persists across container restarts. Health checks prevent app startup before the database is ready.',
      },
    ],
  },
  {
    category: 'Integrations',
    emoji: '🔌',
    color: '#0078d4',
    port: 'REST / OAuth2',
    status: 'live',
    summary: 'External platforms the dashboard connects to for live project data, identity, and code repository access.',
    items: [
      {
        name: 'Azure DevOps REST API',
        badge: 'v7.1',
        color: '#0078d4',
        tagline: 'Live source of all project and sprint data',
        plain: 'Azure DevOps is the system Global HealthX uses to manage all software work. This dashboard connects via a secure API key to pull in everything in real-time — work items, sprint boards, bugs, pull requests, repositories, pipeline runs, and team members.',
        detail: 'ADO REST API v7.1. Auth via PAT (Base64-encoded Basic auth header). adoClient.ts handles org-level and project-level endpoints. Supports WIQL queries for filtered work item retrieval. Covers: Work Items, Iterations, Teams, Repositories, Commits, PRs, Pipelines, Wiki pages.',
      },
      {
        name: 'ADO Git Repositories',
        badge: 'HTTPS push',
        color: '#106ebe',
        tagline: 'Code is mirrored to both GitHub and ADO',
        plain: 'Every code change is automatically pushed to two places: GitHub (for open collaboration) and Azure DevOps (for enterprise backup and ADO pipeline integration). Both repositories stay in sync after every commit.',
        detail: 'Git remote "ado" points to dev.azure.com/globalhealthx/Healix Engage Project Management Dashboard. PAT auth embedded in remote URL. Pushed in parallel with "origin" (GitHub) after every change via rsync + git push both remotes workflow.',
      },
      {
        name: 'Microsoft Graph API',
        badge: 'v1.0',
        color: '#00a4ef',
        tagline: 'Microsoft 365 identity and account access',
        plain: 'The Graph API is Microsoft\'s master key to all M365 services. The pm-tracker uses it so team members can sign in with their existing Microsoft work accounts — no extra password needed.',
        detail: 'OAuth2 flow via NextAuth in the pm-tracker. Scopes: User.Read, profile, email. Fetches display name, job title, and profile photo for team member cards.',
      },
      {
        name: 'Microsoft Outlook (AppleScript)',
        badge: 'osascript',
        color: '#0f78d4',
        tagline: 'Sends the morning digest email via Outlook',
        plain: 'The morning digest email is sent through Microsoft Outlook on the Mac using AppleScript — a built-in Mac automation language. This means the email comes from your real Outlook account, arrives in the right inbox, and looks exactly like a professionally sent HTML email.',
        detail: 'mailer.ts writes HTML to a temp file, generates an AppleScript that opens Outlook, creates a message with the HTML body, and sends it. Triggers via osascript binary. Recipients: ganesh.bandi, varun.m, manushree.enuganti @globalhealthx.co.',
      },
    ],
  },
  {
    category: 'Automation',
    emoji: '⏰',
    color: '#34d399',
    port: 'LaunchAgent',
    status: 'live',
    summary: 'macOS-native scheduling and scripting that automates the morning digest, code sync, and deployment workflows.',
    items: [
      {
        name: 'macOS LaunchAgent',
        badge: 'plist',
        color: '#34d399',
        tagline: 'The alarm clock that triggers the morning digest',
        plain: 'macOS LaunchAgent is the operating system\'s built-in scheduler — like setting an alarm. At exactly 7:00 AM every weekday, it wakes up, runs the morning digest script, and goes back to sleep. No external service needed, no cloud scheduler, it all runs locally.',
        detail: 'com.prm.morning-digest.plist in ~/Library/LaunchAgents. StartCalendarInterval: Hour=7, Minute=0 IST. RunAtLoad=false. Weekend guard in the script exits on Sat/Sun to prevent launchd catch-up fires after Mac sleep. Logs to /tmp/prm-morning-digest.log.',
      },
      {
        name: 'Morning Digest Script',
        badge: 'Node ESM',
        color: '#6ee7b7',
        tagline: '1,400-line automated briefing generator',
        plain: 'The digest script runs automatically every weekday morning. It fetches everything from Azure DevOps, runs AI analysis with Ollama, generates a rich HTML email with charts and insights, and sends it — all without anyone clicking anything.',
        detail: 'scripts/morning-digest.mjs — pure ESM, no bundler. Fetches work items, iterations, commits, PRs, pipelines, engineers. Builds SVG burndown chart and pie charts inline in HTML. Calls Ollama for 6-section AI sprint analysis and code quality commentary. Sends via osascript+Outlook.',
      },
      {
        name: 'rsync + Git Push',
        badge: 'dual remote',
        color: '#a3e635',
        tagline: 'Instant code sync to GitHub and Azure DevOps',
        plain: 'Every code change is immediately copied to a clean git repository and pushed to both GitHub and Azure DevOps simultaneously. This gives you full version history, two cloud backups, and keeps the ADO repo (used for pipeline triggers) always in sync.',
        detail: 'rsync -a --delete syncs client/src and server/src to PRM_GIT/PRM. Then git commit + git push origin main (GitHub) + git push ado main (Azure DevOps). Both remotes always stay in sync. The .env file (contains ADO PAT) is in .gitignore and never committed.',
      },
      {
        name: 'ts-node-dev',
        badge: 'hot reload',
        color: '#fbbf24',
        tagline: 'Server restarts instantly when code changes',
        plain: 'When a developer changes a line of server code, ts-node-dev detects it within milliseconds, compiles the TypeScript, and restarts the server — all automatically. The server is never down for more than half a second during active development.',
        detail: 'ts-node-dev --respawn --transpile-only src/index.ts. Uses SWC for fast TypeScript transpilation. File-backed stores (JSON) ensure no data is lost across restarts, unlike in-memory Maps which would clear on every hot reload.',
      },
    ],
  },
  {
    category: 'Developer Tooling',
    emoji: '🛠️',
    color: '#f97316',
    port: 'Build tools',
    status: 'live',
    summary: 'Libraries and utilities that keep the codebase productive, fast, and maintainable.',
    items: [
      {
        name: 'Zustand',
        badge: 'v4',
        color: '#f97316',
        tagline: 'Shared state across all React components',
        plain: 'When you select a project in the filter bar, every screen — Boards, Bugs, Engineers — needs to know about it. Zustand is the shared memory that holds that selection and automatically tells all parts of the app to refresh. No drilling props through dozens of components.',
        detail: 'Lightweight hook-based state management. Three stores: useAuthStore (JWT token, user profile, role), useFilterStore (project, team, iteration selections), useThemeStore (light/dark mode). Persisted to localStorage via Zustand persist middleware.',
      },
      {
        name: 'Axios',
        badge: 'v1',
        color: '#5a29e4',
        tagline: 'The authenticated messenger to the backend',
        plain: 'Every time the app loads data, Axios sends the request and automatically attaches your login token — so the server always knows it\'s really you. If your session expires, Axios intercepts the 401 response and redirects you to log in again.',
        detail: 'Promise-based HTTP client. apiClient instance (baseURL: /api) has request interceptor that reads JWT from localStorage and attaches Authorization: Bearer header. Response interceptor handles 401 → clearAuth + reload. Used throughout client/ and wiki module.',
      },
      {
        name: 'Socket.IO',
        badge: 'v4',
        color: '#25c2a0',
        tagline: 'Live collaboration in the Wiki',
        plain: 'When you and a colleague both edit the same Wiki page, Socket.IO keeps both views in sync in real time — just like Google Docs. Changes appear on their screen as you type, and vice versa, without either of you needing to refresh.',
        detail: 'WebSocket library providing bidirectional, event-based communication between Wiki server and browser clients. Used for collaborative cursor presence, live content sync, and instant notification of edits by other users.',
      },
      {
        name: 'date-fns',
        badge: 'v3',
        color: '#f472b6',
        tagline: 'Human-readable dates and times',
        plain: 'Computers store timestamps as raw numbers. date-fns turns them into "2 hours ago", "Last Monday", or "June 16, 2026". Every date you see in sprint cards, commit logs, and risk registers goes through this library to become readable.',
        detail: 'Modular JavaScript date utility library with 200+ pure, tree-shakeable functions. No prototype pollution, unlike moment.js. Used for formatting (format, formatDistanceToNow), parsing, and date arithmetic across sprint calculations.',
      },
    ],
  },
];

// ── Architecture flow for the overview tab ────────────────────────────────────
const ARCH_FLOW = [
  { label: 'Browser', sub: 'React + Vite :5175', color: '#61dafb', icon: '🖥️' },
  { label: 'Express API', sub: 'Node.js :3001', color: '#84cc16', icon: '⚙️' },
  { label: 'Azure DevOps', sub: 'REST API v7.1', color: '#0078d4', icon: '☁️' },
  { label: 'Ollama AI', sub: 'qwen3.5:4b :11434', color: '#818cf8', icon: '🤖' },
  { label: 'GitHub + ADO', sub: 'Dual git remote', color: '#f97316', icon: '📦' },
];

function TechStackModal({ onClose }: { onClose: () => void }) {
  const [activeCat, setActiveCat] = useState(-1); // -1 = overview
  const [activeItem, setActiveItem] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const totalTech = TECH_STACK.reduce((n, c) => n + c.items.length, 0);
  const cat = activeCat >= 0 ? TECH_STACK[activeCat] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal — full white, fills most of the screen */}
      <div className="relative w-full max-w-[98vw] h-[96vh] bg-white border border-gray-200 rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.22)] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-center gap-4 px-7 py-4 border-b border-gray-200 bg-white">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-md flex-shrink-0">
            <Layers size={18} style={{ color: '#fff' }} />
          </div>
          <div>
            <h2 style={{ color: '#0f172a', fontWeight: 800, fontSize: 16, letterSpacing: -0.3, lineHeight: 1.2 }}>Healix Engage · Tech Stack</h2>
            <p style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{totalTech} technologies across {TECH_STACK.length} layers · Global HealthX</p>
          </div>

          <div className="hidden md:flex items-center gap-2 ml-4">
            {[
              { label: 'Frontend live', color: '#2563eb' },
              { label: 'AI local', color: '#7c3aed' },
              { label: 'ADO connected', color: '#0369a1' },
            ].map(s => (
              <span key={s.label} className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border"
                style={{ background: `${s.color}0f`, borderColor: `${s.color}30`, color: s.color }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>

          <button onClick={onClose} className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100" style={{ color: '#475569' }}>
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left sidebar */}
          <nav className="flex-shrink-0 w-56 border-r border-gray-200 flex flex-col bg-gray-50 py-3 overflow-y-auto">

            {/* Overview */}
            <button
              onClick={() => { setActiveCat(-1); setActiveItem(null); }}
              className="w-full text-left flex items-center gap-3 px-4 py-2.5 transition-all relative"
              style={{
                background: activeCat === -1 ? '#eff6ff' : 'transparent',
                color: activeCat === -1 ? '#1d4ed8' : '#475569',
              }}
            >
              {activeCat === -1 && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full bg-brand-500" />}
              <span className="text-base leading-none flex-shrink-0">🗺️</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>Architecture</div>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>Full system overview</div>
              </div>
            </button>

            <div className="mx-4 my-2 border-t border-gray-200" />
            <p className="px-4 mb-1.5" style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Layers</p>

            {TECH_STACK.map((c, i) => (
              <button
                key={c.category}
                onClick={() => { setActiveCat(i); setActiveItem(null); }}
                className="w-full text-left flex items-center gap-3 px-4 py-2.5 transition-all relative"
                style={{
                  background: activeCat === i ? `${c.color}12` : 'transparent',
                  color: activeCat === i ? '#0f172a' : '#475569',
                }}
              >
                {activeCat === i && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full" style={{ background: c.color }} />}
                <span className="text-base leading-none flex-shrink-0">{c.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>{c.category}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{c.items.length} tools</span>
                    <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <span style={{ fontSize: 10.5, color: c.color, opacity: 0.85 }}>{c.port}</span>
                  </div>
                </div>
              </button>
            ))}

            <div className="mt-auto mx-4 pt-3 pb-2 border-t border-gray-200">
              <p style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.6 }}>🔒 All AI runs locally<br />No patient data leaves org</p>
            </div>
          </nav>

          {/* Right: content */}
          <div className="flex-1 overflow-hidden flex flex-col bg-white">

            {/* ── Overview tab ── */}
            {activeCat === -1 && (
              <div className="flex-1 overflow-y-auto p-7">
                <div className="mb-8">
                  <h3 style={{ color: '#0f172a', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>System Architecture</h3>
                  <p style={{ color: '#64748b', fontSize: 12, marginBottom: 20 }}>How all the pieces connect end-to-end</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {ARCH_FLOW.map((node, i) => (
                      <div key={node.label} className="flex items-center gap-3">
                        <div className="rounded-xl p-4 text-center border" style={{ minWidth: 110, background: `${node.color}0a`, borderColor: `${node.color}30` }}>
                          <div style={{ fontSize: 22, marginBottom: 6 }}>{node.icon}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{node.label}</div>
                          <div style={{ fontSize: 10.5, marginTop: 3, color: node.color, fontWeight: 600 }}>{node.sub}</div>
                        </div>
                        {i < ARCH_FLOW.length - 1 && (
                          <div style={{ color: '#cbd5e1', fontSize: 18, fontWeight: 300 }}>→</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {TECH_STACK.map((c, i) => (
                    <button
                      key={c.category}
                      onClick={() => setActiveCat(i)}
                      className="text-left rounded-xl p-5 border transition-all group hover:shadow-md"
                      style={{ borderColor: '#e2e8f0', background: '#fafafa' }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span style={{ fontSize: 22 }}>{c.emoji}</span>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>{c.category}</div>
                          <div style={{ fontSize: 10.5, marginTop: 2, color: c.color, fontWeight: 600 }}>{c.port}</div>
                        </div>
                        <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full border" style={{ color: c.color, borderColor: `${c.color}40`, background: `${c.color}10` }}>
                          {c.items.length}
                        </span>
                      </div>
                      <p style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.65 }} className="line-clamp-2">{c.summary}</p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {c.items.slice(0, 4).map(it => (
                          <span key={it.name} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', fontWeight: 600 }}>
                            {it.name}
                          </span>
                        ))}
                        {c.items.length > 4 && <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }}>+{c.items.length - 4}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Category detail tab ── */}
            {cat && (
              <>
                {/* Category header */}
                <div className="flex-shrink-0 px-7 pt-5 pb-4 border-b border-gray-200" style={{ borderTopWidth: 3, borderTopColor: cat.color }}>
                  <div className="flex items-center gap-4">
                    <span style={{ fontSize: 32 }}>{cat.emoji}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 style={{ color: '#0f172a', fontWeight: 800, fontSize: 16 }}>{cat.category}</h3>
                        <span className="text-[11px] px-2.5 py-1 rounded-full border font-semibold"
                          style={{ color: cat.color, borderColor: `${cat.color}40`, background: `${cat.color}0f` }}>
                          {cat.port}
                        </span>
                      </div>
                      <p style={{ color: '#64748b', fontSize: 12.5, marginTop: 4, lineHeight: 1.65, maxWidth: '72ch' }}>{cat.summary}</p>
                    </div>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {cat.items.map((item) => {
                      const isOpen = activeItem === item.name;
                      return (
                        <div
                          key={item.name}
                          className={cn('rounded-xl border transition-all duration-200 overflow-hidden', isOpen && 'md:col-span-2')}
                          style={{
                            borderColor: isOpen ? item.color : '#e2e8f0',
                            background: isOpen ? '#fafffe' : '#ffffff',
                            boxShadow: isOpen ? `0 0 0 1px ${item.color}30, 0 4px 16px rgba(0,0,0,0.06)` : '0 1px 3px rgba(0,0,0,0.04)',
                            borderTopWidth: isOpen ? 3 : 1,
                            borderTopColor: isOpen ? item.color : '#e2e8f0',
                          }}
                        >
                          <button
                            onClick={() => setActiveItem(isOpen ? null : item.name)}
                            className="w-full text-left flex items-center gap-3.5 p-5 hover:bg-gray-50 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-base font-black"
                              style={{ background: `${item.color}15`, border: `2px solid ${item.color}35`, color: item.color }}>
                              {item.name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.name}</span>
                                {item.badge && (
                                  <span className="text-[10.5px] px-2 py-0.5 rounded-md font-semibold"
                                    style={{ background: `${item.color}12`, color: item.color, border: `1px solid ${item.color}35` }}>
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <p style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.45 }}>{item.tagline}</p>
                            </div>
                            <ChevronDown size={15} style={{ color: '#94a3b8', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                          </button>

                          {isOpen && (
                            <div className="px-5 pb-5 pt-1 space-y-3" style={{ borderTop: '1px solid #f1f5f9' }}>
                              <div className="rounded-xl p-4" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                <div className="flex items-center gap-2 mb-2.5">
                                  <span style={{ fontSize: 14 }}>💬</span>
                                  <span style={{ fontSize: 10.5, fontWeight: 800, color: '#166534', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Plain English</span>
                                  <span className="ml-auto" style={{ fontSize: 10.5, color: '#15803d', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 99, padding: '2px 10px', fontWeight: 600 }}>Anyone</span>
                                </div>
                                <p style={{ fontSize: 13, color: '#166534', lineHeight: 1.75 }}>{item.plain}</p>
                              </div>
                              <div className="rounded-xl p-4" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                                <div className="flex items-center gap-2 mb-2.5">
                                  <span style={{ fontSize: 14 }}>🔬</span>
                                  <span style={{ fontSize: 10.5, fontWeight: 800, color: '#1e40af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Technical Detail</span>
                                  <span className="ml-auto" style={{ fontSize: 10.5, color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 99, padding: '2px 10px', fontWeight: 600 }}>Engineers</span>
                                </div>
                                <p style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 1.75, fontFamily: 'ui-monospace, monospace' }}>{item.detail}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
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
  const [showAuditLog, setShowAuditLog] = useState(false);
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


          {/* Audit Log — admin only */}
          {user.role === 'admin' && (
            <button
              onClick={() => setShowAuditLog(true)}
              title="Audit Log"
              className={cn(
                'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
                showAuditLog
                  ? 'bg-red-100 text-red-500'
                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50',
              )}
            >
              <Shield size={14} />
            </button>
          )}

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

        {showTechStack  && <TechStackModal  onClose={() => setShowTechStack(false)} />}
        {showAuditLog   && <AuditLogModal   onClose={() => setShowAuditLog(false)} />}

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
      <AIChatPanel activeSection={tab} />
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
