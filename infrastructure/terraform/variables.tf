variable "cloudflare_api_token" {
  description = "Cloudflare API Token with Workers, R2, and Queues permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "environment" {
  description = "Logical environment name (matches Terraform workspace)"
  type        = string
}

variable "api_worker_name" {
  type    = string
  default = ""
}

variable "jobs_worker_name" {
  type    = string
  default = ""
}

variable "files_bucket_name" {
  type    = string
  default = ""
}

variable "queue_name" {
  type    = string
  default = ""
}

variable "dlq_queue_name" {
  type    = string
  default = ""
}

variable "compatibility_date" {
  type    = string
  default = "2026-07-01"
}

variable "compatibility_flags" {
  type    = list(string)
  default = ["nodejs_compat"]
}

# Secrets
variable "database_url" {
  type      = string
  sensitive = true
}

variable "better_auth_secret" {
  type      = string
  sensitive = true
}

variable "better_auth_url" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "cookie_domain" {
  type    = string
  default = ""
}

variable "upstash_redis_rest_url" {
  type    = string
  default = ""
}

variable "upstash_redis_rest_token" {
  type      = string
  sensitive = true
  default   = ""
}

variable "resend_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "resend_from_email" {
  type    = string
  default = ""
}

variable "email_provider" {
  type    = string
  default = "resend"
}

variable "smtp_user" {
  type    = string
  default = ""
}

variable "smtp_pass" {
  type      = string
  sensitive = true
  default   = ""
}

variable "r2_public_url" {
  type      = string
  sensitive = true
  default   = ""
}

variable "panel_url" {
  type      = string
  sensitive = true
  default   = ""
}

variable "console_url" {
  type      = string
  sensitive = true
  default   = ""
}

