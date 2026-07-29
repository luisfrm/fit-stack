variable "account_id" {
  type = string
}

variable "name" {
  type = string
}

variable "compatibility_date" {
  type = string
}

variable "compatibility_flags" {
  type    = list(string)
  default = []
}

variable "r2_bucket_bindings" {
  type = list(object({
    name        = string
    bucket_name = string
  }))
  default = []
}

variable "queue_producer_bindings" {
  type = list(object({
    name  = string
    queue = string
  }))
  default = []
}

variable "queue_consumer_bindings" {
  type = list(object({
    name              = string
    queue_id          = string
    max_batch_size    = optional(number)
    max_retries       = optional(number)
    dead_letter_queue = optional(string)
  }))
  default = []
}

variable "plain_text_bindings" {
  type    = map(string)
  default = {}
}

variable "secret_text_bindings" {
  type = list(object({
    name = string
    text = string
  }))
  default = []
}
