# Fase 0 — Spike: reproducir el fallo en workerd real

> Precondición de todo el plan: confirmar el error en Cloudflare antes de borrar ninguna dependencia. Sin luz verde aquí, no se sigue.

## Objetivo

Obtener el error real (`{name, message, cause}`) del render en workerd y confirmar que la causa es el WASM dinámico de `yoga-layout`.

## Archivos

- Temporal de spike (no productivo): invocación de la ruta de render vía `wrangler dev`, o inspección con `wrangler deploy --dry-run --outdir`.
- Ningún archivo productivo se modifica en esta fase.

## Pasos

1. Con `wrangler dev`, invocar la ruta de render del comprobante y capturar el log completo del error con `{name, message, cause}` (no solo `message`, que hoy llega vacío).
2. Alternativa/complemento: `wrangler deploy --dry-run --outdir` y confirmar que no hay chunk dinámico separado / que el bundle arrastra el `loadYoga()` con `WebAssembly.instantiate`.
3. Registrar el error real en esta fase (nombre, mensaje, causa y stack) y contrastarlo con el diagnóstico: `CompileError: Wasm code generation disallowed by embedder`.

## Criterio de done

El error queda registrado con `{name, message, cause}` y confirma la causa WASM/workerd. Solo entonces se autoriza la Fase 1.

## Verificación

- Log del spike adjuntado al PR como evidencia.
- Si el spike **no** reproduce el fallo: stop del plan y re-diagnóstico (aplicar antes la Fase 4 para tener causa visible).
