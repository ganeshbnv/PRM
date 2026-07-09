import { Router, Request, Response, NextFunction } from 'express';
import * as risksSvc from '../services/risks';
import * as reg from '../services/riskRegister';

const router = Router();

function wrap(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).then((data) => res.json(data)).catch(next);
  };
}

function proj(req: Request): string {
  const p = (req.query.project ?? req.body?.project) as string;
  if (!p) throw new Error('Missing required param: project');
  return p;
}

// GET /api/risk-register?project=  — sync AI risks then return merged register
router.get('/', wrap(async (req) => {
  const project = proj(req);
  const aiRisks = await risksSvc.getRisks(project, {});
  return reg.syncAiRisks(aiRisks, project);
}));

// POST /api/risk-register/sync?project=  — force re-sync AI risks
router.post('/sync', wrap(async (req) => {
  const project = proj(req);
  const aiRisks = await risksSvc.getRisks(project, {});
  return reg.syncAiRisks(aiRisks, project);
}));

// POST /api/risk-register  — create a manual risk
router.post('/', wrap(async (req) => {
  const project = proj(req);
  const { severity, category, title, description, owner, impact, mitigation, dueDate } = req.body;
  if (!title || !description) throw new Error('title and description are required');
  const userId = (req as any).user?.userId ?? 'unknown';
  return reg.create({ severity, category, title, description, owner, impact, mitigation, dueDate, project, createdBy: userId });
}));

// PATCH /api/risk-register/:id?project=  — update status, owner, mitigation, etc.
router.patch('/:id', wrap(async (req) => {
  const project = proj(req);
  const { severity, category, title, description, status, owner, impact, mitigation, dueDate } = req.body;
  const risk = reg.update(req.params.id, project, { severity, category, title, description, status, owner, impact, mitigation, dueDate });
  if (!risk) throw Object.assign(new Error('Risk not found'), { status: 404 });
  return risk;
}));

// DELETE /api/risk-register/:id?project=  — delete manual risk only
router.delete('/:id', wrap(async (req) => {
  const project = proj(req);
  const ok = reg.remove(req.params.id, project);
  if (!ok) throw Object.assign(new Error('Risk not found or is AI-detected (cannot delete)'), { status: 404 });
  return { ok: true };
}));

export default router;
