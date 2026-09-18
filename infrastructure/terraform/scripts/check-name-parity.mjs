#!/usr/bin/env node
/**
 * Verifica la paridad de nombres entre Terraform y los `wrangler.jsonc`.
 *
 * Terraform (`infrastructure/terraform/main.tf`) deriva los nombres de workers,
 * bucket y colas como `nombre-fijo + sufijo-de-ambiente` (producción sin sufijo,
 * staging/dev con `-<env>`). Los `wrangler.jsonc` de `apps/*` declaran esos
 * mismos nombres a mano. Este script falla si divergen, para evitar el fallo
 * silencioso en runtime (el worker produce/consume una cola que no existe).
 *
 * Sin dependencias: se apoya en el parser JSON de Node. Los `wrangler.jsonc`
 * de este repo son JSON estricto (comentarios solo fuera de objetos), así que
 * un `JSON.parse` directo es suficiente. Si en el futuro se agregaran comentarios
 * dentro de los archivos, habría que sanear antes de parsear.
 *
 * Uso: node infrastructure/terraform/scripts/check-name-parity.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

const ENVIRONMENTS = ['production', 'staging', 'dev'];

/** Nombres derivados por ambiente (espejo de los locals de main.tf). */
function expectedNames(environment) {
  const suffix = environment === 'production' ? '' : `-${environment}`;
  return {
    apiWorker: `fit-stack-api${suffix}`,
    jobsWorker: `fit-stack-jobs${suffix}`,
    filesBucket: `fit-stack-files${suffix}`,
    taskQueue: `fit-task-events${suffix}`,
    taskDlq: `fit-task-events-dlq${suffix}`,
    receiptQueue: `fit-receipt-events${suffix}`,
    receiptDlq: `fit-receipt-events-dlq${suffix}`,
  };
}

function readJson(relPath) {
  const abs = resolve(repoRoot, relPath);
  let raw;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch {
    throw new Error(`No se pudo leer ${relPath}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON inválido en ${relPath}: ${err.message}`);
  }
}

/** Extrae la config del ambiente (`env.<name>`); en producción usa la raíz. */
function envConfig(wrangler, environment) {
  if (environment === 'production') return wrangler;
  const cfg = wrangler.env?.[environment];
  if (!cfg) throw new Error(`Falta env.${environment} en el wrangler.jsonc`);
  return cfg;
}

/** Producers declarados por un wrangler (cola + binding). */
function producers(wrangler, environment) {
  const cfg = envConfig(wrangler, environment);
  const list = cfg.queues?.producers ?? [];
  return new Map(list.map((p) => [p.binding, p.queue]));
}

/** Bucket R2 declarado por un wrangler. */
function bucket(wrangler, environment) {
  const cfg = envConfig(wrangler, environment);
  return cfg.r2_buckets?.[0]?.bucket_name;
}

const apiWrangler = readJson('apps/api-worker/wrangler.jsonc');
const jobsWrangler = readJson('apps/jobs-worker/wrangler.jsonc');

const errors = [];

for (const environment of ENVIRONMENTS) {
  const expected = expectedNames(environment);
  const ctx = `[${environment}]`;

  // Workers
  const apiName = envConfig(apiWrangler, environment).name;
  const jobsName = envConfig(jobsWrangler, environment).name;
  if (apiName !== expected.apiWorker) {
    errors.push(`${ctx} api-worker name: wrangler="${apiName}" vs terraform="${expected.apiWorker}"`);
  }
  if (jobsName !== expected.jobsWorker) {
    errors.push(`${ctx} jobs-worker name: wrangler="${jobsName}" vs terraform="${expected.jobsWorker}"`);
  }

  // Bucket R2 (ambos workers deben declarar el mismo bucket derivado)
  for (const [label, wrangler] of [
    ['api-worker', apiWrangler],
    ['jobs-worker', jobsWrangler],
  ]) {
    const b = bucket(wrangler, environment);
    if (b !== expected.filesBucket) {
      errors.push(`${ctx} ${label} bucket: wrangler="${b}" vs terraform="${expected.filesBucket}"`);
    }
  }

  // Producers (binding -> cola)
  const apiProducers = producers(apiWrangler, environment);
  const jobsProducers = producers(jobsWrangler, environment);
  const expectations = [
    ['api-worker', apiProducers, 'TASK_QUEUE', expected.taskQueue],
    ['api-worker', apiProducers, 'RECEIPT_QUEUE', expected.receiptQueue],
    ['jobs-worker', jobsProducers, 'TASK_QUEUE', expected.taskQueue],
    ['jobs-worker', jobsProducers, 'RECEIPT_QUEUE', expected.receiptQueue],
  ];
  for (const [label, map, binding, expectedQueue] of expectations) {
    const actual = map.get(binding);
    if (actual !== expectedQueue) {
      errors.push(
        `${ctx} ${label} producer ${binding}: wrangler="${actual ?? '(sin declarar)'}" vs terraform="${expectedQueue}"`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('\n❌ Paridad de nombres Terraform ↔ wrangler.jsonc rota:\n');
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    '\n   Los nombres de workers/bucket/colas se derivan en infrastructure/terraform/main.tf\n' +
      '   como nombre+fijo + sufijo de ambiente. Actualiza el wrangler.jsonc correspondiente\n' +
      '   (o main.tf) en el mismo PR para restaurar la paridad.\n',
  );
  process.exit(1);
}

console.log('✅ Paridad de nombres Terraform ↔ wrangler.jsonc OK (production, staging, dev).');
