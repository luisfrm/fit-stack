import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Db = NeonHttpDatabase<typeof schema>;

/**
 * Creates a per-request Drizzle DB instance using Neon's HTTP driver.
 * Suitable for serverless environments like Cloudflare Workers.
 */
export function createDb(databaseUrl: string): Db {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

// Re-export all Drizzle ORM operators (eq, and, sql, desc, asc, etc.)
// so repositories can import them directly from @workspace/database/factory
export * from 'drizzle-orm';

