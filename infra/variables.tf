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

variable "site_basic_auth_b64" {
  description = "base64(\"user:password\") expected by the CloudFront Basic Auth gate (GitHub secret SITE_BASIC_AUTH_B64)."
  type        = string
  sensitive   = true

  validation {
    condition     = nonsensitive(can(regex("^[A-Za-z0-9+/]{4,}={0,2}$", var.site_basic_auth_b64)))
    error_message = "site_basic_auth_b64 must be a non-empty base64 string."
  }
}
