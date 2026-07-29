module "files_bucket" {
  source     = "./modules/r2_bucket"
  account_id = var.cloudflare_account_id
  name       = var.files_bucket_name
  location   = "ENAM"
}
