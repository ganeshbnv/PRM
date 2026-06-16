import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = 20;
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where: { userId: req.user!.id } }),
    ]);
    res.json({ data: notifications, total, page, limit, hasMore: page * limit < total });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.put('/:id/read', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { isRead: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.put('/read-all', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
