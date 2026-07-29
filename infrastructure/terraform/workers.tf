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
      queue             = module.task_queue.name
      max_batch_size    = 10
      max_retries       = 3
      dead_letter_queue = module.dlq_queue.name
    }
  ]
}
