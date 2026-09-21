# Fit-Stack API Worker

API REST primaria de Fit-Stack. Hono sobre Cloudflare Workers con autenticación **Better Auth** y ORM **Drizzle** sobre Neon Postgres.

**Puerto (dev):** 8788
**Entry point:** `src/index.ts`
**Despliegue:** Cloudflare Workers vía Terraform + GitHub Actions (nunca `wrangler` manual — ver [AGENTS.md](../../AGENTS.md#infrastructure--deployment-terraform--github-actions))

---

## Quick Start

### Prerequisites

- Node.js >= 20, pnpm 10+
- Neon Postgres (`DATABASE_URL`)
- (Opcional) Upstash Redis para caché, Resend para correos

### Environment variables

```bash
cp .env.example .dev.vars   # wrangler dev lee .dev.vars (gitignored)
pnpm install                # desde la raíz del monorepo
pnpm dev                    # wrangler dev --port 8788
```

> **Nota**: en dev, las apps (`panel` :3001, `web` :3002, `console` :3003) apuntan a `http://localhost:8788` vía `NEXT_PUBLIC_API_BASE_URL`.

### Scripts

```bash
pnpm dev          # Dev server (wrangler, port 8788)
pnpm deploy       # Deploy a Cloudflare Workers (usa el wrangler.jsonc)
pnpm typecheck    # tsc --noEmit
```

---

## Arquitectura

Worker **stateless y por request**: en cada petición se crea la instancia de Better Auth y la conexión a la DB (patrón de `createDb` del factory de `@workspace/database`). Nada se comparte entre requests.

### Pipeline de middleware (orden en `src/index.ts`)

1. **`GET /healthz`** y **`GET /favicon.ico`** — públicos, sin DB ni auth.
2. **`corsMiddleware`** (`src/lib/cors.ts`) — aplica a `/api/*`. Devuelve el origin exacto si está en la allowlist (permite cookies con `credentials: true`). La allowlist es **solo código**:
   - Dev: cualquier `http://localhost:*`
   - Prod: exactos `panel.luisrivas.site`, `console.luisrivas.site`, `api.luisrivas.site`, `luisrivas.site` + cualquier subdominio `*.luisrivas.site`
3. **Contexto por request** — valida `DATABASE_URL` (500 si falta), crea `auth` + `db`, resuelve la sesión con `auth.api.getSession()` y la inyecta en `c.env` (`session`, `user`).
4. **Manejo global de errores** (`src/lib/errors.ts`) — normaliza a `{ error: string, details?: unknown }`:
   - `ZodError` → 400
   - `APIError` (Better Auth) → status del error
   - `HTTPException` (Hono) → status del error
   - cualquier otro → 500 con log del stack
5. **Better Auth engine** — `POST/GET /api/auth/*` delegado a `auth.handler()` (login, registro, sesión, organización, admin, plugins).
6. **Rutas de negocio** montadas bajo `/api/*` y `/api/platform/*`.

### Guards de ruta (`src/lib/route-handler.ts`)

| Guard | Uso | Qué valida |
|-------|-----|------------|
| `requireAuth()` | Rutas con sesión pero sin permiso granular | Sesión + user (401 si falta) |
| `requireOrgPermission(module, action)` | CRUD de tenant | Sesión + `activeOrganizationId` (400) + permiso vía `auth.api.hasPermission` contra la matriz de `@workspace/shared` (403). Fallback a `can(role, module, action)` si el AC plugin falla |
| `requirePlatformPermission(module, action)` | Rutas SaaS admin | Sesión + `auth.api.userHasPermission` (403 si no). Fallback a `user.role === 'admin'` |
| `requirePlatformAuth()` | Alias de platform auth | `requirePlatformPermission('organization', 'create')` |

### Estructura

```
apps/api-worker/
├── src/
│   ├── index.ts               # App Hono: middleware + montaje de routers
│   ├── lib/
│   │   ├── auth.ts            # createAuth(): Better Auth por request (customSession, organization, admin)
│   │   ├── cors.ts            # Allowlist CORS + middleware
│   │   ├── route-handler.ts   # Guards: requireAuth, requireOrgPermission, requirePlatformPermission
│   │   ├── errors.ts          # onError(): envelope unificado de errores
│   │   ├── env.ts             # Tipos Env (bindings + secrets) y AppEnv
│   │   ├── cache.ts           # createCache(): wrapper Upstash Redis (degrade gracefull)
│   │   ├── r2.ts              # createR2Service(): presigned/direct upload, list, delete
│   │   └── date-manager.ts    # Utilidades de fechas/timezone
│   ├── routes/                # Routers Hono por módulo (HTTP concerns only)
│   ├── services/              # Lógica de negocio (Business logic layer)
│   └── repositories/          # Drizzle ORM, filtrados por organizationId (Data access)
├── wrangler.jsonc             # Config Cloudflare Workers (dev/staging/production)
├── .env.example               # Template de env vars (copiar a .dev.vars)
└── tsconfig.json
```

---

## Rutas

### Públicas (sin sesión)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/healthz` | Healthcheck: `{ status, timestamp }` |
| GET | `/favicon.ico` | 204 vacío |
| GET/POST | `/api/auth/*` | Motor Better Auth (sign-in, sign-up, get-session, organization, invitations, admin) |
| GET | `/api/init` | Verifica si el sistema requiere bootstrap (`needsInit`) |
| POST | `/api/init` | Crea el primer admin global (solo cuando `needsInit`) |
| GET | `/api/members/validate-token?token=...` | Valida token de invitación de panel (sin auth) |
| GET | `/api/platform/staff/validate-token?token=...` | Valida token de invitación de console (sin auth) — prefill del register |
| GET | `/api/public/pages/:slug?organizationId=...` | Página CMS pública (cache 15 min) |
| GET | `/api/public/files/*` | Archivos estáticos desde R2 |

### Rutas de tenant (requieren `requireOrgPermission` salvo indicación)

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| GET | `/api/members` | `members.read` | Lista paginada (`query`, `role`, `excludeRole`, `isActive`, `hasActiveSubscription`, `page`, `limit`, `includeLatestSubscription`) |
| GET | `/api/members/stats` | `members.read` | KPIs de clientes + `growth` 6M + `upcomingBirthdays` (cache `org:*:members:stats` 5 min) |
| GET | `/api/members/me` | `requireAuth` | Perfil del miembro logueado |
| POST | `/api/members/link-user` | `requireAuth` | Vincula cuenta a miembro vía token de invitación + setActiveOrganization |
| GET | `/api/members/:id` | `members.read` | Detalle de miembro |
| POST | `/api/members` | `members.create` | Crea miembro (con `sendInvite` opcional) |
| PUT | `/api/members/:id` | `members.update` | Actualiza miembro |
| DELETE | `/api/members/:id` | `members.delete` | Elimina miembro |
| POST | `/api/members/:id/resend-invite` | `members.update` | Reenvía invitación |
| GET | `/api/plans` | `plans.read` | Lista planes de membresía |
| GET | `/api/plans/summary` | `plans.read` | Resumen de planes |
| GET | `/api/plans/:id` | `plans.read` | Detalle de plan |
| POST | `/api/plans` | `plans.create` | Crea plan |
| PUT | `/api/plans/:id` | `plans.update` | Actualiza plan |
| DELETE | `/api/plans/:id` | `plans.delete` | Elimina plan |
| GET | `/api/subscriptions` | `subscriptions.read` | Lista suscripciones |
| GET | `/api/subscriptions/recent` | `subscriptions.read` | Suscripciones recientes |
| POST | `/api/subscriptions` | `subscriptions.create` | Crea suscripción (unidad atómica con pago) |
| PATCH | `/api/payments/:id/status` | `subscriptions.update` | Actualiza estado de pago (`processing`, `validated`, `voided`) + `voidReason?`. `→ validated` solo desde `processing` (**409 `PAYMENT_NOT_REVALIDATABLE`**) y nunca sobre una suscripción cancelada (**409 `SUBSCRIPTION_CANCELLED`**) — invariante validado ⇔ numerado, espejo del console. Sin DELETE de suscripciones (registro financiero inmutable) |
| POST | `/api/payments/:id/send-email` | `subscriptions.read` | Envía recibo por email (vía queue) |
| GET | `/api/classes` | `classes.read` | Lista clases (grupos) |
| GET | `/api/classes/:id` | `classes.read` | Detalle de clase |
| POST | `/api/classes` | `classes.create` | Crea clase |
| PUT | `/api/classes/:id` | `classes.update` | Actualiza clase |
| DELETE | `/api/classes/:id` | `classes.delete` | Elimina clase |
| GET | `/api/trainers` | `staff.read` | Lista trainers (gym_member + coach_profile) |
| GET | `/api/trainers/:id` | `staff.read` | Detalle de trainer |
| POST | `/api/trainers` | `staff.create` | Crea trainer |
| PUT | `/api/trainers/:id` | `staff.update` | Actualiza trainer |
| DELETE | `/api/trainers/:id` | `staff.delete` | Elimina trainer |
| GET | `/api/cms/pages` | `content.read` | Lista páginas CMS |
| GET | `/api/cms/pages/:id` | `content.read` | Detalle de página |
| POST | `/api/cms/pages` | `content.create` | Crea página |
| PUT | `/api/cms/pages/:id` | `content.update` | Actualiza página |
| DELETE | `/api/cms/pages/:id` | `content.delete` | Elimina página |
| GET | `/api/cms/pages/:id/blocks` | `content.read` | Bloques de una página |
| POST | `/api/cms/blocks` | `content.create` | Crea bloque |
| PUT | `/api/cms/blocks/:id` | `content.update` | Actualiza bloque |
| DELETE | `/api/cms/blocks/:id` | `content.delete` | Elimina bloque |
| PUT | `/api/cms/pages/:id/blocks/reorder` | `content.update` | Reordena bloques (`{ orders: [{ id, displayOrder }] }`) |
| GET | `/api/dashboard/stats?today=YYYY-MM-DD` | `dashboard.read` | KPIs del dashboard (usa timezone de la org) |
| GET | `/api/settings` | `settings.read` | Settings de la organización (merge con platform) |
| GET | `/api/settings/:key` | `settings.read` | Setting por key |
| POST | `/api/settings` | `settings.update` | Upsert de settings |
| GET | `/api/reports/revenue` | `reports.read` | Reporte de ingresos con normalización multi-moneda |
| GET | `/api/organizations/subscription-status` | `requireAuth` | Estado de suscripción SaaS de la org (`active`, `past_due`, `read_only`, `suspended`, `cancelled`) |
| GET | `/api/upload?folder=` | `members.create` | Lista archivos de la org de la **sesión** en R2 (superficie de gestión) |
| GET | `/api/upload/file?key=<orgId>/...` | `members.read` | Entrega autenticada de un asset privado |
| DELETE | `/api/upload?key=<orgId>/...` | `members.create` | Elimina archivo (exige prefijo `<orgId>/`) |
| PUT | `/api/upload/direct?key=<orgId>/...` | `members.create` | Upload directo del body al bucket (exige prefijo `<orgId>/`) |
| POST | `/api/upload/presigned` | `members.create` | Genera presigned URL (`{ presignedUrl, key }`) — key `<orgId>/<folder>/…` |
| GET | `/api/public/files/*` | — (público) | Solo `<orgId>/cms/…` y `platform/branding/…`; el resto 404 |

### `POST /api/subscriptions` — body (periodo calculado por el servidor)

El periodo lo calcula el servidor (Regla 4: ningún día pagado se pierde) con `computeSubscriptionPeriod` (`@workspace/shared`). Requiere `subscriptions.create` + `requireOrgTimezone()` (la tz sale de la sesión, nunca de un query param).

| Campo | Requerido | Default / regla |
|-------|-----------|-----------------|
| `memberId`, `planId` | ✅ | Enteros positivos |
| `startDate` | ❌ | Ausente/vacío = hoy local (tz de la org). `'YYYY-MM-DD'` → medianoche local; ISO con `T` → instante tal cual. Inválida → 400 |
| `endDate` | ❌ | Ausente = periodo acumulativo calculado (baseline `max(latestEndDate, startDate)` con vigencia a día local, suma tz-aware vía `addDuration`). Solo se envía para periodo a medida o idempotente |
| `endDateOverrideReason` | ❌ | Solo se persiste al acortar un periodo vigente (columna `subscription.end_date_override_reason`, migración `0019`, nullable; resto de casos → `NULL`) |
| `payment.amountPaid` | ✅ | Centavos enteros (convención Money) |
| `payment.currencyPaid`, `payment.paymentMethod`, `payment.paymentMethodDetails` | ✅ | Según contrato de pagos |
| `payment.status` | ❌ | `processing` \| `validated` \| `voided` (opcional; el repo lo normaliza a `validated`). La emisión del comprobante se decide sobre la **fila persistida**, nunca sobre este campo (invariante validado ⇔ numerado) |
| `payment.paymentDate` | ❌ | Ausente = ahora |
| `payment.subtotal/taxTotal/taxDetails/taxOverrideReason` | ❌ | Override fiscal (solo reduce carga; ver gating C2) |

Guards (el `code` es el contrato — los toasts del panel lo mapean, nunca texto libre):

| Condición | Respuesta |
|-----------|-----------|
| `endDate` de un **día local anterior** a `startDate` (comparación por día local en la tz de la org, no por instante) | **422 `{ code: 'END_DATE_BEFORE_START' }`** |
| Acortar un periodo vigente sin motivo (`trim().length === 0`) | **422 `{ code: 'END_DATE_OVERRIDE_REASON_REQUIRED' }`** |
| Mismo día local que el fin calculado | Idempotente, no es recorte (no exige motivo) |

Si el pago o la emisión fallan tras crear la suscripción, el service **compensa** (helper `compensateFailedEmission`): decide **por relectura** (con hasta 3 reintentos para vencer un blip de Neon HTTP) si el número quedó persistido (`committed` → el alta es válida, no se re-lanza); si la relectura no se puede resolver (`unresolved`) **no se toca nada** (fail-closed real: anular un comprobante posiblemente numerado lo serviría/enviaría sin sello) y se re-lanza el error original; en caso contrario anula el pago con motivo fijo `COMPENSATION_VOID_REASON` o cancela la huérfana con `cancel()` — nunca `delete()` (registro financiero inmutable). En el flujo gym el pago anulado ya computa `ANULADA`, así que la suscripción **no** se cancela además. En SaaS, donde el periodo se extiende antes de emitir, la compensación también **revierte el periodo** a su valor previo (`updatePeriodEnd(previousPeriodEnd)`, leído antes de extender) **solo si la anulación del pago tuvo éxito** (si no, el cobro sigue válido y no se pierden los días pagados); y un alta SaaS con el pago creado-pero-anulado **cancela también la suscripción** (un `voided` se ignora en `computePlatformSubscriptionStatus` y dejaría un periodo front-loadeado sin cobro) — solo en `compensated`, nunca en `unresolved`. Las mutaciones invalidan las cachés dependientes en un `finally`, así que el camino de fallo compensado también invalida.

### Rutas plataforma (SaaS admin — `requirePlatformAuth`, roles globales `admin`/`owner`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/platform/plans` | Catálogo de planes Fit-Stack |
| GET | `/api/platform/plans/with-stats` | Planes con KPIs (orgs, MRR) |
| GET | `/api/platform/plans/summary` | Resumen de planes |
| GET | `/api/platform/plans/:id` | Detalle de plan |
| POST | `/api/platform/plans` | Crea plan |
| PUT | `/api/platform/plans/:id` | Actualiza plan |
| DELETE | `/api/platform/plans/:id` | Elimina plan |
| GET | `/api/platform/subscriptions` | Suscripciones SaaS |
| GET | `/api/platform/subscriptions/stats` | KPIs de suscripciones |
| GET | `/api/platform/subscriptions/:id` | Detalle |
| POST | `/api/platform/subscriptions` | Crea suscripción (unidad atómica con pago) |
| POST | `/api/platform/subscriptions/:id/cancel` | Cancela suscripción |
| POST | `/api/platform/subscriptions/:id/extend` | Extiende período |
| POST | `/api/platform/subscriptions/:id/renew` | Renueva |
| GET | `/api/platform/subscriptions/:id/payments` | Pagos de la suscripción |
| POST | `/api/platform/subscriptions/:id/payments` | Registra pago |
| PATCH | `/api/platform/subscriptions/payments/:id/status` | Cambia estado del pago. `→ validated` solo desde `processing`: un pago no-`processing` → **409 `{ code: 'PAYMENT_NOT_REVALIDATABLE' }`**; una suscripción cancelada → **409 `{ code: 'SUBSCRIPTION_CANCELLED' }`** (el pago queda `processing`) |
| DELETE | `/api/platform/subscriptions/:id` | Elimina suscripción |
| GET | `/api/platform/organizations` | Lista organizaciones (paginada) |
| GET | `/api/platform/organizations/:id` | Detalle de organización |
| POST | `/api/platform/organizations` | Crea organización |
| PUT | `/api/platform/organizations/:id` | Actualiza (completo) |
| PATCH | `/api/platform/organizations/:id` | Actualiza (parcial) — invalida `org:{id}:profile` |
| DELETE | `/api/platform/organizations/:id` | Elimina |
| GET | `/api/platform/organizations/:id/subscriptions` | Suscripciones de la org |
| POST | `/api/platform/organizations/:id/subscriptions` | Crea suscripción para la org |
| GET | `/api/platform/organizations/:id/staff` | Staff de la org (excluye `member`) |
| POST | `/api/platform/organizations/:id/staff` | Provisiona staff/owner (crea gym_member + auth_member) |
| POST | `/api/platform/organizations/:id/join` | Une al admin a la org como owner |
| GET/POST/PUT/DELETE | `/api/platform/organizations/:id/upload[/presigned\|/direct\|/file]` | Assets de esa organización (la org va por **path**, no por body/query) |
| GET/POST/PUT/DELETE | `/api/platform/upload[/presigned\|/direct\|/file]` | Branding de la plataforma (scope fijo `platform/branding/`) |
| POST | `/api/platform/organizations/:id/staff/:memberId/resend-invite` | Reenvía invitación de staff |
| GET | `/api/platform/settings` | Settings globales de plataforma |
| POST | `/api/platform/settings` | Actualiza settings globales |
| GET | `/api/platform/staff` | Staff de plataforma (users con rol support/admin/owner, cache 5 min) |
| POST | `/api/platform/staff` | Otorga acceso (user existe → update role) o envía invitación a console (user no existe) |
| POST | `/api/platform/staff/accept` | `requireAuth` — activa el rol de plataforma tras registrarse |
| DELETE | `/api/platform/staff/:id` | Revoca acceso (role → `user`). Guards: no a sí mismo, no al último owner, anti-escalación |

---

## Env vars

### Secrets y configuración

| Variable | Requerida | Descripción |
|----------|:---------:|-------------|
| `DATABASE_URL` | ✅ | Neon Postgres (Drizzle) |
| `BETTER_AUTH_SECRET` | ✅ | Secreto de firma de Better Auth |
| `JWT_SECRET` | ✅ | Secreto para tokens JWT (invitaciones) |
| `BETTER_AUTH_URL` | ✅ | Base URL pública de la API (`http://localhost:8788` en dev). Si incluye `localhost` se desactivan cross-subdomain cookies |
| `COOKIE_DOMAIN` | ❌ | Dominio de cookie (`fitstack-api.luisrivas.site` en prod). Solo aplica fuera de localhost |

### Caché, archivos y email

| Variable | Requerida | Descripción |
|----------|:---------:|-------------|
| `UPSTASH_REDIS_REST_URL` | ❌ | Caché Upstash. Sin ella el worker funciona sin caché (degrade) |
| `UPSTASH_REDIS_REST_TOKEN` | ❌ | Token de Upstash |
| `R2_PUBLIC_URL` | ❌ | URL pública de archivos. Default dev: `http://localhost:8788/api/public/files` |
| `RESEND_API_KEY` | ❌ | Declarado en `Env` pero **no consumido por este worker** — los emails se encolan en `TASK_QUEUE` y los envía el `jobs-worker` |
| `RESEND_FROM_EMAIL` | ❌ | Ídem |
| `PANEL_URL` | ❌ | Base URL del panel para links de invitación (default `http://localhost:3001`) |
| `CONSOLE_URL` | ❌ | Base URL del console para links de invitación de staff (default `http://localhost:3003`) |

### Bindings (Cloudflare)

| Binding | Tipo | Descripción |
|---------|------|-------------|
| `FILES_BUCKET` | R2 | Bucket de archivos (per-env: `fit-stack-files[-dev|-staging]`) |
| `TASK_QUEUE` | Queue | Producer de `fit-task-events[-dev|-staging]` (emails) |
| `RECEIPT_QUEUE` | Queue | Producer de `fit-receipt-events[-dev|-staging]` (render de comprobantes PDF). Terraform es dueño del consumer/cron; el worker solo produce |

> ⚠️ **Tip**: `BETTER_AUTH_URL` en dev debe apuntar a `http://localhost:8788` (el puerto de este worker; `8787` es del `jobs-worker`).

---

## Caché (Upstash Redis)

`src/lib/cache.ts` — wrapper con `get`, `set`, `invalidate` (SCAN por patrón) e `invalidateExact`. Todos los métodos degradan con `null` si Redis no está configurado o falla (nunca bloquean el request).

Patrones principales (referencia completa en [AGENTS.md](../../AGENTS.md#cache-key-conventions)):

| Patrón | TTL | Uso |
|--------|-----|-----|
| `org:{id}:profile` | 5 min | Perfil de la org activa (customSession) |
| `org:{id}:members:*` | 5 min | Listados de miembros |
| `org:{id}:plans:*` / `classes:*` / `subscriptions` | 5 min | Catálogos |
| `org:{id}:dashboard:stats:*` | 5 min | KPIs del dashboard |
| `org:{id}:settings` | 10 min | Settings de org |
| `org:{id}:public:page:*` | 15 min | Páginas públicas (web) |
| `org:{id}:subscription-status` | 1 min | Estado de facturación |
| `platform:organizations*` / `platform:plans*` / `platform:subscriptions*` / `platform:staff*` | 5-10 min | Datos SaaS admin |
| `member:role:{userId}:{orgId}` | 1 min | Rol cached del miembro (invalidado en `afterUpdateMemberRole`) |

Las escrituras (POST/PUT/DELETE) invalidan los patrones relacionados inmediatamente.

---

## Sesión (customSession)

`src/lib/auth.ts` — el plugin `customSession` de Better Auth enriquece la respuesta de `get-session` con:

- `member` — rol del usuario en la org activa (cacheado 1 min en `member:role:{userId}:{orgId}`)
- `activeOrganization` — objeto completo de la org activa (cacheado 5 min en `org:{id}:profile`), usado para branding del sidebar, tema (color primario) y timezone

Gracias a `customSessionClient` en `@workspace/auth`, estos campos fluyen tanto al server (`sessionService.getSession()`) como al cliente (`useAuth()`).

`organization` plugin: invitaciones por email via `TASK_QUEUE`, hook `afterAcceptInvitation` (vincula `gym_member.userId`) e `afterUpdateMemberRole` (invalida caché de rol).

---

## Deploy

- **Guía completa**: [vaults/architecture/INFRASTRUCTURE.md](../../vaults/architecture/INFRASTRUCTURE.md) y
                     [vaults/architecture/terraform.md](../../vaults/architecture/terraform.md).
- **Infraestructura**: gestionada con Terraform (`infrastructure/terraform/`) — workers, R2, queues y secrets. **Nunca** ejecutar `wrangler` manualmente para deploys.
- **Ambientes**: `dev` / `staging` / `production` definidos en `wrangler.jsonc` (nombre del worker, bucket R2 y cola por ambiente).
- **CI/CD**: GitHub Actions (`deploy-api-worker.yml`) — push a `master` → `production`, push a `develop` → `dev`. La migración de DB se ejecuta con `database-migrations.yml`.
- **Secrets**: configurados a nivel de GitHub Environment (nombres simples sin prefijo) e inyectados por Terraform como `secret_text_bindings` en el worker.
