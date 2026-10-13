/* ── Queues module — cross-app queue contracts ─────────────────────────
   Shared contracts of the Cloudflare Queues exchanged between api-worker
   (producer) and jobs-worker (consumer): event types, validated builders
   and type-guards. Pure types + functions, no I/O, edge-safe. Re-exported
   by `@workspace/shared`.
   ─────────────────────────────────────────────────────────────────────── */

export * from './fit-task-events';
