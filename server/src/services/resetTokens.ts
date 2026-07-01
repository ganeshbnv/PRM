import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(__dirname, '../../data');
const TOKENS_FILE = path.join(DATA_DIR, 'reset-tokens.json');

interface TokenEntry {
  userId: string;
  email: string;
  expires: number;
}

const TTL_MS = 30 * 60 * 1000;

function read(): Record<string, TokenEntry> {
  if (!fs.existsSync(TOKENS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8')); }
  catch { return {}; }
}

function write(tokens: Record<string, TokenEntry>): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

function purgeExpired(tokens: Record<string, TokenEntry>): Record<string, TokenEntry> {
  const now = Date.now();
  const clean: Record<string, TokenEntry> = {};
  for (const [tok, val] of Object.entries(tokens)) {
    if (val.expires > now) clean[tok] = val;
  }
  return clean;
}

export function create(userId: string, email: string): string {
  let tokens = purgeExpired(read());
  // Invalidate any existing token for this user
  for (const [tok, val] of Object.entries(tokens)) {
    if (val.userId === userId) delete tokens[tok];
  }
  const token = crypto.randomBytes(32).toString('hex');
  tokens[token] = { userId, email, expires: Date.now() + TTL_MS };
  write(tokens);
  return token;
}

/** One-time use — deletes token on success. Returns null if invalid or expired. */
export function consume(token: string): { userId: string; email: string } | null {
  const tokens = read();
  const entry = tokens[token];
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    delete tokens[token];
    write(tokens);
    return null;
  }
  delete tokens[token];
  write(tokens);
  return { userId: entry.userId, email: entry.email };
}
