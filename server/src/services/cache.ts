import NodeCache from 'node-cache';

const TTL = parseInt(process.env.CACHE_TTL_SECONDS ?? '300', 10);

const cache = new NodeCache({ stdTTL: TTL, checkperiod: 60 });

export function get<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function set<T>(key: string, value: T, ttl?: number): void {
  cache.set(key, value, ttl ?? TTL);
}

export function del(key: string): void {
  cache.del(key);
}

export function flush(): void {
  cache.flushAll();
}

export function stats() {
  return cache.getStats();
}

/** Wrap an async fetcher with cache-aside logic. */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> {
  const hit = get<T>(key);
  if (hit !== undefined) return hit;
  const value = await fetcher();
  set(key, value, ttl);
  return value;
}
