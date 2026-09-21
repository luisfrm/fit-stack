# Fase 8 — Correcciones post-review

> Fase de cierre correctivo. La auditoría del `reviewer` sobre el change set **sin commitear** detectó 2 defectos **bloqueantes** en el helper de compensación y 4 follow-ups. Se corrigen en la **misma task y PR** (regla 1 task = 1 PR): los defectos viajan en el código de FS-0002.

## Objetivo

Dejar la rama mergeable: eliminar el fallo fail-**open** de la relectura, evitar revertir el periodo sobre un cobro válido, y cerrar los follow-ups de caché, panel, shared y tests.

## Hallazgos y correctivos

### BLOQUEANTES

| # | Hallazgo | Correctivo |
| --- | --- | --- |
| 1 | `readPayment` lanza → `persisted = null` → `voidPayment()` a ciegas. Si el número había commiteado, la fila queda `voided` con `receipt_number` y `receipt_voided = false` → se sirve/emaile­a el comprobante **sin sello** y el barrido lo re-encola. Comentario "fail-closed", código fail-open. | Relectura con **reintento acotado** (3 intentos, 50/150 ms). Si persiste → `'unresolved'`, **sin** void/revert/cancel; el servicio re-lanza y el barrido reconcilia. |
| 2 | `revertEffect` corría aunque `voidPayment` fallara (dos `try/catch` independientes) → cobro `validated` con periodo revertido (Regla 4). | `compensate()` → `Promise<boolean>`; `revertEffect` **solo si el void tuvo éxito**. |

### RECOMENDADOS

| # | Hallazgo | Correctivo |
| --- | --- | --- |
| 3 | `changePlan` cancelaba la vieja antes de crear la nueva → alta compensada dejaba la org con cero suscripciones. Comentario inexacto. | Crear-nuevo **primero**, cancelar-viejo **después** + comentario (ruta no montada). |
| 4 | La invalidación de caché corre tras el retorno → en fallo compensado no limpia. | `try/finally` en las 5 rutas (`subscriptions.route.ts`, 4 en `platform-subscriptions.route.ts`). |
| 5 | El panel solo pinta el motivo si su cálculo local (posiblemente obsoleto) dice que acorta; con 422 del servidor no hay campo. | Estado `serverRequiresReason`; el modal re-lanza el error; el form activa el campo y refresca el `latestSubscription`. |
| 6 | Faltaban tests de las ramas más riesgosas. | Unit U1/U2/U3; integración (g)/(h)/(i)/(d). |

### NIT

- `voidPlatformPayment` acepta `number \| null` (sin `as number`).
- `ICreateSubscriptionPayload` omite `status/cancelledAt/isActive/createdAt`.
- AGENTS/README: `unresolved`, revert gateado, gym no cancela la suscripción, invalidación en `finally`.

## Fuera de alcance

- Montar `POST /api/platform/subscriptions/change-plan`.
- Refactor "void-but-seal" del helper.
- `e2e/seed.ts` sin `endDate` explícito (alteraría las fechas esperadas).
- Test I7 por HTTP (Redis no-op en integración).

## Criterio de done

- [x] `readPayment` fallido N veces → `'unresolved'`, sin void/revert (U1).
- [x] Relectura recupera el blip → `'committed'` (U2).
- [x] Void fallido → revert no llamado (U3).
- [x] Alta SaaS no se cancela en `'unresolved'`.
- [x] `changePlan` crea antes de cancelar.
- [x] Invalidación en `finally` (camino feliz intacto, caso d).
- [x] Panel activa el motivo por código 422 y refresca el latest.
- [x] `accumulated` correcto con `latestEndDate === startDate`.
- [x] Matriz de verificación global en verde (typecheck 9/9, lint 0, unit, integración, `db:check`, E2E panel 53/53).
