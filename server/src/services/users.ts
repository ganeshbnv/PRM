import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

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

export function count(): number {
  return read().length;
}
