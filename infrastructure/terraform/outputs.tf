output "environment" {
  description = "Logical environment label for this workspace"
  value       = local.environment
}

output "api_worker_name" {
  value = module.api_worker.name
}

output "jobs_worker_name" {
  value = module.jobs_worker.name
}

output "files_bucket_name" {
  value = module.files_bucket.name
}

output "task_queue_name" {
  value = module.task_queue.name
}

output "dlq_queue_name" {
  value = module.dlq_queue.name
}
