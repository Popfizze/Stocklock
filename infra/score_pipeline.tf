# Score pipeline (step 1): a Step Functions state machine that invokes the score collector Lambda once per
# stage, Bronze -> Silver -> Gold, started daily by EventBridge Scheduler and on demand by the API (Labo).
# Every stage writes under s3://<data bucket>/score/ ; the API reads the gold table and the run records.
#
#   Init -> BronzeTitres -> SilverUnivers -> Bronze (relevés | cours | articles)
#        -> Silver (relevés | cours | événements) -> Gold -> Finalize
#   any failure -> RecordFailure -> Failed

locals {
  score_pipeline_enabled  = fileexists("${local.collectors_source_dir}/score/handler.py")
  score_state_machine     = "${local.name}-score-pipeline"
  score_state_machine_arn = "arn:aws:states:${var.region}:${local.account_id}:stateMachine:${local.score_state_machine}"
  score_execution_arns    = "arn:aws:states:${var.region}:${local.account_id}:execution:${local.score_state_machine}:*"
  score_function_arn      = module.step_pipeline["score"].function_arn

  lambda_retry = [{
    ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
    IntervalSeconds = 5
    MaxAttempts     = 3
    BackoffRate     = 2
  }]
  to_failure = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "RecordFailure" }]

  # One stage of the pipeline: the Lambda gets {"stage", "run"}; the state keeps {"run"} unchanged.
  score_stage = { for stage in ["bronze_titres", "silver_univers", "bronze_releves", "bronze_cours", "bronze_articles", "silver_releves", "silver_cours", "silver_evenements", "gold"] : stage => {
    Type     = "Task"
    Resource = "arn:aws:states:::lambda:invoke"
    Parameters = {
      FunctionName = local.score_function_arn
      Payload      = { stage = stage, "run.$" = "$.run" }
    }
    ResultPath     = null
    TimeoutSeconds = 960
    Retry          = local.lambda_retry
  } }

  score_definition = {
    Comment        = "StockLock score pipeline: Bronze -> Silver -> Gold (table score_par_titre)"
    StartAt        = "Init"
    TimeoutSeconds = 7200
    States = {
      Init = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = local.score_function_arn
          Payload      = { stage = "init", "execution_name.$" = "$$.Execution.Name", "input.$" = "$" }
        }
        ResultSelector = { "run.$" = "$.Payload.run" }
        ResultPath     = "$"
        Retry          = local.lambda_retry
        Catch          = [{ ErrorEquals = ["States.ALL"], Next = "Failed" }]
        Next           = "BronzeTitres"
      }
      BronzeTitres  = merge(local.score_stage["bronze_titres"], { Catch = local.to_failure, Next = "SilverUnivers" })
      SilverUnivers = merge(local.score_stage["silver_univers"], { Catch = local.to_failure, Next = "Bronze" })
      Bronze = {
        Type       = "Parallel"
        ResultPath = null
        Catch      = local.to_failure
        Next       = "Silver"
        Branches = [for stage in ["bronze_releves", "bronze_cours", "bronze_articles"] : {
          StartAt = stage
          States  = { (stage) = merge(local.score_stage[stage], { End = true }) }
        }]
      }
      Silver = {
        Type       = "Parallel"
        ResultPath = null
        Catch      = local.to_failure
        Next       = "Gold"
        Branches = [for stage in ["silver_releves", "silver_cours", "silver_evenements"] : {
          StartAt = stage
          States  = { (stage) = merge(local.score_stage[stage], { End = true }) }
        }]
      }
      Gold = merge(local.score_stage["gold"], { Catch = local.to_failure, Next = "Finalize" })
      Finalize = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = local.score_function_arn
          Payload      = { stage = "finalize", "run.$" = "$.run" }
        }
        ResultSelector = { "summary.$" = "$.Payload.summary" }
        ResultPath     = "$.result"
        Retry          = local.lambda_retry
        End            = true
      }
      RecordFailure = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = local.score_function_arn
          Payload      = { stage = "fail", "run.$" = "$.run", "error.$" = "$.error" }
        }
        ResultPath = null
        Retry      = local.lambda_retry
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "Failed" }]
        Next       = "Failed"
      }
      Failed = { Type = "Fail", Error = "ScorePipelineFailed", Cause = "Une étape du pipeline de score a échoué (voir score/runs/<run_id>.json)." }
    }
  }
}

data "aws_iam_policy_document" "sfn_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "score_pipeline" {
  count              = local.score_pipeline_enabled ? 1 : 0
  name               = local.score_state_machine
  assume_role_policy = data.aws_iam_policy_document.sfn_trust.json
}

resource "aws_iam_role_policy" "score_pipeline" {
  count = local.score_pipeline_enabled ? 1 : 0
  name  = "invoke-score-collector"
  role  = aws_iam_role.score_pipeline[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = [local.score_function_arn, "${local.score_function_arn}:*"]
    }]
  })
}

resource "aws_sfn_state_machine" "score_pipeline" {
  count      = local.score_pipeline_enabled ? 1 : 0
  name       = local.score_state_machine
  role_arn   = aws_iam_role.score_pipeline[0].arn
  type       = "STANDARD"
  definition = jsonencode(local.score_definition)

  depends_on = [aws_iam_role_policy.score_pipeline]
}

# --- Daily run ------------------------------------------------------------------------------------------

data "aws_iam_policy_document" "score_scheduler_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "score_scheduler" {
  count              = local.score_pipeline_enabled ? 1 : 0
  name               = "${local.score_state_machine}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.score_scheduler_trust.json
}

resource "aws_iam_role_policy" "score_scheduler" {
  count = local.score_pipeline_enabled ? 1 : 0
  name  = "start-score-pipeline"
  role  = aws_iam_role.score_scheduler[0].id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "states:StartExecution", Resource = local.score_state_machine_arn }]
  })
}

resource "aws_scheduler_schedule" "score_daily" {
  count                        = local.score_pipeline_enabled ? 1 : 0
  name                         = "${local.score_state_machine}-daily"
  description                  = "Daily run of the score pipeline (gold table score_par_titre)"
  schedule_expression          = "cron(0 6 * * ? *)"
  schedule_expression_timezone = "America/Toronto"

  flexible_time_window {
    mode                      = "FLEXIBLE"
    maximum_window_in_minutes = 15
  }

  target {
    arn      = aws_sfn_state_machine.score_pipeline[0].arn
    role_arn = aws_iam_role.score_scheduler[0].arn
    input    = jsonencode({ params = {}, trigger = "schedule" })

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

output "score_pipeline_state_machine" {
  value = local.score_pipeline_enabled ? aws_sfn_state_machine.score_pipeline[0].arn : null
}
