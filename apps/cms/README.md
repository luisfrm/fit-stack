# Fit-Stack CMS

Panel de administración para gimnasios (Owner/Manager/Cashier). Next.js 16 con autenticación Better Auth y componentes `@workspace/ui`.

**Puerto:** 3001  
**Roles permitidos:** `OWNER`, `MANAGER`, `CASHIER` (validado en `dashboard/layout.tsx`)

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
pnpm dev          # Dev server (Turbopack, port 3001)
pnpm build        # Production build
pnpm start        # Production server
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
```

---

## Estructura

```
apps/cms/
├── app/
│   ├── login/                     # Login page
│   ├── register/                  # Registration page
│   ├── init/                      # First-time setup
│   ├── accept-invitation/[id]/   # Accept org invitation
│   ├── no-subscription/          # Org suspended/cancelled
│   ├── reset-org-context/        # Force org selection
│   ├── unauthorized/             # Role denied
│   └── dashboard/                # Main app shell
│       ├── classes/              # Group activity scheduling
│       ├── content/              # CMS pages & blocks
│       ├── members/              # Gym member management
│       ├── memberships/         # Plans CRUD & pricing
│       ├── payments/              # Payment registration & analytics
│       ├── settings/            # Multi-tab settings
│       │   ├── general/          # Branding, preferences
│       │   ├── organization/      # Org profile & fiscal data
│       │   ├── roles/             # Role management
│       │   ├── currencies/        # Active currencies
│       │   └── payment-methods/   # Payment method config
│       ├── staff/                 # Staff table (Owner/Manager/Cashier/Coach)
│       └── trainers/              # Coach profiles
├── components/
│   ├── classes/
│   ├── content/                   # block-forms, image-uploader
│   ├── dashboard/                 # Sidebar, stats, subscription banner
│   ├── members/
│   ├── memberships/               # plan-card, plan-form, plan-modal
│   ├── payments/                  # Revenue chart, analytics, receipt dialog
│   ├── providers/                 # Theme injector
│   ├── settings/
│   ├── staff/
│   └── trainers/
└── lib/
    ├── auth-client.ts             # Re-export de @workspace/auth/client
    ├── auth-utils.ts              # Cookie helpers
    ├── hooks/                     # use-auth, use-classes, use-trainers...
    ├── services/                  # members, plans, payments, sessions...
    └── config/                    # envs, constants, display config
```

## Flujos Clave

### Subscription Status Banner
El layout del dashboard verifica el estado de suscripción de la organización via `/api/organizations/subscription-status`:
- `suspended` / `cancelled` → redirect a `/no-subscription`
- `past_due` / `read_only` → muestra `<SubscriptionWarningBanner />`
- `active` → render normal

### Organization Picker
Si no hay `activeOrganizationId` en sesión, se muestra `<OrganizationPicker />`.

### CMS Content
Páginas dinámicas con bloques arrastrables: hero, services, classes_info, testimonials, gallery, contact, team_info.

---

## Deploy

- Configurar `NEXT_PUBLIC_API_BASE_URL` con la URL del API en producción
- Asegurar que el dominio CMS esté en `TRUSTED_ORIGINS` del API
- Se requiere Next.js standalone output (`next.config.mjs` ya configurado)