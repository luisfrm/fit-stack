/**
 * Pushes the Drizzle schema to the TEST_DATABASE_URL.
 *
 * Usage:  pnpm --filter api-worker test:db:push
 *
 * Reads TEST_DATABASE_URL from apps/api-worker/.dev.vars (same file the test
 * runner reads via tests/setup.ts). Falls back to process.env if already set.
 *
 * This is for LOCAL use only — never run against production.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load TEST_DATABASE_URL from .dev.vars ──────────────────────────────────
const DEV_VARS_PATH = resolve(__dirname, '../.dev.vars');

if (!process.env.TEST_DATABASE_URL && existsSync(DEV_VARS_PATH)) {
  const lines = readFileSync(DEV_VARS_PATH, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = line.indexOf('=');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    if (key === 'TEST_DATABASE_URL' && !process.env.TEST_DATABASE_URL) {
      const value = line.slice(sep + 1).trim().replace(/^(['"])(.*)\1$/s, '$2');
      process.env.TEST_DATABASE_URL = value;
    }
  }
}

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  console.error(
    '\n❌ TEST_DATABASE_URL is not set.\n' +
    'Add it to apps/api-worker/.dev.vars (a dedicated Neon branch, never production).\n',
  );
  process.exit(1);
}

// ── Safety: refuse to push to production ────────────────────────────────────
const PROD_URL = process.env.DATABASE_URL;
if (PROD_URL) {
  const identity = (raw: string) => {
    try {
      const url = new URL(raw);
      return `${url.hostname}${url.pathname}`;
    } catch {
      return raw;
    }
  };
  if (identity(PROD_URL) === identity(TEST_DATABASE_URL)) {
    console.error(
      '\n🚫 REFUSING: TEST_DATABASE_URL points at the same host+database as DATABASE_URL.\n' +
      'Use a dedicated Neon branch for testing.\n',
    );
    process.exit(1);
  }
}

// ── Run drizzle-kit push ────────────────────────────────────────────────────
const databasePath = resolve(__dirname, '../../packages/database');

console.log(`\n🔄 Pushing schema to TEST_DATABASE_URL...\n`);
console.log(`   Target: ${TEST_DATABASE_URL.replace(/:([^@]+)@/, ':***@')}\n`);

try {
  execSync('npx drizzle-kit push --force', {
    cwd: databasePath,
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
    },
    stdio: 'inherit',
  });
  console.log('\n✅ Schema pushed successfully to test database.\n');
} catch {
  console.error('\n❌ drizzle-kit push failed. Check the output above.\n');
  process.exit(1);
}
