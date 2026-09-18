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
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

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
// `packages/database` está en la raíz del monorepo; `__dirname` es
// `apps/api-worker/scripts`, así que hay que subir tres niveles.
const databasePath = resolve(__dirname, '../../../packages/database');

/**
 * Resuelve el binario real de `drizzle-kit` (`./bin.cjs`) sin depender de
 * `node_modules/.bin` ni de `npx`.
 *
 * El `exports` del paquete NO expone ni `bin.cjs` ni `package.json`, y con
 * pnpm el binario no está en la raíz: hay que partir de la entrada CJS que
 * resuelve Node (`require.resolve('drizzle-kit')`), subir hasta el directorio
 * del paquete y leer su campo `bin` (puede ser `string` u objeto).
 */
function resolveDrizzleBin(): string {
  const databaseRequire = createRequire(resolve(databasePath, 'package.json'));
  const entry = databaseRequire.resolve('drizzle-kit');

  let packageDir = dirname(entry);
  while (!existsSync(resolve(packageDir, 'package.json'))) {
    const parent = dirname(packageDir);
    if (parent === packageDir) {
      throw new Error(
        `No se encontró el package.json de drizzle-kit subiendo desde ${entry}.`,
      );
    }
    packageDir = parent;
  }

  const packageJsonPath = resolve(packageDir, 'package.json');
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const binRelative =
    typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['drizzle-kit'];

  if (!binRelative) {
    throw new Error(
      `drizzle-kit no declara un bin "drizzle-kit" en ${packageJsonPath}.`,
    );
  }

  const drizzleBin = resolve(packageDir, binRelative);
  if (!existsSync(drizzleBin)) {
    throw new Error(`El bin resuelto de drizzle-kit no existe: ${drizzleBin}.`);
  }
  return drizzleBin;
}

let drizzleBin: string;
try {
  drizzleBin = resolveDrizzleBin();
} catch (err) {
  console.error('\n❌ No se pudo resolver el binario de drizzle-kit.\n');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

console.log(`\n🔄 Pushing schema to TEST_DATABASE_URL...\n`);
console.log(`   Target: ${TEST_DATABASE_URL.replace(/:([^@]+)@/, ':***@')}\n`);

// `spawn` sin shell: en Windows `execSync`/`npx` fallan con
// `spawnSync cmd.exe ENOENT`. Ejecutamos el bin con el propio Node.
const result = spawnSync(process.execPath, [drizzleBin, 'push', '--force'], {
  cwd: databasePath,
  env: {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
});

if (result.error) {
  console.error('\n❌ No se pudo ejecutar drizzle-kit push:\n');
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error('\n❌ drizzle-kit push failed. Full output:\n');
  if (result.stdout) console.error(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(result.status ?? 1);
}

if (result.stdout) console.log(result.stdout);
console.log('\n✅ Schema pushed successfully to test database.\n');
