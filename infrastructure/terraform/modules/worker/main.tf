resource "cloudflare_workers_script" "this" {
  account_id  = var.account_id
  script_name = var.name
  content     = "export default { async fetch() { return new Response('placeholder - deployed via wrangler') } }"

  compatibility_date  = var.compatibility_date
  compatibility_flags = var.compatibility_flags

  # Wrangler manages the actual worker code in CI; Terraform only owns
  # the worker configuration (bindings, secrets, metadata).
  lifecycle {
    ignore_changes = [content]
  }

  r2_bucket_binding = var.r2_bucket_bindings

  queue_binding = var.queue_producer_bindings

  plain_text_binding = [
    for k, v in var.plain_text_bindings : {
      name = k
      text = v
    }
  ]

  secret_text_binding = var.secret_text_bindings
}

resource "cloudflare_queue_consumer" "this" {
  for_each = { for q in var.queue_consumer_bindings : q.name => q }

  account_id  = var.account_id
  queue_id    = each.value.queue_id
  script_name = cloudflare_workers_script.this.script_name
  type        = "worker"

  dead_letter_queue = each.value.dead_letter_queue

  settings = {
    batch_size  = each.value.max_batch_size
    max_retries = each.value.max_retries
  }
}
