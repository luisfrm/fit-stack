module "api_worker" {
  source              = "./modules/worker"
  account_id          = var.cloudflare_account_id
  name                = var.api_worker_name
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
    }
  ]

  plain_text_bindings = {
    BETTER_AUTH_URL = var.better_auth_url
    R2_PUBLIC_URL   = var.r2_public_url
  }

  secret_text_bindings = concat(
    [
      { name = "DATABASE_URL", text = var.database_url },
      { name = "BETTER_AUTH_SECRET", text = var.better_auth_secret },
      { name = "JWT_SECRET", text = var.jwt_secret }
    ],
    var.cookie_domain != "" ? [{ name = "COOKIE_DOMAIN", text = var.cookie_domain }] : [],
    var.upstash_redis_rest_url != "" ? [{ name = "UPSTASH_REDIS_REST_URL", text = var.upstash_redis_rest_url }] : [],
    var.upstash_redis_rest_token != "" ? [{ name = "UPSTASH_REDIS_REST_TOKEN", text = var.upstash_redis_rest_token }] : [],
    var.resend_api_key != "" ? [{ name = "RESEND_API_KEY", text = var.resend_api_key }] : [],
    var.resend_from_email != "" ? [{ name = "RESEND_FROM_EMAIL", text = var.resend_from_email }] : []
  )
}

module "jobs_worker" {
  source              = "./modules/worker"
  account_id          = var.cloudflare_account_id
  name                = var.jobs_worker_name
  compatibility_date  = var.compatibility_date
  compatibility_flags = var.compatibility_flags

  r2_bucket_bindings = [
    {
      name        = "FILES_BUCKET"
      bucket_name = module.files_bucket.name
    }
  ]

  queue_consumer_bindings = [
    {
      name              = "TASK_QUEUE"
      queue_id          = module.task_queue.id
      max_batch_size    = 10
      max_retries       = 3
      dead_letter_queue = module.dlq_queue.name
    }
  ]

  secret_text_bindings = concat(
    [
      { name = "DATABASE_URL", text = var.database_url }
    ],
    var.email_provider != "" ? [{ name = "EMAIL_PROVIDER", text = var.email_provider }] : [],
    var.resend_api_key != "" ? [{ name = "RESEND_API_KEY", text = var.resend_api_key }] : [],
    var.resend_from_email != "" ? [{ name = "RESEND_FROM_EMAIL", text = var.resend_from_email }] : [],
    var.smtp_user != "" ? [{ name = "SMTP_USER", text = var.smtp_user }] : [],
    var.smtp_pass != "" ? [{ name = "SMTP_PASS", text = var.smtp_pass }] : []
  )
}
