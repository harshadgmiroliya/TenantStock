/**
 * Optional Redis layer for read-heavy endpoints (dashboard).
 * If REDIS_URL is unset or Redis is down, callers fall back to MongoDB only.
 */
import { Redis } from "ioredis";

let client: Redis | null = null;
let disabled = false;

function getClient(): Redis | null {
  if (disabled || !process.env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    client.on("error", () => {
      // Avoid crashing API when Redis is unavailable in local dev
    });
  }
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    if (redis.status !== "ready") await redis.connect();
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    disabled = true;
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    if (redis.status !== "ready") await redis.connect();
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    disabled = true;
  }
}

/** Delete a single key or all keys matching a glob pattern (e.g. `tenantstock:dashboard:*`). */
export async function cacheDel(keyOrPattern: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    if (redis.status !== "ready") await redis.connect();
    if (!keyOrPattern.includes("*")) {
      await redis.del(keyOrPattern);
      return;
    }
    const keys = await redis.keys(keyOrPattern);
    if (keys.length) await redis.del(...keys);
  } catch {
    disabled = true;
  }
}

export function dashboardCacheKey(tenantId: string) {
  return `tenantstock:dashboard:${tenantId}`;
}
