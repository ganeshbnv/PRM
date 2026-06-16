import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as pagesService from '../services/pages.service';

export const pagesRouter = Router();

pagesRouter.use(authenticate);

// Page tree for a space
pagesRouter.get('/spaces/:key/pages', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tree = await pagesService.getPageTree(req.params.key);
    res.json(tree);
  } catch (err) {
    next(err);
  }
});

// Create page in a space
pagesRouter.post(
  '/spaces/:key/pages',
  [
    body('title').optional().trim().isLength({ max: 300 }),
    body('content').optional().isString(),
    body('parentId').optional().isString(),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = await pagesService.createPage(req.user!.id, req.params.key, req.body as {
        parentId?: string;
        title?: string;
        content?: string;
      });
      res.status(201).json(page);
    } catch (err) {
      next(err);
    }
  }
);

// Get single page
pagesRouter.get('/pages/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = await pagesService.getPage(req.params.id, req.user!.id);
    res.json(page);
  } catch (err) {
    next(err);
  }
});

// Update page
pagesRouter.put(
  '/pages/:id',
  [
    body('title').optional().trim().isLength({ max: 300 }),
    body('content').optional().isString(),
    body('status').optional().isIn(['draft', 'published', 'archived']),
    body('emoji').optional().isString(),
    body('parentId').optional().isString(),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = await pagesService.updatePage(req.user!.id, req.params.id, req.body as {
        title?: string;
        content?: string;
        status?: string;
        emoji?: string;
        parentId?: string;
      });
      res.json(page);
    } catch (err) {
      next(err);
    }
  }
);

// Delete page
pagesRouter.delete('/pages/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await pagesService.deletePage(req.user!.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Recent pages
pagesRouter.get('/pages/recent', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const pages = await pagesService.getRecentPages(req.user!.id);
    res.json(pages);
  } catch (err) {
    next(err);
  }
});

// Move page (drag-and-drop)
pagesRouter.patch(
  '/pages/:id/move',
  [
    body('parentId').optional({ nullable: true }),
    body('position').optional().isFloat(),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await pagesService.movePage(
        req.user!.id,
        req.params.id,
        (req.body as { parentId?: string | null }).parentId ?? null,
        (req.body as { position?: number }).position ?? 0,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// Version history
pagesRouter.get('/pages/:id/versions', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const versions = await pagesService.getVersions(req.params.id);
    res.json(versions);
  } catch (err) {
    next(err);
  }
});

pagesRouter.get('/pages/:id/versions/:version', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const version = await pagesService.getVersion(req.params.id, parseInt(req.params.version, 10));
    res.json(version);
  } catch (err) {
    next(err);
  }
});

// Page access management
pagesRouter.get('/pages/:id/access', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const access = await pagesService.getPageAccess(req.params.id);
    res.json(access);
  } catch (err) {
    next(err);
  }
});

pagesRouter.post(
  '/pages/:id/access',
  [body('userId').isString().notEmpty()],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const entry = await pagesService.grantPageAccess(req.user!.id, req.params.id, (req.body as { userId: string }).userId);
      res.json(entry);
    } catch (err) {
      next(err);
    }
  }
);

pagesRouter.delete('/pages/:id/access/:userId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await pagesService.revokePageAccess(req.user!.id, req.params.id, req.params.userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
