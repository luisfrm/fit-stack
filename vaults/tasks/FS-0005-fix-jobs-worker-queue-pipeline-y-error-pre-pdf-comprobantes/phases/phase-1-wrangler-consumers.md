# Fase 1 — Configuración de consumers en wrangler.jsonc

> Estado: ✅ Completada

## Objetivo
Permitir que `jobs-worker` escuche y consuma los eventos emitidos por `api-worker` en las colas `fit-task-events` y `fit-receipt-events`.

## Cambios realizados
En `apps/jobs-worker/wrangler.jsonc`:
- Se agregó la sección `queues.consumers` al nivel raíz (top-level):
  - `fit-task-events` (max_batch_size: 5, max_batch_timeout: 10, max_retries: 3, dead_letter_queue: "fit-task-events-dlq")
  - `fit-receipt-events` (max_batch_size: 1, max_batch_timeout: 5, max_retries: 3, dead_letter_queue: "fit-receipt-events-dlq")
- Se replicó la sección en los entornos `env.dev`, `env.staging` y `env.production` con sus respectivos nombres de cola y DLQs correspondientes.
