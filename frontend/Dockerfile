FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/auth-service/package.json ./apps/auth-service/
COPY apps/core-api/package.json ./apps/core-api/
COPY apps/order-service/package.json ./apps/order-service/
COPY apps/report-service/package.json ./apps/report-service/
COPY apps/tenant-service/package.json ./apps/tenant-service/
COPY libs/common/package.json ./libs/common/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY frontend/ ./frontend/
WORKDIR /app/frontend
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.gcp.conf.template /etc/nginx/nginx.conf.template
EXPOSE 8080
# Substitute only the service URL vars — leaves nginx vars ($host, $uri, $1, etc.) intact
CMD ["/bin/sh", "-c", "envsubst '${AUTH_SERVICE_URL} ${TENANT_SERVICE_URL} ${CORE_API_URL} ${ORDER_SERVICE_URL} ${REPORT_SERVICE_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
