# Track Console C3 — Descarga + reenvío en console, cierre Console

> Depende de: C2 (PDF en R2 + evento con `receiptNumber`). Espejo de Fase 3 (3A) + cierre para Console.

## Objetivo

Soporte/admin descarga el comprobante SaaS y lo reenvía a payer/owners con PDF adjunto. RBAC plataforma. Cierre del track Console (tests + docs).

## Contexto verificado

- Jobs: `handleOrgPaymentReceived` (`pdf.handler.ts`) + template `org-payment-received.ts` + `sendEmail` con attachments (tras Fase 3). Requiere lectura R2 (binding agregado en Fase 3).
- Console API layer (ofetch, `apps/console/lib/api/client.ts` + `lib/services/*`): `platform-subscriptions-service.ts` (ver métodos de suscripciones/facturas en implementación), `session-service.ts`, tags `console:subs`, `console:settings`. Patrón mutación: service → toast → `updateTag` → `router.refresh()` (Next 16: `updateTag` en server actions).
- RBAC plataforma (`@workspace/shared`): `requirePlatformAuth` / `requirePlatformPermission`; soporte read-only (matriz: soporte no entra a ciertas escrituras — verificar qué permiso cubre aprobar pagos vs descargar comprobantes).
- Cache api-worker: `platform:subscriptions*`, `platform:subscriptions:stats`, `platform:subscriptions:invoices:{orgId}` (5 min, invalidada on-write). La emisión debe invalidar `invoices:{orgId}`.

## Crear / modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker` (ruta platform-subscriptions o receipts) | `GET /api/platform/subscriptions/payments/:id/receipt` (`requirePlatformAuth` o permiso de lectura plataforma) → descarga/redirect R2; histórico `NULL` → "anterior al sistema". `POST …/resend` (reenvío a payer+owners) o reutilizar flujo existente de reenvío si lo hay. Invalidar `platform:subscriptions:invoices:{orgId}` al emitir. |
| `apps/jobs-worker/src/handlers/pdf.handler.ts` + `templates/org-payment-received.ts` | Leer PDF de R2 por `receipt_pdf_key`, HTML corto + adjunto `FS-<n>.pdf`, loop por destinatarios con try/catch individual (patrón existente). |
| `apps/console` (detalle suscripción/org + services) | Botón descargar (blob) + reenviar (toast + `updateTag('console:subs')` + `refresh()`). Extender `platform-subscriptions-service.ts` con `downloadReceipt(paymentId)` / `resendReceipt(paymentId)`. |
| Docs | `AGENTS.md` (secuencia global `FS-N`, keys emisor, evento con `receiptNumber`), `docs/PENDING.md`, `plan.md` (marcar C1-C3). |

## Criterios de aceptación

- E2E console (extender `e2e/console/subscriptions.spec.ts` o `org-detail`): aprobar pago pendiente → comprobante descargable + email a payer/owners con adjunto idéntico.
- Soporte (read-only) puede descargar pero no emitir/reenviar si la matriz lo exige (verificar permiso exacto en implementación).
- `pnpm build/lint/typecheck/test` + `pnpm test:e2e:console` verdes.
