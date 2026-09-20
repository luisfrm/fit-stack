# Plan — FS-0002 Subscription integrity: compensación y periodo servidor

> Depende de [[FS-0001]] (rama apilada `fix/subscription-integrity` desde `fix/receipt-emission-integrity`; hereda la migración 0018 y el snapshot de duración en `payment`). **1 task = 1 PR.** Prosa en español; rutas, código y comandos en su forma literal.

## Diagnóstico (verificado, no re-discutir)

1. El alta del panel commitea en 3 pasos sin red (`subsRepo.create` → `paymentsRepo.create` → `assignReceiptNumber` en `apps/api-worker/src/services/subscriptions.service.ts:171-249`). Fallo en el 3.º = suscripción + pago `validated` sin número → el operador reintenta → segundo periodo + segundo cobro (el guard solo bloquea `processing`, línea 153). Fallo en el 2.º = suscripción huérfana sin pago, invisible en toda UI.
2. El mismo patrón se repite en Console en los 4 sitios con `assignPlatformReceiptNumber` (`apps/api-worker/src/services/platform-subscriptions.service.ts`: alta 227, renovación 294, registro 433, transición a validado 543; `changePlan` hereda vía `createSubscriptionWithPayment`; `renewOrgSubscription` es `processing` y no emite).
3. El periodo acumulativo (Regla 4) es convención de UI (`apps/panel/components/payments/subscription-form.tsx:193-218`): el servidor solo parsea lo que recibe (`subscriptions.service.ts:159-169`). `findLatestForMember` ya excluye anuladas/canceladas (`subscriptions.repository.ts:281-311`) y `onError` ya traduce `ReceiptError` (`lib/errors.ts:92`): la compensación solo re-lanza.
4. Console ya es autoritativo en el periodo (front-load solo si nace pagada, líneas 176-186): B3.3 es solo panel; Console es el modelo a imitar.
5. Sin transacciones interactivas: el driver HTTP de Neon no tiene `db.transaction()`. La atomicidad se logra con sentencia única (ya existe para el número) o con **compensación explícita** en el `catch`. La cola nunca se compensa: pago numerado = predicado 1 del barrido lo recupera.

## Decisiones congeladas (de `task.md`, no re-discutir por fase)

- Los 4 flujos SaaS entran en la compensación; el motivo del override se persiste (migración 0019); el `endDate` explícito solo pide motivo si **acorta un periodo vigente**.
- Renovación/cambio/registro SaaS con fallo: pago anulado, **periodo no revertido** (ya se movió; documentado). Garantía: ningún cobro válido sin comprobante y el reintento no cobra dos veces.
- `voided` nunca se borra (regla 6): panel anula el pago (sin cancelar además la suscripción: ANULADA ya gana sobre `cancelled`); SaaS anula el pago y, solo en el alta sin pago, anula la suscripción con `cancel()` — jamás `delete()`.
- `NULL` en `end_date_override_reason` = periodo calculado o histórico (sin backfill).

## Orden de ejecución

```
fase-0 (DB 0019) ──▶ fase-1 (shared computeSubscriptionPeriod) ──▶ fase-2 (B3.1 panel)
                                                                    │
                                    fase-3 (B3.2 SaaS) ◀──────────────┘ (requiere helper de fase-2)
                                        │
                                    fase-4 (B3.3 periodo servidor, requiere fase-0 + fase-1)
                                        │
                                    fase-5 (panel form, requiere fase-1 + fase-4)
                                        │
                                    fase-6 (docs + verificación global)
```

| Fase | Archivo | Requiere | Commit sugerido |
|---|---|---|---|
| 0 — DB | `phases/fase-0-db-0019.md` | rama apilada con 0018 | `feat(database): persist the end date override reason (0019)` |
| 1 — Shared | `phases/fase-1-shared-periodo.md` | fase-0 | `feat(shared): one rule for the cumulative subscription period` |
| 2 — B3.1 | `phases/fase-2-compensacion-panel.md` | fase-1 | `fix(api-worker): compensate the gym subscription creation when emission fails` |
| 3 — B3.2 | `phases/fase-3-compensacion-saas.md` | fase-2 | `fix(api-worker): same compensation in the four SaaS payment flows` |
| 4 — B3.3 | `phases/fase-4-periodo-servidor.md` | fase-0 + fase-1 | `feat(api-worker): the gym subscription period is authoritative on the server` |
| 5 — Panel | `phases/fase-5-form-panel.md` | fase-1 + fase-4 | `feat(panel): preview from the shared rule and override with reason` |
| 6 — Docs | `phases/fase-6-docs-cierre.md` | fase-0…5 | `docs: compensation rule + period contract + PENDING` |

Fase-2 y fase-3 comparten el helper (`apps/api-worker/src/lib/subscription-compensation.ts`): la fase-3 no puede escribirse antes de que la firma del helper exista y esté probada en el panel. Fase-4 necesita la columna 0019 (persistir el motivo) y el helper puro de fase-1 (calcular el periodo).

## Capas (orden por dependencias)

### DB — `packages/database` (fase-0)

- `src/schema.ts`: `endDateOverrideReason: text('end_date_override_reason')` (nullable, sin default) en `subscription`.
- `pnpm db:generate` → revisar el SQL (`ALTER TABLE "subscription" ADD COLUMN "end_date_override_reason" text;`, aditiva, sin backfill, sin índice) → `pnpm db:migrate` (con aprobación explícita; prohibido `db:push` en la rama compartida).
- Repo `apps/api-worker/src/repositories/subscriptions.repository.ts`: `create()` acepta `endDateOverrideReason?` y lo persiste; exponerlo en `findAllPaginated` / `findAllVisible` (auditoría del override).

### Backend — `apps/api-worker` (fases 2, 3, 4)

- Nuevo `src/lib/subscription-compensation.ts` (factory-free, función pura de orquestación): `compensateFailedEmission(err, closures)` con closures `readPayment` / `voidPayment` / `cancelParent?`; devuelve `'committed' | 'compensated'`. **Decide por relectura** (`findById` tras el `catch`), nunca por tipo de error; re-lanza el original para que `onError` traduzca el código.
- `services/subscriptions.service.ts` (B3.1): rastrea `subscriptionId` / `paymentId|null`; en el `catch`: numerado → éxito (`'committed'`, se responde la suscripción, el barrido re-encola el render ≤15 min); pago sin número → `voided` con motivo fijo `"Compensación: fallo al emitir el comprobante"` (sin `cancel` adicional); sin pago → `subsRepo.cancel` (huérfana cancelada, nunca borrada).
- `services/platform-subscriptions.service.ts` (B3.2): mismo helper en los 4 sitios de emisión + `changePlan` por herencia; alta sin pago → `platformSubsRepo.cancel(id, motivo)`; resto → solo void del pago, periodo intacto y documentado. Trial/free `$0` (`skipped:true`) no compensan: no hay documento.
- `routes/subscriptions.route.ts` + `services/subscriptions.service.ts` (B3.3, solo `POST /api/subscriptions`): `startDate`/`endDate` opcionales, `endDateOverrideReason` opcional; cálculo con `computeSubscriptionPeriod`; guards `422 END_DATE_BEFORE_START` y `422 END_DATE_OVERRIDE_REASON_REQUIRED` vía `HTTPException` con `res` (código = contrato, como `SLUG_TAKEN`); tz siempre de `requireOrgTimezone()`, nunca query param; dinero intacto en centavos enteros.

### Frontend — `apps/panel` (fase-5)

- `components/payments/subscription-form.tsx`: deja de mandar `endDate` por defecto (solo `startDate`; `endDate` únicamente si el operador lo editó); preview con `computeSubscriptionPeriod` (se elimina la regla inline 193-218); campo motivo condicional obligatorio al acortar periodo vigente; toasts por `apiCode()` (`END_DATE_OVERRIDE_REASON_REQUIRED` / `END_DATE_BEFORE_START`), resto por `mutationError` genérico.
- `components/payments/subscription-modal.tsx`: el `catch` mapea los mismos códigos en vez del genérico único.
- `apps/console`: sin cambios de UI (los 4 flujos SaaS son backend).

### Tests

- Unitarios shared (estilo `date.test.ts`, sin DB): `packages/shared/tests/subscription-period.test.ts` — mensual/semanal/diaria, acumulación desde `latest.endDate`, vencido no acumula, vigencia a día local (borde 23:xx), `max(latest, start)` futuro.
- Integración api-worker (HTTP real + rama Neon, `describe.skipIf` sin `TEST_DATABASE_URL`): nueva suite `subscriptions-compensation.test.ts` (3), `platform-subscriptions-compensation.test.ts` (3), `subscriptions-period.test.ts` (6). Revisar (no dar por buenos) los acumulativos de `subscriptions.test.ts` y el E2E de renovación.
- E2E: flujo de renovación del panel (`e2e/panel/subscriptions.spec.ts`) + compat: las 12 suites que mandan `endDate` de periodo nuevo, `e2e/seed.ts` y los specs siguen en 201 sin cambios.

### Caché (sin claves nuevas)

- Escrituras panel reutilizan `invalidateSubscriptionDependentCaches` (`subscriptions*`, `members:stats`, `dashboard:*`, `reports:*`); escrituras SaaS invalidan `platform:subscriptions*` (+ `org:{id}:subscription*` / `features` donde ya lo hacen). Verificar que cada ruta tocada invalida lo mismo que hoy — no se añade TTL ni clave.

### Jobs (sin cambios)

- Sin eventos nuevos ni cambios en `jobs-worker`: la compensación nunca toca la cola; el caso numerado lo recupera el predicado 1 del barrido existente.

## Contratos nuevos (resumen)

| Contrato | Forma |
|---|---|
| Helper compensación | `compensateFailedEmission(err, { readPayment, voidPayment, cancelParent? }): Promise<'committed' \| 'compensated'>` — `committed` = éxito, `compensated` = re-lanzar |
| Motivo de compensación | `"Compensación: fallo al emitir el comprobante"` en `voided_by`/`void_reason` (gym) y `cancel(reason)` SaaS solo en alta sin pago |
| `computeSubscriptionPeriod` | `({ startDate, latestEndDate?, durationValue, durationUnit, timezone, now? }) → { startDate, endDate, baseline, accumulated, hasActivePeriod }`, pura en `@workspace/shared`, vigencia a **día local** (`latestEndDate >= localDayStartUtc(tz)`) |
| `POST /api/subscriptions` | `startDate?` (default hoy local), `endDate?` (default servidor), `endDateOverrideReason?`; `422 { code: 'END_DATE_BEFORE_START' }`, `422 { code: 'END_DATE_OVERRIDE_REASON_REQUIRED' }` |
| Columna | `subscription.end_date_override_reason` nullable (migración 0019), `NULL` = calculado o histórico |

## Riesgos y reglas que aplican en todas las fases

- **Sin transacciones interactivas** (driver HTTP de Neon): compensación explícita, nunca `db.transaction()` ni rollback asumido.
- **Void-not-delete** (regla 6): ningún `delete` nuevo; SaaS usa `cancel()`, nunca el `DELETE /:id` (ver `vaults/backlog/pagos-suscripciones.md` §2).
- **Timezone de sesión** (`requireOrgTimezone`, 500 si falta); **dinero en centavos** (`z.number().int()`, `formatCents` solo en display); **toasts por código** (`apiCode`), nunca texto del servidor; **sin `pgEnum`**; repos/servicios por **factory** con DB por request.
- Rama apilada `fix/subscription-integrity` desde `fix/receipt-emission-integrity` (sin mergear la anterior); hereda 0018. Si la base cambia, rebase antes de fase-0.

## Verificación global (fase-6)

`pnpm typecheck` (9/9) · `pnpm lint` (0 errores) · unitarios shared/panel/console/jobs-worker · integración: `subscriptions`, compensación gym + SaaS, periodo, `receipts-*`, `platform-receipts-*`, `dashboard`, `members-stats`, `org-billing` · E2E del flujo de renovación del panel · `pnpm db:check`.
