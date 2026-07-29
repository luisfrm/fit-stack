resource "cloudflare_r2_bucket" "this" {
  account_id = var.account_id
  name       = var.name
  location   = var.location
}
