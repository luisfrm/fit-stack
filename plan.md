# Plan de ejecución — Middleware de contexto + configuración explícita sin fallbacks

## Objetivo

1. Que los **handlers de ruta** hagan únicamente su responsabilidad (datos → servicio → respuesta) y que la **autenticación, autorización y resolución de contexto** (org + timezone) vivan en middleware composable.
2. Que **no existan fallbacks silenciosos** de configuración: lo **obligatorio** son columnas `NOT NULL` sin default en `organization` (imposible que falten); lo **extensible** vive en KV con único fallback permitido `[]`. Si un dato obligatorio falta, error visible, nunca `"USD"`/`"latam"` inventados.
3. Que **crear una org deje todo completo en un insert** + seed solo de lo extensible, y que **crear usuarios** use defaults explícitos por spread (`{ ...DEFAULTS, ...rest }`), cero `.default()` en zod.
4. Que el **índice de países** (`COUNTRIES`) sea la fuente única derivada (`COUNTRY_INDEX`) para monedas, timezones y validación — sin lógica repetida ni aliases deprecated.

---

## Contexto previo (ya hecho)

- Util de fechas compartida `packages/shared/src/date.ts` (date-fns + @date-fns/tz).
- Migración `0009`: `timezone` obligatoria (`notNull`, sin default).
- Migración `0010`: `primary_currency` + `currency_format` columnas `NOT NULL` sin default en `organization` (con backfill `CASE country_code`); `country_code` pierde su default `'VE'`.
- `display.ts` de panel/console deduplicados.

---

## Frente A — Middleware de contexto ✅ (histórico, verificado)

- **A1** — `requireOrgTimezone()` middleware + contexto `org`/`orgTimezone` en las 5 rutas (reports, plans/summary, subscriptions POST, dashboard/stats, payments/analytics); eliminado `org-timezone.ts`; `org` completo en `c.set('org', ...)` global (`index.ts`).
- **A2** — `orgId` centralizado (`c.get('orgId')!`) en todos los routers con `requireOrgPermission`; `requireOrg()` en seats/features/ai-usage y en `organizations/subscription` + `/payment-methods`. **Excepciones documentadas**: `upload.route` (platform bypass por query/body) y `organizations/subscription-status` (bypass de admin sin org) conservan lectura de sesión a propósito.
- **A3** — composición limpia por ruta.

## Frente B — Seeding original ✅ (histórico, superado por columnas)

- **B1/B2** — `buildDefaultOrgSettings` + seed en `createOrganization`; `DEFAULT_PLATFORM_SETTINGS` + seed en `/api/init`. (La parte de moneda/formato migró a columnas en Fase D; el seed hoy solo cubre lo extensible.)
- **B3** — sin `currencyPaid || 'USD'` (subscriptions.service) ni `currency: .default('USD')` (platform-plans); tampoco `|| plan.currency` (platform-subscriptions.service).
- **B4/B5** — panel/console leen moneda/formato de la org (`session.activeOrganization` / `useAuth()`), nunca de settings. Quedan como guards de **dato** (no config): `currencyPaid`, `planCurrency` en UI.

## Frente C/D — Obligatorios a columnas ✅ (implementado 2026-09-07, verificado)

- `IOrganization`: `countryCode/timezone/primaryCurrency/currencyFormat` requeridos.
- `ORGANIZATION_ADDITIONAL_FIELDS`: `countryCode*`, `primaryCurrency*`, `currencyFormat*` required.
- `organizations.service.createOrganization`: un insert (`primaryCurrency = COUNTRIES[cc].currency`, `currencyFormat` explícito/`'latam'` de escritura, `settings` override por spread); cambio de `countryCode` recalcula la principal.
- `createOrgSchema`: `countryCode*`, `timezone*`, `slogan`, `currencyFormat?`, `settings?`.
- `POST /api/settings` rechaza `primary_currency`/`currency_format` (400).
- Usuarios: `shared/defaults.ts` (`DEFAULT_MEMBER_VALUES` / `ORG_STAFF` / `PLATFORM_STAFF`) + spread; cero `.default()` en los 3 schemas.
- Console `organization-form`: país/timezone requeridos (valida antes del paso 2), `slogan`, formato editable, primaria readonly derivada. Panel: Monedas solo edita activas (principal readonly); formato en Configuración de Sede.
- Tests: fixtures + `platform.test.ts`/`settings.test.ts` actualizados.
- Verificación: `typecheck` 0 (shared/api-worker/database/panel/console), lint 0 errores, `vitest` 97+177+42+33 en verde.

---

## Frente E — Índice de países, form completo y limpieza (implementado 2026-09-07)

### Principios

- Monedas/zonas derivadas de `COUNTRIES` (fuente única); exchange API **solo** para tasas/conversión, nunca como catálogo.
- `LATAM_COUNTRIES` eliminado (alias deprecated de `COUNTRY_LIST`); solo `COUNTRY_LIST`.
- Paso 1 del form en 4 secciones (Identidad / País y moneda / Zona horaria / Entidad legal) + `*` en obligatorios + nota *"Los campos con `*` son obligatorios."*
- Timezone del país = default inicial (editable); multi-timezone por país queda para después (`timezones: string[]` en `ICountryConfig`).

### Fase E1 — `COUNTRY_INDEX` global ✅ (`shared/constants.ts`)

```ts
export function indexCountries(countries: readonly ICountryConfig[]) {
  const list = [...countries];
  return {
    codes: list.map((c) => c.code),
    currencies: [...new Set(list.map((c) => c.currency))],   // universo de activas (8)
    timezones: [...new Set(list.map((c) => c.timezone))],
    timezoneOptions: list.map((c) => ({
      value: c.timezone, label: `${c.name} (${c.timezone})`, countryCode: c.code,
    })),
  };
}
export const COUNTRY_INDEX = indexCountries(COUNTRY_LIST); // se computa una vez
```

Una sola lógica de derivación (pura, testeable), un solo global. Sin `SUPPORTED_*` sueltos (`COUNTRY_LIST` ya es el universo de países).

### Fase E2 — UI compartida ✅ (`@workspace/ui`)

1. `ActiveCurrenciesField` (`currencies/value/onChange/locked[]/label/hint/disabled/onLockedAttempt`): chips + modo edición con buscador y toggles; la bloqueada (principal) muestra badge y no se puede quitar. **Adoptado (2026-09-08)** en panel `settings/currencies`, console `currencies-settings` y console `organization-form`, siempre con `currencies={COUNTRY_INDEX.currencies}` (catálogo cerrado de 8, sin exchange API).
2. Prop `required?: boolean` en `CountrySelector` y `SimpleSelect` (pinta `*` en el label; `Input` ya lo tiene nativo).

### Fase E3 — `organization-form` completo ✅ (console)

- Secciones Identidad / País y moneda / Zona horaria / Entidad legal (opcional).
- `ActiveCurrenciesField` con `currencies={COUNTRY_INDEX.currencies}`, inicial `[primaria, "USD"]` re-derivado al cambiar país (conserva extras); primaria en `locked`.
- Timezone desde `COUNTRY_INDEX.timezoneOptions`; label fiscal dinámico con `taxLabel`; footnote de obligatorios.
- Payload: campos org directos + `settings: { active_currencies }` **solo al crear** (en edición el campo va disabled: las activas se gestionan desde el panel de la sede — no existe endpoint console para leer settings de otra org). La primaria **nunca se envía**. Quitado `status` del estado (muerto: zod lo pela, no existe la columna).

### Fase E4 — Staff/members ✅ (panel)

- `member-form.tsx`: completo (10/10 columnas editables, incluye `birthday`). Sin cambios.
- `staff-form.tsx`: agregado `birthday` (único faltante). Biométricos excluidos a propósito (Bridge pausado); `userId` es del sistema.

### Fase E5 — Código muerto ✅

1. Panel `SETTINGS_KEYS.PRIMARY_CURRENCY` + `CURRENCY_FORMAT` (0 usos) — borradas.
2. `status` del form de org (ver E3).
3. Filas legacy `primary_currency`/`currency_format` en `gym_setting` de DBs existentes: `DELETE FROM gym_setting WHERE key IN ('primary_currency','currency_format')` post-migración.
4. **No tocar**: `DEFAULT_COUNTRY`, `useSettings` + keys `ACTIVE_*`/`BRAND_*`, `DEFAULT_PLATFORM_SETTINGS`, `CurrencySelector` (single).

### Fase E6 — DB de test

Vacía de filas = **normal** (`tests/helpers/db.ts` hace `TRUNCATE ... CASCADE` entre archivos). Escalera si falla: diagnosticar (tablas, columnas `0010`, huérfanos FK) → borrar huérfanos → `drizzle-kit migrate` (no `push`) → recrear branch en Neon. Mejora aplicada: `push-test-schema.ts` ahora imprime el output real de drizzle en vez de tragarlo.

---

## Orden de ejecución y riesgo

| Orden | Fase | Riesgo | Notas |
|---|---|---|---|
| 1 | E1 | Bajo | Solo shared, sin consumidores aún |
| 2 | E2 | Bajo | Componente nuevo aislado en ui |
| 3 | E3 | Medio | Form de creación de org (flujo crítico console) |
| 4 | E4 | Bajo | Un campo en staff-form |
| 5 | E5 | Bajo | Borrados verificados + SQL legacy |
| 6 | E6 | — | Solo si la DB de test falla |

## Verificación

- `pnpm typecheck` (shared → api-worker → panel → console) en 0; `lint` 0 errores; `vitest` unit + integración.
- Sin migraciones Drizzle en E (solo filas legacy vía SQL manual); `db:push` prohibido en ramas compartidas.
- Revisión manual del diff; **no commitear** (el usuario commitea).

## Riesgos / notas

- `requireOrg()` en `upload` y lectura directa en `subscription-status`: excepciones intencionales (platform bypass / bypass admin), no regressar.
- `.default()` restantes en zod (`isTrial`, `priceOverride`, `isVisible`) son negocio, no identidad/config: no se tocan.
- `apps/api` legacy (pausado): fuera de alcance.
- Multi-timezone por país: pendiente (`timezones: string[]` en `ICountryConfig`; `indexCountries` ya está diseñado para aplanarlo sin romper consumidores).
- `IOrganization.status` se conserva en el tipo (lo lee `organization-mobile-card` como fallback); sin columna ni escritura.
