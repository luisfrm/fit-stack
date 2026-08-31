import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../migrations');
const journalPath = join(migrationsDir, 'meta/_journal.json');
const journal = JSON.parse(readFileSync(journalPath, 'utf8'));

// Load TEST_DATABASE_URL from apps/api-worker/.dev.vars
const devVarsPath = resolve(__dirname, '../../../apps/api-worker/.dev.vars');
let testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl && existsSync(devVarsPath)) {
  const lines = readFileSync(devVarsPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = line.indexOf('=');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    if (key === 'TEST_DATABASE_URL') {
      const value = line.slice(sep+1).trim().replace(/^(['"])(.*)\1$/s, '$2');
      testUrl = value;
      break;
    }
  }
}
if (!testUrl) {
  console.error('TEST_DATABASE_URL not found in', devVarsPath);
  process.exit(1);
}
const sql = neon(testUrl);
console.log('Repairing TEST DB:', testUrl.replace(/:([^@]+)@/, ':***@'));
console.log('Journal entries:', journal.entries.length);
const entries = [];
for (const e of journal.entries) {
  const content = readFileSync(join(migrationsDir, `${e.tag}.sql`), 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  entries.push({ tag: e.tag, hash, when: String(e.when) });
  console.log(`${e.tag} -> ${hash.slice(0,12)}...`);
}
const current = await sql`SELECT * FROM "drizzle"."__drizzle_migrations" ORDER BY created_at`;
console.log('\nCurrent TEST rows:', current.length);
current.forEach(r => console.log(`  ${r.id}: ${r.hash.slice(0,12)}...`));
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='ai_usage' ORDER BY ordinal_position`;
console.log('\nTEST ai_usage columns:', cols.map(c => c.column_name).join(', '));

// Ensure bonus_credits exists (push may have already added it)
const hasBonus = cols.some(c => c.column_name === 'bonus_credits');
if (!hasBonus) {
  console.log('\nbonus_credits missing in TEST DB, adding via ALTER...');
  await sql`ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "bonus_credits" integer DEFAULT 0`;
  console.log('Added bonus_credits');
}

console.log('\n--- Repairing TEST drizzle.__drizzle_migrations ---');
await sql`TRUNCATE "drizzle"."__drizzle_migrations" RESTART IDENTITY`;
for (const { hash, when } of entries) {
  await sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${when})`;
}
const after = await sql`SELECT * FROM "drizzle"."__drizzle_migrations" ORDER BY created_at`;
console.log('After repair TEST rows:', after.length);
after.forEach(r => console.log(`  ${r.id}: ${r.hash.slice(0,12)}...`));
console.log('\n✅ TEST repair complete');
