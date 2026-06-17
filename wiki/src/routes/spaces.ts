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

// List members
spacesRouter.get('/:key/members', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const members = await spacesService.getSpaceMembers(req.params.key);
    res.json(members);
  } catch (err) { next(err); }
});

// Add / update member
spacesRouter.post('/:key/members',
  authenticate,
  [body('userId').isString().notEmpty(), body('role').isIn(['viewer', 'admin'])],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { userId, role } = req.body as { userId: string; role: 'viewer' | 'admin' };
      const member = await spacesService.setSpaceMember(req.user!.id, req.params.key, userId, role);
      res.json(member);
    } catch (err) { next(err); }
  }
);

// Remove member
spacesRouter.delete('/:key/members/:userId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    await spacesService.removeSpaceMember(req.user!.id, req.params.key, req.params.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Update space (isPrivate etc.)
spacesRouter.patch('/:key',
  authenticate,
  [body('isPrivate').optional().isBoolean(), body('name').optional().trim()],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const updated = await spacesService.updateSpace(req.user!.id, req.params.key, req.body as Partial<{ name: string; isPrivate: boolean; description: string; iconEmoji: string }>);
      res.json(updated);
    } catch (err) { next(err); }
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
