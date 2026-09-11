# Track Console C3 — Descarga + reenvío en console, cierre Console

> Depende de: C2 (PDF en R2 + evento con `receiptNumber`). Espejo de Fase 3 (3A) + cierre para Console.

## Objetivo

Soporte/admin descarga el comprobante SaaS y lo reenvía a payer/owners con PDF adjunto. RBAC plataforma. Cierre del track Console (tests + docs).

## Contexto verificado

- Jobs: `handleOrgPaymentReceived` (`pdf.handler.ts`) + template `org-payment-received.ts` + `sendEmail` con attachments (tras Fase 3). El binding R2 `FILES_BUCKET` ya existe en jobs-worker; el email lo encola el paso 2 de C2 tras confirmar el PDF (no el paso 1).
- Console API layer (ofetch, `apps/console/lib/api/client.ts` + `lib/services/*`): `platform-subscriptions-service.ts` (ver métodos de suscripciones/facturas en implementación), `session-service.ts`, tags `console:subs`, `console:settings`. Patrón mutación: service → toast → `updateTag` → `router.refresh()` (Next 16: `updateTag` en server actions).
- RBAC plataforma (`@workspace/shared`): `requirePlatformAuth` / `requirePlatformPermission`; soporte read-only (matriz: soporte no entra a ciertas escrituras — verificar qué permiso cubre aprobar pagos vs descargar comprobantes).
- Cache api-worker: `platform:subscriptions*`, `platform:subscriptions:stats`, `platform:subscriptions:invoices:{orgId}` (5 min, invalidada on-write). La emisión debe invalidar `invoices:{orgId}`.

## Crear / modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker` (ruta platform-subscriptions o receipts) | `GET /api/platform/subscriptions/payments/:id/receipt` (`requirePlatformAuth` o permiso de lectura plataforma) con **el mismo contrato de 3 estados de Fase 2** (200 ready / 202 pending / 200 `available:false, reason:'pre_system'`; nunca 409) + `GET …/receipt/pdf` binario (404 sin objeto). `POST …/resend` (reenvío a payer+owners; si el PDF aún no existe → 202 `pdfStatus:'pending'` y el paso 2 hará el reenvío) o reutilizar flujo existente si lo hay. Invalidar `platform:subscriptions:invoices:{orgId}` al emitir. |
| `apps/jobs-worker/src/handlers/pdf.handler.ts` + `templates/org-payment-received.ts` | Leer PDF de R2 por `receipt_pdf_key`, HTML corto + adjunto `FS-<n>.pdf`, loop por destinatarios con try/catch individual (patrón existente). |
| `apps/console` (detalle suscripción/org + services) | Botón descargar (blob) + reenviar (toast + `updateTag('console:subs')` + `refresh()`). Extender `platform-subscriptions-service.ts` con `downloadReceipt(paymentId)` / `resendReceipt(paymentId)`. |
| Docs | `AGENTS.md` (secuencia global `FS-N`, keys emisor, evento con `receiptNumber`), `docs/PENDING.md`, `plan.md` (marcar C1-C3). |

## Criterios de aceptación

- E2E console (extender `e2e/console/subscriptions.spec.ts` o `org-detail`): aprobar pago pendiente → comprobante descargable + email a payer/owners con adjunto idéntico.
- Soporte (read-only) puede descargar pero no emitir/reenviar si la matriz lo exige (verificar permiso exacto en implementación).
- `pnpm build/lint/typecheck/test` + `pnpm test:e2e:console` verdes.