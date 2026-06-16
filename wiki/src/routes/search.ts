import { Router, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../utils/prisma';

export const searchRouter = Router();

searchRouter.use(authenticate);

searchRouter.get(
  '/',
  [query('q').trim().isLength({ min: 1 })],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const q = req.query.q as string;
      const spaceId = req.query.spaceId as string | undefined;

      const where: Record<string, unknown> = {
        status: 'published',
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { contentText: { contains: q, mode: 'insensitive' } },
        ],
      };
      if (spaceId) where.spaceId = spaceId;

      const pages = await prisma.page.findMany({
        where,
        take: 20,
        select: {
          id: true,
          title: true,
          emoji: true,
          contentText: true,
          updatedAt: true,
          space: { select: { id: true, name: true, key: true } },
          creator: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const results = pages.map((p) => {
        const idx = p.contentText.toLowerCase().indexOf(q.toLowerCase());
        const snippet =
          idx >= 0
            ? '...' + p.contentText.slice(Math.max(0, idx - 40), idx + 100) + '...'
            : p.contentText.slice(0, 140);
        return { ...p, contentText: undefined, snippet };
      });

      res.json(results);
    } catch (err) {
      next(err);
    }
  }
);
