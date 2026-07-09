import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Risk as AiRisk } from './risks';

const DATA_DIR = path.resolve(__dirname, '../../data');
const FILE     = path.join(DATA_DIR, 'risks.json');

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';
export type RiskStatus   = 'open' | 'mitigating' | 'resolved' | 'accepted';
export type RiskSource   = 'ai' | 'manual';

export type RiskCategory =
  | 'board' | 'bug' | 'pr' | 'wiki' | 'engineer' | 'pipeline'
  | 'technical' | 'resource' | 'schedule' | 'external' | 'manual';

export interface RegisteredRisk {
  id: string;
  displayId: string;       // RISK-001 (manual) or AI-{hash} (ai)
  source: RiskSource;
  severity: RiskSeverity;
  category: RiskCategory;
  title: string;
  description: string;
  status: RiskStatus;
  owner?: string;
  impact?: string;
  mitigation?: string;
  dueDate?: string;
  artifactId?: string | number;
  artifactType?: string;
  detectedAt: string;
  updatedAt: string;
  createdBy?: string;
  project: string;
}

interface Store {
  risks: RegisteredRisk[];
  nextManualId: number;
}

let _cache: Store | null = null;

function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function load(): Store {
  if (_cache) return _cache;
  ensureDir();
  try {
    _cache = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Store;
  } catch {
    _cache = { risks: [], nextManualId: 1 };
  }
  return _cache;
}

function save(store: Store) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  _cache = store;
}

// Merge AI-detected risks into the register (preserves existing status/owner/mitigation)
export function syncAiRisks(aiRisks: AiRisk[], project: string): RegisteredRisk[] {
  const store = load();
  const now = new Date().toISOString();
  const existingIds = new Set(store.risks.filter(r => r.project === project && r.source === 'ai').map(r => r.id));
  const freshIds    = new Set(aiRisks.map(r => r.id));

  // Update or add AI risks
  for (const ai of aiRisks) {
    const existing = store.risks.find(r => r.id === ai.id && r.project === project);
    if (existing) {
      // Refresh AI-computed fields, keep user edits
      existing.title       = ai.title;
      existing.description = ai.description;
      existing.severity    = ai.severity as RiskSeverity;
      existing.category    = ai.category as RiskCategory;
      existing.artifactId  = ai.artifactId;
      existing.artifactType = ai.artifactType;
      existing.updatedAt   = now;
    } else {
      store.risks.push({
        id:           ai.id,
        displayId:    `AI-${ai.id.slice(-6)}`,
        source:       'ai',
        severity:     ai.severity as RiskSeverity,
        category:     ai.category as RiskCategory,
        title:        ai.title,
        description:  ai.description,
        status:       'open',
        artifactId:   ai.artifactId,
        artifactType: ai.artifactType,
        detectedAt:   ai.detectedAt ?? now,
        updatedAt:    now,
        project,
      });
    }
  }

  // Auto-resolve AI risks that are no longer detected (keep in register for audit)
  for (const r of store.risks) {
    if (r.source === 'ai' && r.project === project && existingIds.has(r.id) && !freshIds.has(r.id)) {
      if (r.status === 'open' || r.status === 'mitigating') {
        r.status    = 'resolved';
        r.updatedAt = now;
        r.mitigation = (r.mitigation ? r.mitigation + ' | ' : '') + 'Auto-resolved: no longer detected by AI';
      }
    }
  }

  save(store);
  return listForProject(store, project);
}

function listForProject(store: Store, project: string): RegisteredRisk[] {
  const SEV_ORDER: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const STATUS_ORDER: Record<RiskStatus, number> = { open: 0, mitigating: 1, accepted: 2, resolved: 3 };
  return store.risks
    .filter(r => r.project === project)
    .sort((a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      SEV_ORDER[a.severity]  - SEV_ORDER[b.severity]
    );
}

export function list(project: string): RegisteredRisk[] {
  return listForProject(load(), project);
}

export interface CreateRiskInput {
  severity: RiskSeverity;
  category: RiskCategory;
  title: string;
  description: string;
  owner?: string;
  impact?: string;
  mitigation?: string;
  dueDate?: string;
  project: string;
  createdBy?: string;
}

export function create(input: CreateRiskInput): RegisteredRisk {
  const store = load();
  const id    = `manual-${crypto.randomUUID().slice(0, 8)}`;
  const num   = String(store.nextManualId++).padStart(3, '0');
  const now   = new Date().toISOString();
  const risk: RegisteredRisk = {
    id,
    displayId:   `RISK-${num}`,
    source:      'manual',
    severity:    input.severity,
    category:    input.category,
    title:       input.title,
    description: input.description,
    status:      'open',
    owner:       input.owner,
    impact:      input.impact,
    mitigation:  input.mitigation,
    dueDate:     input.dueDate,
    detectedAt:  now,
    updatedAt:   now,
    createdBy:   input.createdBy,
    project:     input.project,
  };
  store.risks.push(risk);
  save(store);
  return risk;
}

export type UpdateRiskInput = Partial<Pick<RegisteredRisk,
  'severity' | 'category' | 'title' | 'description' | 'status' | 'owner' | 'impact' | 'mitigation' | 'dueDate'>>;

export function update(id: string, project: string, changes: UpdateRiskInput): RegisteredRisk | null {
  const store = load();
  const risk  = store.risks.find(r => r.id === id && r.project === project);
  if (!risk) return null;
  Object.assign(risk, changes, { updatedAt: new Date().toISOString() });
  save(store);
  return risk;
}

export function remove(id: string, project: string): boolean {
  const store = load();
  const idx   = store.risks.findIndex(r => r.id === id && r.project === project && r.source === 'manual');
  if (idx === -1) return false;
  store.risks.splice(idx, 1);
  save(store);
  return true;
}
