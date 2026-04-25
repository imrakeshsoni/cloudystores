#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-asia-south1}"
REPOSITORY="${REPOSITORY:-shoposphere}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"
DB_INSTANCE="${DB_INSTANCE:-shoposphere-sql}"
DB_NAME="${DB_NAME:-shoposphere}"
DB_USER="${DB_USER:-shoposphere}"
REDIS_HOST="${REDIS_HOST:-}"
VPC_CONNECTOR="${VPC_CONNECTOR:-}"
JWT_SECRET="${JWT_SECRET:-}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required"
  exit 1
fi

if [[ -z "${REDIS_HOST}" ]]; then
  echo "REDIS_HOST is required"
  exit 1
fi

if [[ -z "${VPC_CONNECTOR}" ]]; then
  echo "VPC_CONNECTOR is required"
  exit 1
fi

if [[ -z "${JWT_SECRET}" || -z "${JWT_REFRESH_SECRET}" ]]; then
  echo "JWT_SECRET and JWT_REFRESH_SECRET are required"
  exit 1
fi

IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
DB_SOCKET="/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
DATABASE_URL="postgresql://${DB_USER}:\${DB_PASSWORD}@/${DB_NAME}?host=${DB_SOCKET}"
COMMON_ENV="NODE_ENV=production,DB_SSL=false,APP_URL=https://frontend-${PROJECT_ID}.a.run.app,API_URL=https://core-api-${PROJECT_ID}.a.run.app,JWT_SECRET=${JWT_SECRET},JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET},JWT_EXPIRY=3600,JWT_REFRESH_EXPIRY=604800,REDIS_HOST=${REDIS_HOST},REDIS_PORT=6379,REDIS_URL=redis://${REDIS_HOST}:6379,DATABASE_URL=${DATABASE_URL}"

echo "Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  vpcaccess.googleapis.com \
  secretmanager.googleapis.com \
  --project "${PROJECT_ID}"

echo "Creating Artifact Registry repository if needed..."
gcloud artifacts repositories create "${REPOSITORY}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="Shoposphere containers" \
  --project="${PROJECT_ID}" || true

echo "Building container images with Cloud Build..."
gcloud builds submit \
  --config cloudbuild.gcp.yaml \
  --substitutions "_REGION=${REGION},_REPOSITORY=${REPOSITORY},_TAG=${IMAGE_TAG}" \
  --project "${PROJECT_ID}" \
  .

deploy_service() {
  local name="$1"
  local image_name="$2"
  local port="$3"
  local extra_env="${4:-}"

  gcloud run deploy "${name}" \
    --image "${IMAGE_BASE}/${image_name}:${IMAGE_TAG}" \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --port "${port}" \
    --vpc-connector "${VPC_CONNECTOR}" \
    --add-cloudsql-instances "${PROJECT_ID}:${REGION}:${DB_INSTANCE}" \
    --set-env-vars "${COMMON_ENV}${extra_env:+,${extra_env}}" \
    --set-secrets "DB_PASSWORD=shoposphere-db-password:latest" \
    --project "${PROJECT_ID}"
}

echo "Deploying backend services to Cloud Run..."
deploy_service auth-service auth-service 3001
deploy_service tenant-service tenant-service 3002
deploy_service core-api core-api 3003
deploy_service order-service order-service 3007
deploy_service report-service report-service 3008

AUTH_URL="$(gcloud run services describe auth-service --region "${REGION}" --format='value(status.url)' --project "${PROJECT_ID}")"
TENANT_URL="$(gcloud run services describe tenant-service --region "${REGION}" --format='value(status.url)' --project "${PROJECT_ID}")"
CORE_URL="$(gcloud run services describe core-api --region "${REGION}" --format='value(status.url)' --project "${PROJECT_ID}")"
ORDER_URL="$(gcloud run services describe order-service --region "${REGION}" --format='value(status.url)' --project "${PROJECT_ID}")"
REPORT_URL="$(gcloud run services describe report-service --region "${REGION}" --format='value(status.url)' --project "${PROJECT_ID}")"

echo "Deploying frontend..."
gcloud run deploy frontend \
  --image "${IMAGE_BASE}/frontend:${IMAGE_TAG}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "AUTH_SERVICE_URL=${AUTH_URL},TENANT_SERVICE_URL=${TENANT_URL},CORE_API_URL=${CORE_URL},ORDER_SERVICE_URL=${ORDER_URL},REPORT_SERVICE_URL=${REPORT_URL}" \
  --project "${PROJECT_ID}"

echo
echo "Deployment complete."
echo "Frontend URL:"
gcloud run services describe frontend --region "${REGION}" --format='value(status.url)' --project "${PROJECT_ID}"
