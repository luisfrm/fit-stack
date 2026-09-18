# Checklist — estados de suscripción, flujo de pago y fases

> Estado verificado: **2026-09-18** (C6 en `622b28e` + documentos en `46f4347`; los cambios de C7 quedan pendientes del commit del usuario).
> Documentos relacionados: `docs/PAYMENT_STATUSES.md` (semántica completa), `tasks/correcciones-comprobantes.md` (plan del track), `docs/PENDING.md` (pendientes).

## 1. Estados de una suscripción (derivados, no se guardan)

Se computan en SQL (`subscriptions.repository.ts`). El orden importa:

| Estado | Cuándo | Badge | Significa |
|---|---|---|---|
| `voided` | El cobro quedó `voided` o `invalid` | **ANULADA** (outline) | El registro es **inválido**: no debió existir así |
| `cancelled` | `cancelled_at IS NOT NULL` y el cobro vale | **CANCELADA** (destructive) | El acceso se **revocó**; el cobro sigue siendo legítimo |
| `expired` | `end_date < now()` | **EXPIRADA** | Venció el periodo |
| `active` | Todo lo demás | **ACTIVA** | Vigente |

- [x] `expiring` **no** es un estado de fila: es solo valor del filtro "Por vencer" (pagada, no revocada, vence en ≤7 días).
- [x] Sin migración: `cancelled_at` sigue siendo la marca interna de "fuera de vigencia" (reportes y activos no cambiaron de criterio).

## 2. Flujo del pago, paso a paso

- [x] **Alta** (`POST /api/subscriptions`): suscripción + pago.
  - con `validated` → el **paso 1** numera (`{slug}-año-n`) y encola el PDF; el email sale del **paso 2**.
  - con `processing` → "Por validar", sin número.
- [x] **Aprobación** (`PATCH /api/payments/:id/status` → `validated`): numera (si aún no lo estaba) y encola el render.
- [x] **Anulación** (`→ voided`): el comprobante se marca **ANULADO** (número y PDF intactos, nunca se reutiliza) y la suscripción pasa a **ANULADA**.
- [x] **Rechazo** (`→ invalid`): mismo efecto sobre la suscripción.
- [x] **Revocar / restaurar acceso** (`PUT /api/subscriptions/:id`): mueve `cancelled_at`. Si el cobro está anulado o rechazado, la acción no se ofrece (ANULADA gana sobre CANCELADA).
- [x] **Eliminar: no existe** — sin ruta, sin permiso RBAC, sin acción en el panel, sin `subscriptionsService.delete`.
- [x] **Acceso** (`isActive`): `end_date >= now()` **y** `cancelled_at IS NULL` **y** el cobro no es `voided`/`invalid`.

## 3. Fases del track de correcciones

- [x] **C0** Integridad del correlativo (orden + carrera + compensación)
- [x] **C8** Guardado de organización org-scoped en Panel (D5)
- [x] **C1** Snapshot del emisor — migración `0016`, sin backfill
- [x] **C2** Perfil fiscal conservador (`isFormalTaxpayer`, IGTF)
- [x] **C3** Fidelidad del PDF (placeholders fuera, equivalente en moneda base)
- [x] **C4** Auditoría espejo en Console (`FS-N` + export CSV)
- [x] **C5** Trazabilidad de emisión (`issued_by`) — misma `0016`
- [x] **C9** ANULADA ≠ CANCELADA + registro no eliminable + los 2 fallos de E2E
- [x] **C6** Robustez del barrido (2.º predicado) y contrato de anulación explícito
- [x] **C7** Higiene, docs y matriz de tests

## 4. Pendientes abiertos (`docs/PENDING.md`)

- [ ] **§12.1** `create()` no es atómico de verdad (dos inserts): un fallo del pago deja suscripción huérfana y ya no hay DELETE que la limpie.
- [ ] **§12.2** El borrado de un **miembro** arrastra su histórico financiero por cascada — la única vía por la que un pago desaparece hoy.
- [ ] **§13** `DELETE /api/platform/subscriptions/:id` (Console) borra la suscripción SaaS y sus pagos: puede dejar la serie `FS-N` sin las filas que la auditoría necesita.
- [ ] **§14** El email que agota reintentos y cae a la DLQ **después** de la marca de notificado no lo recupera el barrido: recuperación manual (`send-email` / `resend`).
- [ ] **§9** Tasa y base del IGTF a confirmar con contador + declaración fiscal del emisor plataforma (los `FS-N` no detallan impuestos).
- [ ] **§11** Los comprobantes emitidos antes de C1 recomponen en vivo (limitación documentada, sin backfill inventado).
- [ ] **§10** Universo de `gaps[]` a escala (disparador de performance).
- [ ] **§8** Disclaimer de Console con país proxy hasta configurar `fitstack_country_code`.
- [ ] **§15** Naming `platform_document_sequence.next_number` → `last_number` (cosmético, requiere migración; agrupar).
- [ ] **§16** Claim-then-number para cerrar la carrera de correlativo (disparador: hueco no explicado en `gaps[]`).

## 5. Verificación

- [x] `pnpm typecheck` 9/9 · `pnpm lint` 0 errores (warnings preexistentes)
- [x] Unit: shared **279** · panel **77** · console **90** · jobs-worker **17** · api-worker **26**
- [x] Integración C9: `subscriptions` **18/18** (5 nuevas) + guards/dashboard/members-stats/reports-receipts/receipts-rbac **42/42**
- [x] Integración C6: `receipts-emission` **13** (T4b y T8b nuevos) + `platform-receipts-emission` **8** (T4b nuevo) + `platform-receipts-void` **4** (nombre y assert corregidos) → 25/25; + `subscriptions` 18 + `receipts-integrity` 4 + `reports-receipts` 6 → **28/28**
- [x] **E2E completo (estado C9, commit `4d5a626`): 86/86** (panel 52 + console 34), 0 warnings de borrado
- [x] E2E de comprobantes tras C6: **7/7** (consola 3 + panel 2 + los 2 setups), incluido el clic real de "Anular"/"Marcar como Validado" en la consola
- [x] C7 (sin migración): units de `emitterSnapshot`/`baseTotal`/gating fiscal y E2E del guardado de sede ya estaban en la suite; `.gitignore` (`*.log`) + destrackeo de los 3 logs de `spec/`, script `push-test-schema` sin shell y naming documentado.
- [x] Commit de C6 (`622b28e`) y de la versión previa de estos documentos (`46f4347`); los cambios de C7 quedan pendientes del commit del usuario.

## 6. Checklist de release (no es fase: es el día que entra un cliente real)

- [ ] **Cadencia del barrido**: pasar el cron de `0 */10 * * *` a `*/10 * * * *` en `infrastructure/terraform/workers.tf` (hoy 10 h es un ahorro de pre-venta, no un SLA) y actualizar `plan.md` / `docs/PENDING.md` §7.
- [ ] **Escanear la serie**: correr la auditoría de correlativo en Panel y Console (`gaps[]` vacío o con huecos explicados por anulaciones).
- [ ] **Vigilar §14**: revisar la DLQ de `fit-task-events` y confirmar que ningún comprobante quedó sin email entregado.
- [ ] **Confirmar con contador** la tasa y base del IGTF antes de encenderla en un gym real (`docs/PENDING.md` §9).

## 7. Cómo repetir la verificación

```bash
pnpm typecheck && pnpm lint
pnpm test                                    # shared → api-worker → panel → console
cd apps/api-worker && pnpm exec vitest run tests/integration/subscriptions.test.ts
pnpm exec playwright test --project=panel    # 52
pnpm exec playwright test --project=console  # 34
```

> Si la suite E2E cae con `net::ERR_CONNECTION_REFUSED` hacia 3000/3001/8788, **no son los tests**: se murieron los dev servers (presión de memoria). Repetir en limpio.
