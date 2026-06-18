import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';
import { LoadingCard, ErrorCard } from '../common/Spinner';
import { Modal } from '../common/Modal';
import { SortableTable } from '../common/SortableTable';
import type { GitPullRequest } from '../../types';
import { format, differenceInDays, parseISO } from 'date-fns';

export function ReposModule() {
  const { filters } = useFilterStore();
  const { data: repos, loading: lr, error: er } = useApi(() => api.getRepos(filters.project), [filters.project]);
  const { data: prs, loading: lp, error: ep } = useApi(() => api.getAllPRs(filters.project, 'all'), [filters.project]);
  const { data: commits, loading: lc, error: ec } = useApi(
    () => api.getAllCommits({ fromDate: filters.fromDate, toDate: filters.toDate, project: filters.project }),
    [filters.fromDate, filters.toDate, filters.project]
  );

  const [modalPRs, setModalPRs] = useState<GitPullRequest[] | null>(null);
  const [modalPRTitle, setModalPRTitle] = useState('');

  if (lr || lp || lc) return <LoadingCard label="Loading repo data…" />;
  if (er) return <ErrorCard error={er} />;
  if (ep) return <ErrorCard error={ep} />;
  if (ec) return <ErrorCard error={ec} />;

  const allPRs = prs ?? [];
  const allCommits = commits ?? [];
  const activePRs = allPRs.filter((p) => p.status === 'active');
  const stalePRs = activePRs.filter((p) => differenceInDays(new Date(), new Date(p.creationDate)) >= 5);
  const noReviewerPRs = activePRs.filter((p) => p.reviewers.length === 0);

  // Commits per repo bar
  const commitsByRepo: Record<string, number> = {};
  for (const c of allCommits) {
    commitsByRepo[c.repoName] = (commitsByRepo[c.repoName] ?? 0) + 1;
  }
  const repoBar = Object.entries(commitsByRepo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, Commits]) => ({ name, Commits }));

  // Commits over time (daily)
  const commitsByDay: Record<string, number> = {};
  for (const c of allCommits) {
    const day = c.author.date.slice(0, 10);
    commitsByDay[day] = (commitsByDay[day] ?? 0) + 1;
  }
  const days = Object.keys(commitsByDay).sort();
  const timelineData = days.map((d) => ({ date: format(parseISO(d), 'MMM d'), Commits: commitsByDay[d] }));

  // PR avg time-to-merge
  const mergedPRs = allPRs.filter((p) => p.status === 'completed' && p.closedDate);
  const avgMerge = mergedPRs.length
    ? Math.round(mergedPRs.reduce((s, p) => s + differenceInDays(new Date(p.closedDate!), new Date(p.creationDate)), 0) / mergedPRs.length)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card"><span className="text-xs text-gray-400 uppercase">Repositories</span><span className="text-3xl font-bold">{repos?.length ?? 0}</span></div>
        <div className="card cursor-pointer hover:bg-surface-elevated" onClick={() => { setModalPRTitle('Active PRs'); setModalPRs(activePRs); }}>
          <span className="text-xs text-gray-400 uppercase">Active PRs</span><span className="text-3xl font-bold text-blue-400">{activePRs.length}</span>
        </div>
        <div className="card cursor-pointer hover:bg-surface-elevated" onClick={() => { setModalPRTitle('Stale PRs (5d+)'); setModalPRs(stalePRs); }}>
          <span className="text-xs text-gray-400 uppercase">Stale PRs</span><span className="text-3xl font-bold text-orange-400">{stalePRs.length}</span>
        </div>
        <div className="card"><span className="text-xs text-gray-400 uppercase">Avg Merge Time</span><span className="text-3xl font-bold">{avgMerge}d</span></div>
      </div>

      {/* Commit timeline */}
      {timelineData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Commit Activity Over Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} interval={Math.floor(timelineData.length / 8)} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8 }} />
              <Line type="monotone" dataKey="Commits" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Commits by repo */}
      {repoBar.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Commits by Repo</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={repoBar} layout="vertical" margin={{ left: 80, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={120} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8 }} />
              <Bar dataKey="Commits" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* No-reviewer PRs warning */}
      {noReviewerPRs.length > 0 && (
        <div className="card border-orange-200 bg-orange-50">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-orange-400 font-semibold text-sm">⚠ PRs without reviewers ({noReviewerPRs.length})</span>
            <button className="btn-ghost text-xs ml-auto" onClick={() => { setModalPRTitle('PRs without reviewers'); setModalPRs(noReviewerPRs); }}>View all</button>
          </div>
          <ul className="space-y-1">
            {noReviewerPRs.slice(0, 5).map((p) => (
              <li key={p.pullRequestId} className="text-sm text-gray-600 dark:text-gray-300 flex gap-2">
                <span className="font-mono text-brand-500">#{p.pullRequestId}</span>
                <span className="truncate">{p.title}</span>
                <span className="text-gray-500 text-xs ml-auto">{p.repoName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PR table */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300">Active Pull Requests</h3>
          <button className="btn-ghost text-xs" onClick={() => { setModalPRTitle('All Active PRs'); setModalPRs(activePRs); }}>View all ({activePRs.length})</button>
        </div>
        <PRTable prs={activePRs.slice(0, 10)} />
      </div>

      {/* Modal */}
      <Modal open={!!modalPRs} onClose={() => setModalPRs(null)} title={modalPRTitle} width="max-w-5xl">
        <PRTable prs={modalPRs ?? []} />
      </Modal>
    </div>
  );
}

function PRTable({ prs }: { prs: GitPullRequest[] }) {
  return (
    <SortableTable
      data={prs}
      rowKey={(r) => r.pullRequestId}
      emptyMessage="No pull requests"
      columns={[
        { key: 'id', header: '#', sortable: true, render: (r) => <span className="font-mono text-brand-500">#{r.pullRequestId}</span>, sortValue: (r) => r.pullRequestId },
        { key: 'title', header: 'Title', render: (r) => <span className="truncate max-w-xs block">{r.title}</span> },
        { key: 'repo', header: 'Repo', sortable: true, render: (r) => <span className="text-xs text-gray-400">{r.repoName}</span>, sortValue: (r) => r.repoName },
        { key: 'author', header: 'Author', sortable: true, render: (r) => r.createdBy.displayName, sortValue: (r) => r.createdBy.displayName },
        { key: 'reviewers', header: 'Reviewers', render: (r) => r.reviewers.length === 0 ? <span className="text-orange-400 text-xs">None</span> : <span>{r.reviewers.length}</span> },
        { key: 'age', header: 'Age', sortable: true, render: (r) => `${differenceInDays(new Date(), new Date(r.creationDate))}d`, sortValue: (r) => differenceInDays(new Date(), new Date(r.creationDate)) },
        { key: 'status', header: 'Status', sortable: true, render: (r) => <span className={r.status === 'active' ? 'text-blue-400' : r.status === 'completed' ? 'text-emerald-400' : 'text-gray-400'}>{r.status}</span>, sortValue: (r) => r.status },
      ]}
    />
  );
}
