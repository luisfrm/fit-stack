import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../migrations');
const journalPath = join(migrationsDir, 'meta/_journal.json');

const journal = JSON.parse(readFileSync(journalPath, 'utf8'));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(url);

async function main() {
  console.log('Repairing drizzle.__drizzle_migrations for DB:', url.replace(/:([^@]+)@/, ':***@'));
  console.log('Journal entries:', journal.entries.length);

  // Compute hashes for each journal entry (SHA256 of the .sql file content)
  const entries = [];
  for (const e of journal.entries) {
    const file = join(migrationsDir, `${e.tag}.sql`);
    const content = readFileSync(file, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    entries.push({ tag: e.tag, hash, when: String(e.when) });
    console.log(`${e.tag} -> ${hash} (when ${e.when})`);
  }

  // Show current DB state
  const current = await sql`SELECT * FROM "drizzle"."__drizzle_migrations" ORDER BY created_at`;
  console.log('\nCurrent DB rows:', current.length);
  current.forEach(r => console.log(`  ${r.id}: ${r.hash.slice(0,12)}... created_at=${r.created_at}`));

  // Check ai_usage columns
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='ai_usage' ORDER BY ordinal_position`;
  console.log('\nai_usage columns:', cols.map(c => c.column_name).join(', '));

  // Repair: delete and reinsert all (baseline)
  console.log('\n--- Repairing: truncating and reinserting all journal entries ---');
  await sql`TRUNCATE "drizzle"."__drizzle_migrations" RESTART IDENTITY`;
  for (const { hash, when } of entries) {
    await sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${when})`;
  }
  const after = await sql`SELECT * FROM "drizzle"."__drizzle_migrations" ORDER BY created_at`;
  console.log('\nAfter repair rows:', after.length);
  after.forEach(r => console.log(`  ${r.id}: ${r.hash.slice(0,12)}...`));

  console.log('\n✅ Repair complete. Now "pnpm db:migrate" should report "No migrations to run" (or only new ones).');
  console.log('Check with: pnpm --filter @workspace/database exec drizzle-kit check');
}

main().catch(e => { console.error(e); process.exit(1); });
