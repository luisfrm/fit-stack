resource "cloudflare_queue" "this" {
  account_id = var.account_id
  name       = var.name
}
