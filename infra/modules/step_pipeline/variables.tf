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
