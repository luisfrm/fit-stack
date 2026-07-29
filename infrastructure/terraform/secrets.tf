###############################################################################
# API Worker Secrets
###############################################################################

resource "cloudflare_workers_secret" "api_database_url" {
  account_id  = var.cloudflare_account_id
  script_name = module.api_worker.name
  name        = "DATABASE_URL"
  text        = var.database_url
}

resource "cloudflare_workers_secret" "api_better_auth_secret" {
  account_id  = var.cloudflare_account_id
  script_name = module.api_worker.name
  name        = "BETTER_AUTH_SECRET"
  text        = var.better_auth_secret
}

resource "cloudflare_workers_secret" "api_jwt_secret" {
  account_id  = var.cloudflare_account_id
  script_name = module.api_worker.name
  name        = "JWT_SECRET"
  text        = var.jwt_secret
}

resource "cloudflare_workers_secret" "api_cookie_domain" {
  count        = var.cookie_domain != "" ? 1 : 0
  account_id   = var.cloudflare_account_id
  script_name  = module.api_worker.name
  name         = "COOKIE_DOMAIN"
  text         = var.cookie_domain
}

resource "cloudflare_workers_secret" "api_upstash_url" {
  count        = var.upstash_redis_rest_url != "" ? 1 : 0
  account_id   = var.cloudflare_account_id
  script_name  = module.api_worker.name
  name         = "UPSTASH_REDIS_REST_URL"
  text         = var.upstash_redis_rest_url
}

resource "cloudflare_workers_secret" "api_upstash_token" {
  count        = var.upstash_redis_rest_token != "" ? 1 : 0
  account_id   = var.cloudflare_account_id
  script_name  = module.api_worker.name
  name         = "UPSTASH_REDIS_REST_TOKEN"
  text         = var.upstash_redis_rest_token
}

resource "cloudflare_workers_secret" "api_resend_key" {
  count        = var.resend_api_key != "" ? 1 : 0
  account_id   = var.cloudflare_account_id
  script_name  = module.api_worker.name
  name         = "RESEND_API_KEY"
  text         = var.resend_api_key
}

resource "cloudflare_workers_secret" "api_resend_from" {
  count        = var.resend_from_email != "" ? 1 : 0
  account_id   = var.cloudflare_account_id
  script_name  = module.api_worker.name
  name         = "RESEND_FROM_EMAIL"
  text         = var.resend_from_email
}

###############################################################################
# Jobs Worker Secrets
###############################################################################

resource "cloudflare_workers_secret" "jobs_database_url" {
  account_id  = var.cloudflare_account_id
  script_name = module.jobs_worker.name
  name        = "DATABASE_URL"
  text        = var.database_url
}

resource "cloudflare_workers_secret" "jobs_email_provider" {
  count        = var.email_provider != "" ? 1 : 0
  account_id   = var.cloudflare_account_id
  script_name  = module.jobs_worker.name
  name         = "EMAIL_PROVIDER"
  text         = var.email_provider
}

resource "cloudflare_workers_secret" "jobs_resend_key" {
  count        = var.resend_api_key != "" ? 1 : 0
  account_id   = var.cloudflare_account_id
  script_name  = module.jobs_worker.name
  name         = "RESEND_API_KEY"
  text         = var.resend_api_key
}

resource "cloudflare_workers_secret" "jobs_resend_from" {
  count        = var.resend_from_email != "" ? 1 : 0
  account_id   = var.cloudflare_account_id
  script_name  = module.jobs_worker.name
  name         = "RESEND_FROM_EMAIL"
  text         = var.resend_from_email
}

resource "cloudflare_workers_secret" "jobs_smtp_user" {
  count        = var.smtp_user != "" ? 1 : 0
  account_id   = var.cloudflare_account_id
  script_name  = module.jobs_worker.name
  name         = "SMTP_USER"
  text         = var.smtp_user
}

resource "cloudflare_workers_secret" "jobs_smtp_pass" {
  count        = var.smtp_pass != "" ? 1 : 0
  account_id   = var.cloudflare_account_id
  script_name  = module.jobs_worker.name
  name         = "SMTP_PASS"
  text         = var.smtp_pass
}
