# PRM — Azure DevOps PM Dashboard

A locally-hosted single-page dashboard that aggregates an entire Azure DevOps organization across Boards, Repos, Wiki, Pipelines, and Bug tracking into one real-time view for a Software Project Manager.

---

## Prerequisites

- Node.js 18+
- An Azure DevOps Personal Access Token (PAT)

## Setup

### 1. Clone / download

```bash
cd prm
```

### 2. Create your `.env`

```bash
cp .env.example .env
```

Edit `.env`:

```env
ADO_ORG=your-org-name           # e.g. mycompany
ADO_PROJECT=your-project-name   # e.g. MyProject
ADO_PAT=xxxxxxxxxxxxxxxxxxxx     # your Personal Access Token
PORT=3001
CACHE_TTL_SECONDS=300           # cache lifetime in seconds
```

### 3. Install dependencies

```bash
npm run install:all
```

### 4. Run

```bash
npm run dev
```

- **Client:** http://localhost:5173
- **API:**    http://localhost:3001/api

---

## Required PAT Scopes

| Scope | Access |
|---|---|
| Work Items | Read |
| Code (Repositories) | Read |
| Wiki | Read |
| Build | Read |
| Test Management | Read |
| Project and Team | Read |

---

## Architecture

```
prm/
├── server/           Node.js + Express (TypeScript)
│   └── src/
│       ├── models/   ADO v7.1 TypeScript interfaces
│       ├── services/ ADO client, cache, domain services
│       ├── routes/   REST proxy endpoints (/api/*)
│       └── middleware/ Error handling
└── client/           React + Vite (TypeScript)
    └── src/
        ├── api/      Typed Axios wrappers → /api
        ├── store/    Zustand global filter state
        ├── hooks/    useApi data-fetching hook
        ├── types/    Shared TypeScript types
        └── components/
            ├── common/     FilterBar, Modal, SortableTable, StatCard
            ├── boards/     BoardsModule  (work items, burndown, sprints)
            ├── bugs/       BugsModule    (priority, severity, aging)
            ├── engineers/  EngineersModule (activity, commits, PRs)
            ├── repos/      ReposModule   (commits, PRs, branches)
            ├── wiki/       WikiModule    (pages, staleness, authorship)
            └── risks/      RisksModule   (risk center, alerts)
```

### API Routes

| Method | Path | Description |
|---|---|---|
| GET | /api/ping | Verify ADO connectivity |
| POST | /api/cache/flush | Invalidate all cached responses |
| GET | /api/boards/workitems | Filtered work items (WIQL) |
| GET | /api/boards/sprint-stats | Per-iteration stats + burndown data |
| GET | /api/boards/iterations | All iterations for a team |
| GET | /api/repos | All repositories |
| GET | /api/repos/commits/all | Commits across all repos |
| GET | /api/repos/prs/all | PRs across all repos |
| GET | /api/repos/branches/all | Branches across all repos |
| GET | /api/wiki/stats | Page count, stale pages, authorship |
| GET | /api/wiki/pages/all | All wiki pages (flattened) |
| GET | /api/pipelines/stats | Build success rate summary |
| GET | /api/engineers/activity | Per-engineer cross-domain activity |
| GET | /api/risks | Risk center — scored, sorted alerts |

All list endpoints support filter params: `fromDate`, `toDate`, `assignedTo`, `workItemType`, `areaPath`, `iterationPath`, `team`.

---

## Features

- **Boards** — work-item state pies, type distribution, stacked sprint bars, burndown line for current sprint
- **Bugs** — priority/severity pies, assignee breakdown, aging buckets; all click-through to detail tables
- **Engineers** — per-engineer commits/PRs/items/points table; stale-item flag; detail drill-down
- **Repos** — commit timeline, commits by repo, active PRs with age + no-reviewer warnings
- **Wiki** — stale page detection, authorship bar, page inventory
- **Risk Center** — severity-scored alerts for stale items, unassigned bugs, aging bugs, stale PRs, stale wiki; filter by severity/category; badge on tab
- **Global filter bar** — date presets (7d/14d/30d/90d) + custom, person, type, area path, team — applied across all modules
- **Click-through drill-downs** — every chart segment opens a sortable table modal
- **Server-side cache** — in-memory (node-cache), configurable TTL, manual flush button
