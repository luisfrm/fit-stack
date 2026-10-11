import { Redis } from '@upstash/redis';
import type { Env } from './env';

export function createCache(env: Partial<Env>) {
  const isConfigured = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
  
  const redis = isConfigured
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL!,
        token: env.UPSTASH_REDIS_REST_TOKEN!,
      })
    : null;

  return {
    async get<T>(key: string): Promise<T | null> {
      if (!redis) return null;
      try {
        return await redis.get<T>(key);
      } catch (error) {
        console.error(`[CACHE GET ERROR] key: ${key}`, error);
        return null;
      }
    },

    async set(key: string, data: unknown, ttlSeconds: number = 60 * 5): Promise<void> {
      if (!redis) return;
      try {
        await redis.set(key, data, { ex: ttlSeconds });
      } catch (error) {
        console.error(`[CACHE SET ERROR] key: ${key}`, error);
      }
    },

    async invalidate(pattern: string): Promise<void> {
      if (!redis) return;
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
          cursor = String(nextCursor);
          if (keys.length > 0) {
            await redis.del(...keys);
          }
        } while (cursor !== '0');
      } catch (error) {
        console.error(`[CACHE INVALIDATE ERROR] pattern: ${pattern}`, error);
      }
    },

    async invalidateExact(key: string): Promise<void> {
      if (!redis) return;
      try {
        await redis.del(key);
      } catch (error) {
        console.error(`[CACHE INVALIDATE EXACT ERROR] key: ${key}`, error);
      }
    },

    /**
     * Atomic INCR with TTL (only if key is new). Used by AI rate-limiting:
     * DB (ai_usage) is the single source of truth; Redis acts as cache.
     */
    async increment(key: string, ttlSeconds?: number): Promise<number | null> {
      if (!redis) return null;
      try {
        const value = await redis.incr(key);
        if (value === 1 && ttlSeconds) {
          await redis.expire(key, ttlSeconds);
        }
        return value;
      } catch (error) {
        console.error(`[CACHE INCREMENT ERROR] key: ${key}`, error);
        return null;
      }
    },
  };
}

export type Cache = ReturnType<typeof createCache>;
