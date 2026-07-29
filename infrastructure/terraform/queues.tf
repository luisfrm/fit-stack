module "task_queue" {
  source     = "./modules/queue"
  account_id = var.cloudflare_account_id
  name       = var.queue_name
}

module "dlq_queue" {
  source     = "./modules/queue"
  account_id = var.cloudflare_account_id
  name       = var.dlq_queue_name
}
