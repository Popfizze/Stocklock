variable "region" {
  type    = string
  default = "us-east-1"
}

variable "agent_code_key" {
  description = "S3 key of the AgentCore code zip in the artifacts bucket (uploaded by the deploy-infra workflow)."
  type        = string
}

variable "agent_mode" {
  description = "How the API runs the narration agents: in-process ('local') or on the AgentCore runtime ('agentcore')."
  type        = string
  default     = "agentcore"

  validation {
    condition     = contains(["local", "agentcore"], var.agent_mode)
    error_message = "agent_mode must be 'local' or 'agentcore'."
  }
}

variable "bedrock_model_id" {
  type    = string
  default = "global.anthropic.claude-sonnet-5"
}

variable "bedrock_fast_model_id" {
  type    = string
  default = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "sec_user_agent" {
  description = "User-Agent sent to SEC EDGAR (generic on purpose, no personal address)."
  type        = string
  default     = "StockLock datathon research contact@example.com"
}

variable "extra_cors_origins" {
  description = "Origins allowed besides the CloudFront domain (local frontend dev server)."
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "site_password_sha256" {
  description = "Lowercase hex SHA-256 of the site password, expected in the stocklock_access cookie (GitHub secret SITE_PASSWORD_SHA256)."
  type        = string
  sensitive   = true

  validation {
    condition     = nonsensitive(can(regex("^[0-9a-f]{64}$", var.site_password_sha256)))
    error_message = "site_password_sha256 must be a lowercase hex SHA-256 (64 characters)."
  }
}
