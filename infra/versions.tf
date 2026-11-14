terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.22"
    }
  }

  # Bucket created by infra/bootstrap. Locking uses S3 native lock files (no DynamoDB table).
  backend "s3" {
    bucket       = "stocklock-tfstate-010438466625"
    key          = "stocklock/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "stocklock"
      ManagedBy = "terraform"
      Stack     = "app"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  name       = "stocklock"
}
