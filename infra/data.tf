# Shared data bucket (one prefix per step: <step>/raw/, <step>/curated/, <step>/traces/) and the
# per-step collection pipelines.

resource "aws_s3_bucket" "data" {
  bucket        = "${local.name}-data-${local.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

locals {
  steps                 = ["score", "explain_move", "tax", "bias"]
  collectors_source_dir = "${path.root}/../backend/collectors"
  # Written by infra/scripts/build-collectors.sh (gitignored build/ folder at the repo root).
  collectors_build_dir = "${path.root}/../build/collectors"
}

module "step_pipeline" {
  source   = "./modules/step_pipeline"
  for_each = toset(local.steps)

  step             = each.key
  enabled          = fileexists("${local.collectors_source_dir}/${each.key}/handler.py")
  package_file     = "${local.collectors_build_dir}/${each.key}.zip"
  data_bucket      = aws_s3_bucket.data.bucket
  data_bucket_arn  = aws_s3_bucket.data.arn
  artifacts_bucket = data.aws_s3_bucket.artifacts.bucket
  sec_user_agent   = var.sec_user_agent
}
