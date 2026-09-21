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
- Renovación/cambio/registro SaaS con fallo: pago anulado y **periodo revertido** (`updatePeriodEnd(previousPeriodEnd)`, leído antes de extender); el alta con pago anulado también cancela la suscripción (un `voided` se ignora en el status SaaS). Un pago `voided` no puede re-validarse. Garantía: ningún cobro válido sin comprobante y el reintento no acumula dos veces.
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
- `services/platform-subscriptions.service.ts` (B3.2): mismo helper en los 4 sitios de emisión + `changePlan` por herencia; alta sin pago → `platformSubsRepo.cancel(id, motivo)`; resto → void del pago + reversión del periodo extendido (`revertEffect` → `updatePeriodEnd(previousPeriodEnd)`, leído antes de extender). Trial/free `$0` (`skipped:true`) no compensan: no hay documento.
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

---

## Cierre (post-implementación)

> Enmienda posterior: las fases 0–5 están **implementadas y sin commitear** en `fix/subscription-integrity` (recreada desde `26dcdf0`, el merge de [[FS-0004]]); esta sección **no re-planifica**, solo cierra. El detalle paso a paso vive en `phases/fase-7-cierre.md`. No se toca código de producto salvo el test rojo. El commit y el PR son del **usuario** (nunca auto-commit).

### Objetivo

Dejar la rama verificable y lista para PR: (1) arreglar el único test rojo, (2) corregir la deriva de docs («el periodo SaaS **sí** se revierte») y la ruta muerta `docs/PENDING.md`, (3) documentar los contratos nuevos que el spec no recogía, (4) correr la matriz de verificación completa, (5) cierre administrativo de la task.

### Estado de partida (verificado en el working tree)

- Rama `fix/subscription-integrity`; `git status`: **16 modificados + 9 nuevos = 25 archivos** sin commitear (código de fases 0–5).
- `pnpm typecheck` ya está verde (no re-verificar hasta la matriz).
- **1 test rojo**: `apps/api-worker/tests/integration/platform-subscriptions-compensation.test.ts` → caso `(d) validar un pago de una suscripción cancelada` (línea ~337). Falla con **404 `Pago no encontrado`**: el test cancela con `DELETE /api/platform/subscriptions/:id` (borrado duro; la FK se lleva el pago) y el `PATCH` posterior del pago ya no encuentra fila. La inducción correcta es `POST /api/platform/subscriptions/:id/cancel` (ruta `apps/api-worker/src/routes/platform-subscriptions.route.ts:277`, `cancelSchema = { reason?: string }` línea 63, servicio `cancelSubscription` línea 555), que fija `cancelledAt` **sin borrar**.

### Orden de pasos (dependencias)

```
C1 (test rojo) ──┐
C2 (deriva docs) ├──▶ C4 (verificación global) ──▶ C5 (E2E panel) ──▶ C6 (cierre admin)
C3 (contratos) ──┘
```

C1–C3 son independientes entre sí y pueden ir en cualquier orden. C4 exige C1 en verde. C5 es independiente de C4 pero se reporta junto. C6 es el último paso.

### C1 — Arreglar el test rojo (único cambio de código)

Archivo: `apps/api-worker/tests/integration/platform-subscriptions-compensation.test.ts`, líneas ~355-356.

Sustituir:

```ts
const cancel = await admin.client.delete(`/api/platform/subscriptions/${subId}`);
expect(cancel.status, cancel.text).toBe(200);
```

por:

```ts
const cancel = await admin.client.post(`/api/platform/subscriptions/${subId}/cancel`, {
  reason: 'Cancelación de prueba (d)',
});
expect(cancel.status, cancel.text).toBe(200);
```

Resultado esperado: `POST` responde 200 (`{ success: true, id }`), la suscripción queda con `cancelled_at` no nulo y el pago `processing` **sobrevive**; el `PATCH` posterior a `validated` responde **409 `{ code: 'SUBSCRIPTION_CANCELLED' }`**, el pago sigue `processing` con `receipt_number` null y `expectNoValidChargeWithoutReceipt` no falla.

### C2 — Corregir deriva de docs (el periodo SaaS sí se revierte + ruta muerta)

| Archivo | Línea | Sustituir |
|---|---|---|
| `phases/README.md` | 28 | `periodo SaaS movido no se revierte` → `periodo SaaS extendido se revierte al valor previo (`revertEffect` → `updatePeriodEnd(previousPeriodEnd)`, leído antes de extender)` |
| `phases/fase-6-docs-cierre.md` | 13 | `periodo SaaS no revertido` → `periodo SaaS revertido al valor previo (`revertEffect`)` |
| `plan.md` | 58 | `resto → solo void del pago, periodo intacto y documentado` → `resto → void del pago + reversión del periodo extendido (`revertEffect` → `updatePeriodEnd(previousPeriodEnd)`, leído antes de extender)` |
| `phases/fase-3-compensacion-saas.md` | 39 | `pago voided, periodo y suscripción sin revertir, reintento limpio` → `pago voided, periodo revertido al valor previo, reintento limpio` (hallazgo: contradice el encabezado de la propia fase-3; el spec manda reversión) |
| `task.md` | 74 | `docs/PENDING.md §5.2` → `vaults/backlog/pagos-suscripciones.md` (ruta movida por [[FS-0004]]) |

> Nota de verificación: `plan.md:16` («Decisiones congeladas») **ya está alineada** (dice `periodo revertido`), no tocar. Se ratifica como **enmienda anotada**, no reescritura de historia.

### C3 — Documentar contratos nuevos (spec → implementación)

Contratos que existen en código pero no en el spec; se documentan sin reinventar:

| Contrato | Forma |
|---|---|
| Re-validar un pago no-`processing` | `PATCH /api/platform/subscriptions/payments/:id/status` → **409 `{ code: 'PAYMENT_NOT_REVALIDATABLE' }`** (`platform-subscriptions.service.ts:611`); un `voided` no puede volver a `validated` |
| Validar pago de suscripción cancelada | **409 `{ code: 'SUBSCRIPTION_CANCELLED' }`** (`platform-subscriptions.service.ts:633`); el pago permanece `processing` |
| `END_DATE_BEFORE_START` | Compara **días locales** de la tz de la org (`subscriptions.service.ts:239`), no instantes: `startDate` instante + `endDate` `'YYYY-MM-DD'` del mismo día local no se rechaza |
| Alta SaaS con pago creado-pero-anulado | Además de anular el pago, se **cancela la suscripción** con `cancel()`: un `voided` se ignora en `computePlatformSubscriptionStatus` y dejaría un periodo front-loadeado sin cobro |

Archivos a editar (detalle en fase-7):

- `apps/api-worker/README.md`: en la sección `POST /api/subscriptions` aclarar que el guard compara **día local**; en la tabla de rutas plataforma añadir/annotar `PATCH /api/platform/subscriptions/payments/:id/status` con los dos `409` por código; ampliar el párrafo de compensación (línea 189) con el caso SaaS alta-con-pago-anulado y la reversión del periodo.
- `AGENTS.md`: el bullet de compensación (línea 169) ya recoge la reversión y «cannot be re-validated»; **verificar y, si falta, completar** con los nombres de código `PAYMENT_NOT_REVALIDATABLE` / `SUBSCRIPTION_CANCELLED` y el caso alta-con-pago-anulado.

### C4 — Verificación global (comandos exactos)

| # | Comando | Resultado esperado |
|---|---|---|
| 1 | `pnpm typecheck` | 9/9 tareas OK |
| 2 | `pnpm lint` | 0 errores |
| 3 | `pnpm test` | shared + api-worker + jobs-worker + panel + console; integración api-worker corre contra rama Neon (`TEST_DATABASE_URL` en `.dev.vars`), si falta se salta con `describe.skipIf` |
| 4 | integración por **archivo completo** (ver caveat) | suites verdes, incluida `platform-subscriptions-compensation` (4/4 tras C1) |
| 5 | `pnpm db:check` | esquema consistente |

**Caveat del filtro de vitest**: `pnpm --filter api-worker test -- <filtro>` trata cada argumento posicional como **substring** y los OR-ea. Un filtro parcial (`subscriptions`) ejecutaría `subscriptions.test.ts`, `subscriptions-period`, `subscriptions-compensation` y `platform-subscriptions-*` a la vez. Correr **un archivo por comando con la ruta completa**, p. ej. `pnpm --filter api-worker test -- tests/integration/subscriptions.test.ts`.

Archivos de integración a correr: `subscriptions`, `subscriptions-compensation`, `platform-subscriptions-compensation`, `subscriptions-period`, `platform-subscription-status`, `dashboard`, `members-stats`, `org-billing`, `receipts-{emission,sequence,snapshot,voided-pdf,integrity,rbac}`, `platform-receipts-{emission,sequence,snapshot,void,report,contract}`.

### C5 — E2E renovación del panel

1. Comprobar env: `Test-Path apps/panel/.env` **y** `Test-Path apps/console/.env` (hoy **ambos existen**).
2. Si están presentes → `pnpm test:e2e:panel` (spec `e2e/panel/subscriptions.spec.ts`, flujo de renovación).
3. Si falta alguno → **reportar infra-bloqueado**, no marcar como fallo de la task.

### C6 — Cierre administrativo

- `task.md`: marcar los checkboxes de B3.1/B3.2/B3.3 y de «Verificación global»; frontmatter `status: in_progress` → `done`; `pr` se rellena cuando el usuario abra el PR.
- Commits en el **orden de 7 ya sugerido en `task.md`** (mapea los 25 archivos: DB 0019 → shared periodo → helper+gym → SaaS → periodo servidor → panel → docs). No auto-commit: el usuario revisa y commitea.
- Migración **0019** (`packages/database/migrations/0019_woozy_whiplash.sql`): **NO** aplicar a mano (`pnpm db:migrate` prohibido). La aplica CI (`database-migrations.yml`) al merge; `db:check` debe pasar sin drift.

### Criterio de done

- C1 aplicado → `platform-subscriptions-compensation.test.ts` verde (4/4).
- C2 y C3 aplicados (docs sin deriva, contratos documentados).
- C4 en verde (o fallos preexistentes documentados como tales, fuera de alcance).
- C5 ejecutado o reportado como infra-bloqueado con la comprobación de env.
- `task.md` cerrada (`status: done`, checkboxes) y PR abierto por el usuario.

---

## Correcciones post-review (bloqueantes)

> Auditoría del `reviewer` sobre el change set **sin commitear**: 2 defectos bloqueantes del helper de compensación + 4 follow-ups. Se corrigen **en esta misma task/PR** (1 task = 1 PR). Detalle: `phases/fase-8-correcciones-review.md`.

### Contexto

El helper `compensateFailedEmission` tenía dos agujeros reales:

1. **Relectura fallida → anula un comprobante posiblemente numerado.** Si `readPayment` lanzaba, caía al branch "sin número" y ejecutaba `voidPayment`; si el número **sí** había commiteado, la fila quedaba `voided` **con** `receipt_number` y `receipt_voided = false` → los lectores seguían sirviendo/emailando el comprobante **sin sello ANULADO** y el barrido re-encolaba render+email. El comentario decía "fail-closed"; el código era fail-**open**.
2. **`revertEffect` corría aunque `voidPayment` fallara.** Dos `try/catch` independientes: un cobro válido (`validated`) quedaba con el periodo revertido → días pagados perdidos (viola Regla 4).

### Correcciones aplicadas

| # | Correctivo | Archivos |
| --- | --- | --- |
| #1 | Relectura con **reintento acotado** (3 intentos, backoff 50/150 ms); si persiste → outcome `'unresolved'` y **no se toca nada** (el servicio re-lanza; el barrido reconcilia). Elimina el void a ciegas. | `lib/subscription-compensation.ts` |
| #1b | El alta SaaS **cancela solo con `outcome === 'compensated'`**, nunca con `'unresolved'` (podría ser válida). | `platform-subscriptions.service.ts` |
| #2 | `compensate()` → `Promise<boolean>`; **`revertEffect` solo si el void tuvo éxito**. | `lib/subscription-compensation.ts` |
| #3 | `changePlan`: **crear la nueva primero, cancelar la vieja después** (si el alta se compensa la org no queda con cero suscripciones) + comentario exacto (ruta no montada). | `platform-subscriptions.service.ts` |
| #4 | Invalidación de caché en **`finally`** en las 5 rutas (el camino de fallo compensado también invalida). | `subscriptions.route.ts`, `platform-subscriptions.route.ts` |
| #5 | Panel: si el servidor responde 422 `END_DATE_OVERRIDE_REASON_REQUIRED`, **forzar el campo motivo** + refrescar el `latestSubscription` del miembro (el modal re-lanza el error). | `subscription-form.tsx`, `subscription-modal.tsx` |
| #7 | `accumulated` sale de la **misma condición** que elige el `baseline` (con `latestEndDate === startDate` ya no miente). | `packages/shared/src/subscription-period.ts` |
| #6 | Tests: unit **U1/U2/U3** (relectura fallida, blip recuperado, void fallido no revierte) + integración período **(g)/(h)/(i)** (idempotente, a medida, acortar vigente) + **(d)** alta exitosa con `finally`. | `tests/unit`, `tests/integration` |
| NIT | `voidPlatformPayment` acepta `number \| null` (sin `as number`); `ICreateSubscriptionPayload` omite `status/cancelledAt/isActive/createdAt`; AGENTS/README reflejan `unresolved` + revert gateado + gym no cancela. | varios |

### Fuera de alcance (documentado)

- Montar `POST /api/platform/subscriptions/change-plan` (task aparte; hoy no está en el router).
- Refactor "void-but-seal" del helper (descartado: anular un comprobante legítimo es peor que no decidir).
- `e2e/seed.ts` sigue enviando `endDate = payDate + 30d` (cambiarlo alteraría las fechas esperadas por dashboard/reportes; es un NIT de futuro, no bloqueante).
- Test I7 (invalidación en camino de fallo por HTTP): **no testeable** — Redis es no-op en la suite de integración; se cubre la no-regresión del camino feliz con el caso (d).

### Verificación (post-corrección)

`pnpm typecheck` 9/9 · `pnpm lint` 0 errores · unit shared 304 / api-worker 39 / panel 77 · integración: subscriptions+org-billing+dashboard+members-stats 43, compensación+periodo+status+guards 51, receipts-* 35, platform-receipts-* 33 · `pnpm db:check` ✓ · **E2E panel 53/53**.
