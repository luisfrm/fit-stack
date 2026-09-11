# Fase 6 — Cierre Panel: tests, E2E, docs

> Depende de: Fases 0-5. Sin código de producto nuevo (salvo fixes que salgan de los tests).

## Objetivo

Dejar el track Panel verde, cubierto y documentado antes de abrir el track Console.

## Qué hacer

1. **Vitest unitarios** — `packages/shared` (Fase 0: gate matriz 8, tax-math VE/CO/PE/US + caso trial/free $0, formatos, checklist, máscaras) + panel (`receipts-service`, máscaras en UI si hay helpers).
2. **Integración api-worker** (rama Neon, `TEST_DATABASE_URL`) — paso 1 asigna número síncrono (+ `receipt.render` encolado), consumer completa PDF (spy R2/Queue) **y encola el email solo al completar** (`rowCount === 1`), **entrega duplicada del mismo mensaje no genera segundo PDF ni segundo email**, **barrido re-encola filas vencidas y no las recientes**, contrato `GET :id/receipt` (200 ready / 202 pending / 200 `available:false pre_system`; nunca 409) y `GET :id/receipt/pdf` (200 bytes / 404), `voided` conserva número + cancela subscription, `processing` → 409, gates RBAC (cashier READ sí / issue manual 403), PATCH fiscal 400/403, reporte + gaps.
3. **E2E Playwright panel** — fixture pago validado → abrir comprobante (número con formato + disclaimer VE) → descargar PDF → reenviar email → toast éxito; settings fiscal guarda y re-renderiza; reporte filtra y exporta. Extender `e2e/panel/subscriptions.spec.ts` o nuevo `e2e/panel/receipts.spec.ts`. Teardown obligatorio de fixtures (`afterAll`, orden: member antes que plan).
4. **Verificación manual** — panel :3001 + worker :8788: validar pago `processing` → comprobante con número + PDF descargable idéntico al adjunto del email; anular → badge ANULADO; histórico → "anterior al sistema".
5. **Docs** — `AGENTS.md`: nueva sección comprobantes (sentencia única de secuencia, paso 1 síncrono + paso 2 en cola `fit-receipt-events` con DLQ, barrido cron cada 10 min, keys R2 `receipts/`, email encolado desde el paso 2 tras confirmar el PDF, contrato `receipt` con estados ready/pending/pre_system, attachments en jobs-worker, gate documental, regla UUID invisible). `docs/PENDING.md`: tachar §1-3 fiscal cuando corresponda + **ítem explícito "disclaimer Console usa país del org como proxy hasta configurar `fitstack_country_code`"** (no solo TODO en código). `plan.md`: marcar Fases 0-6 hechas.

## Módulos tocados

Ninguno nuevo; solo fixes derivados. Docs: `AGENTS.md`, `docs/PENDING.md`, `plan.md`.

## Criterios de aceptación

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e:panel
```

Todo verde. Sin `db:push` en el historial (solo `generate → review → migrate`). Sin referencias al `pdf-service.ts` muerto ni a `Operación #payment.id`.