# Fase 2 — Trazabilidad y refactor de handlers

> Estado: ✅ Completada

## Objetivo
Añadir visibilidad al ciclo de vida del mensaje (producción y consumo) y reducir la complejidad cognitiva de los handlers.

## Cambios realizados
1. **`apps/api-worker/src/services/receipts.service.ts`**:
   - Logs detallados antes y después de `receiptQueue.send()` y `taskQueue.send()`.
   - Extracción de `resolveTaxBreakdown()` para calcular impuestos y tolerancias limpiamente.
2. **`apps/api-worker/src/services/platform-receipts.service.ts`**:
   - Logs de envío a `receiptQueue` y simplificación en `resolveFiscalProfile(org.countryCode)`.
3. **`apps/jobs-worker/src/index.ts`**:
   - Extracción de `processReceiptBatch()` y `processTaskBatch()`.
   - Logs estructurados con número de mensajes, queue name y payload.
4. **`apps/jobs-worker/src/handlers/pdf.handler.ts`**:
   - Extracción de `resolveOrgReceiptAttachment()`.
   - Uso de `composed?.member` para evitar lecturas de propiedad sobre valores no definidos.
