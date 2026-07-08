import { Router, Response } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import * as auditSvc from '../services/audit';

const router = Router();

// GET /api/audit — paginated log (admin only)
router.get('/', requireAuth, requireAdmin, (req: AuthRequest, res: Response): void => {
  const {
    limit, offset, userId, action, section, fromTs, toTs, search,
  } = req.query as Record<string, string>;

  const result = auditSvc.query({
    limit:   limit  ? parseInt(limit,  10) : 100,
    offset:  offset ? parseInt(offset, 10) : 0,
    userId,
    action,
    section,
    fromTs,
    toTs,
    search,
  });

  res.json(result);
});

// GET /api/audit/stats — summary stats (admin only)
router.get('/stats', requireAuth, requireAdmin, (_req: AuthRequest, res: Response): void => {
  res.json(auditSvc.getStats());
});

export default router;
