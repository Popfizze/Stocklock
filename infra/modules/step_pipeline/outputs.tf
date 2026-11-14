output "function_name" {
  description = "Collector Lambda name, or null while the collector code does not exist."
  value       = var.enabled ? aws_lambda_function.collector[0].function_name : null
}

output "function_arn" {
  value = var.enabled ? aws_lambda_function.collector[0].arn : null
}

output "schedule_name" {
  value = var.enabled && var.schedule_enabled ? aws_scheduler_schedule.daily[0].name : null
}

output "data_prefix" {
  value = "s3://${var.data_bucket}/${var.step}/"
}
