import { useState, useEffect } from 'react';
import { FilterBar } from './components/common/FilterBar';
import { BoardsModule } from './components/boards/BoardsModule';
import { BugsModule } from './components/bugs/BugsModule';
import { EngineersModule } from './components/engineers/EngineersModule';
import { ReposModule } from './components/repos/ReposModule';
import { WikiModule } from './components/wiki/WikiModule';
import { RisksModule } from './components/risks/RisksModule';
import { AuthPage } from './components/auth/AuthPage';
import { api } from './api/client';
import { useFilterStore } from './store/filters';
import { useAuthStore } from './store/auth';

type Tab = 'boards' | 'bugs' | 'engineers' | 'repos' | 'wiki' | 'risks';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'boards', label: 'Boards', icon: '📋' },
  { id: 'bugs', label: 'Bugs', icon: '🐛' },
  { id: 'engineers', label: 'Engineers', icon: '👤' },
  { id: 'repos', label: 'Repos', icon: '💻' },
  { id: 'wiki', label: 'Wiki', icon: '📄' },
  { id: 'risks', label: 'Risks', icon: '⚠️' },
];

export default function App() {
  const { token, user } = useAuthStore();
  if (!token || !user) return <AuthPage />;
  return <Dashboard user={user} />;
}

function Dashboard({ user }: { user: { name: string } }) {
  const { clearAuth } = useAuthStore();
  const [tab, setTab] = useState<Tab>('boards');
  const [conn, setConn] = useState<{ ok: boolean; label: string } | null>(null);
  const [flushing, setFlushing] = useState(false);
  const { filters } = useFilterStore();

  useEffect(() => {
    api.ping()
      .then((r) => setConn({ ok: true, label: `${r.org} · ${r.projectCount} projects` }))
      .catch(() => setConn({ ok: false, label: 'Connection failed — check .env' }));
  }, []);

  async function handleFlush() {
    setFlushing(true);
    await api.flushCache().finally(() => setFlushing(false));
  }

  const hasProject = !!filters.project;

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="flex items-center justify-between px-6 py-3 bg-surface-card border-b border-surface-border">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-white tracking-tight">Jarvis for PRM</span>
        </div>
        <div className="flex items-center gap-3">
          {conn && (
            <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${conn.ok ? 'border-emerald-700/50 bg-emerald-900/20 text-emerald-400' : 'border-red-700/50 bg-red-900/20 text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${conn.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {conn.label}
            </div>
          )}
          <button onClick={handleFlush} disabled={flushing} className="btn-ghost text-xs">
            {flushing ? '…' : '↺'} Refresh Cache
          </button>
          <div className="h-4 w-px bg-surface-border" />
          <span className="text-xs text-gray-400">{user.name}</span>
          <button onClick={clearAuth} className="btn-ghost text-xs text-gray-500 hover:text-red-400">
            Sign out
          </button>
        </div>
      </header>

      <FilterBar />

      {!hasProject ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">📋</div>
            <h2 className="text-xl font-semibold text-white mb-2">Select a project to get started</h2>
            <p className="text-gray-400 text-sm">Use the project dropdown in the filter bar above</p>
          </div>
        </div>
      ) : (
        <>
          <nav className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-surface-border bg-surface-card">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
                  tab === t.id
                    ? 'border-brand-500 text-white bg-surface-elevated'
                    : 'border-transparent text-gray-400 hover:text-white hover:bg-surface-elevated/50'
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
                {t.id === 'risks' && <RisksBadge project={filters.project} />}
              </button>
            ))}
          </nav>

          <main className="flex-1 overflow-y-auto p-6">
            {tab === 'boards' && <BoardsModule />}
            {tab === 'bugs' && <BugsModule />}
            {tab === 'engineers' && <EngineersModule />}
            {tab === 'repos' && <ReposModule />}
            {tab === 'wiki' && <WikiModule />}
            {tab === 'risks' && <RisksModule />}
          </main>
        </>
      )}
    </div>
  );
}

function RisksBadge({ project }: { project: string }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!project) return;
    api.getRisks(project).then((r) => {
      setCount(r.filter((risk) => risk.severity === 'critical' || risk.severity === 'high').length);
    }).catch(() => {});
  }, [project]);
  if (!count) return null;
  return (
    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold leading-none">
      {count}
    </span>
  );
}
