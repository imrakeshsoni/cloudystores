terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "shoposphere-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "shoposphere-tf-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "shoposphere"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ─────────────────────────────────────────────────────────────
# VPC
# ─────────────────────────────────────────────────────────────

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "shoposphere-${var.environment}"
  cidr = "10.0.0.0/16"

  azs             = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = var.environment == "production" ? false : true
  one_nat_gateway_per_az = var.environment == "production"

  enable_dns_hostnames = true
  enable_dns_support   = true
}

# ─────────────────────────────────────────────────────────────
# SECURITY GROUPS
# ─────────────────────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name        = "shoposphere-alb-${var.environment}"
  description = "Allow HTTP/S from internet"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name        = "shoposphere-ecs-${var.environment}"
  description = "Allow traffic from ALB to ECS services"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  # Allow inter-service communication
  ingress {
    from_port = 0
    to_port   = 65535
    protocol  = "tcp"
    self      = true
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name        = "shoposphere-rds-${var.environment}"
  description = "Allow PostgreSQL from ECS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
}

resource "aws_security_group" "redis" {
  name        = "shoposphere-redis-${var.environment}"
  description = "Allow Redis from ECS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
}

# ─────────────────────────────────────────────────────────────
# RDS Aurora PostgreSQL (Serverless v2)
# ─────────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "shoposphere-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_rds_cluster" "postgres" {
  cluster_identifier     = "shoposphere-${var.environment}"
  engine                 = "aurora-postgresql"
  engine_version         = "15.4"
  database_name          = "shoposphere"
  master_username        = var.db_username
  master_password        = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period         = var.environment == "production" ? 7 : 1
  preferred_backup_window         = "02:00-03:00"
  preferred_maintenance_window    = "Mon:03:00-Mon:04:00"
  deletion_protection             = var.environment == "production"
  storage_encrypted               = true
  skip_final_snapshot             = var.environment != "production"
  final_snapshot_identifier       = var.environment == "production" ? "shoposphere-final-${var.environment}" : null

  serverlessv2_scaling_configuration {
    min_capacity = var.environment == "production" ? 1.0 : 0.5
    max_capacity = var.environment == "production" ? 64.0 : 4.0
  }

  enabled_cloudwatch_logs_exports = ["postgresql"]
}

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "shoposphere-${var.environment}-writer"
  cluster_identifier = aws_rds_cluster.postgres.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.postgres.engine
  engine_version     = aws_rds_cluster.postgres.engine_version
}

resource "aws_rds_cluster_instance" "reader" {
  count              = var.environment == "production" ? 2 : 0
  identifier         = "shoposphere-${var.environment}-reader-${count.index}"
  cluster_identifier = aws_rds_cluster.postgres.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.postgres.engine
  engine_version     = aws_rds_cluster.postgres.engine_version
}

# RDS Proxy — connection pooling (critical for ECS/Lambda scale)
resource "aws_db_proxy" "main" {
  name                   = "shoposphere-proxy-${var.environment}"
  debug_logging          = false
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_security_group_ids = [aws_security_group.rds.id]
  vpc_subnet_ids         = module.vpc.private_subnets

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.db.arn
  }
}

resource "aws_db_proxy_default_target_group" "main" {
  db_proxy_name = aws_db_proxy.main.name
  connection_pool_config {
    max_connections_percent      = 90
    max_idle_connections_percent = 50
  }
}

resource "aws_db_proxy_target" "main" {
  db_cluster_identifier = aws_rds_cluster.postgres.id
  db_proxy_name         = aws_db_proxy.main.name
  target_group_name     = aws_db_proxy_default_target_group.main.name
}

# ─────────────────────────────────────────────────────────────
# ELASTICACHE REDIS
# ─────────────────────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "main" {
  name       = "shoposphere-redis-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "shoposphere-${var.environment}"
  description                = "Redis for ShopOS caching and sessions"
  node_type                  = var.environment == "production" ? "cache.r7g.large" : "cache.t4g.micro"
  num_cache_clusters         = var.environment == "production" ? 3 : 1
  automatic_failover_enabled = var.environment == "production"
  multi_az_enabled           = var.environment == "production"
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token
  engine_version             = "7.0"
  port                       = 6379
}

# ─────────────────────────────────────────────────────────────
# S3 BUCKETS
# ─────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "assets" {
  bucket        = "shoposphere-assets-${var.environment}"
  force_destroy = var.environment != "production"
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "archive-old-invoices"
    status = "Enabled"
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }
}

# ─────────────────────────────────────────────────────────────
# ECS CLUSTER
# ─────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "shoposphere-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# ─────────────────────────────────────────────────────────────
# ALB
# ─────────────────────────────────────────────────────────────

resource "aws_lb" "main" {
  name               = "shoposphere-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
  enable_deletion_protection = var.environment == "production"
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ALB routing rules — route /v1/auth/* → auth-service, etc.
resource "aws_lb_listener_rule" "auth_api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  condition {
    path_pattern { values = ["/v1/auth/*"] }
  }
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["auth-service"].arn
  }
}

resource "aws_lb_listener_rule" "core_api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  condition {
    path_pattern { values = ["/v1/products/*", "/v1/inventory/*", "/v1/categories/*", "/v1/customers/*", "/v1/suppliers/*"] }
  }
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["core-api"].arn
  }
}

resource "aws_lb_listener_rule" "orders_api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 30

  condition {
    path_pattern { values = ["/v1/orders/*"] }
  }
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["order-service"].arn
  }
}

resource "aws_lb_listener_rule" "reports_api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 40

  condition {
    path_pattern { values = ["/v1/reports/*"] }
  }
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["report-service"].arn
  }
}

# ─────────────────────────────────────────────────────────────
# ECS SERVICES (one per microservice)
# ─────────────────────────────────────────────────────────────

locals {
  services = {
    "auth-service"    = { port = 3001, desired = 2, cpu = 512,  memory = 1024 }
    "tenant-service"  = { port = 3002, desired = 1, cpu = 512,  memory = 1024 }
    "core-api"        = { port = 3003, desired = 2, cpu = 1024, memory = 2048 }
    "order-service"   = { port = 3007, desired = 2, cpu = 1024, memory = 2048 }
    "report-service"  = { port = 3008, desired = 1, cpu = 512,  memory = 1024 }
    "frontend"        = { port = 80,   desired = 2, cpu = 256,  memory = 512  }
  }
}

resource "aws_lb_target_group" "services" {
  for_each    = local.services
  name        = "shoposphere-${each.key}-${var.environment}"
  port        = each.value.port
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = each.key == "frontend" ? "/" : "/v1/auth/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
  }
}

resource "aws_lb_target_group" "frontend" {
  name        = "shoposphere-frontend-${var.environment}"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"
}

resource "aws_ecs_task_definition" "services" {
  for_each = local.services

  family                   = "shoposphere-${each.key}-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = each.key
    image = "${var.ecr_registry}/shoposphere-${each.key}:latest"
    portMappings = [{ containerPort = each.value.port, protocol = "tcp" }]

    environment = [
      { name = "NODE_ENV", value = var.environment },
      { name = "PORT",     value = tostring(each.value.port) },
    ]
    secrets = [
      { name = "DATABASE_URL",          valueFrom = "${aws_secretsmanager_secret.app.arn}:DATABASE_URL::" },
      { name = "REDIS_URL",             valueFrom = "${aws_secretsmanager_secret.app.arn}:REDIS_URL::" },
      { name = "JWT_SECRET",            valueFrom = "${aws_secretsmanager_secret.app.arn}:JWT_SECRET::" },
      { name = "JWT_REFRESH_SECRET",    valueFrom = "${aws_secretsmanager_secret.app.arn}:JWT_REFRESH_SECRET::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = "/ecs/shoposphere-${var.environment}/${each.key}"
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", each.key == "frontend" ? "wget -qO- http://localhost/ || exit 1" : "wget -qO- http://localhost:${each.value.port}/v1/auth/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])
}

resource "aws_ecs_service" "services" {
  for_each = local.services

  name                               = "shoposphere-${each.key}"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.services[each.key].arn
  desired_count                      = each.value.desired
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  health_check_grace_period_seconds  = 60

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services[each.key].arn
    container_name   = each.key
    container_port   = each.value.port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller { type = "ECS" }

  lifecycle {
    ignore_changes = [task_definition]  # managed by CI/CD
  }
}

# ─────────────────────────────────────────────────────────────
# AUTO SCALING
# ─────────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "services" {
  for_each = { for k, v in local.services : k => v if k != "tenant-service" }

  max_capacity       = 10
  min_capacity       = each.value.desired
  resource_id        = "service/${aws_ecs_cluster.main.name}/shoposphere-${each.key}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each = aws_appautoscaling_target.services

  name               = "shoposphere-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = each.value.resource_id
  scalable_dimension = each.value.scalable_dimension
  service_namespace  = each.value.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# ─────────────────────────────────────────────────────────────
# SECRETS MANAGER
# ─────────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "app" {
  name                    = "shoposphere/${var.environment}/app"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "db" {
  name                    = "shoposphere/${var.environment}/db"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

# ─────────────────────────────────────────────────────────────
# CLOUDWATCH LOG GROUPS
# ─────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "services" {
  for_each          = local.services
  name              = "/ecs/shoposphere-${var.environment}/${each.key}"
  retention_in_days = var.environment == "production" ? 90 : 14
}
