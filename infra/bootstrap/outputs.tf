output "region" {
  value = var.region
}

output "deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "artifacts_bucket" {
  value = aws_s3_bucket.artifacts.bucket
}

output "ecr_repository" {
  value = aws_ecr_repository.api.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "github_oidc_subject" {
  value = local.github_sub
}
