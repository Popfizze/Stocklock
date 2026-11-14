output "frontend_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "api_url" {
  description = "Function URL without the trailing slash (value of VITE_API_BASE_URL)."
  value       = trimsuffix(aws_lambda_function_url.api.function_url, "/")
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "agent_runtime_arn" {
  value = aws_bedrockagentcore_agent_runtime.narrator.agent_runtime_arn
}

output "agent_mode" {
  value = var.agent_mode
}
