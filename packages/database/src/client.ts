import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

// Required for WebSocket support in environments where it's not global
if (!process.env.VERCEL) {
  neonConfig.webSocketConstructor = ws;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined in environment variables');
}

const pool = new Pool({ connectionString: databaseUrl });

export const db = drizzle(pool, { schema })

export * from 'drizzle-orm';
