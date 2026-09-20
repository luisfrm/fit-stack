# Fase 5 — Panel: preview con la regla compartida y override con motivo

> Requiere: fase-1 (helper puro) + fase-4 (contrato 422 del servidor). Commit: `feat(panel): preview from the shared rule and override with reason — form + toast by code`.

## Objetivo

El form deja de mandar `endDate` por defecto y deja de reimplementar la Regla 4: el preview usa `computeSubscriptionPeriod` y el servidor decide. Si el operador edita la fecha y acorta un periodo vigente, aparece el campo motivo (obligatorio); los errores del servidor se traducen por código, nunca por texto.

## Modificar

| Archivo | Cambio |
|---|---|
| `apps/panel/components/payments/subscription-form.tsx` | Preview con el helper compartido; `endDate` solo se envía si el operador lo editó (flag `dirty`); campo motivo condicional; validación local del motivo antes del submit. |
| `apps/panel/components/payments/subscription-modal.tsx` | `handleSubmit` mapea `apiCode(err)` a mensajes específicos; resto por `mutationError` genérico. |

## No tocar

- `payment-section.tsx`, `tax-block.tsx`, `member-selector.tsx`, `plan-selector.tsx` (impuestos, moneda y selección intactos); `apps/console` (sin cambios de UI).
- `useAuth()` sigue siendo la fuente de `activeOrganization.timezone` (nunca `useSession()` directo); dinero sigue en centavos en el boundary (`unitsToCents` al enviar).

## Detalle

1. Reemplazar el `useEffect` de "Fecha Final Inteligente" (líneas ~193-218) por `computeSubscriptionPeriod({ startDate: parseDateAsConfigTimezone(startDate, timezone), latestEndDate: latestDelMiembro, durationValue/Unit del plan, timezone })`, donde el latest sale de `selectedMember.latestSubscription` (el search ya pide `includeLatestSubscription: true`). Sin plan o sin miembro → preview con `+1 month` como hoy (solo display, no se envía).
2. `endDate` del state = preview editable; `dirty` se marca en `onChange` del input. Al enviar: sin `dirty` → `{ memberId, planId, startDate, payment }` (sin `endDate`: el servidor calcula); con `dirty` → suma `endDate` y, si el preview indica periodo vigente acortado (`hasActivePeriod && edited < computed` a día local), exige el motivo localmente (toast "Indica el motivo del ajuste de fecha") y lo envía como `endDateOverrideReason`.
3. Campo motivo (condicional, `required` con `*` según convención de forms): visible solo cuando el operador acorta un periodo vigente; nota de cierre "Fields with _ are required." ya existe en el form si aplica.
4. Toasts en `subscription-modal.tsx` (patrón `receipt-dialog.tsx:243-248`): `apiCode(err) === 'END_DATE_OVERRIDE_REASON_REQUIRED'` → "El periodo vigente se acorta: indica el motivo del ajuste"; `'END_DATE_BEFORE_START'` → "La fecha final no puede ser anterior a la de inicio"; resto → `mutationError("SubscriptionModal", err, "Fallo al registrar la suscripción")`. Tras éxito: `updateTag` + `router.refresh()` según convención del caller (`payments-client`/`members-client` ya la aplican).

## Criterio de done

- Alta normal: el payload no trae `endDate` y el periodo lo fija el servidor (verificable en red); edición que acorta vigente sin motivo → campo visible + bloqueo local, y si llega al servidor → 422 mapeado a toast específico; edición de periodo nuevo o igual al calculado → sin motivo y en 201.
- Sin texto del servidor en ningún toast (regla toasts); sin `fetch` nativo (servicios con `api` ofetch como hoy).

## Verificación

- `pnpm --filter panel typecheck`; `pnpm --filter panel lint`; unitarios del panel; manual: alta con vigente (preview = `latest.endDate` + duración), acorte con/sin motivo, `endDate` anterior al inicio; E2E `subscriptions.spec.ts` en verde.
