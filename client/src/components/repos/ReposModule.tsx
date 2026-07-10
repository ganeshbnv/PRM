import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';
import { LoadingCard, ErrorCard } from '../common/Spinner';
import { Modal } from '../common/Modal';
import { SortableTable } from '../common/SortableTable';
import type { GitPullRequest, ContributorStat } from '../../types';
import { format, differenceInDays, parseISO } from 'date-fns';
import { AiSummaryStrip } from '../common/AiSummaryStrip';

export function ReposModule() {
  const { filters } = useFilterStore();

  const { data: repos, loading: lr, error: er } = useApi(
    () => api.getRepos(filters.project),
    [filters.project]
  );
  const { data: prs, loading: lp, error: ep } = useApi(
    () => api.getAllPRs(filters.project, 'all'),
    [filters.project]
  );
  const { data: contribData, loading: lc, error: ec } = useApi(
    () => api.getRepoContributors({ fromDate: filters.fromDate, toDate: filters.toDate, project: filters.project }),
    [filters.fromDate, filters.toDate, filters.project]
  );

  const [modalPRs, setModalPRs] = useState<GitPullRequest[] | null>(null);
  const [modalPRTitle, setModalPRTitle] = useState('');
  const [expandedContrib, setExpandedContrib] = useState<string | null>(null);

  if (lr || lp || lc) return <LoadingCard label="Loading repo data…" />;
  if (er) return <ErrorCard error={er} />;
  if (ep) return <ErrorCard error={ep} />;
  if (ec) return <ErrorCard error={ec} />;

  const allPRs    = prs ?? [];
  const activePRs = allPRs.filter((p) => p.status === 'active');
  const stalePRs  = activePRs.filter((p) => differenceInDays(new Date(), new Date(p.creationDate)) >= 5);
  const noReviewerPRs = activePRs.filter((p) => p.reviewers.length === 0);

  const mergedPRs = allPRs.filter((p) => p.status === 'completed' && p.closedDate);
  const avgMerge  = mergedPRs.length
    ? Math.round(mergedPRs.reduce((s, p) => s + differenceInDays(new Date(p.closedDate!), new Date(p.creationDate)), 0) / mergedPRs.length)
    : 0;

  // Charts derived from contributor data (pre-aggregated server-side)
  const dailyTotals  = contribData?.dailyTotals ?? [];
  const repoTotals   = contribData?.repoTotals  ?? [];
  const contributors = contribData?.contributors ?? [];

  const timelineData = dailyTotals.map((d) => ({
    date: format(parseISO(d.date), 'MMM d'),
    Commits: d.commits,
  }));

  const repoBar = repoTotals.slice(0, 12).map(({ repoName, commits }) => ({
    name: repoName,
    Commits: commits,
  }));

  return (
    <div className="flex flex-col gap-6">
      <AiSummaryStrip section="repos" />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <span className="text-xs text-gray-400 uppercase">Repositories</span>
          <span className="text-3xl font-bold">{repos?.length ?? 0}</span>
        </div>
        <div className="card cursor-pointer hover:bg-surface-elevated" onClick={() => { setModalPRTitle('Active PRs'); setModalPRs(activePRs); }}>
          <span className="text-xs text-gray-400 uppercase">Active PRs</span>
          <span className="text-3xl font-bold text-blue-400">{activePRs.length}</span>
        </div>
        <div className="card cursor-pointer hover:bg-surface-elevated" onClick={() => { setModalPRTitle('Stale PRs (5d+)'); setModalPRs(stalePRs); }}>
          <span className="text-xs text-gray-400 uppercase">Stale PRs</span>
          <span className="text-3xl font-bold text-orange-400">{stalePRs.length}</span>
        </div>
        <div className="card">
          <span className="text-xs text-gray-400 uppercase">Avg Merge Time</span>
          <span className="text-3xl font-bold">{avgMerge}d</span>
        </div>
      </div>

      {/* Commit timeline */}
      {timelineData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
            Commit Activity Over Time
            <span className="ml-2 text-xs font-normal text-gray-400">({contribData?.totalCommits ?? 0} total)</span>
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} interval={Math.max(0, Math.floor(timelineData.length / 8))} />
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
          <ResponsiveContainer width="100%" height={Math.max(180, repoBar.length * 28)}>
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

      {/* Contributors by date */}
      {contributors.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
            Contributors
            <span className="ml-2 text-xs font-normal text-gray-400">({contributors.length} engineers · click to expand)</span>
          </h3>
          <SortableTable
            data={contributors}
            rowKey={(r) => r.email}
            emptyMessage="No contributor data"
            columns={[
              {
                key: 'name',
                header: 'Engineer',
                sortable: true,
                render: (r) => (
                  <button
                    className="text-left hover:text-brand-400 transition-colors"
                    onClick={() => setExpandedContrib(expandedContrib === r.email ? null : r.email)}
                  >
                    <span className="font-medium text-gray-800 dark:text-gray-100">{r.name}</span>
                    <span className="block text-xs text-gray-400">{r.email}</span>
                  </button>
                ),
                sortValue: (r) => r.name,
              },
              {
                key: 'commits',
                header: 'Commits',
                sortable: true,
                render: (r) => (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-400">{r.totalCommits}</span>
                    <div className="flex-1 max-w-[80px] h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${Math.round((r.totalCommits / (contributors[0]?.totalCommits || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ),
                sortValue: (r) => r.totalCommits,
              },
              {
                key: 'repos',
                header: 'Top Repo',
                render: (r) => (
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px] block">
                    {r.topRepo ?? '—'}
                    {r.repoBreakdown.length > 1 && (
                      <span className="ml-1 text-gray-400">+{r.repoBreakdown.length - 1}</span>
                    )}
                  </span>
                ),
              },
              {
                key: 'firstCommit',
                header: 'First Commit',
                sortable: true,
                render: (r) => r.firstCommit ? (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{r.firstCommit.slice(0, 10)}</span>
                ) : <span className="text-gray-400">—</span>,
                sortValue: (r) => r.firstCommit ?? '',
              },
              {
                key: 'lastCommit',
                header: 'Last Commit',
                sortable: true,
                render: (r) => {
                  if (!r.lastCommit) return <span className="text-gray-400">—</span>;
                  const age = differenceInDays(new Date(), new Date(r.lastCommit));
                  return (
                    <span className={`text-xs ${age <= 7 ? 'text-emerald-500' : age <= 30 ? 'text-yellow-500' : 'text-gray-400'}`}>
                      {r.lastCommit.slice(0, 10)}
                      <span className="ml-1 text-gray-500">({age}d ago)</span>
                    </span>
                  );
                },
                sortValue: (r) => r.lastCommit ?? '',
              },
            ]}
          />

          {/* Expanded contributor detail */}
          {expandedContrib && (() => {
            const c = contributors.find(x => x.email === expandedContrib);
            if (!c) return null;
            return <ContributorDetail contributor={c} />;
          })()}
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

function ContributorDetail({ contributor: c }: { contributor: ContributorStat }) {
  const maxDay = Math.max(1, ...c.dailyActivity.map(d => d.commits));
  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
      <div className="flex flex-wrap gap-6">
        {/* Repo breakdown */}
        <div className="flex-1 min-w-[200px]">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Commits by repo</p>
          <div className="space-y-1.5">
            {c.repoBreakdown.map((r) => (
              <div key={r.repoName} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-32 truncate flex-shrink-0">{r.repoName}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${Math.round((r.commits / c.totalCommits) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-indigo-400 w-8 text-right flex-shrink-0">{r.commits}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Daily activity spark */}
        {c.dailyActivity.length > 0 && (
          <div className="flex-1 min-w-[240px]">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Daily activity</p>
            <div className="flex items-end gap-0.5 h-16 overflow-x-auto">
              {c.dailyActivity.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.commits} commit${d.commits !== 1 ? 's' : ''}`}
                  className="flex-shrink-0 w-2 rounded-sm bg-indigo-500 opacity-80 hover:opacity-100 transition-opacity"
                  style={{ height: `${Math.round((d.commits / maxDay) * 100)}%`, minHeight: 3 }}
                />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {c.firstCommit?.slice(0, 10)} → {c.lastCommit?.slice(0, 10)}
            </p>
          </div>
        )}
      </div>
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
