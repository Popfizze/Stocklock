# API: FastAPI container image on Lambda (AWS Lambda Web Adapter) exposed by a public Function URL.
# CORS is handled by FastAPI (CORS_ORIGINS), so the Function URL has no cors block.

data "aws_ecr_repository" "api" {
  name = "${local.name}-api"
}

locals {
  api_function_name = "${local.name}-api"
  cors_origins      = concat(["https://${aws_cloudfront_distribution.frontend.domain_name}"], var.extra_cors_origins)
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "${local.name}-api-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "api" {
  statement {
    sid = "BedrockInvoke"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
      "bedrock:Converse",
      "bedrock:ConverseStream",
    ]
    # Global inference profiles route to foundation models in several regions.
    resources = ["*"]
  }

  statement {
    sid     = "AgentCoreInvoke"
    actions = ["bedrock-agentcore:InvokeAgentRuntime"]
    resources = [
      aws_bedrockagentcore_agent_runtime.narrator.agent_runtime_arn,
      "${aws_bedrockagentcore_agent_runtime.narrator.agent_runtime_arn}/*",
    ]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "bedrock-and-agentcore"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.api_function_name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "api" {
  function_name = local.api_function_name
  description   = "StockLock FastAPI backend"
  role          = aws_iam_role.api.arn
  package_type  = "Image"
  # First deploy only: the deploy-backend workflow then pins each release by commit SHA.
  image_uri                      = "${data.aws_ecr_repository.api.repository_url}:latest"
  architectures                  = ["x86_64"]
  memory_size                    = 2048
  timeout                        = 300
  reserved_concurrent_executions = 10

  environment {
    # AWS_REGION is a reserved variable that Lambda sets by itself.
    variables = {
      BEDROCK_MODEL_ID      = var.bedrock_model_id
      BEDROCK_FAST_MODEL_ID = var.bedrock_fast_model_id
      AGENT_MODE            = var.agent_mode
      AGENTCORE_RUNTIME_ARN = aws_bedrockagentcore_agent_runtime.narrator.agent_runtime_arn
      SEC_USER_AGENT        = var.sec_user_agent
      CORS_ORIGINS          = join(",", local.cors_origins)
      CACHE_DIR             = "/tmp/cache"
    }
  }

  lifecycle {
    ignore_changes = [image_uri]
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_iam_role_policy_attachment.api_logs,
    aws_iam_role_policy.api,
  ]
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
  invoke_mode        = "BUFFERED"
}

# A public Function URL needs both statements since October 2025.
resource "aws_lambda_permission" "api_url" {
  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "api_url_invoke" {
  statement_id             = "FunctionURLAllowInvokeAction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "*"
  invoked_via_function_url = true
}
