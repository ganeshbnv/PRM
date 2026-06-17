import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as userStore from '../services/users';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production';
const ALLOWED_DOMAIN = 'globalhealthx.co';

function issueToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function safeUser(u: userStore.StoredUser) {
  return { id: u.id, email: u.email, name: u.name, role: u.role ?? 'user', createdAt: u.createdAt };
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, name, password } = req.body as { email?: string; name?: string; password?: string };

  if (!email || !name || !password) {
    res.status(400).json({ error: 'Email, name, and password are required.' });
    return;
  }

  const domain = email.split('@')[1]?.toLowerCase();
  if (domain !== ALLOWED_DOMAIN) {
    res.status(403).json({ error: `Only @${ALLOWED_DOMAIN} email addresses are allowed.` });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  if (userStore.findByEmail(email.toLowerCase())) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = userStore.create({ email: email.toLowerCase(), name: name.trim(), passwordHash, role: 'user' });
  const token = issueToken(user.id);

  res.status(201).json({ token, user: safeUser(user) });
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = userStore.findByEmail(email.toLowerCase());
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = issueToken(user.id);
  res.json({ token, user: safeUser(user) });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthRequest, res: Response): void => {
  const user = userStore.findById(req.user!.id);
  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
  res.json(safeUser(user));
});

export default router;
