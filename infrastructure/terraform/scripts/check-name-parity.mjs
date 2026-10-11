#!/usr/bin/env node
/**
 * Verifica la paridad entre Terraform y los `wrangler.jsonc`.
 *
 * 1. **Nombres**: Terraform (`infrastructure/terraform/main.tf`) deriva los
 *    nombres de workers, bucket y colas como `nombre-fijo + sufijo-de-ambiente`
 *    (producción sin sufijo, staging/dev con `-<env>`). Los `wrangler.jsonc` de
 *    `apps/*` declaran esos mismos nombres a mano. Este script falla si
 *    divergen, para evitar el fallo silencioso en runtime (el worker
 *    produce/consume una cola que no existe).
 *
 * 2. **Settings de consumers**: los consumers están declarados en Terraform
 *    (`workers.tf`) Y en el `wrangler.jsonc` de jobs-worker, con los mismos
 *    valores (el deploy hace upsert y gana el último escritor). Este script
 *    compara los bloques del wrangler entre sí y contra Terraform, con la
 *    conversión de unidades `max_batch_timeout` (segundos) ==
 *    `max_wait_time_ms` (milisegundos). Sin esto, un cambio en un solo lado
 *    cambia el comportamiento de la cola en silencio.
 *
 * 3. **Dead-letter threshold**: the shared constant `TASK_QUEUE_MAX_RETRIES`
 *    (`packages/shared/src/constants.ts`) is what jobs-worker compares
 *    `message.attempts` against to detect the final delivery before the DLQ.
 *    This script asserts the constant equals the `fit-task-events` consumer's
 *    `max_retries` in every wrangler block (root + envs) and in Terraform
 *    (`cloudflare_queue_consumer.task`), so a silent change of the retry
 *    policy can never desync the worker's threshold from the real one.
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

/**
 * Settings de los consumers declarados en Terraform (espejo de `workers.tf`).
 * Devuelve `{ receipt: {...}, task: {...} }`. Falla con un error explícito si el
 * formato del bloque cambia: nunca un pass silencioso.
 */
function parseTerraformConsumers() {
  const raw = readFileSync(resolve(repoRoot, 'infrastructure/terraform/workers.tf'), 'utf8');
  const found = {};
  const resourceRe = /resource\s+"cloudflare_queue_consumer"\s+"([\w-]+)"\s*\{([\s\S]*?)\n\}/g;
  let match;
  while ((match = resourceRe.exec(raw)) !== null) {
    const [, name, body] = match;
    const settings = /settings\s*=\s*\{([\s\S]*?)\n\s*\}/.exec(body);
    if (!settings) {
      throw new Error(`no pude leer el bloque "settings" del consumer "${name}" en workers.tf`);
    }
    const readNumber = (key) => {
      const hit = new RegExp(`\\b${key}\\s*=\\s*(\\d+)`).exec(settings[1]);
      if (!hit) throw new Error(`falta "${key}" en el consumer "${name}" de workers.tf`);
      return Number(hit[1]);
    };
    found[name] = {
      batch_size: readNumber('batch_size'),
      max_wait_time_ms: readNumber('max_wait_time_ms'),
      max_retries: readNumber('max_retries'),
    };
  }
  for (const name of ['receipt', 'task']) {
    if (!found[name]) throw new Error(`workers.tf no declara cloudflare_queue_consumer.${name}`);
  }
  return found;
}

/**
 * Reads `TASK_QUEUE_MAX_RETRIES` from the shared constants (regex, no deps —
 * the script must stay dependency-free). Never falls back silently: a missing
 * or malformed constant is a hard error.
 */
function readTaskQueueMaxRetries() {
  const relPath = 'packages/shared/src/constants.ts';
  let raw;
  try {
    raw = readFileSync(resolve(repoRoot, relPath), 'utf8');
  } catch {
    throw new Error(`No se pudo leer ${relPath}`);
  }
  const hit = /export\s+const\s+TASK_QUEUE_MAX_RETRIES\s*=\s*(\d+)\s*;/.exec(raw);
  if (!hit) {
    throw new Error(`TASK_QUEUE_MAX_RETRIES no está declarado en ${relPath}`);
  }
  return Number(hit[1]);
}

const apiWrangler = readJson('apps/api-worker/wrangler.jsonc');
const jobsWrangler = readJson('apps/jobs-worker/wrangler.jsonc');

/** Bloques reales del wrangler de jobs-worker (el raíz es el que usa `wrangler dev` local). */
const jobsWranglerBlocks = [
  { label: 'root', environment: 'production', cfg: jobsWrangler },
  { label: 'env.dev', environment: 'dev', cfg: jobsWrangler.env?.dev },
  { label: 'env.staging', environment: 'staging', cfg: jobsWrangler.env?.staging },
  { label: 'env.production', environment: 'production', cfg: jobsWrangler.env?.production },
];

/** Consumers esperados: resource de Terraform -> nombres derivados por ambiente. */
const CONSUMER_QUEUES = [
  { tfName: 'task', queue: 'taskQueue', dlq: 'taskDlq' },
  { tfName: 'receipt', queue: 'receiptQueue', dlq: 'receiptDlq' },
];

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

// Consumers: settings espejados entre Terraform y todos los bloques del wrangler.
// `max_batch_timeout` del wrangler está en SEGUNDOS; el provider lo llama
// `max_wait_time_ms` y va en MILISEGUNDOS.
let terraformConsumers;
try {
  terraformConsumers = parseTerraformConsumers();
} catch (err) {
  errors.push(`[consumers] ${err.message}`);
}

// Shared dead-letter threshold: must equal the fit-task-events consumer's
// max_retries in every wrangler block AND in Terraform.
let taskMaxRetries;
try {
  taskMaxRetries = readTaskQueueMaxRetries();
} catch (err) {
  errors.push(`[consumers] ${err.message}`);
}

if (terraformConsumers) {
  for (const block of jobsWranglerBlocks) {
    const ctx = `[consumers/${block.label}]`;
    if (!block.cfg) {
      errors.push(`${ctx} falta el bloque en wrangler.jsonc`);
      continue;
    }

    const declaredList = block.cfg.queues?.consumers ?? [];
    const declared = new Map(declaredList.map((c) => [c.queue, c]));
    const expected = expectedNames(block.environment);

    for (const { tfName, queue, dlq } of CONSUMER_QUEUES) {
      const queueName = expected[queue];
      const dlqName = expected[dlq];
      const actual = declared.get(queueName);
      const tf = terraformConsumers[tfName];

      if (!actual) {
        errors.push(`${ctx} falta el consumer de "${queueName}"`);
        continue;
      }
      if (actual.dead_letter_queue !== dlqName) {
        errors.push(
          `${ctx} ${queueName} dead_letter_queue: wrangler="${actual.dead_letter_queue}" vs terraform="${dlqName}"`,
        );
      }
      if (actual.max_batch_size !== tf.batch_size) {
        errors.push(
          `${ctx} ${queueName} max_batch_size: wrangler="${actual.max_batch_size}" vs terraform.batch_size="${tf.batch_size}"`,
        );
      }
      if (actual.max_batch_timeout * 1000 !== tf.max_wait_time_ms) {
        errors.push(
          `${ctx} ${queueName} max_batch_timeout: wrangler="${actual.max_batch_timeout}s" vs terraform.max_wait_time_ms="${tf.max_wait_time_ms}ms"`,
        );
      }
      if (actual.max_retries !== tf.max_retries) {
        errors.push(
          `${ctx} ${queueName} max_retries: wrangler="${actual.max_retries}" vs terraform="${tf.max_retries}"`,
        );
      }
      // Dead-letter threshold: the shared constant must match the
      // fit-task-events consumer on every surface (wrangler + Terraform).
      if (tfName === 'task' && taskMaxRetries !== undefined) {
        if (actual.max_retries !== taskMaxRetries) {
          errors.push(
            `${ctx} ${queueName} max_retries: wrangler="${actual.max_retries}" vs shared TASK_QUEUE_MAX_RETRIES="${taskMaxRetries}"`,
          );
        }
        if (tf.max_retries !== taskMaxRetries) {
          errors.push(
            `${ctx} ${queueName} max_retries: terraform="${tf.max_retries}" vs shared TASK_QUEUE_MAX_RETRIES="${taskMaxRetries}"`,
          );
        }
      }
    }

    for (const consumer of declaredList) {
      if (![expected.taskQueue, expected.receiptQueue].includes(consumer.queue)) {
        errors.push(`${ctx} consumer inesperado: "${consumer.queue}"`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('\n❌ Paridad Terraform ↔ wrangler.jsonc rota:\n');
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    '\n   Los nombres de workers/bucket/colas se derivan en infrastructure/terraform/main.tf\n' +
      '   como nombre+fijo + sufijo de ambiente. Los settings de los consumers están\n' +
      '   espejados entre infrastructure/terraform/workers.tf y el wrangler.jsonc de\n' +
      '   jobs-worker (el deploy hace upsert y gana el último escritor). Actualiza el\n' +
      '   otro lado en el mismo PR para restaurar la paridad.\n',
  );
  process.exit(1);
}

console.log(
  '✅ Paridad Terraform ↔ wrangler.jsonc OK (nombres + settings de consumers + TASK_QUEUE_MAX_RETRIES; production, staging, dev).',
);
