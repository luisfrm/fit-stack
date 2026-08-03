# Fit-Stack Console

Panel SaaS super-admin (Fit-Stack staff). Gestiona organizaciones, planes de plataforma, suscripciones, configuraciones globales (currencies, payment methods) y el equipo de administración (Staff).

**Puerto:** 3003  
**Acceso:** Usuarios con rol global de plataforma que pasen `canAccessConsole(role)` (admin/owner — los que tienen `organization.create` en `platformRoles`); `support` es read-only y no entra al layout

---

## Quick Start

### Prerequisites

- Node.js >= 20, pnpm 10+
- `apps/api-worker` corriendo en :8788 (la API activa)

### Environment variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | ✅ | API URL (default: `http://localhost:8788`) |
| `NEXT_PUBLIC_R2_URL` | ✅ | URL pública de archivos R2 (default: `http://localhost:8788/api/public/files`) |

```bash
cp .env.example .env
```

### Run

```bash
pnpm dev          # Dev server (Turbopack, port 3003)
pnpm build        # Production build
pnpm start        # Production server
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
```

---

## Estructura

```
apps/console/
├── app/
│   ├── login/                     # Super-admin login (soporta ?returnTo=)
│   ├── register/                  # Registro de invitados del módulo Staff (token → signUp → accept)
│   ├── init/                      # First admin setup
│   └── dashboard/
│       ├── page.tsx               # SaaS admin dashboard (KPIs + recent orgs)
│       ├── organizations/         # List + detail/[id]/settings + subscriptions
│       ├── plans/                 # FitStack plan CRUD
│       ├── settings/              # Global platform settings
│       │   ├── currencies/        # Supported currencies
│       │   └── payment-methods/   # Active payment methods
│       ├── subscriptions/         # All platform subscriptions list
│       └── staff/                 # Staff de plataforma (list + add/revoke admins)
├── components/
│   ├── dashboard/                 # saas-admin-dashboard, organizations-table, org-form/modal
│   ├── platform/                  # platform-plan-card/form/modal, subscription-form/modal,
│                                  # subscriptions-table + kpi-section, payment-section
│   └── staff/                     # staff-table, staff-modal, staff-form
└── lib/
    ├── auth-client.ts             # Re-export de @workspace/auth/client
    ├── hooks/                     # Vanilla (sin TanStack Query): use-auth, use-debounce, use-exchange-rates
    ├── services/                  # organizations, platform-plans, platform-subscriptions, staff
    └── config/                    # envs, constants, display config
```

## Rutas

| Ruta | Descripción |
|------|-------------|
| `/dashboard` | KPIs globales (organizaciones totales, ingresos, suscripciones activas) |
| `/dashboard/organizations` | Lista de organizaciones + crear nueva |
| `/dashboard/organizations/[id]/settings` | Editar org (name, legal, fiscal, timezone) |
| `/dashboard/organizations/[id]/subscriptions` | Suscripciones de la org + crear manual |
| `/dashboard/plans` | Catálogo de planes Fit-Stack |
| `/dashboard/subscriptions` | Lista global de suscripciones |
| `/dashboard/staff` | Equipo de administración de la plataforma (support/admin/owner) — alta con invitación por correo o acceso directo, y revocación |
| `/dashboard/settings/currencies` | Monedas disponibles |
| `/dashboard/settings/payment-methods` | Métodos de pago |

## API consumida

Todas las llamadas van al `api-worker` via `/api/platform/*` (requiere rol global `admin`):
- `/api/platform/organizations`
- `/api/platform/plans/*`
- `/api/platform/settings`
- `/api/platform/staff` (list/create/revoke + validate-token/accept para el register)
- `/api/platform/subscriptions/*`

## Deploy

Despliegue **manual en Vercel** (guía completa en [`INFRASTRUCTURE.md` §4](../../INFRASTRUCTURE.md)):

```bash
cd apps/console
vercel --prod   # o Vercel Dashboard → Git Integration (root: `apps/console`, preset: Next.js)
```

**Env vars en producción (Vercel):**

| Variable | Valor |
|----------|-------|
| `NEXT_PUBLIC_API_BASE_URL` | URL del api-worker (dev: `http://localhost:8788`) |
| `NEXT_PUBLIC_R2_URL` | URL pública de archivos R2 (dev: `http://localhost:8788/api/public/files`) |

**Requisitos:**
- No debe ser accesible públicamente (solo staff Fit-Stack); dominio separado del panel de tenants
- El dominio del console debe estar en la allowlist CORS del API (`apps/api-worker/src/lib/cors.ts`)