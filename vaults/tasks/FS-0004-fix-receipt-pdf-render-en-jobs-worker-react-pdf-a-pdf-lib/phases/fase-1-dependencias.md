# Fase 1 — Dependencias: pdf-lib dentro, react-pdf fuera

> Requiere: Fase 0 (spike confirmado).

## Objetivo

Cambiar el motor de PDF sin romper el resto del worker: entra `pdf-lib`, sale `@react-pdf/renderer`, y `react` se queda.

## Archivos

- `apps/jobs-worker/package.json`
- `pnpm-lock.yaml` (raíz, regenerado con `pnpm install`)

## Pasos

1. `pnpm --filter jobs-worker add pdf-lib`.
2. `pnpm --filter jobs-worker remove @react-pdf/renderer`.
3. **Mantener** `react` y `@types/react`: los necesitan `resend` / `@react-email/render` como peer. Verificar que siguen en `package.json` tras el paso 2.
4. `pnpm install` desde la raíz para dejar el lock consistente.

## Criterio de done

- `@react-pdf/renderer` (y con él `yoga-layout`) ya no aparece en las dependencias de `jobs-worker`.
- `pdf-lib` está instalado; `react`/`@types/react` siguen presentes.
- El lock instala limpio desde la raíz.

## Verificación

- `pnpm --filter jobs-worker test` sigue corriendo (puede fallar el test de PDF hasta la Fase 3; lo importante es que el resto no rompa por peers faltantes).
- `pnpm typecheck` sin errores nuevos de resolución de módulos.
