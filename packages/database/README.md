# @workspace/database

Schema Drizzle ORM + cliente Neon Postgres + seeds y migraciones. Contiene las 28 tablas del sistema y scripts de administración de base de datos.

---

## Entry Points

| Import path | Contents |
|-------------|----------|
| `@workspace/database/client` | `db` (Neon serverless), `eq`, `and`, `or`, `sql`, `desc`, `count`, `isNull` |
| `@workspace/database/schema` | Todas las tablas + relaciones |
| `@workspace/database/seed` | Script de seed (`tsx src/seed.ts`) |
| `@workspace/database/constants` | `rbac-defaults` (valores por defecto) |

---

## Tablas (28)

### Better Auth Core
`user`, `session`, `account`, `verification`

### Organization & Membership
`organization` (incluye: slogan, countryCode, timezone, taxId, legalName, address, fiscalConfig), `member` (auth_member — Better Auth plugin), `invitation`

### Platform Billing (SaaS)
`fitstack_plan` (catalog with features as PlanFeatures), `store_subscription` (org subscriptions), `platform_payment` (platform invoices)

### Gym Domain
`gym_member` (local profiles, linked to user via userId), `coach_profile` (1:1 extension), `coach_assignment` (coach ↔ client)

### Memberships & Payments
`membership_plan` (gym product catalog), `subscription` (member ↔ plan), `payment` (financial audit trail)

### Access Control
`access_control_log` (every access attempt), `biometric_sync_task` (device sync queue)

### Routines (Fitness)
`exercise`, `routine_template`, `routine_template_item`, `workout_session`, `workout_session_log`

### CMS & Web
`cms_class`, `cms_page`, `cms_page_block`

### Settings
`platform_setting`, `gym_setting`

---

## Comandos (ejecutar desde la raíz del monorepo)

```bash
pnpm db:generate    # Genera migraciones (requiere aprobación explícita)
pnpm db:migrate     # Aplica migraciones
pnpm db:check       # Verifica consistencia schema ↔ migraciones
pnpm db:push        # Push schema directo (SOLO local prototyping)
pnpm db:pull        # Pull schema desde DB (SOLO local)
pnpm db:studio      # Abre Drizzle Studio
pnpm db:seed        # Corre tsx src/seed.ts
```

## Convenciones

- Nombres de tabla en **singular**: `user`, no `users`
- Repositorios y servicios en **plural**: `users.service.ts`
- **Workflow**: `generate` → `review` → `migrate`. Prohibido `db:push` en producción/compartido.
- **Nombres de migración**: auto-generados por Drizzle Kit (`0000_name.sql`)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon/Postgres connection string |

```bash
cp .env.example .env
```