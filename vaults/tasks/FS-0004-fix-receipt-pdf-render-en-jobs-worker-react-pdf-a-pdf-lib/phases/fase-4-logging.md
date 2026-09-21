# Fase 4 — Logging accionable en el consumer (`index.ts:65-68`)

> Sin dependencias: paralelizable con las Fases 0–3. Si el spike no reproduce, aplicar esta fase primero y reintentar.

## Objetivo

Que un fallo de render nunca más llegue con el texto vacío: el catch del consumer debe loguear `{name, message, cause}`.

## Archivos

- `apps/jobs-worker/src/index.ts:65-68` (rama `fit-receipt-events` del `queue()`).

## Pasos

1. Ampliar el `console.error` del catch para incluir `name`, `message` y `cause` del error (además del id del mensaje, que ya se loguea).
2. No cambiar la semántica: tras loguear, se mantiene `message.retry()` (la DLQ sigue siendo el destino de los reintentos agotados).

## Criterio de done

Un error de render produce un log con nombre, mensaje y causa identificables (el incidente que originó esta task habría mostrado el `CompileError` a la primera).

## Verificación

- `pnpm --filter jobs-worker test`, `pnpm typecheck` y `pnpm lint` en verde.
