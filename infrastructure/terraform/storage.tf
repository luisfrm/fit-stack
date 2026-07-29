module "files_bucket" {
  source     = "./modules/r2_bucket"
  account_id = var.cloudflare_account_id
  name       = local.files_bucket_name
  location   = "ENAM"
}
