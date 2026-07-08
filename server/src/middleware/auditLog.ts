import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import * as audit from '../services/audit';

// Deduplicate section-visit events per user within 5 minutes
const lastVisit = new Map<string, Map<string, number>>();
const DEDUP_MS = 5 * 60 * 1000;

const SKIP_SUBPATHS = ['/ping', '/projects', '/boards/teams', '/boards/sprint-stats', '/cache'];

function pathToSection(p: string): string {
  if (p.includes('/ai/chat'))    return 'AI Chat';
  if (p.includes('/ai/analyze')) return 'AI Analysis';
  if (p.includes('/boards'))     return 'Boards';
  if (p.includes('/repos'))      return 'Repos';
  if (p.includes('/engineers'))  return 'Engineers';
  if (p.includes('/risks'))      return 'Risks';
  if (p.includes('/wiki'))       return 'Wiki';
  if (p.includes('/users'))      return 'User Management';
  return 'API';
}

export function auditLog(req: AuthRequest, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    if (!req.user) return;
    const p = req.path;
    if (SKIP_SUBPATHS.some(s => p.startsWith(s))) return;
    // Skip non-200 GETs that are just errors — not meaningful
    if (req.method === 'GET' && res.statusCode >= 400) return;

    const section = pathToSection(p);
    const userId  = req.user.id;

    // For plain GET section visits, deduplicate within 5 minutes
    if (req.method === 'GET' && !p.includes('/ai/')) {
      let umap = lastVisit.get(userId);
      if (!umap) { umap = new Map(); lastVisit.set(userId, umap); }
      const last = umap.get(section) ?? 0;
      if (Date.now() - last < DEDUP_MS) return;
      umap.set(section, Date.now());
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
             ?? req.socket?.remoteAddress ?? '';
    const ua = req.headers['user-agent'] ?? '';

    let action: audit.AuditAction = 'SECTION_VISITED';
    let detail: string | undefined;

    if (p.includes('/ai/chat') && req.method === 'POST') {
      action = 'AI_QUERY';
      const q = (req.body as { question?: string })?.question;
      if (q) detail = q.slice(0, 200);
    } else if (p.includes('/ai/analyze') && req.method === 'GET') {
      action = 'AI_ANALYSIS';
      detail = (req.query.section as string) ?? undefined;
    }

    audit.append({
      userId,
      userEmail: req.user.email,
      userName:  req.user.name,
      action,
      section,
      resource: req.originalUrl.split('?')[0],
      ip,
      userAgent: ua,
      status:    res.statusCode,
      detail,
    });
  });
  next();
}
