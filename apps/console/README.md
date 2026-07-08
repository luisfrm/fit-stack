# Fit-Stack Console

Panel SaaS super-admin (Fit-Stack staff). Gestiona organizaciones, planes de plataforma, suscripciones y configuraciones globales (currencies, payment methods). Requiere `GLOBAL_ROLES.ADMIN`.

**Puerto:** 3003  
**Acceso:** Solo usuarios con rol global `admin`

---

## Quick Start

### Prerequisites

- Node.js >= 20, pnpm 10+
- `apps/api` corriendo en :3000

### Environment variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | ✅ | API URL (default: `http://localhost:3000`) |

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
│   ├── login/                     # Super-admin login
│   ├── init/                      # First admin setup
│   └── dashboard/
│       ├── page.tsx               # SaaS admin dashboard (KPIs + recent orgs)
│       ├── organizations/         # List + detail/[id]/settings + subscriptions
│       ├── plans/                 # FitStack plan CRUD
│       ├── settings/              # Global platform settings
│       │   ├── currencies/        # Supported currencies
│       │   └── payment-methods/   # Active payment methods
│       └── subscriptions/         # All platform subscriptions list
├── components/
│   ├── dashboard/                 # saas-admin-dashboard, organizations-table, org-form/modal
│   └── platform/                  # platform-plan-card/form/modal, subscription-form/modal,
│                                  # subscriptions-table + kpi-section, payment-section
└── lib/
    ├── auth-client.ts             # Re-export de @workspace/auth/client
    ├── hooks/                     # use-auth, platform-settings, platform-subscriptions
    ├── services/                  # organizations, platform-plans, platform-subscriptions
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
| `/dashboard/settings/currencies` | Monedas disponibles |
| `/dashboard/settings/payment-methods` | Métodos de pago |

## API consumida

Todas las llamadas van a `apps/api` via `/api/platform/*` (requiere `GLOBAL_ROLES.ADMIN`):
- `/api/platform/organizations`
- `/api/platform/plans/*`
- `/api/platform/settings`
- `/api/platform/subscriptions/*`

## Deploy

- Configurar `NEXT_PUBLIC_API_BASE_URL` con la URL del API en producción
- No debe ser accesible públicamente (solo staff Fit-Stack)
- Dominio separado del CMS de tenants