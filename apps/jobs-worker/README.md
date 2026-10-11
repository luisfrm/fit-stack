# jobs-worker

Cloudflare Worker de **procesamiento asíncrono** de Fit-Stack: consume colas de Cloudflare Queues para enviar emails y renderizar comprobantes en PDF, y corre un cron de barrido.

## Responsabilidades

- **`fit-task-events`** (consumer): emails transaccionales (invitaciones, recibo de pago al miembro, confirmación de pago SaaS).
- **`fit-receipt-events`** (consumer): render del PDF de comprobantes (Panel y Console), subida a R2 y notificación por email.
- **Cron de barrido**: re-encola render pendientes (ver abajo).

El `queue()` de `src/index.ts` ramifica por nombre de cola (`batch.queue.startsWith('fit-receipt-events')`), no por tipo de evento — una cola = un consumer.

## Estructura

```
src/
├── index.ts                    # default export: queue() + scheduled(); Env; FitTaskEvent
├── receipt-pdf.ts                # render del PDF con pdf-lib (JS puro, sin WASM, compatible con workerd; lazy)
├── handlers/
│   ├── email.handler.ts        # TRANSPORTE de email (Resend / Gmail SMTP)
│   ├── pdf.handler.ts          # emails con comprobante adjunto (lee el PDF de R2)
│   ├── receipt.handler.ts      # paso 2: selección de perfil por scope + sweepPendingReceiptPdfs
│   ├── render-profile.ts       # núcleo del paso 2 + perfiles de emisor (Panel / Console)
│   └── notify-mark.ts          # limpieza de la marca al dead-letter (fit-task-events)
└── templates/                  # el HTML vive aquí, nunca en los handlers
    ├── layout.ts               # renderDarkShell / renderLightShell + escapeHtml
    ├── send-invitation.ts
    ├── org-invite.ts
    ├── payment-receipt-short.ts
    └── org-payment-received.ts
```

## Eventos

`FitTaskEvent` (`src/index.ts`):

| Tipo | Payload | Productor |
|---|---|---|
| `email.registration_invite` | `{ email, token, target?: 'panel' \| 'console', role? }` | `api-worker` (`members.service`, `/api/platform/staff`) |
| `email.org_invite` | `{ email, orgName, inviterName, inviteLink }` | hook `sendInvitationEmail` de Better Auth (`api-worker`) |
| `email.payment_receipt` | `{ paymentId, organizationId }` | `subscriptions.service` (alta validada / aprobación / reenvío) |
| `email.org_payment_received` | `{ paymentId, organizationId, payerEmail?, payerName? }` | `organizations.route` (autoservicio) + paso 2 SaaS + reenvío |

`ReceiptRenderEvent` (compartido con `@workspace/shared`) llega por `fit-receipt-events` con `scope: 'panel' | 'platform'`.

## Emisión de comprobantes en dos pasos

1. **Paso 1** (síncrono, en `api-worker`): asigna el número correlativo e **encola** el evento de render. No envía email. Los dos emisores comparten un único núcleo (`apps/api-worker/src/services/receipt-issue.core.ts`) parametrizado por un `issuer profile`.
2. **Paso 2** (aquí, `handleReceiptRender`): selecciona el perfil por `event.scope`, arma el `ReceiptData` (snapshot del emisor primero), renderiza el PDF, lo `PUT` a R2, completa `receipt_pdf_key` (`UPDATE … WHERE receipt_pdf_key IS NULL RETURNING` como gate) y **solo entonces** encola el email. Entrega duplicada = overwrite idempotente, sin segundo email. La secuencia vive **una sola vez** en `handlers/render-profile.ts` (núcleo + perfiles); la única divergencia de negocio por emisor es el año de la clave de R2 (Panel: año local del número; Console: año UTC de `receiptIssuedAt`).

El motor de comprobantes está **unificado**: núcleo + perfiles de emisor (composer en `@workspace/shared/src/documents/receipt-composer.ts`, paso 1 y paso 2 con sus perfiles). La composición y el acceso a datos viven en repos compartidos de `@workspace/database` (`receipts.repository.ts`, `platform-receipts.repository.ts`) y en `@workspace/shared`; aquí vive solo el render.

## Barrido (`scheduled`)

`sweepPendingReceiptPdfs` cubre **tres** estados de fallo con una única definición por tabla:

- **Numerado sin PDF** (≥15 min): el render se perdió → re-encola.
- **PDF listo sin notificar** (≥30 min): el email del paso 2 nunca salió → re-encola.
- **Anulado sin PDF con sello** (≥15 min): el void se persistió pero el render del artefacto ANULADO se perdió → re-encola. Mientras falte, la descarga responde `pending`: el PDF de emisión **no** se sirve para un anulado.

Los tres son seguros de re-encolar porque cada artefacto tiene su propio gate idempotente (`receipt_notified_at` / `receipt_voided_pdf_key`). Una fila corrupta no aborta el resto.

> **Cadencia (pre-venta)**: `0 */10 * * *` (cada 10 horas) — ahorro de invocaciones sin clientes reales. Bajar a `*/10 * * * *` (cada 10 min) con clientes reales. Ver `vaults/backlog/comprobantes.md`.

## Infraestructura (settings espejados Terraform ↔ wrangler)

- **Producers**: declarados en `wrangler.jsonc` (`TASK_QUEUE` + `RECEIPT_QUEUE`) — son bindings del worker, el código los usa. El deploy (`deploy-jobs-worker.yml`) sube el código.
- **Consumers (×2)**: declarados **en ambos** lados — Terraform (`infrastructure/terraform/workers.tf`: `cloudflare_queue_consumer.receipt` / `.task`) y `wrangler.jsonc` (bloque raíz + cada env) — con **los mismos valores**. El deploy hace upsert del consumer, así que gana el último escritor: si los números difieren, el recurso vivo cambia en silencio. `pnpm check:infra-parity` compara nombres + settings (`max_batch_timeout` s == `max_wait_time_ms` ms). El bloque raíz es el que consume `wrangler dev` local.
- **Cron**: declarado **solo** en Terraform (`cloudflare_workers_cron_trigger.jobs_sweep`); el `wrangler.jsonc` no declara `triggers`.
- **Orden**: `terraform apply` + `wrangler deploy jobs-worker`.

## Env vars

| Var | Descripción |
|---|---|
| `DATABASE_URL` | Neon Postgres (driver HTTP) |
| `EMAIL_PROVIDER` | `resend` o `gmail` (SMTP) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | credenciales de Resend |
| `SMTP_USER` / `SMTP_PASS` | credenciales de Gmail SMTP |
| `PANEL_URL` | Base URL del panel. **Requerida** para `email.org_payment_received` (CTA "Ir al Panel"): el handler falla visible si falta, sin fallback a localhost. |
| `CONSOLE_URL` | Base URL de la consola (invitaciones de plataforma). |

> **CTA target-based**: el URL lo decide quién es el destinatario, nunca el template. Hoy el único target es el panel (destinatarios staff). Cuando exista la app de portal (member/trainer) su target será `PORTAL_URL` + `target: 'portal'` en el contrato de invitación; hasta entonces no hay binding ni fallback.

## Dev

```bash
cd apps/jobs-worker && pnpm dev     # wrangler dev (port 8787)
pnpm --filter jobs-worker test      # vitest (unit)
```

`wrangler dev` local no necesita consumer/cron declarados para funcionar.
