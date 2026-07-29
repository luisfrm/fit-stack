resource "cloudflare_workers_script" "this" {
  account_id = var.account_id
  name       = var.name
  content    = "export default { async fetch() { return new Response('placeholder - deployed via wrangler') } }"

  compatibility_date  = var.compatibility_date
  compatibility_flags = var.compatibility_flags

  # Wrangler manages the actual worker code in CI; Terraform only owns
  # the worker configuration (bindings, secrets, metadata).
  lifecycle {
    ignore_changes = [content]
  }

  dynamic "r2_bucket_binding" {
    for_each = var.r2_bucket_bindings
    content {
      name        = r2_bucket_binding.value.name
      bucket_name = r2_bucket_binding.value.bucket_name
    }
  }

  dynamic "queue_binding" {
    for_each = var.queue_producer_bindings
    content {
      binding = queue_binding.value.name
      queue   = queue_binding.value.queue
    }
  }

  dynamic "plain_text_binding" {
    for_each = var.plain_text_bindings
    content {
      name = plain_text_binding.key
      text = plain_text_binding.value
    }
  }
}

resource "cloudflare_workers_queue_consumer" "this" {
  for_each = { for q in var.queue_consumer_bindings : q.name => q }

  account_id  = var.account_id
  queue_id    = each.value.queue
  script_name = cloudflare_workers_script.this.name

  max_batch_size       = each.value.max_batch_size
  max_retries          = each.value.max_retries
  dead_letter_queue    = each.value.dead_letter_queue
}
