resource "cloudflare_workers_script" "this" {
  account_id  = var.account_id
  script_name = var.name
  content     = "addEventListener('fetch', event => { event.respondWith(new Response('placeholder - deployed via wrangler')); });"

  compatibility_date  = var.compatibility_date
  compatibility_flags = var.compatibility_flags

  # Wrangler manages the actual worker code in CI; Terraform only owns
  # the worker configuration (bindings, secrets, metadata).
  lifecycle {
    ignore_changes = [content]
  }

  # R2 bucket bindings
  bindings = concat(
    [for b in var.r2_bucket_bindings : {
      name        = b.name
      type        = "r2_bucket"
      bucket_name = b.bucket_name
    }],
    [for b in var.queue_producer_bindings : {
      name       = b.name
      type       = "queue"
      queue_name = b.queue
    }],
    [for k, v in var.plain_text_bindings : {
      name = k
      type = "plain_text"
      text = v
    }],
    [for b in var.secret_text_bindings : {
      name = b.name
      type = "secret_text"
      text = b.text
    }]
  )
}
