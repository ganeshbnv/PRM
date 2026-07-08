import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import * as userStore from '../services/users';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import * as audit from '../services/audit';

const router = Router();
const ALLOWED_DOMAIN = 'globalhealthx.co';

function safeUser(u: userStore.StoredUser) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt };
}

function generateTempPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// GET /api/users
router.get('/', requireAuth, requireAdmin, (_req: AuthRequest, res: Response): void => {
  res.json(userStore.list().map(safeUser));
});

// POST /api/users/invite
router.post('/invite', requireAuth, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, name } = req.body as { email?: string; name?: string };

  if (!email || !name) {
    res.status(400).json({ error: 'Email and name are required.' });
    return;
  }

  const domain = email.split('@')[1]?.toLowerCase();
  if (domain !== ALLOWED_DOMAIN) {
    res.status(403).json({ error: `Only @${ALLOWED_DOMAIN} email addresses can be invited.` });
    return;
  }

  if (userStore.findByEmail(email.toLowerCase())) {
    res.status(409).json({ error: 'A user with this email already exists.' });
    return;
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const user = userStore.create({
    email: email.toLowerCase(),
    name: name.trim(),
    passwordHash,
    role: 'user',
  });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '';
  audit.append({ userId: req.user!.id, userEmail: req.user!.email, userName: req.user!.name,
    action: 'USER_INVITED', section: 'User Management', resource: '/api/users/invite',
    ip, userAgent: req.headers['user-agent'] ?? '', status: 201,
    detail: `Invited ${email.toLowerCase()} as ${name.trim()}` });
  res.status(201).json({ user: safeUser(user), tempPassword });
});

// PATCH /api/users/:id/role
router.patch('/:id/role', requireAuth, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { role } = req.body as { role?: string };

  if (role !== 'user' && role !== 'admin') {
    res.status(400).json({ error: 'Role must be "user" or "admin".' });
    return;
  }

  const target = userStore.findById(req.params.id);
  if (!target) { res.status(404).json({ error: 'User not found.' }); return; }

  if (role === 'user' && userStore.adminCount() <= 1 && target.role === 'admin') {
    res.status(400).json({ error: 'Cannot remove the only remaining admin.' });
    return;
  }

  const updated = userStore.update(req.params.id, { role });
  if (!updated) { res.status(404).json({ error: 'User not found.' }); return; }

  const ip2 = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '';
  audit.append({ userId: req.user!.id, userEmail: req.user!.email, userName: req.user!.name,
    action: 'USER_ROLE_CHANGED', section: 'User Management', resource: `/api/users/${req.params.id}/role`,
    ip: ip2, userAgent: req.headers['user-agent'] ?? '', status: 200,
    detail: `Changed ${target.email} role to ${role}` });
  res.json(safeUser(updated));
});

// DELETE /api/users/:id
router.delete('/:id', requireAuth, requireAdmin, (req: AuthRequest, res: Response): void => {
  if (req.params.id === req.user!.id) {
    res.status(400).json({ error: 'You cannot delete your own account.' });
    return;
  }

  const target = userStore.findById(req.params.id);
  if (!target) { res.status(404).json({ error: 'User not found.' }); return; }

  if (target.role === 'admin' && userStore.adminCount() <= 1) {
    res.status(400).json({ error: 'Cannot delete the only remaining admin.' });
    return;
  }

  const ip3 = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '';
  audit.append({ userId: req.user!.id, userEmail: req.user!.email, userName: req.user!.name,
    action: 'USER_DELETED', section: 'User Management', resource: `/api/users/${req.params.id}`,
    ip: ip3, userAgent: req.headers['user-agent'] ?? '', status: 200,
    detail: `Deleted ${target.email}` });
  userStore.remove(req.params.id);
  res.json({ ok: true });
});

export default router;
