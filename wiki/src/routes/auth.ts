import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as authService from '../services/auth.service';

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
