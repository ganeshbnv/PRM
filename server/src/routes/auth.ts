import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as userStore from '../services/users';
import * as resetTokens from '../services/resetTokens';
import { sendPasswordResetEmail, sendNewUserNotification } from '../services/mailer';
import { requireAuth, AuthRequest } from '../middleware/auth';
import * as audit from '../services/audit';

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

  // Notify admin — fire-and-forget, never block registration
  setImmediate(() => {
    try { sendNewUserNotification(user.name, user.email); }
    catch (err) { console.warn('[mailer] new-user notification failed:', (err as Error).message); }
  });

  res.status(201).json({ token, user: safeUser(user) });
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '';
  const ua = req.headers['user-agent'] ?? '';

  const user = userStore.findByEmail(email.toLowerCase());
  if (!user) {
    audit.append({ userId: '', userEmail: email.toLowerCase(), userName: '', action: 'LOGIN_FAILED',
      section: 'Auth', resource: '/api/auth/login', ip, userAgent: ua, status: 401,
      detail: 'Unknown email' });
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    audit.append({ userId: user.id, userEmail: user.email, userName: user.name, action: 'LOGIN_FAILED',
      section: 'Auth', resource: '/api/auth/login', ip, userAgent: ua, status: 401,
      detail: 'Wrong password' });
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  audit.append({ userId: user.id, userEmail: user.email, userName: user.name, action: 'LOGIN_SUCCESS',
    section: 'Auth', resource: '/api/auth/login', ip, userAgent: ua, status: 200 });
  const token = issueToken(user.id);
  res.json({ token, user: safeUser(user) });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: 'Email is required.' }); return; }

  const ip2 = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '';
  const ua2 = req.headers['user-agent'] ?? '';
  // Always return 200 — don't reveal whether the email exists
  const user = userStore.findByEmail(email.toLowerCase());
  if (user) {
    audit.append({ userId: user.id, userEmail: user.email, userName: user.name,
      action: 'PASSWORD_RESET_REQUESTED', section: 'Auth', resource: '/api/auth/forgot-password',
      ip: ip2, userAgent: ua2, status: 200 });
    const token = resetTokens.create(user.id, user.email);
    const serverUrl = process.env.SERVER_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
    const resetLink = `${serverUrl}/reset-password?token=${token}`;
    try {
      sendPasswordResetEmail(user.email, user.name, resetLink);
    } catch (err) {
      console.error('Failed to send reset email:', (err as Error).message);
    }
  }

  res.json({ message: 'If that email is registered, a reset link has been sent.' });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) { res.status(400).json({ error: 'Token and password are required.' }); return; }
  if (password.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }

  const entry = resetTokens.consume(token);
  if (!entry) { res.status(400).json({ error: 'This reset link is invalid or has expired.' }); return; }

  const hash = await bcrypt.hash(password, 12);
  const updated = userStore.updatePassword(entry.userId, hash);
  if (!updated) { res.status(404).json({ error: 'User not found.' }); return; }

  const ip3 = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '';
  const ua3 = req.headers['user-agent'] ?? '';
  audit.append({ userId: updated.id, userEmail: updated.email, userName: updated.name,
    action: 'PASSWORD_RESET_COMPLETED', section: 'Auth', resource: '/api/auth/reset-password',
    ip: ip3, userAgent: ua3, status: 200 });
  const newToken = issueToken(updated.id);
  res.json({ token: newToken, user: safeUser(updated) });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthRequest, res: Response): void => {
  const user = userStore.findById(req.user!.id);
  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
  res.json(safeUser(user));
});

export default router;
