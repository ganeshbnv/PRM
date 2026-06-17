import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const usersRouter = Router();
usersRouter.use(authenticate);

usersRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: { NOT: { id: req.user!.id } },
      select: { id: true, name: true, email: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

usersRouter.get('/search', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const q = ((req.query.q as string) ?? '').trim();
    if (!q) return res.json([]);
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
        NOT: { id: req.user!.id },
      },
      select: { id: true, name: true, email: true, avatarUrl: true },
      take: 10,
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});
