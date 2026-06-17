import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as userStore from '../services/users';

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; name: string; role: userStore.UserRole };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const { userId } = jwt.verify(auth.slice(7), JWT_SECRET) as { userId: string };
    const user = userStore.findById(userId);
    if (!user) { res.status(401).json({ error: 'User not found' }); return; }
    req.user = { id: user.id, email: user.email, name: user.name, role: user.role ?? 'user' };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return; }
  next();
}
