# Fase 4 — Configuración fiscal por org (panel + api-worker)

> Depende de: Fase 0 (`FiscalConfigSchema`, `resolveFiscalProfile`). Sin migración (columna `organization.fiscalConfig` jsonb ya existe). Paralelizable con Fase 3 (archivos distintos: settings vs jobs).

## Objetivo

Cada gym completa su identidad emisora y sus overrides (`documentLabel`, `taxes[]`, `disclaimerOverride`, `isFormalTaxpayer` con fricción intencional). El form de pago muestra impuestos auto-calculados con override auditado. Defensa en profundidad: el backend fuerza `'receipt'` mientras no haya homologación fiscal real.

## Contexto verificado

- `apps/panel/app/(protected)/settings/organization/page.tsx` — cliente, ya edita `name, slug, slogan, legalName, taxId, address, countryCode, timezone, currencyFormat` + logo (vía `uploadService.uploadFile`) usando `organizationsService` + `useAuth().activeOrganization` + `refetch`. **No tiene** sección fiscal. Base del formulario a extender.
- `apps/panel/lib/services/organizations-service.ts` — **OJO**: apunta a `/platform/organizations` (nivel plataforma, console). La edición fiscal org-scoped **no** va por aquí: hace falta endpoint org-scoped nuevo (abajo). No reutilizar este service para fiscal.
- `apps/panel/lib/services/settings-service.ts` — apunta a `/api/settings` (`gym_setting` KV extensible). `fiscalConfig` es **columna de `organization`**, no KV → no va por settings-service.
- `apps/api-worker/src/routes/organizations.route.ts` — rutas `subscription-status`, `subscription`, `payment-methods`, `subscription/renew` (org-scoped con `requireAuth/requireOrg`). Aquí se agrega el `PATCH /profile` fiscal.
- `apps/api-worker/src/services/organizations.service.ts` — `updateOrganization` ya existe (valida slug único, recalcula `primaryCurrency` si cambia `countryCode`), delega en `organizations.repository`. Reutilizar + extender con merge de `fiscalConfig` (no reemplazo ciego) e invalidación de `org:{id}:profile` (la sesión la cachea 5 min).
- `apps/api-worker/src/routes/platform-organizations.route.ts` — acepta `fiscalConfig` en `createOrgSchema` como `z.record(z.string(), z.any())` **sin schema** → endurecer con `fiscalConfigSchema` de Fase 0 (create + update platform también).
- `apps/panel/components/payments/subscription-form.tsx` + `payment-section.tsx` — form actual envía `amountPaid, currencyPaid, exchangeRateApplied, paymentMethod, paymentMethodDetails[], status, paymentDate`. Aquí se agregan impuestos visibles + `taxOverrideReason`.
- RBAC: settings de org = permiso `ORGANIZATION.UPDATE` (owner/manager). Cache: `org:{id}:settings` (1h) y `org:{id}:profile` (5 min) se invalidan on-write (patrón existente).
- `countryCode` y `primaryCurrency` **no** editables aquí (required inmutables de creación).

## Crear

| Archivo | Contenido |
|---|---|
| Sección "Facturación" en `apps/panel/app/(protected)/settings/organization/page.tsx` (o subpágina `.../settings/organization/fiscal/`) | Campos: `legalName`, `taxId` (label dinámica `taxLabel` del país vía `COUNTRIES[countryCode]`), `address`, `documentLabel` (default "Comprobante de pago", editable), `taxes[]` (toggle por impuesto del país + tasa override), `disclaimerOverride` (textarea, placeholder = disclaimer del país), `isFormalTaxpayer` como **checkbox de declaración explícita** con texto legal ("Declaro bajo mi responsabilidad que mi negocio está registrado como contribuyente formal ante [autoridad del país]…") + doble confirmación — fricción intencional, no toggle cosmético. Lectura inicial desde `useAuth().activeOrganization`; guardado vía `api()` + server action `updateTag` + `router.refresh()`; errores con `mutationError` + toast. |
| `PATCH /api/organizations/profile` en `apps/api-worker/src/routes/organizations.route.ts` | Org-scoped, `requireOrgPermission(ORGANIZATION, UPDATE)`. Body `{ legalName?, taxId?, address?, fiscalConfig? }` validado con `fiscalConfigSchema` (Fase 0). `isFormalTaxpayer:true` exige flag `{ confirmed: true }` o 400. `countryCode/primaryCurrency` rechazados aquí (400 si vienen). |

## Modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker/src/services/organizations.service.ts` + `repositories/organizations.repository.ts` | `updateOrganization`: merge profundo de `fiscalConfig` (no reemplazo ciego) + invalidar `org:{id}:profile` (y `settings` si aplica). |
| `apps/api-worker/src/routes/platform-organizations.route.ts` | `createOrgSchema`/`updateOrgSchema`: `fiscalConfig` con `fiscalConfigSchema` real en vez de `z.record(z.string(), z.any())`. |
| `apps/panel/components/payments/subscription-form.tsx` (+ `payment-section.tsx`) | Impuestos auto-calculados visibles (desde `resolveFiscalProfile` vía preview del backend o réplica shared en cliente); override manual despliega `taxOverrideReason` obligatorio (actor = sesión) o el backend rechaza 400. Enviar `subtotal/taxTotal/taxDetails/taxOverrideReason` en el `payment` del `POST /api/subscriptions`. |
| `apps/api-worker/src/services/receipts.service.ts` (Fase 2) | Gate backend: aunque el body pida `document_type: 'invoice'`, forzar `'receipt'` mientras `hasFiscalHomologation=false` (constante explícita + log + respuesta indica etiqueta aplicada). |

## Criterios de aceptación

- Test integración: PATCH con `fiscalConfig` inválido → 400; cashier → 403, manager → 200; `GET /:id/receipt` posterior refleja override (label y disclaimer custom).
- Activar `isFormalTaxpayer` sin checkbox/confirmación → 400.
- Override de impuestos sin `taxOverrideReason` → 400 con mensaje genérico vía `mutationError`.
- PE muestra IGV, US sin impuestos; labels `taxLabel/docLabel` por país.
- E2E settings: guarda fiscal y re-renderiza. `pnpm typecheck/lint/test` verdes.

## Verificación

```bash
pnpm --filter api-worker test:integration
pnpm test:e2e:panel
pnpm typecheck
```