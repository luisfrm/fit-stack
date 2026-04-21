import { Redis } from '@upstash/redis';
import { env } from '@/config/envs';

export const redis = new Redis({
  url: env.upstashRedisRestUrl || '',
  token: env.upstashRedisRestToken || '',
});
