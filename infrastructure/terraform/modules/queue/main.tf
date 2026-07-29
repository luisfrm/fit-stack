resource "cloudflare_queue" "this" {
  account_id = var.account_id
  queue_name = var.name
}
