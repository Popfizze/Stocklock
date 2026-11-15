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

  # The score pipeline runs one stage per invocation, driven by its state machine (score_pipeline.tf).
  timeout              = each.key == "score" ? 900 : 300
  memory_size          = each.key == "score" ? 3008 : 1024
  ephemeral_storage_mb = each.key == "score" ? 2048 : 512
  schedule_enabled     = each.key != "score"
  extra_env = each.key == "score" ? {
    BEDROCK_FAST_MODEL_ID = var.bedrock_fast_model_id
    CACHE_DIR             = "/tmp/cache"
  } : {}
}

# Raw (bronze) copies of the score pipeline are kept 30 days; silver, gold and run records stay.
resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "expire-score-bronze"
    status = "Enabled"
    filter {
      prefix = "score/bronze/"
    }
    expiration {
      days = 30
    }
  }

  # Cached answers of the stock page (cache/moves/, at most 12 h fresh): removed after 2 days.
  rule {
    id     = "expire-answer-cache"
    status = "Enabled"
    filter {
      prefix = "cache/"
    }
    expiration {
      days = 2
    }
  }
}
