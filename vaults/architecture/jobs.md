> **Alcance:** jobs en background con Cloudflare Queues (emails), cola de receipts, handlers y templates.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

## Background Jobs (Cloudflare Queues)

Emails and PDF generation are processed **asynchronously** via Cloudflare Queues: the `api-worker` produces events in the `TASK_QUEUE` binding (`fit-task-events`, DLQ `fit-task-events-dlq`) and `apps/jobs-worker` consumes them.

**Event contract** (`FitTaskEvent` — `apps/jobs-worker/src/index.ts`):

| Type                         | Payload                                                  | Producer                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email.registration_invite`  | `{ email, token, target?: 'panel' \| 'console', role? }` | `members.service.ts` (invite member without account → panel) + `/api/platform/staff` (console invitations)                                                                                                 |
| `email.org_invite`           | `{ email, orgName, inviterName, inviteLink }`            | Better Auth `sendInvitationEmail` hook in `lib/auth.ts` (invite a member with an account)                                                                                                                  |
| `email.payment_receipt`      | `{ paymentId, organizationId }`                          | `subscriptions.service.ts` — automatic: when creating a sub with `validated` payment and when approving a `processing` payment (PATCH status); also in manual resend (`POST /api/payments/:id/send-email`) |
| `email.org_payment_received` | `{ paymentId, organizationId, payerEmail?, payerName? }` | `organizations.route.ts` (POST `/subscription/renew` — self-service renewal, processing, payer+owners) + step 2 platform (PDF ready, payer from DB or owners-only) + manual resend |

**Handlers** (`apps/jobs-worker/src/handlers/`):

- `email.handler.ts` — email TRANSPORT ONLY (**Resend** with `EMAIL_PROVIDER=resend` or **Gmail SMTP** with `EMAIL_PROVIDER=gmail` + `SMTP_USER`/`SMTP_PASS`); the HTML is composed by the templates.
- `pdf.handler.ts` — payment receipts (gym membership + org SaaS payment confirmation).

**Templates** (`apps/jobs-worker/src/templates/`) — the HTML lives here, never in the handlers:

- `layout.ts` — base shells: `renderDarkShell` (invitations, dark background) and `renderLightShell` (receipts, yellow-receipt style) + `escapeHtml`.
- `send-invitation.ts`, `org-invite.ts`, `payment-receipt-short.ts`, `org-payment-received.ts` — each exports `renderX(data): { subject, html }`.

**Env vars (jobs-worker)**: `DATABASE_URL`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SMTP_USER`, `SMTP_PASS`, `PANEL_URL`, `CONSOLE_URL`.

> **Rule**: never couple api-worker to synchronous email/PDF sends — always enqueue in `TASK_QUEUE` and let jobs-worker process it.

> **Receipts queue (`fit-receipt-events`)**: dedicated queue, own DLQ, **single consumer = jobs-worker**. `api-worker` is only a producer (step 1 + manual issue + re-enqueues); jobs-worker consumes **two** queues (`fit-task-events` emails + `fit-receipt-events` render) and branches `queue()` by `batch.queue`. Consumers are declared in **both** `workers.tf` (`cloudflare_queue_consumer` ×2) and `apps/jobs-worker/wrangler.jsonc` (root + each env) with **identical settings**: `wrangler deploy` upserts the consumer on every deploy, so the numbers are the contract, not the ownership — `pnpm check:infra-parity` compares both sides (`max_batch_timeout` in seconds == `max_wait_time_ms` in milliseconds). The cron is Terraform-only (`cloudflare_workers_cron_trigger`); `wrangler.jsonc` declares no `triggers`. Sweep cron runs **every 10 hours in pre-sale** (`0 */10 * * *`; revert to `*/10 * * * *` with real customers — see `vaults/backlog/comprobantes.md`). The render lives in `apps/jobs-worker/src/receipt-pdf.ts` (lazy `pdf-lib`, workerd-safe, no WASM) — **api-worker must never depend on `pdf-lib`**. Shared receipt data access lives in `packages/database/src/repositories/receipts.repository.ts` (see [§1 Monorepo Boundaries](../../AGENTS.md#1-monorepo-architecture--boundaries)): atomic numbering + `getReceiptComposedData` + `completeReceiptPdf`/`markReceiptNotified`. The receipt email is gated by `markReceiptNotified` (with `clearReceiptNotified` rollback on send failure) so a transient queue error never loses the email — and that gate is exactly why the sweep can safely re-enqueue both pending states (C6). The mark is **also cleared on the dead-letter path**: on the final failed delivery of a receipt email (`isFinalDeliveryAttempt` with the shared `TASK_QUEUE_MAX_RETRIES`, mirrored in wrangler + Terraform and enforced by `pnpm check:infra-parity`), `processTaskBatch` calls `clearReceiptNotifiedMarkForEvent` (`handlers/notify-mark.ts`, best-effort — a cleanup failure never blocks `message.retry()`), so the sweep's second predicate can still recover a payment whose email exhausted its retries.
