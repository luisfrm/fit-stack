# Fit-Stack Infrastructure & Deployment Guide

Este documento detalla la arquitectura de infraestructura, aprovisionamiento y estrategias de despliegue para el ecosistema **Fit-Stack**.

---

## 1. Visión General de la Arquitectura

```
                        ┌─────────────────────────────────────────┐
                        │            Usuarios / Clients           │
                        └────────────────────┬────────────────────┘
                                             │
                       ┌─────────────────────┼─────────────────────┐
                       │                     │                     │
                       ▼                     ▼                     ▼
              ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
              │   apps/panel    │   │    apps/web     │   │  apps/console   │
              │  (Gym Manager)  │   │ (Member Portal) │   │ (Platform SaaS) │
              └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
                       │                     │                     │
                       └─────────────────────┼─────────────────────┘
                                             │  (Vercel - Manual Deploy)
                                             ▼
                                 ┌───────────────────────┐
                                 │   apps/api-worker     │
                                 │  (Cloudflare Worker)  │
                                 └───────────┬───────────┘
                                             │
                   ┌─────────────────────────┼─────────────────────────┐
                   │                         │                         │
                   ▼                         ▼                         ▼
        ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
        │   Neon Postgres  │      │  Upstash Redis   │      │ Cloudflare Queues│
        │ (Drizzle Database│      │  (Cache Serverless)     │ (fit-task-events)│
        └──────────────────┘      └──────────────────┘      └────────┬─────────┘
                                                                     │
                                                                     ▼
                                                         ┌───────────────────────┐
                                                         │   apps/jobs-worker    │
                                                         │  (Cloudflare Worker)  │
                                                         └───────────────────────┘
```

### Componentes y Proveedores

| Componente | Tipo | Hosting / Proveedor | Estrategia de Deploy |
|------------|------|---------------------|----------------------|
| **`apps/api-worker`** | Worker (Hono API) | Cloudflare Workers | Automatizado / manual vía GitHub Actions + Wrangler |
| **`apps/jobs-worker`** | Worker (Queues Consumer) | Cloudflare Workers | Automatizado / manual vía GitHub Actions + Wrangler |
| **`apps/panel`** | Next.js 16 (Gym CMS) | Vercel | Manual (Vercel Dashboard / Vercel CLI) |
| **`apps/web`** | Next.js 16 (Member Portal) | Vercel | Manual (Vercel Dashboard / Vercel CLI) |
| **`apps/console`** | Next.js 16 (SaaS Admin) | Vercel | Manual (Vercel Dashboard / Vercel CLI) |
| **`apps/bridge`** | Desktop (Python/Flet) | Local en Gimnasio | Ejecución local vía `uv` |
| **Base de Datos** | Serverless Postgres | Neon | Migraciones vía GitHub Actions / Drizzle |
| **Cache & KV** | Redis Serverless | Upstash | Administrado vía REST |
| **Storage (R2)** | Object Storage | Cloudflare R2 | Aprovisionado vía Terraform |
| **Infraestructura** | IaC (S3 Backend) | Terraform + R2 Backend | GitHub Actions (`terraform.yml`) |

---

## 2. Aprovisionamiento de Infraestructura con Terraform

Toda la infraestructura básica en Cloudflare (Buckets R2, Queues y Workers) se gestiona declarativamente mediante **Terraform**.

- **Ubicación del Código**: [`infrastructure/terraform/`](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/infrastructure/terraform/)
- **Proveedor**: `cloudflare/cloudflare ~> 5.0`
- **Estado Remoto (Backend)**: Bucket R2 de Cloudflare usando la API compatible con S3 (`fit-stack-terraform-state`).

### Estructura de Terraform

```
infrastructure/terraform/
├── backend.tf            # Configuración del backend S3 en R2
├── providers.tf          # Configuración del provider cloudflare/cloudflare
├── main.tf               # Variables locales por entorno
├── variables.tf          # Declaración de variables globales y secretos
├── outputs.tf            # Salidas de recursos aprovisionados
├── workers.tf            # Invocación de módulos para api-worker y jobs-worker
├── queues.tf             # Invocación de módulos para task_queue y dlq_queue
├── storage.tf            # Invocación del módulo de R2 (files_bucket)
└── modules/
    ├── worker/           # Módulo para scripts Worker y consumidores de colas
    ├── queue/            # Módulo para Cloudflare Queues
    └── r2_bucket/        # Módulo para buckets R2
```

### Ejecución de Terraform vía GitHub Actions

El flujo de trabajo [`.github/workflows/terraform.yml`](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/.github/workflows/terraform.yml) permite ejecutar `plan` y `apply` de manera controlada por entorno:

1. Ve a **GitHub Actions** → **Terraform**.
2. Haz clic en **Run workflow**.
3. Selecciona:
   - **Target environment**: `production`, `staging`, o `dev`.
   - **Action**: `plan` (para previsualizar) o `apply` (para aplicar cambios).

---

## 3. Despliegue de Backend & Workers (Cloudflare / Wrangler)

Los Workers (`api-worker` y `jobs-worker`) son desplegados en Cloudflare utilizando **Wrangler** con soporte nativo de entornos (`"env"`).

### Configuración Multi-Entorno (`wrangler.jsonc`)

Cada Worker define las configuraciones específicas de cada entorno (`dev`, `staging`, `production`) en su archivo `wrangler.jsonc`:

- **[`apps/api-worker/wrangler.jsonc`](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/apps/api-worker/wrangler.jsonc)**
- **[`apps/jobs-worker/wrangler.jsonc`](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/apps/jobs-worker/wrangler.jsonc)**

Ejemplo de mapeo de entornos en `wrangler.jsonc`:
```jsonc
{
  "name": "fit-stack-api",
  "env": {
    "dev": {
      "name": "fit-stack-api-dev",
      "r2_buckets": [{ "binding": "FILES_BUCKET", "bucket_name": "fit-stack-files-dev" }],
      "queues": { "producers": [{ "binding": "TASK_QUEUE", "queue": "fit-task-events-dev" }] }
    },
    "staging": {
      "name": "fit-stack-api-staging",
      "r2_buckets": [{ "binding": "FILES_BUCKET", "bucket_name": "fit-stack-files-staging" }],
      "queues": { "producers": [{ "binding": "TASK_QUEUE", "queue": "fit-task-events-staging" }] }
    },
    "production": {
      "name": "fit-stack-api-production",
      "r2_buckets": [{ "binding": "FILES_BUCKET", "bucket_name": "fit-stack-files-prod" }],
      "queues": { "producers": [{ "binding": "TASK_QUEUE", "queue": "fit-task-events-prod" }] }
    }
  }
}
```

### Despliegue Automático mediante GitHub Actions

- **API Worker**: [`.github/workflows/deploy-api-worker.yml`](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/.github/workflows/deploy-api-worker.yml)
- **Jobs Worker**: [`.github/workflows/deploy-jobs-worker.yml`](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/.github/workflows/deploy-jobs-worker.yml)

**Despliegue Automático**:
- Al hacer push a la rama `master` → despliega automáticamente al entorno `production`.
- Al hacer push a la rama `develop` → despliega automáticamente al entorno `dev`.

**Despliegue Manual (`workflow_dispatch`)**:
- Puedes desencadenar el despliegue manualmente desde GitHub Actions eligiendo el entorno de destino (`production`, `staging`, `dev`).

---

## 4. Despliegue de Aplicaciones Frontend (Vercel - Manual)

Las tres aplicaciones frontend Next.js 16 se despliegan **manualmente en Vercel**:

1. **`apps/panel`**: Panel de Administración para Gimnasios (`panel.luisrivas.site`).
2. **`apps/web`**: Portal Público de Miembros (`luisrivas.site` / subdominios).
3. **`apps/console`**: Panel SaaS Super-Admin (`console.luisrivas.site`).

### Pasos para Desplegar manualmente en Vercel

#### Método 1: Desde la Consola (Vercel CLI)

1. Instala Vercel CLI globalmente si no lo tienes:
   ```bash
   pnpm add -g vercel
   ```
2. Para desplegar **Panel**:
   ```bash
   cd apps/panel
   vercel --prod
   ```
3. Para desplegar **Web**:
   ```bash
   cd apps/web
   vercel --prod
   ```
4. Para desplegar **Console**:
   ```bash
   cd apps/console
   vercel --prod
   ```

#### Método 2: Desde el Dashboard de Vercel (Git Integration)

1. Crea una nueva aplicación en [Vercel Dashboard](https://vercel.com).
2. Vincula el repositorio de GitHub `fit-stack`.
3. Configura la **Root Directory**:
   - Para Panel: `apps/panel`
   - Para Web: `apps/web`
   - Para Console: `apps/console`
4. Selecciona el Framework Preset: **Next.js**.

### Variables de Entorno Requeridas en Vercel

#### Para `apps/panel`, `apps/console` y `apps/web`:
```env
NEXT_PUBLIC_API_BASE_URL=https://api.luisrivas.site
NEXT_PUBLIC_R2_URL=https://api.luisrivas.site/api/public/files
NEXT_PUBLIC_EXCHANGE_URL=https://open.er-api.com/v6/latest   # opcional (default en código)
```

---

## 5. Migraciones de Base de Datos (Neon Postgres + Drizzle ORM)

Las migraciones de base de datos se gestionan mediante **Drizzle ORM** (`@workspace/database`).

### Ejecución Automática (CI/CD)

El flujo de trabajo [`.github/workflows/database-migrations.yml`](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/.github/workflows/database-migrations.yml) ejecuta `pnpm db:migrate` automáticamente cuando se detectan cambios en `packages/database/src/schema/**` o mediante `workflow_dispatch`.

### Comandos Locales / Desarrollo

```bash
# Generar una nueva migración tras cambiar el schema
pnpm db:generate

# Aplicar migraciones pendientes (requiere aprobación en ramas compartidas)
pnpm db:migrate

# Abrir Drizzle Studio para explorar la base de datos visualmente
pnpm db:studio
```

---

## 6. Resumen de Dominios y CORS

Los dominios de producción y políticas CORS están unificados en [`apps/api-worker/src/index.ts`](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/apps/api-worker/src/index.ts) y en la configuración de la API:

| Entorno | Dominio API | Dominios Frontend Permitidos (CORS) |
|---------|-------------|-------------------------------------|
| **Development** | `http://localhost:8788` | `http://localhost:3001` (panel), `http://localhost:3002` (web), `http://localhost:3003` (console) |
| **Production** | `https://api.luisrivas.site` | `https://panel.luisrivas.site`, `https://console.luisrivas.site`, `https://luisrivas.site`, `https://*.luisrivas.site` |
