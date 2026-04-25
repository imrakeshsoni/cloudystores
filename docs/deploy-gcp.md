# Google Cloud Deployment

This repo originally shipped with AWS-oriented infrastructure. This document adds a Google Cloud deployment path using:

- Cloud Run for each app service
- Artifact Registry for images
- Cloud SQL for PostgreSQL
- Memorystore for Redis
- Serverless VPC Access for Redis and Cloud SQL connectivity
- Secret Manager for the database password

## Services

- `auth-service`
- `tenant-service`
- `core-api`
- `order-service`
- `report-service`
- `frontend`

The frontend is deployed as an Nginx container that proxies `/api/*` paths to the deployed Cloud Run services via environment-configured upstream URLs.

## Prerequisites

1. Install `gcloud`
2. Authenticate:

```bash
gcloud auth login
gcloud auth application-default login
```

3. Set your project:

```bash
gcloud config set project YOUR_PROJECT_ID
```

4. Create or confirm these managed resources:

- Cloud SQL Postgres instance
- Memorystore Redis instance
- Serverless VPC Access connector
- Secret Manager secret named `shoposphere-db-password`

## Recommended bootstrap

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  vpcaccess.googleapis.com \
  secretmanager.googleapis.com
```

## Required environment

Before running the deployment script, export:

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="asia-south1"
export REPOSITORY="shoposphere"
export DB_INSTANCE="shoposphere-sql"
export DB_NAME="shoposphere"
export DB_USER="shoposphere"
export REDIS_HOST="10.x.x.x"
export VPC_CONNECTOR="shoposphere-connector"
export JWT_SECRET="replace-this"
export JWT_REFRESH_SECRET="replace-this-too"
```

## Deploy

```bash
chmod +x tools/deploy-gcp.sh
./tools/deploy-gcp.sh
```

## GitHub Actions

The repository workflow at `.github/workflows/ci-cd.yml` is now wired for Google Cloud instead of AWS.

Required GitHub secrets:

- `GCP_PROJECT_ID`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `GCP_DB_INSTANCE`
- `GCP_DB_NAME`
- `GCP_DB_USER`
- `GCP_REDIS_HOST`
- `GCP_VPC_CONNECTOR`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

The workflow:

- runs backend tests and frontend build/lint checks
- builds all images with Cloud Build
- deploys to Cloud Run for staging
- runs smoke tests
- deploys to production after staging

## Notes

- The script builds images with `cloudbuild.gcp.yaml`.
- Backend services receive the Cloud SQL instance connection and the database password from Secret Manager.
- The frontend is deployed last after backend URLs are known.
- If you want a single custom domain, put an HTTPS Load Balancer or CDN in front of the frontend service.

## Important security note

Do not reuse local `.env` secrets in production. Store production secrets in Secret Manager and rotate any secrets that were ever committed or exposed locally.
