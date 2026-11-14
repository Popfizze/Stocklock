variable "step" {
  description = "Step id as used in the code: score, explain_move, tax or bias."
  type        = string
}

variable "enabled" {
  description = "True when backend/collectors/<step>/handler.py exists."
  type        = bool
}

variable "package_file" {
  description = "Path of the collector zip built by infra/scripts/build-collectors.sh."
  type        = string
}

variable "data_bucket" {
  type = string
}

variable "data_bucket_arn" {
  type = string
}

variable "artifacts_bucket" {
  type = string
}

variable "sec_user_agent" {
  type = string
}

variable "schedule_expression" {
  type    = string
  default = "cron(0 6 * * ? *)"
}

variable "schedule_timezone" {
  type    = string
  default = "America/Toronto"
}

variable "memory_size" {
  type    = number
  default = 1024
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "timeout" {
  description = "Lambda timeout in seconds (900 at most)."
  type        = number
  default     = 300
}

variable "ephemeral_storage_mb" {
  type    = number
  default = 512
}

variable "schedule_enabled" {
  description = "Whether EventBridge Scheduler invokes the Lambda daily (off when a state machine drives it)."
  type        = bool
  default     = true
}

variable "extra_env" {
  description = "Extra environment variables of the collector Lambda."
  type        = map(string)
  default     = {}
}
