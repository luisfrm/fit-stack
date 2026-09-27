# Fase 4 — Verificación de infraestructura y pruebas E2E

> Estado: ⏳ Pendiente

## Objetivo
Garantizar que los recursos en Cloudflare (colas y DLQs) existan efectivamente y que el ciclo de vida completo funcione de extremo a extremo sin mensajes perdidos.

## Tareas pendientes
1. **Verificar colas DLQ**:
   - Confirmar en Cloudflare Dashboard o Terraform que `fit-task-events-dlq` y `fit-receipt-events-dlq` (y sus contrapartes en dev/staging/prod) estén creadas.
   - En caso contrario, crearlas para evitar que el deploy de `jobs-worker` falle por cola inexistente.
2. **Prueba End-to-End local**:
   - Crear un pago desde `apps/panel`.
   - Verificar logs en `api-worker` (emisión a cola).
   - Verificar logs en `jobs-worker` (`processReceiptBatch` → render PDF → guardado en R2 → emisión a `fit-task-events` → envío de correo vía Resend).
3. **Prueba en `apps/console`**:
   - Registrar o validar un pago SaaS y comprobar que el flujo análogo se ejecuta correctamente.
