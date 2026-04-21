import { redis } from './redis';

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      return await redis.get<T>(key);
    } catch (error) {
      console.error(`[CACHE GET ERROR] key: ${key}`, error);
      return null;
    }
  },

  async set(key: string, data: any, ttlSeconds: number = 60 * 5): Promise<void> {
    try {
      await redis.set(key, data, { ex: ttlSeconds });
    } catch (error) {
      console.error(`[CACHE SET ERROR] key: ${key}`, error);
    }
  },

  async invalidate(pattern: string): Promise<void> {
    try {
      // In serverless environments, Upstash supports scan
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      console.error(`[CACHE INVALIDATE ERROR] pattern: ${pattern}`, error);
    }
  },

  async invalidateExact(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      console.error(`[CACHE INVALIDATE EXACT ERROR] key: ${key}`, error);
    }
  }
};
