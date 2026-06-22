import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import jwt from 'jsonwebtoken';
import { validate } from '../middleware/validate';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as authService from '../services/auth.service';

const PRM_JWT_SECRET = process.env.PRM_JWT_SECRET ?? 'prm-ghx-jwt-secret-2024-change-in-prod';

export const authRouter = Router();

authRouter.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('password').isLength({ min: 8 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, name, password } = req.body as {
        email: string;
        name: string;
        password: string;
      };
      const result = await authService.register(email, name, password);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const result = await authService.login(email, password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post('/sso', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prmToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!prmToken) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'PRM token required' } }); return; }
    try { jwt.verify(prmToken, PRM_JWT_SECRET); }
    catch { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid PRM token' } }); return; }

    const { email, name } = req.body as { email?: string; name?: string };
    if (!email || !name) { res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'email and name required' } }); return; }

    const result = await authService.ssoLogin(email, name);
    res.json(result);
  } catch (err) { next(err); }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'refreshToken required' } });
      return;
    }
    const result = await authService.refreshToken(refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post(
  '/logout',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      await authService.logout(req.user!.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.get(
  '/me',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getMe(req.user!.id);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
);

authRouter.patch(
  '/me',
  authenticate,
  [body('name').optional().trim().isLength({ min: 1, max: 100 })],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, avatarUrl } = req.body as { name?: string; avatarUrl?: string };
      const user = await authService.updateProfile(req.user!.id, { name, avatarUrl });
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
);
