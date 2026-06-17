import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

export type UserRole = 'user' | 'admin';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

const SUPER_ADMIN_EMAIL = 'ganesh.bandi@globalhealthx.co';

function read(): StoredUser[] {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')) as StoredUser[]; }
  catch { return []; }
}

function write(users: StoredUser[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export function findByEmail(email: string): StoredUser | undefined {
  return read().find(u => u.email === email);
}

export function findById(id: string): StoredUser | undefined {
  return read().find(u => u.id === id);
}

export function list(): StoredUser[] {
  return read();
}

export function create(data: Omit<StoredUser, 'id' | 'createdAt'>): StoredUser {
  const users = read();
  const user: StoredUser = {
    ...data,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    createdAt: new Date().toISOString(),
  };
  write([...users, user]);
  return user;
}

export function update(id: string, data: Partial<Pick<StoredUser, 'name' | 'role'>>): StoredUser | undefined {
  const users = read();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return undefined;
  users[idx] = { ...users[idx], ...data };
  write(users);
  return users[idx];
}

export function remove(id: string): boolean {
  const users = read();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return false;
  users.splice(idx, 1);
  write(users);
  return true;
}

export function count(): number {
  return read().length;
}

export function adminCount(): number {
  return read().filter(u => u.role === 'admin').length;
}

/** Run on server start — ensures Ganesh is always admin and migrates old role-less records. */
export function ensureSuperAdmin(): void {
  const users = read();
  let changed = false;

  for (const u of users) {
    if (!(u as StoredUser).role) {
      (u as StoredUser).role = u.email === SUPER_ADMIN_EMAIL ? 'admin' : 'user';
      changed = true;
    }
  }

  const ganesh = users.find(u => u.email === SUPER_ADMIN_EMAIL);
  if (ganesh && ganesh.role !== 'admin') {
    ganesh.role = 'admin';
    changed = true;
  }

  if (changed) write(users);
}
