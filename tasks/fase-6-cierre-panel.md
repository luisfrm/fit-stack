# Fase 6 — Cierre Panel: tests, E2E, docs

> Depende de: Fases 0-5. Sin código de producto nuevo (salvo fixes que salgan de los tests).

## Objetivo

Dejar el track Panel verde, cubierto y documentado antes de abrir el track Console.

## Qué hacer

1. **Vitest unitarios** — `packages/shared` (Fase 0: gate matriz 8, tax-math VE/CO/PE/US, formatos, checklist, máscaras) + panel (`receipts-service`, máscaras en UI si hay helpers).
2. **Integración api-worker** (rama Neon, `TEST_DATABASE_URL`) — emisión automática al validar, idempotencia (doble `issue`, fallo R2 sin huérfanos), `voided` conserva número + cancela subscription, `processing` → 409, gates RBAC (cashier READ sí / issue manual 403), PATCH fiscal 400/403, reporte + gaps.
3. **E2E Playwright panel** — fixture pago validado → abrir comprobante (número con formato + disclaimer VE) → descargar PDF → reenviar email → toast éxito; settings fiscal guarda y re-renderiza; reporte filtra y exporta. Extender `e2e/panel/subscriptions.spec.ts` o nuevo `e2e/panel/receipts.spec.ts`. Teardown obligatorio de fixtures (`afterAll`, orden: member antes que plan).
4. **Verificación manual** — panel :3001 + worker :8788: validar pago `processing` → comprobante con número + PDF descargable idéntico al adjunto del email; anular → badge ANULADO; histórico → "anterior al sistema".
5. **Docs** — `AGENTS.md`: nueva sección comprobantes (secuencias, keys R2 `receipt-documents/`, evento con `receiptNumber`, attachments en jobs-worker, gate documental, regla UUID invisible). `docs/PENDING.md`: tachar §1-3 fiscal cuando corresponda. `plan.md`: marcar Fases 0-6 hechas.

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
