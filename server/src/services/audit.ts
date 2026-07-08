import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR   = path.resolve(__dirname, '../../data');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
const MAX_ENTRIES = 10_000;

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'USER_INVITED'
  | 'USER_ROLE_CHANGED'
  | 'USER_DELETED'
  | 'SECTION_VISITED'
  | 'AI_QUERY'
  | 'AI_ANALYSIS';

export interface AuditEntry {
  id: string;
  ts: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: AuditAction;
  section: string;
  resource: string;
  ip: string;
  userAgent: string;
  status: number;
  detail?: string;
}

let _cache: AuditEntry[] | null = null;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(): AuditEntry[] {
  if (_cache !== null) return _cache;
  ensureDir();
  try {
    _cache = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')) as AuditEntry[];
  } catch {
    _cache = [];
  }
  return _cache;
}

function save(entries: AuditEntry[]) {
  ensureDir();
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries));
  _cache = entries;
}

export function append(entry: Omit<AuditEntry, 'id' | 'ts'>) {
  const entries = load();
  const newEntry: AuditEntry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    ...entry,
  };
  entries.unshift(newEntry);
  if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES);
  save(entries);
}

export interface QueryOpts {
  limit?: number;
  offset?: number;
  userId?: string;
  action?: string;
  section?: string;
  fromTs?: string;
  toTs?: string;
  search?: string;
}

export function query(opts: QueryOpts = {}): { entries: AuditEntry[]; total: number } {
  let entries = load();

  if (opts.userId)  entries = entries.filter(e => e.userId === opts.userId);
  if (opts.action)  entries = entries.filter(e => e.action === opts.action);
  if (opts.section) entries = entries.filter(e => e.section.toLowerCase() === opts.section!.toLowerCase());
  if (opts.fromTs)  entries = entries.filter(e => e.ts >= opts.fromTs!);
  if (opts.toTs)    entries = entries.filter(e => e.ts <= opts.toTs! + 'Z');
  if (opts.search) {
    const q = opts.search.toLowerCase();
    entries = entries.filter(e =>
      e.userEmail.toLowerCase().includes(q) ||
      e.userName.toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q) ||
      e.section.toLowerCase().includes(q) ||
      (e.detail?.toLowerCase().includes(q) ?? false)
    );
  }

  const total = entries.length;
  const limit  = Math.min(opts.limit  ?? 100, 500);
  const offset = opts.offset ?? 0;
  return { entries: entries.slice(offset, offset + limit), total };
}

export function getStats() {
  const entries = load();
  const now   = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const todayEntries = entries.filter(e => e.ts.startsWith(today));
  const last7 = entries.filter(e => now - new Date(e.ts).getTime() < 7 * 86_400_000);

  const activeUsers  = new Set(last7.filter(e => e.action !== 'LOGIN_FAILED').map(e => e.userId)).size;
  const loginsFailed = last7.filter(e => e.action === 'LOGIN_FAILED').length;
  const loginsToday  = todayEntries.filter(e => e.action === 'LOGIN_SUCCESS').length;

  const sectionCounts: Record<string, number> = {};
  for (const e of last7.filter(e => e.action === 'SECTION_VISITED')) {
    sectionCounts[e.section] = (sectionCounts[e.section] ?? 0) + 1;
  }

  const userMap = new Map<string, { email: string; name: string; count: number; lastSeen: string }>();
  for (const e of last7) {
    if (!e.userId || e.action === 'LOGIN_FAILED') continue;
    const cur = userMap.get(e.userId);
    if (!cur) {
      userMap.set(e.userId, { email: e.userEmail, name: e.userName, count: 1, lastSeen: e.ts });
    } else {
      cur.count++;
      if (e.ts > cur.lastSeen) cur.lastSeen = e.ts;
    }
  }

  return {
    total: entries.length,
    todayCount: todayEntries.length,
    activeUsers,
    loginsFailed,
    loginsToday,
    sectionCounts,
    topUsers: [...userMap.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    lastEntry: entries[0]?.ts ?? null,
  };
}
