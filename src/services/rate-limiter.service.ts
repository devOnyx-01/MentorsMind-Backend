import { logger } from '../utils/logger.utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlidingWindowResult {
  allowed: boolean;
  current: number;
  remaining: number;
  resetTime: Date;
  limit: number;
}

// ─── In-Memory Store (fallback when Redis is unavailable) ─────────────────────

interface WindowEntry {
  timestamps: number[];
  windowMs: number;
}

const memoryStore = new Map<string, WindowEntry>();

function slidingWindowMemory(key: string, windowMs: number, max: number): SlidingWindowResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = memoryStore.get(key);
  if (!entry) {
    entry = { timestamps: [], windowMs };
    memoryStore.set(key, entry);
  }

  // Evict timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
  entry.timestamps.push(now);

  const current = entry.timestamps.length;
  const allowed = current <= max;
  const oldest = entry.timestamps[0] ?? now;
  const resetTime = new Date(oldest + windowMs);

  return { allowed, current, remaining: Math.max(0, max - current), resetTime, limit: max };
}

// Periodically clean up stale keys to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    const windowStart = now - entry.windowMs;
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
    if (entry.timestamps.length === 0) {
      memoryStore.delete(key);
    }
  }
}, 60_000);

// ─── Redis Store ──────────────────────────────────────────────────────────────

let redisClient: any = null;
let redisAvailable = false;

/**
 * Lazily initialise the Redis client.
 * If ioredis is not installed or REDIS_URL is absent, falls back to memory.
 */
async function getRedisClient(): Promise<any | null> {
  if (redisClient) return redisAvailable ? redisClient : null;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    // Dynamic import so the app still boots without ioredis installed
    const { default: Redis } = await import('ioredis');
    redisClient = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      enableOfflineQueue: false,
    });

    redisClient.on('error', (err: Error) => {
      if (redisAvailable) {
        logger.warn('Redis connection lost — falling back to in-memory rate limiting', {
          error: err.message,
        });
      }
      redisAvailable = false;
    });

    redisClient.on('connect', () => {
      redisAvailable = true;
      logger.info('Redis connected — using distributed rate limiting');
    });

    await redisClient.connect();
    return redisClient;
  } catch (err: any) {
    logger.warn('Redis unavailable — using in-memory rate limiting', { error: err.message });
    return null;
  }
}

/**
 * Sliding window via Redis sorted sets.
 * Each member is a unique timestamp; score = timestamp (ms).
 */
async function slidingWindowRedis(
  client: any,
  key: string,
  windowMs: number,
  max: number
): Promise<SlidingWindowResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `rl:sw:${key}`;

  const pipeline = client.pipeline();
  pipeline.zremrangebyscore(redisKey, '-inf', windowStart);
  pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
  pipeline.zcard(redisKey);
  pipeline.zrange(redisKey, 0, 0, 'WITHSCORES');
  pipeline.pexpire(redisKey, windowMs);

  const results = await pipeline.exec();
  const current: number = results[2][1] as number;
  const oldestScore: number = results[3][1]?.[1]
    ? parseInt(results[3][1][1], 10)
    : now;

  const allowed = current <= max;
  const resetTime = new Date(oldestScore + windowMs);

  return { allowed, current, remaining: Math.max(0, max - current), resetTime, limit: max };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class RateLimiterService {
  /**
   * Check and record a hit for the given key using a sliding window.
   * Automatically uses Redis when available, falls back to in-memory.
   */
  static async check(key: string, windowMs: number, max: number): Promise<SlidingWindowResult> {
    try {
      const client = await getRedisClient();
      if (client && redisAvailable) {
        return await slidingWindowRedis(client, key, windowMs, max);
      }
    } catch (err: any) {
      logger.warn('Redis sliding window error — falling back to memory', { error: err.message });
    }
    return slidingWindowMemory(key, windowMs, max);
  }

  /**
   * Reset all hits for a key (e.g. after successful login).
   */
  static async reset(key: string): Promise<void> {
    memoryStore.delete(key);
    try {
      const client = await getRedisClient();
      if (client && redisAvailable) {
        await client.del(`rl:sw:${key}`);
      }
    } catch {
      // best-effort
    }
  }

  /**
   * Returns whether Redis is currently being used.
   */
  static isDistributed(): boolean {
    return redisAvailable;
  }

  /**
   * Analytics: get current hit count for a key without recording a new hit.
   */
  static async getCount(key: string, windowMs: number): Promise<number> {
    try {
      const client = await getRedisClient();
      if (client && redisAvailable) {
        const now = Date.now();
        const windowStart = now - windowMs;
        return await client.zcount(`rl:sw:${key}`, windowStart, '+inf');
      }
    } catch {
      // fall through
    }
    const entry = memoryStore.get(key);
    if (!entry) return 0;
    const windowStart = Date.now() - windowMs;
    return entry.timestamps.filter((t) => t > windowStart).length;
  }
}
