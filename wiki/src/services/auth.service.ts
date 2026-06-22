import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { redis } from '../utils/redis';
import { Errors } from '../utils/errors';

const REFRESH_PREFIX = 'refresh:';

export async function register(email: string, name: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw Errors.conflict('Email already in use');

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, name, password: hashed },
    select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
  });

  const tokens = await issueTokens(user.id);
  return { user, tokens };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw Errors.unauthorized('Invalid email or password');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw Errors.unauthorized('Invalid email or password');

  const tokens = await issueTokens(user.id);
  const { password: _, ...safeUser } = user;
  return { user: safeUser, tokens };
}

export async function refreshToken(token: string) {
  const { userId } = verifyRefreshToken(token);
  const stored = await redis.get(`${REFRESH_PREFIX}${userId}`);
  if (stored !== token) throw Errors.unauthorized('Refresh token revoked');

  const accessToken = signAccessToken(userId);
  return { accessToken };
}

export async function logout(userId: string) {
  await redis.del(`${REFRESH_PREFIX}${userId}`);
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
  });
  if (!user) throw Errors.notFound('User');
  return user;
}

export async function updateProfile(userId: string, data: { name?: string; avatarUrl?: string }) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
  });
  return user;
}

export async function ssoLogin(email: string, name: string) {
  let existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const hashed = await bcrypt.hash(crypto.randomUUID(), 12);
    existing = await prisma.user.create({
      data: { email, name, password: hashed },
    });
  } else if (existing.name !== name) {
    existing = await prisma.user.update({ where: { id: existing.id }, data: { name } });
  }

  const tokens = await issueTokens(existing.id);
  const { password: _, ...safeUser } = existing;
  return { user: safeUser, tokens };
}

async function issueTokens(userId: string) {
  const accessToken = signAccessToken(userId);
  const refreshToken = signRefreshToken(userId);
  await redis.set(`${REFRESH_PREFIX}${userId}`, refreshToken, 'EX', 60 * 60 * 24 * 7);
  return { accessToken, refreshToken };
}
