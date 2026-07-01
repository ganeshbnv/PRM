import crypto from 'crypto';

interface TokenEntry {
  userId: string;
  email: string;
  expires: number;
}

// In-memory store — tokens are short-lived (30 min) and don't need to survive restarts
const store = new Map<string, TokenEntry>();

const TTL_MS = 30 * 60 * 1000;

export function create(userId: string, email: string): string {
  // Invalidate any existing token for this user
  for (const [tok, val] of store.entries()) {
    if (val.userId === userId) store.delete(tok);
  }
  const token = crypto.randomBytes(32).toString('hex');
  store.set(token, { userId, email, expires: Date.now() + TTL_MS });
  return token;
}

/** Validates and consumes (one-time use) the token. Returns null if invalid or expired. */
export function consume(token: string): { userId: string; email: string } | null {
  const entry = store.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(token);
    return null;
  }
  store.delete(token);
  return { userId: entry.userId, email: entry.email };
}
