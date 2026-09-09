# Plan: Rebuild console `/subscriptions` y `/organizations` + endpoint SaaS revenue

## Contexto

**Ritmo objetivo (decisión 1):** páginas RSC que fetchean + filtrado cliente vía URL state, `data-testid` estables, side panel `3/4+1/4`, helpers selectores puros + unit tests. Referencia viva: `apps/console/lib/dashboard/selectors` + `apps/console/tests/unit/dashboard-selectors.test.ts:1-60` (fixtures `makeOrg`/`makeSub` con `NOW` fijo). Convención `data-testid` como selector preferido: `e2e/helpers/selectors.ts` (citado en AGENTS.md).

### Módulo suscripciones — diagnóstico

- `apps/console/app/(protected)/subscriptions/page.tsx:37-57` fetchea en paralelo `getAll` + `getStats` + `settings`. `getStats` ya trae dinero (`platform-subscriptions-service.ts:26-37`: `mrrCents`, `monthlyRevenueCents`, `previousMonthRevenueCents`) pero `subscriptions-kpi-section.tsx:7-15` tipa `SubscriptionsStats` **sin** esos campos y `page.tsx:85-96` no los pasa: dinero fetched pero nunca displayed.
- `subscriptions-kpi-section.tsx:66-117`: solo 4 cards clicables (Activas, Trial, Vencidas, Suspendidas). No hay cards de dinero ni crecimiento.
- `subscriptions-client.tsx:24-29` (`FILTER_OPTIONS`) ofrece `active/trial/expiring/suspended`, desalineado con los filtros del KPI (`past_due`, `read_only`, `cancelled` existen en `FILTER_TO_STATUS` de `page.tsx:18-25` pero sin botón). No hay filtro por plan aunque el backend lo soporta (`platform-subscriptions.route.ts:77`, `platform-subscriptions-service.ts:18,68-78` con `planId`). No hay side panel.
- `subscriptions-table.tsx:206-265`: acciones sin gating por rol — todo rol con acceso a console ve Registrar/Extender/Cancelar/Eliminar. `handleDelete` usa `confirm()` nativo (`:75-85`) más `console.error` + toast crudo; mismo patrón en `handleCancel` (`:87-101`) y `handleExtend` (`:103-117`). Viola regla console (decisión 10): debe ser `mutationError` de `@/lib/errors` (`apps/console/lib/errors.ts:11-18`) + mensaje genérico en español.
- `subscriptions-table.tsx:230-235`: "Registrar Pago" navega a `/organizations/<slug>/subscriptions?addPayment=<id>`. **Parámetro muerto**: `apps/console/app/(protected)/organizations/[slug]/subscriptions/page.tsx:20-26` solo lee `searchParams.page`; nada lee `addPayment`.
- `platform-subscription-modal.tsx:39-71`: solo crea suscripciones nuevas vía `organizationsService.addSubscription`. No sirve para registrar un pago sobre una sub existente (dominios distintos; reutilizar `apps/panel/components/payments/subscription-modal.tsx` está prohibido — cross-app imports, decisión 3). El servicio ya expone lo necesario: `platformSubscriptionsService.addPayment` (`platform-subscriptions-service.ts:230-238` → `POST /:id/payments`).
- `platform-payment-history-modal.tsx:111-248`: sin botón "Registrar pago"; acciones de estado (`:96-109`, Validar/Rechazar/Anular) sin gating y con `console.error` + toast crudo (`:84-86`, `:103-106`).
- Columna de pagos: existe insignia "Pago pendiente" (`subscriptions-table.tsx:183-187` vía `latestPaymentStatus`) y celda de precio (`price-cell.tsx`), pero no se muestra `paymentsCount` (campo ya joineado en `IPlatformSubscription`, `packages/shared/src/types.ts:425`).

### Módulo organizaciones — diagnóstico

- `apps/console/app/(protected)/organizations/page.tsx:56-75`: placeholder muerto "Activos Hoy" (`---`, `grayscale select-none`). Solo KPI Total.
- `organizations-table.tsx:47-200`: columnas Organización / Ubicación / Métricas / Suscripción (`SubscriptionCell` sobre `org.latestSubscription`, tipado en `types.ts:491-492`) / Acciones. Sin columna Alta (`createdAt`), sin columna AI credits, sin semáforo de salud. `calcStatus` (`:172-178`) solo distingue `active/inactive/pending`.
- `organization-actions.tsx:33-103`: "Gestionar Plan" + "Dar AI Credits" (vivos) + sección "Estado" Activar/Desactivar con `onToggleStatus` que **nadie cablea** (`organizations-table.tsx:180-193` no lo pasa → item muerto) + engranaje settings. Según decisión 6 el estado final es: Gestionar Plan, Dar AI Credits, Ver suscripciones, Editar; fuera toggle muerto y engranaje.
- Sin filtros de país ni de estado de sub. El list backend (`organizations-service.ts:40-53`) solo acepta `query/page/limit/includeMemberCount`: filtros nuevos van en memoria vía selectores (cero backend, coherente con decisión 6 "no backend change" para KPIs).
- `organizations-results.tsx:17-73`: wrapper cliente que ya levanta estado para el modal de sub — punto natural para cablear filtros/paginación en memoria.

### Permisos — diagnóstico

- `packages/shared/src/access-control.ts:15-37`: `support` solo `list/read`; `admin`/`owner` tienen `cancel/extend` en subscription. `canAccessConsole` (`:47-52`) exige `organization.create` → `support` ni entra al layout (`apps/console/app/(protected)/layout.tsx:25-29`). Pero **dentro** de console no hay gating fino: support (si algún día entra a otra ruta) u otros roles verían acciones mutantes.
- Rol de plataforma disponible en cliente: `useAuth().user.role` (`packages/auth/src/hooks.ts:8-47`, `roleName = user?.role`; re-export console en `apps/console/lib/hooks/use-auth.ts:1-2`). No confundir con `orgRole` (rol de gym, irrelevante en console).
- `canAssignPlatformRole` (`permissions/role-assignment.ts:30-41`) no se toca en este build (fuera de alcance).

### Backend — diagnóstico

- `apps/api-worker/src/routes/reports.route.ts:11` es org-scoped (`requireOrgPermission(REPORTS,READ)` + `requireOrgTimezone`) y `services/reports.service.ts:6-19` agrega **gym payments** con bucketing por tz del org. Tabla equivocada + sesión de org requerida → **descartado** para revenue SaaS (decisión 9).
- `GET /api/platform/subscriptions/stats` (`platform-subscriptions.route.ts:105-117`) es el endpoint KPI caliente → **no extender** (decisión 9).
- `getStats` en repo (`platform-subscriptions.repository.ts:472-526`): conteos por status computado + `monthlyRevenueCents`/`previousMonthRevenueCents` (`:501-502`, `status VALIDATED` + `COALESCE(baseAmount, amountPaid)`) + `mrrCents` (`:509`, `priceOverride ?? plan.price` donde status `active`). El nuevo endpoint replica exactamente esa fórmula para que el total del chart cuadre con el KPI.
- Cache escrituras: todas invalidan `platform:subscriptions*` + `org:{id}:subscription-status|features` (`platform-subscriptions.route.ts:138-140,157-159,175-177,193-195,211-215,243-245,260-262`). Clave nueva `platform:subscriptions:revenue:{months}m` comparte prefijo → invalidación automática, sin tocar writes. TTL 1h (3600) como `reports:revenue` (`reports.route.ts:26`).
- **Orden de rutas crítico**: `/:id` (`platform-subscriptions.route.ts:119-128`) tragaría `/revenue` si se registra después (igual que `/stats` está antes, `:105-117`). Insertar `/revenue` entre `/stats` y `/:id`.
- **Hallazgo verificación IA (decisión 7):** `GET /api/ai/usage` es org-scoped (`apps/api-worker/src/routes/ai-usage.route.ts:15`, `requireAuth()+requireOrg()`) — inservible desde console para N orgs arbitrarias. Única lectura por org hoy: la **respuesta** del `POST /platform/organizations/:id/ai-credits` (`platform-organizations.route.ts:185-187`, tipada en `organizations-service.ts:174-182` con `{ monthly:{used,limit}, remaining }`). **No existe GET platform de uso IA** → la columna "AI credits por org" requiere un endpoint mínimo de lectura (Fase 1, T1.0). Sin cambio de schema (lee `ai_usage` vía `features.service.getAiQuota`, `features.service.ts:156`).

### Docs — diagnóstico

- `docs/FUTURE_IDEAS.md:65` bullet SWR/React Query (descartado oficialmente en AGENTS.md) → borrar, conservar modo offline del Bridge (`:66`).
- `§4 :76-79` schema stabilization → hecho, borrar sección.
- `§3 :71` "Reportes en PDF" → engañoso: receipts existen vía jobs-worker (`pdf.handler.ts`); reescribir: pendiente solo attendance reports + revenue export.
- `apps/cms` stale en `:19`, `:42`, `:58` → panel/web.

---

## Fase 0 — Limpieza y §6 en `docs/FUTURE_IDEAS.md`

> Solo toca `docs/FUTURE_IDEAS.md`. Sin código.

- [x] **T0.1 Borrar §2 bullet SWR/React Query** (`FUTURE_IDEAS.md:65`). Mantener bullet offline Bridge (`:66`). _Hecho:_ el bullet no existe y el de offline sigue.
- [x] **T0.2 Borrar §4 completa** (`:76-79`, "Estabilización del Schema"). _Hecho:_ sección eliminada, secciones siguientes renumeradas si aplica.
- [x] **T0.3 Reescribir §3 bullet PDF** (`:71`). Nuevo texto: receipts de pago existen vía jobs-worker (`pdf.handler.ts` + templates); pendiente: reportes de asistencia gym y export de revenue SaaS (CSV/PDF). _Hecho:_ bullet no promete nada ya existente.
- [x] **T0.4 Fix refs `apps/cms`** (`:19` path config, `:42` auth-client, `:58` scripts) → `apps/panel` / `apps/web` según frase. _Hecho:_ cero ocurrencias de `apps/cms` en el archivo.
- [x] **T0.5 Nuevo §6 "SaaS Revenue UI (post-endpoint)"**: (a) chart de revenue en console sobre `GET /api/platform/subscriptions/revenue` (backend listo Fase 1, UI queda futura); (b) normalización multi-moneda real — hoy las sumas mezclan monedas exactamente igual que `monthlyRevenueCents` (caveat documentado, no bloquea); (c) agregados org server-side si el dataset 500 de Fase 4 se queda corto; (d) alertas 80%/100% créditos vía Queue+email si se pide. _Hecho:_ §6 existe con esos 4 bullets y referencia al endpoint.

## Fase 1 — Backend: `GET /revenue` + lectura IA por org + tests

> Sin cambios Drizzle (no hay `db:generate`/`db:migrate` en este plan).

- [x] **T1.0 (prerrequisito AI column) `GET /api/platform/organizations/:id/ai-usage`**. Archivos: `apps/api-worker/src/routes/platform-organizations.route.ts` (nuevo handler junto al `POST :185-187`), `apps/console/lib/services/organizations-service.ts` (`getAiUsage(id)` vía ofetch `api`, sin `fetch` crudo). Lógica: `requirePlatformAuth()`, `features.service.getAiQuota(orgId)` (misma fuente que `ai-usage.route.ts:28`), shape `{ monthly:{used,limit}, remaining, disabled, periodStart }`, cache `platform:ai-usage:{orgId}` TTL 300, `invalidateExact` en el `POST /:id/ai-credits`. _Hecho:_ 200 para owner/admin con quota real; 403 support; 404 org inexistente; tras grant, la key se invalida.
- [x] **T1.1 Repo `getMonthlyRevenue(months)`** en `apps/api-worker/src/repositories/platform-subscriptions.repository.ts` (junto a `getStats :472-526`). SQL UTC: `WHERE status='validated'`, `COALESCE(baseAmount, amountPaid)` (idéntico a `:501-502`), `DATE_TRUNC('month', paymentDate AT TIME ZONE 'UTC')`, rango `DATE_TRUNC('month', CURRENT_TIMESTAMP) - (months-1) months`, devuelve `[{ month:'YYYY-MM-01', totalCents, count }]`. Comentario multi-currency caveat en código. _Hecho:_ bucket del mes corriente `totalCents === getStats().monthlyRevenueCents` con mismo dataset.
- [x] **T1.2 Service passthrough** en `apps/api-worker/src/services/platform-subscriptions.service.ts` (tras `getStats :123-124`): `getRevenue(months)` → repo. Sin lógica de negocio. _Hecho:_ compila, test unitario no requerido (passthrough).
- [x] **T1.3 Ruta `GET /api/platform/subscriptions/revenue?months=12`** en `platform-subscriptions.route.ts`, insertada **entre `/stats` (`:105-117`) y `/:id` (`:119`)** (orden Hono). `requirePlatformAuth()`, `months` default 12 clamp 1–24, cache `platform:subscriptions:revenue:{months}m` TTL 3600 (patrón `reports.route.ts:18-26`). Sin cambios en writes (el `invalidate('platform:subscriptions*')` existente ya cubre el prefijo). _Hecho:_ 401 sin sesión; 403 support/user (mirror `guards.test.ts`); 200 owner/admin con array de `months` buckets; tras `POST /:id/payments` la key desaparece (test lo aserta vía segunda lectura).
- [x] **T1.4 Console service `getRevenue(months, options?)`** en `platform-subscriptions-service.ts` + tipo `RevenuePoint { month:string; totalCents:number; count:number }`. Tag Next `console:subs`. _Hecho:_ tipado sin `any`, usa `api` ofetch.
- [x] **T1.5 Tests integración** `apps/api-worker/tests/integration/platform-subscriptions-revenue.test.ts` (HTTP real + Neon branch, patrón `guards.test.ts` + spies R2/Queue existentes): validated-only, `COALESCE(baseAmount ?? amountPaid)`, bucketing UTC a caballo de mes, clamp `months`, 401/403, coherencia `revenue[mes actual] === stats.monthlyRevenueCents`, invalidación post-write. _Hecho:_ `pnpm --filter api-worker test:integration` verde (requiere `TEST_DATABASE_URL`; sin ella suite skipea — no bloquear).

## Fase 2 — Permisos + `platform-payment-modal` + historial

- [x] **T2.1 Nuevo `apps/console/lib/platform-permissions.ts`**:
  ```ts
  canManageBilling(role: string|null|undefined) // role === 'owner' || role === 'admin'
  hasActiveSubscription(sub: { cancelledAt?: unknown; status: string }) // !cancelledAt && (status==='active'||status==='trial')
  ```
  Rol desde `useAuth().user.role` (decisión 2; `packages/auth/src/hooks.ts:14`). Unit test `apps/console/tests/unit/platform-permissions.test.ts` (matriz: owner/admin true; support/user/null false; `hasActiveSubscription` con cancelled/active/trial/past_due/cancelled). _Hecho:_ tests verdes, cero `any`.
- [x] **T2.2 Gate en `subscriptions-table.tsx`**. Leer `const { user } = useAuth()` (`@/lib/hooks/use-auth`). Items con prop `show` (patrón ya usado en `platform-payment-history-modal.tsx:225,231,239`): Registrar Pago + Extender Periodo → `show: canManageBilling && hasActiveSubscription(sub)`; Cancelar → `show: canManageBilling && hasActiveSubscription(sub)`; Eliminar → `show: canManageBilling`; Ver Pagos + Ver detalle sin gate (todos los roles). _Hecho:_ con sesión support (o mock `user.role='support'`) no se renderizan los items mutantes; owner los ve todos; `tsc` pasa.
- [x] **T2.3 Nuevo `apps/console/components/platform/platform-payment-modal.tsx`** (console-nativo, decisión 3). Props `{ subscription: SubscriptionWithDetails; open; onOpenChange; onSuccess?; settings: Record<string,string> }`. Reutiliza `payment-section.tsx:20-48` (mismas props que `platform-subscription-form.tsx`) + `platformSubscriptionsService.addPayment(sub.id, payload)`. Sub/org preseleccionados y read-only en el header. Submit: `try/catch` con `mutationError(scope, err, "No se pudo registrar el pago")` + `toast.error/success` en español. `onSuccess` → parent ejecuta server action `updateTag("console:subs")` + `router.refresh()`. _Hecho:_ modal abre con datos precargados, registra pago validado/processing, aparece en historial, KPIs se refrescan.
- [x] **T2.4 "Registrar pago" dentro de `platform-payment-history-modal.tsx`**. Nueva prop `onRegisterPayment?: () => void`; botón header junto a Refrescar (`:264-273`) con `show` = mismo gate T2.2 (requiere pasar `canRegister: boolean` o el `subscription` para evaluarlo dentro). Gate también en acciones de estado (`:214-246`: Validar/Rechazar/Anular → `show: canManageBilling`). Migrar sus `catch` a `mutationError` + genérico ES (`:84-86`, `:103-106`). _Hecho:_ botón abre el modal T2.3; support no ve ni el botón ni los cambios de estado.
- [x] **T2.5 Eliminar flujo `?addPayment=`**. En `subscriptions-table.tsx:230-235` "Registrar Pago" abre el modal T2.3 (estado local `paymentModal`, como `cancelModal/extendModal :70-72`) en vez de `router.push(...?addPayment=)`. `SubscriptionsTable` levanta también el estado para el callback `onRegisterPayment` del historial. Pasar `settings` por props (`SubscriptionsClient` ← `page.tsx`, que ya los fetchea `:37,54` pero no los baja). Misma prop en la page de detalle org (ya tiene `settings :27-33`, pasarla a la tabla). _Hecho:_ cero ocurrencias de `addPayment` en `apps/console`; navegación eliminada, modal en ambas páginas.
- [x] **T2.6 Reemplazar `confirm()` por modal del design system** (sugerencia 3). Nuevo `apps/console/components/platform/delete-subscription-modal.tsx` (Modal/ResponsiveModal de `@workspace/ui`, patrón `cancel-subscription-modal.tsx`): muestra org+plan+periodo, botón destructivo con `actionLoading`, error vía `mutationError` + "No se pudo eliminar la suscripción". Cablear en tabla en lugar de `handleDelete :75-85`. _Hecho:_ sin `confirm(` en `apps/console/components/platform/`; eliminar funciona y refresca.

## Fase 3 — Página `/subscriptions` SaaS-billing

Ritmo: RSC `page.tsx` fetchea; `subscriptions-client.tsx` filtra por URL; layout `grid lg:grid-cols-4` (tabla `col-span-3` + aside).

- [x] **T3.1 `page.tsx`: plan filter + datos del panel**. Leer `planId` de `searchParams` → `getAll({ planId })`. En paralelo sumar: `platformPlansService.getAll` (opciones del filtro, tag `console:plans`) y `getRevenue(12)` (tag `console:subs`). Pasar `plans`, `revenue`, `settings` al cliente/panel. _Hecho:_ `?planId=` filtra server-side; builds sin `any`.
- [x] **T3.2 KPIs de dinero** en `subscriptions-kpi-section.tsx`. Extender su interfaz con `mrrCents/monthlyRevenueCents/previousMonthRevenueCents` (ya vienen en `SubscriptionStats :26-37`), renderizar 3 cards NO clicables (MRR, Ingreso mes actual, Mes previo + % crecimiento vía selector) con `ValueConverter.format` + `currencyFormat` existente, `data-testid="subs-kpi-mrr|month|prev"`. Mantener las 4 cards clicables actuales. _Hecho:_ cifras visibles cuadran con `getStats` crudo; crecimiento `null-safe` (div/0 → "—").
- [x] **T3.3 Filtro por plan en `subscriptions-client.tsx`**. Select (opciones `plans` de T3.1) que escribe `?planId=` en URL (reset `page=1`), con botón limpiar X existente (`:116-125`). Sincronizar `initialPlanId` como `initialStatus`. _Hecho:_ URL es la fuente de verdad; recargar con `?planId=&status=` reproduce el estado.
- [x] **T3.4 Columna de pagos en tabla**. Enriquecer celda Precio/Status: `paymentsCount` (`types.ts:425`) como sublínea ("N pagos") + mantener badge "Pago pendiente" (`:183-187`). Sin backend (campos ya joineados). `data-testid="subs-row-<id>"`. _Hecho:_ filas muestran conteo; soporte visual para la cola de revisión.
- [x] **T3.5 Nuevo `subscriptions-side-panel.tsx`** (aside `col-span-1`): (a) Ingresos 6M mini-lista desde `revenue` T3.1 (nota "sums mix currencies — ver §6 FUTURE_IDEAS"); (b) Top planes por revenue (selector T3.6 sobre muestra `getAll({ status:'active', limit:200 })` fetcheada en RSC solo para el panel); (c) Métodos de pago desde `settings` (ya en page); (d) Cola de revisión: links `/subscriptions?status=past_due|read_only|suspended` con counts de `stats`. _Hecho:_ panel renderiza sin fetch cliente; links navegan con filtros URL.
- [x] **T3.6 Selectores + tests** `apps/console/lib/platform/subscription-selectors.ts`: `selectTopPlansByRevenue(subs)`, `selectRevenueGrowth(stats)`, `selectReviewCounts(stats)` — puros, testeados en `apps/console/tests/unit/subscription-selectors.test.ts` (patrón `dashboard-selectors.test.ts`, `NOW` fijo). _Hecho:_ cobertura de bordes (trial precio 0, `priceOverride null`, div/0).

## Fase 4 — Página `/organizations` org-focused

Dataset amplio en RSC para KPIs/filtros en memoria (cero backend, decisión 6): `getAll({ query, page:1, limit:500 })` (tag `console:orgs`) + `Promise.allSettled(orgs.map(getAiUsage))` (T1.0, tag `console:orgs`).

- [x] **T4.1 `page.tsx`: dataset + params**. Leer `searchParams { query, country, subStatus, page }`; fetch página actual (limit 10, existente `:24-32`) + dataset KPI (limit 500, misma `query`) + mapa `aiUsage: Record<orgId, quota>`. Pasar todo a `OrganizationsResults`. _Hecho:_ con ≤500 orgs los KPIs son exactos; si `total > 500`, nota en código + follow-up §6 (agregado server).
- [x] **T4.2 Selectores + tests** `apps/console/lib/platform/organization-selectors.ts`:
  - `selectOrgKpis(orgs, now)` → `{ total, newThisMonth (createdAt en mes UTC, mirror `selectNewOrgsThisMonth`), withActiveSub (hasActiveSubscription sobre `latestSubscription`), withoutActiveSub }`.
  - `selectOrgHealth(org)` → semáforo (sugerencia 2): `down` = sin sub o `suspended/cancelled`; `warn` = `past_due/read_only` o vence ≤7d; `ok` = `active/trial` resto. Reutiliza `hasActiveSubscription` de T2.1.
  - `filterOrgsByCountry(orgs, countryCode)`, `filterOrgsBySubStatus(orgs, subStatus)`.
  - Tests `apps/console/tests/unit/organization-selectors.test.ts` (NOW fijo, matriz de estados). _Hecho:_ tests verdes incl. bordes (`latestSubscription null`, `cancelledAt` set con status active).
- [x] **T4.3 KPIs propios** (nuevo `organizations-kpi-section.tsx` o bloque en page): Total / Nuevas este mes / Con sub activa / Sin sub activa (clicables → `?subStatus=active|none`). **Borrar bloque muerto** `page.tsx:56-75` ("Activos Hoy"). _Hecho:_ placeholder eliminado; clicks filtran por URL.
- [x] **T4.4 Filtros URL**. Extender `organizations-search.tsx` o nuevo `organizations-filters.tsx`: país (opciones de `COUNTRIES`/`COUNTRY_INDEX` en `@workspace/shared`, nunca API de rates) + estado-sub (`active/past_due/read_only/suspended/cancelled/none`) → `?country= ?subStatus=` (reset page). Tabla pagina **en memoria** sobre el dataset filtrado (PAGE_LIMIT como page-size; `OrganizationsPagination` existente se mantiene con el nuevo total). _Hecho:_ URL reproduce estado; filtros combinables con `query`.
- [x] **T4.5 Tabla: columnas Alta + AI + salud; acciones recortadas** (`organizations-table.tsx`, `organization-actions.tsx`):
  - Nueva columna "Alta" (`createdAt`, `formatDate` ES existente).
  - Nueva columna "AI Credits" desde mapa T4.1 (`used/limit` + restante; "—" si `rejected`/sin dato; `data-testid="org-ai-<id>"`).
  - Badge semáforo `selectOrgHealth` en celda Suscripción (`data-testid="org-health-<id>"`).
  - Acciones finales (decisión 6): Editar (EditModal), Gestionar Plan, Dar AI Credits, **Ver suscripciones** (nuevo: `router.push(/organizations/[slug]/subscriptions)`); **eliminar** sección Estado (toggle muerto `:73-82` en actions) y engranaje settings (`:87-94`). _Hecho:_ support ve las 4 acciones de lectura/gestión sin mutaciones de billing (el modal de sub hereda gates Fase 2); paridad en `organization-mobile-card.tsx` (al menos compila + muestra salud/alta).
- [x] **T4.6 Toasts/errores**. Migrar `organization-actions.tsx` y `grant-ai-credits-modal.tsx:39-44` a `mutationError` + genérico ES (el modal ya usa genérico; uniformar `console.error` → helper). _Hecho:_ sin `console.error` directos en los archivos tocados.

## Fase 5 — Verificación y cierre

- [x] **T5.1 Estático + unit**: `pnpm typecheck` · `pnpm lint` · `pnpm test` (Vitest shared → api-worker → panel → console, incluye nuevos `platform-permissions`, `subscription-selectors`, `organization-selectors`). _Hecho:_ todo verde.
- [x] **T5.2 Integración api-worker**: `pnpm --filter api-worker test:integration` (requiere `TEST_DATABASE_URL` en `apps/api-worker/.dev.vars`; hard guards anti-prod; sin ella se skipea con mensaje — aceptado). _Hecho:_ `platform-subscriptions-revenue.test.ts` + `guards` verdes.
- [x] **T5.3 E2E console**: `pnpm test:e2e:console` (existen `e2e/console/*`: auth, dashboard, organizations, subscriptions, plans, settings). Añadir specs mínimas con `data-testid` nuevos: filtro `?planId=` persiste, modal Registrar Pago abre y guarda, support no ve items mutantes, semáforo renderiza. _Hecho:_ suite verde, `trace/screenshot` solo en fallo (config existente).
- [x] **T5.4 Manual**: matriz de roles (owner/admin ven todo; support: Ver Pagos/detalle sí, mutaciones no — ni botón Registrar en historial); flujo Registrar Pago → aparece en historial + KPIs; Cancelar exige sub activa; Eliminar pide modal (no `confirm`); KPIs dinero = `getStats`; bucket mes actual revenue = `monthlyRevenueCents`; filtros URL recargables; side panel links; columna AI tras grant. _Hecho:_ checklist firmada en el PR.
- [x] **T5.5 Actualizar AGENTS.md** (regla "When in doubt, update it"): Route Map `platform-subscriptions.route.ts` (+ `GET /revenue?months=`), fila `platform-organizations` (`GET /:id/ai-usage`), cache keys (`platform:subscriptions:revenue:{months}m` 1h, `platform:ai-usage:{orgId}` 5min + invalidación en grant). _Hecho:_ diff AGENTS.md incluido.

---

## Verificación (comandos)

```bash
pnpm typecheck          # todo el monorepo
pnpm lint               # todo el monorepo
pnpm test               # Vitest: shared → api-worker → panel → console
pnpm --filter api-worker test:integration   # HTTP real vs Neon branch (TEST_DATABASE_URL en apps/api-worker/.dev.vars)
pnpm test:e2e:console   # Playwright console (o pnpm test:e2e para todo)
```

Sin pasos DB: este plan no cambia schema Drizzle (no `db:generate`/`db:migrate`/`db:push`). Reglas console en todo el diff: ofetch vía `api` (nada de `fetch` crudo), `mutationError(scope, err, "mensaje genérico ES")` + `toast`, sin `any`, RSC-first, filtros en URL, UI en español.
