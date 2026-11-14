variable "region" {
  type    = string
  default = "us-east-1"
}

variable "github_owner" {
  type    = string
  default = "Popfizze"
}

variable "github_owner_id" {
  description = "Numeric id of the GitHub owner (gh api users/<owner> --jq .id)."
  type        = string
  default     = "75695460"
}

variable "github_repo" {
  type    = string
  default = "datathon"
}

variable "github_repo_id" {
  description = "Numeric id of the GitHub repository (gh api repos/<owner>/<repo> --jq .id)."
  type        = string
  default     = "1457988409"
}
