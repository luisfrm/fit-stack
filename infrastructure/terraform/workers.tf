module "api_worker" {
  source              = "./modules/worker"
  account_id          = var.cloudflare_account_id
  name                = local.api_worker_name
  compatibility_date  = var.compatibility_date
  compatibility_flags = var.compatibility_flags

  r2_bucket_bindings = [
    {
      name        = "FILES_BUCKET"
      bucket_name = module.files_bucket.name
    }
  ]

  queue_producer_bindings = [
    {
      name  = "TASK_QUEUE"
      queue = module.task_queue.name
    },
    {
      name  = "RECEIPT_QUEUE"
      queue = module.receipt_queue.name
    }
  ]

  plain_text_bindings = {}

  secret_text_bindings = concat(
    [
      { name = "DATABASE_URL", text = var.database_url },
      { name = "BETTER_AUTH_SECRET", text = var.better_auth_secret },
      { name = "BETTER_AUTH_URL", text = var.better_auth_url },
      { name = "JWT_SECRET", text = var.jwt_secret },
      { name = "CLOUDFLARE_ACCOUNT_ID", text = var.cloudflare_account_id },
      { name = "CLOUDFLARE_AI_API_TOKEN", text = var.cloudflare_ai_api_token }
    ],
    var.r2_public_url != "" ? [{ name = "R2_PUBLIC_URL", text = var.r2_public_url }] : [],
    var.cookie_domain != "" ? [{ name = "COOKIE_DOMAIN", text = var.cookie_domain }] : [],
    var.panel_url != "" ? [{ name = "PANEL_URL", text = var.panel_url }] : [],
    var.console_url != "" ? [{ name = "CONSOLE_URL", text = var.console_url }] : [],
    var.upstash_redis_rest_url != "" ? [{ name = "UPSTASH_REDIS_REST_URL", text = var.upstash_redis_rest_url }] : [],
    var.upstash_redis_rest_token != "" ? [{ name = "UPSTASH_REDIS_REST_TOKEN", text = var.upstash_redis_rest_token }] : [],
    var.resend_api_key != "" ? [{ name = "RESEND_API_KEY", text = var.resend_api_key }] : [],
    var.resend_from_email != "" ? [{ name = "RESEND_FROM_EMAIL", text = var.resend_from_email }] : [],
    var.ai_gateway_url != "" ? [{ name = "AI_GATEWAY_URL", text = var.ai_gateway_url }] : [],
    var.openrouter_api_key != "" ? [{ name = "OPENROUTER_API_KEY", text = var.openrouter_api_key }] : []
  )
}

module "jobs_worker" {
  source              = "./modules/worker"
  account_id          = var.cloudflare_account_id
  name                = local.jobs_worker_name
  compatibility_date  = var.compatibility_date
  compatibility_flags = var.compatibility_flags

  r2_bucket_bindings = [
    {
      name        = "FILES_BUCKET"
      bucket_name = module.files_bucket.name
    }
  ]

  queue_producer_bindings = [
    {
      name  = "TASK_QUEUE"
      queue = module.task_queue.name
    },
    {
      name  = "RECEIPT_QUEUE"
      queue = module.receipt_queue.name
    }
  ]

  secret_text_bindings = concat(
    [
      { name = "DATABASE_URL", text = var.database_url }
    ],
    var.panel_url != "" ? [{ name = "PANEL_URL", text = var.panel_url }] : [],
    var.console_url != "" ? [{ name = "CONSOLE_URL", text = var.console_url }] : [],
    var.email_provider != "" ? [{ name = "EMAIL_PROVIDER", text = var.email_provider }] : [],
    var.resend_api_key != "" ? [{ name = "RESEND_API_KEY", text = var.resend_api_key }] : [],
    var.resend_from_email != "" ? [{ name = "RESEND_FROM_EMAIL", text = var.resend_from_email }] : [],
    var.smtp_user != "" ? [{ name = "SMTP_USER", text = var.smtp_user }] : [],
    var.smtp_pass != "" ? [{ name = "SMTP_PASS", text = var.smtp_pass }] : []
  )
}

# Consumer de fit-receipt-events en jobs-worker (una cola = un consumer).
# Terraform es el DUEÑO ÚNICO de consumers/cron en cloud; el wrangler.jsonc de
# jobs-worker NO declara `queues.consumers` ni `triggers` (solo producers) para
# que `wrangler deploy` no compita con el estado. `wrangler dev` local no
# necesita consumer/cron declarados para funcionar.
resource "cloudflare_queue_consumer" "receipt" {
  account_id  = var.cloudflare_account_id
  queue_id    = module.receipt_queue.id
  script_name = module.jobs_worker.name
  type        = "worker"

  settings = {
    batch_size  = 10
    max_retries = 3
  }

  dead_letter_queue = module.receipt_dlq_queue.name
}

# Barrido cada 10 horas (pre-venta; bajar a `*/10 * * * *` con clientes reales
# — ver docs/PENDING.md): `scheduled()` en jobs-worker re-encola renders pendientes.
resource "cloudflare_workers_cron_trigger" "jobs_sweep" {
  account_id  = var.cloudflare_account_id
  script_name = module.jobs_worker.name
  schedules = [
    {
      cron = "0 */10 * * *"
    }
  ]
}

# Consumer de fit-task-events (emails) en jobs-worker. Terraform es dueño único
# de consumers/cron; el wrangler.jsonc de jobs-worker solo declara producers.
resource "cloudflare_queue_consumer" "task" {
  account_id  = var.cloudflare_account_id
  queue_id    = module.task_queue.id
  script_name = module.jobs_worker.name
  type        = "worker"

  settings = {
    batch_size  = 10
    max_retries = 3
  }

  dead_letter_queue = module.dlq_queue.name
}
