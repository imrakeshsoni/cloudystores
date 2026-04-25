variable "aws_region" {
  default = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment"
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Must be development, staging, or production."
  }
}

variable "db_username" {
  description = "RDS master username"
  sensitive   = true
}

variable "db_password" {
  description = "RDS master password"
  sensitive   = true
}

variable "redis_auth_token" {
  description = "Redis AUTH token"
  sensitive   = true
}

variable "ecr_registry" {
  description = "ECR registry URL (AWS account ID.dkr.ecr.region.amazonaws.com)"
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS"
}
