# @workspace/database

Schema Drizzle ORM + cliente Neon Postgres + seeds y migraciones. Contiene las 30 tablas del sistema y scripts de administración de base de datos.

---

## Entry Points

| Import path | Contents |
|-------------|----------|
| `@workspace/database/client` | `db` (Neon serverless) — contexto Next.js / Node |
| `@workspace/database/factory` | `createDb(url)` → instancia Drizzle **por request** (Neon HTTP driver, ideal Cloudflare Workers) + re-export de `drizzle-orm` (`eq`, `and`, `sql`, `desc`, etc.) |
| `@workspace/database/schema` | Todas las tablas + relaciones |
| `@workspace/database/seed` | Script de seed (`tsx src/seed.ts`) |
| `@workspace/database/constants` | `rbac-defaults` (valores por defecto) |

> **Workers**: en `api-worker` se usa siempre `@workspace/database/factory` — el cliente se crea por request con `createDb(c.env.DATABASE_URL)` (no existe `process.env` en Workers).

---

## Tablas (28)

### Better Auth Core
`user`, `session`, `account`, `verification`

### Organization & Membership
`organization` (incluye: slogan, countryCode, timezone, taxId, legalName, address, fiscalConfig, primaryCurrency, currencyFormat), `member` (auth_member — Better Auth plugin), `invitation`

### Platform Billing (SaaS)
`platform_plan` (catalog with features as PlanFeatures), `platform_subscription` (org subscriptions, status computado en SQL), `platform_subscription_payment` (invoices with commercial snapshots), `ai_usage` (AI credits: `credits` + `bonus_credits`)

### Gym Domain
`gym_member` (local profiles, linked to user via userId), `coach_profile` (1:1 extension), `coach_assignment` (coach ↔ client)

### Memberships & Payments
`membership_plan` (gym product catalog), `subscription` (member ↔ plan), `payment` (financial audit trail), `organization_document_sequence` (correlativo por org/año)

### Access Control
`access_control_log` (every access attempt), `biometric_sync_task` (device sync queue)

### AI / RAG
`ai_knowledge_document` (org `NULL` = plataforma), `ai_knowledge_chunk` (pgvector 1024 dims + HNSW)

### Routines (Fitness)
`exercise`, `routine_template`, `routine_template_item`, `workout_session`, `workout_session_log`

### CMS & Web
`gym_class` (class schedule), `content_page` (SEO: metaTitle/metaDescription), `content_block` (blocks by type with display order)

### Settings
`platform_setting`, `gym_setting`, `platform_document_sequence` (correlativo global `FS-N`)

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
- **Sin `pgEnum`**: los estados viven en `text('col')` y se validan con Zod (nunca en la capa DB).

## Migraciones notables

| Migración | Cambio |
|---|---|
| `0016` | Aditiva/nullable, sin backfill: `payment.emitter_snapshot` + `payment.issued_by` (y gemelas en `platform_subscription_payment`) |
| `0017` | Default de `platform_subscription_payment.status` = `'processing'` + normalización `pending → processing` e `invalid → voided` (marca `receipt_voided`/`voided_at`/`void_reason` si había comprobante). Retrocompatible |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon/Postgres connection string |

```bash
cp .env.example .env
```