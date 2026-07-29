# Note: In Cloudflare Provider v5, standalone `cloudflare_workers_secret` resources were removed.
# Worker secrets are now declared inline via `secret_text_bindings` in `workers.tf`
# using the `secret_text_binding` attribute on `cloudflare_workers_script`.
