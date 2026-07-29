locals {
  # Logical environment name passed from variables
  environment = var.environment
  env_suffix  = var.environment == "production" ? "prod" : var.environment

  # Compute resource names with fallback if variables are empty
  api_worker_name   = var.api_worker_name != "" ? var.api_worker_name : "fit-stack-api-${local.env_suffix}"
  jobs_worker_name  = var.jobs_worker_name != "" ? var.jobs_worker_name : "fit-stack-jobs-${local.env_suffix}"
  files_bucket_name = var.files_bucket_name != "" ? var.files_bucket_name : "fit-stack-files-${local.env_suffix}"
  queue_name        = var.queue_name != "" ? var.queue_name : "fit-task-events-${local.env_suffix}"
  dlq_queue_name    = var.dlq_queue_name != "" ? var.dlq_queue_name : "fit-task-events-dlq-${local.env_suffix}"
}
