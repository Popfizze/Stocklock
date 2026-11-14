# Data collection for one StockLock step: a zip Lambda run daily by EventBridge Scheduler, writing
# only under "<step>/" in the shared data bucket. Nothing is created until the collector code exists.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  count         = var.enabled ? 1 : 0
  dashed        = replace(var.step, "_", "-")
  function_name = "stocklock-collect-${local.dashed}"
  log_group_arn = "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.function_name}"
}

resource "aws_cloudwatch_log_group" "collector" {
  count             = local.count
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

# --- IAM: this step's S3 prefix only ---------------------------------------------------------------

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "collector" {
  count              = local.count
  name               = local.function_name
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

data "aws_iam_policy_document" "collector" {
  statement {
    sid       = "StepObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.data_bucket_arn}/${var.step}/*"]
  }

  statement {
    sid       = "ListStepPrefix"
    actions   = ["s3:ListBucket"]
    resources = [var.data_bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${var.step}/", "${var.step}/*"]
    }
  }

  statement {
    sid = "BedrockInvoke"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
      "bedrock:Converse",
      "bedrock:ConverseStream",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${local.log_group_arn}:*"]
  }
}

resource "aws_iam_role_policy" "collector" {
  count  = local.count
  name   = "step-${local.dashed}"
  role   = aws_iam_role.collector[0].id
  policy = data.aws_iam_policy_document.collector.json
}

# --- Lambda ---------------------------------------------------------------------------------------

resource "aws_s3_object" "package" {
  count       = local.count
  bucket      = var.artifacts_bucket
  key         = "collectors/${var.step}.zip"
  source      = var.package_file
  source_hash = filemd5(var.package_file)
}

resource "aws_lambda_function" "collector" {
  count            = local.count
  function_name    = local.function_name
  description      = "StockLock daily data collection for the ${var.step} step"
  role             = aws_iam_role.collector[0].arn
  runtime          = "python3.12"
  handler          = "handler.handler"
  architectures    = ["x86_64"]
  s3_bucket        = aws_s3_object.package[0].bucket
  s3_key           = aws_s3_object.package[0].key
  source_code_hash = filebase64sha256(var.package_file)
  memory_size      = var.memory_size
  timeout          = var.timeout

  ephemeral_storage {
    size = var.ephemeral_storage_mb
  }

  environment {
    variables = merge({
      DATA_BUCKET    = var.data_bucket
      STEP           = var.step
      SEC_USER_AGENT = var.sec_user_agent
    }, var.extra_env)
  }

  depends_on = [aws_cloudwatch_log_group.collector, aws_iam_role_policy.collector]
}

# --- Daily schedule -------------------------------------------------------------------------------

data "aws_iam_policy_document" "scheduler_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  count              = var.enabled && var.schedule_enabled ? 1 : 0
  name               = "${local.function_name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_trust.json
}

resource "aws_iam_role_policy" "scheduler" {
  count = var.enabled && var.schedule_enabled ? 1 : 0
  name  = "invoke-${local.dashed}"
  role  = aws_iam_role.scheduler[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.collector[0].arn
    }]
  })
}

# Steps whose collection is orchestrated elsewhere (score: a Step Functions state machine) turn it off.
resource "aws_scheduler_schedule" "daily" {
  count                        = var.enabled && var.schedule_enabled ? 1 : 0
  name                         = local.function_name
  description                  = "Daily data collection for the ${var.step} step"
  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.schedule_timezone

  flexible_time_window {
    mode                      = "FLEXIBLE"
    maximum_window_in_minutes = 15
  }

  target {
    arn      = aws_lambda_function.collector[0].arn
    role_arn = aws_iam_role.scheduler[0].arn
    input    = jsonencode({ source = "schedule", step = var.step })

    retry_policy {
      maximum_retry_attempts = 1
    }
  }
}
