import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as commentsService from '../services/comments.service';

export const commentsRouter = Router();

commentsRouter.use(authenticate);

commentsRouter.get('/pages/:id/comments', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const comments = await commentsService.getComments(req.params.id);
    res.json(comments);
  } catch (err) {
    next(err);
  }
});

commentsRouter.post(
  '/pages/:id/comments',
  [body('body').trim().isLength({ min: 1 })],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const comment = await commentsService.createComment(req.user!.id, req.params.id, req.body as {
        body: string;
        parentId?: string;
        anchorText?: string;
        anchorPos?: unknown;
      });
      res.status(201).json(comment);
    } catch (err) {
      next(err);
    }
  }
);

commentsRouter.put(
  '/comments/:id',
  [body('body').trim().isLength({ min: 1 })],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const comment = await commentsService.updateComment(req.user!.id, req.params.id, (req.body as { body: string }).body);
      res.json(comment);
    } catch (err) {
      next(err);
    }
  }
);

commentsRouter.delete('/comments/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await commentsService.deleteComment(req.user!.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

commentsRouter.put('/comments/:id/resolve', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const comment = await commentsService.resolveComment(req.user!.id, req.params.id);
    res.json(comment);
  } catch (err) {
    next(err);
  }
});
