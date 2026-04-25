output "alb_dns_name" {
  description = "ALB DNS name — point Route53 wildcard here"
  value       = aws_lb.main.dns_name
}

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint for DATABASE_URL"
  value       = aws_db_proxy.main.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis primary endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "s3_assets_bucket" {
  description = "S3 bucket for assets"
  value       = aws_s3_bucket.assets.bucket
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}
