import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../utils/prisma';
import { Errors } from '../utils/errors';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; name: string };
}

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw Errors.unauthorized();
    }
    const token = header.slice(7);
    const { userId } = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw Errors.unauthorized();
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const token = header.slice(7);
      const { userId } = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      });
      if (user) req.user = user;
    }
    next();
  } catch {
    next();
  }
}
