import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as spacesService from '../services/spaces.service';

export const spacesRouter = Router();

spacesRouter.use(authenticate);

spacesRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const spaces = await spacesService.getSpaces(req.user!.id);
    res.json(spaces);
  } catch (err) {
    next(err);
  }
});

spacesRouter.post(
  '/',
  [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('key')
      .trim()
      .matches(/^[A-Z0-9]{2,10}$/)
      .withMessage('Key must be 2-10 uppercase alphanumeric characters'),
    body('description').optional().trim().isLength({ max: 500 }),
    body('iconEmoji').optional().isString(),
    body('isPrivate').optional().isBoolean(),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const space = await spacesService.createSpace(req.user!.id, req.body as {
        name: string;
        key: string;
        description?: string;
        iconEmoji?: string;
        isPrivate?: boolean;
      });
      res.status(201).json(space);
    } catch (err) {
      next(err);
    }
  }
);

spacesRouter.get('/:key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const space = await spacesService.getSpaceByKey(req.user!.id, req.params.key);
    res.json(space);
  } catch (err) {
    next(err);
  }
});

spacesRouter.put(
  '/:key',
  [
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('iconEmoji').optional().isString(),
    body('isPrivate').optional().isBoolean(),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const space = await spacesService.updateSpace(req.user!.id, req.params.key, req.body as {
        name?: string;
        description?: string;
        iconEmoji?: string;
        isPrivate?: boolean;
      });
      res.json(space);
    } catch (err) {
      next(err);
    }
  }
);

spacesRouter.delete('/:key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await spacesService.deleteSpace(req.user!.id, req.params.key);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
