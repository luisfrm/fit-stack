module "task_queue" {
  source     = "./modules/queue"
  account_id = var.cloudflare_account_id
  name       = local.queue_name
}

module "dlq_queue" {
  source     = "./modules/queue"
  account_id = var.cloudflare_account_id
  name       = local.dlq_queue_name
}

module "receipt_queue" {
  source     = "./modules/queue"
  account_id = var.cloudflare_account_id
  name       = local.receipt_queue_name
}

module "receipt_dlq_queue" {
  source     = "./modules/queue"
  account_id = var.cloudflare_account_id
  name       = local.receipt_dlq_queue_name
}
