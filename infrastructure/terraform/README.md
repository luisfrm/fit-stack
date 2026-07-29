# Fit-Stack Infrastructure (Terraform)

Esta carpeta contiene toda la infraestructura de Cloudflare como código.

## Recursos gestionados

- **Workers** (`api-worker`, `jobs-worker`) con bindings de R2, Queues y plain text.
- **R2 Bucket** para archivos (logos, imágenes CMS, etc.).
- **Queues** para tareas asíncronas (emails, PDFs) y su DLQ.
- **Secrets** de cada worker (DATABASE_URL, BETTER_AUTH_SECRET, etc.).

## Modelo de ambientes

Un solo set de archivos Terraform. Cada ambiente se selecciona en el workflow de GitHub Actions vía `inputs.environment`. Los workflows son **uno solo** y leen las variables según el ambiente.

**Los secrets y variables son nombres simples** (sin prefijo). GitHub ya los aísla por environment, así que `CLOUDFLARE_API_TOKEN` en `production` es distinto de `CLOUDFLARE_API_TOKEN` en `staging`.

Actualmente configurado: **`production`**.

## Prerrequisitos

1. **Bucket R2** `fit-stack-terraform-state` (ya creado).
2. **Access Key/Secret** del bucket (en GitHub Repository secrets).
3. **API Token de Cloudflare** (en GitHub Environment secrets).
4. **Account ID de Cloudflare** (en GitHub Environment secrets).

## Configuración de GitHub

### 1. Crear el environment `production`

Settings > Environments > New environment > `production`.

Marca **"Required reviewers"** y agrégate a ti mismo.

### 2. Configurar Environment secrets (en `production`)

Todos los secrets se configuran **dentro del environment** (no a nivel de repositorio). Nombres simples, sin prefijo:

| Secret | Descripción |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | API Token de Cloudflare |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID de Cloudflare |
| `DATABASE_URL` | URL de Neon Postgres |
| `BETTER_AUTH_URL` | URL pública del API (ej: `https://api.fit-stack.com`) |
| `R2_PUBLIC_URL` | URL pública del bucket R2 |
| `BETTER_AUTH_SECRET` | Secreto de Better Auth |
| `JWT_SECRET` | Secreto JWT |
| `COOKIE_DOMAIN` | Dominio de cookies (ej: `.fit-stack.com`) |
| `UPSTASH_REDIS_REST_URL` | URL de Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Token de Upstash Redis |
| `RESEND_API_KEY` | API Key de Resend |
| `RESEND_FROM_EMAIL` | Email de envío |

### 3. Configurar Environment variables (en `production`)

Solo los nombres de los recursos. No son sensibles:

| Variable | Ejemplo |
|----------|---------|
| `API_WORKER_NAME` | `fit-stack-api` |
| `JOBS_WORKER_NAME` | `fit-stack-jobs` |
| `FILES_BUCKET_NAME` | `fit-stack-files` |
| `QUEUE_NAME` | `fit-task-events` |
| `DLQ_QUEUE_NAME` | `fit-task-events-dlq` |

### 4. Configurar Repository secrets (compartidos)

Estos se usan para acceder al bucket de estado de Terraform. Son **repository secrets** porque solo hay un bucket para todos los environments:

| Secret | Descripción |
|--------|-------------|
| `TFSTATE_R2_ACCOUNT_ID` | Account ID de la cuenta donde está el bucket de estado |
| `TFSTATE_R2_ACCESS_KEY_ID` | R2 access key |
| `TFSTATE_R2_SECRET_ACCESS_KEY` | R2 secret key |

## Uso

### Desde GitHub Actions

1. Ve a **Actions > Terraform > Run workflow**.
2. Selecciona `environment: production` y `action: plan`.
3. Revisa el output.
4. Vuelve a ejecutarlo con `action: apply`.

### Desde local (solo para debug)

```bash
cd infrastructure/terraform

export TF_VAR_cloudflare_api_token="..."
export TF_VAR_cloudflare_account_id="..."
export TF_VAR_api_worker_name="fit-stack-api"
export TF_VAR_jobs_worker_name="fit-stack-jobs"
export TF_VAR_files_bucket_name="fit-stack-files"
export TF_VAR_queue_name="fit-task-events"
export TF_VAR_dlq_queue_name="fit-task-events-dlq"
export TF_VAR_better_auth_url="https://api.fit-stack.com"
# ... resto de variables

export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."

terraform init \
  -backend-config="bucket=fit-stack-terraform-state" \
  -backend-config="key=production/terraform.tfstate" \
  -backend-config="endpoint=https://<TFSTATE_R2_ACCOUNT_ID>.r2.cloudflarestorage.com"

terraform plan
terraform apply
```

## Estado remoto

Cada ambiente tiene su propio path en R2:

- `s3://fit-stack-terraform-state/production/terraform.tfstate`
- `s3://fit-stack-terraform-state/staging/terraform.tfstate`
- `s3://fit-stack-terraform-state/dev/terraform.tfstate`

## Cómo escalar a más ambientes

1. Settings > Environments > New environment (ej: `staging`).
2. Decide si requiere aprobador.
3. En "Environment secrets", agrega los mismos secrets que tiene `production` (con los valores de staging).
4. En "Environment variables", agrega los nombres de los recursos de staging (ej: `API_WORKER_NAME=fit-stack-api-staging`).
5. Ejecuta `terraform.yml` con `environment: staging`.
6. Listo. Los workflows de deploy también lo soportan.

**No necesitas modificar archivos del repo.**

## Cómo desplegar en otra cuenta de Cloudflare

1. Crea la cuenta en Cloudflare.
2. Crea un API Token en esa cuenta.
3. Settings > Environments > New environment (ej: `fitstack`).
4. En ese environment, configura `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` con los valores de la nueva cuenta.
5. Configura el resto de secrets apuntando a esa cuenta.
6. Configura las variables de nombres de recursos.
7. Ejecuta `terraform.yml` con `environment: fitstack`.

**Cero cambios en código.**

## Estructura

```
infrastructure/terraform/
├── backend.tf            # Backend S3 en R2 (endpoint por -backend-config)
├── providers.tf          # Cloudflare provider
├── variables.tf          # Variables
├── main.tf               # Locals
├── workers.tf            # Workers
├── queues.tf             # Colas + DLQ
├── storage.tf            # R2 bucket
├── secrets.tf            # Secrets por worker
├── outputs.tf            # Outputs
├── .gitignore
└── modules/
    ├── worker/
    ├── r2_bucket/
    └── queue/
```
