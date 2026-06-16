import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as labelsService from '../services/labels.service';

export const labelsRouter = Router();

labelsRouter.use(authenticate);

labelsRouter.get('/spaces/:key/labels', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const labels = await labelsService.getLabels(req.params.key);
    res.json(labels);
  } catch (err) {
    next(err);
  }
});

labelsRouter.post(
  '/spaces/:key/labels',
  [body('name').trim().isLength({ min: 1, max: 50 }), body('color').optional().isHexColor()],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const label = await labelsService.createLabel(req.user!.id, req.params.key, req.body as { name: string; color?: string });
      res.status(201).json(label);
    } catch (err) {
      next(err);
    }
  }
);

labelsRouter.post('/pages/:id/labels', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await labelsService.addLabelToPage(req.params.id, (req.body as { labelId: string }).labelId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

labelsRouter.delete('/pages/:id/labels/:labelId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await labelsService.removeLabelFromPage(req.params.id, req.params.labelId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
