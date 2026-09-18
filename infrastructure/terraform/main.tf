# Nombres de recursos DERIVADOS: nombre fijo + sufijo de ambiente (producción sin
# sufijo). NO hay variables de override: la paridad con los `wrangler.jsonc` de
# `apps/*` es 1:1 y cambiar un nombre exige tocar ambos lados en el mismo PR.
# La verificación automática vive en `scripts/check-name-parity.mjs` (CI).
locals {
  # Logical environment name passed from variables
  environment = var.environment
  env_suffix  = var.environment == "production" ? "" : "-${var.environment}"

  api_worker_name        = "fit-stack-api${local.env_suffix}"
  jobs_worker_name       = "fit-stack-jobs${local.env_suffix}"
  files_bucket_name      = "fit-stack-files${local.env_suffix}"
  queue_name             = "fit-task-events${local.env_suffix}"
  dlq_queue_name         = "fit-task-events-dlq${local.env_suffix}"
  receipt_queue_name     = "fit-receipt-events${local.env_suffix}"
  receipt_dlq_queue_name = "fit-receipt-events-dlq${local.env_suffix}"
}
