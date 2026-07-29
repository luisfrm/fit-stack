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
