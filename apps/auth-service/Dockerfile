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
COPY tsconfig.base.json ./
COPY libs/common/ ./libs/common/
RUN npm run build --workspace=libs/common
COPY apps/auth-service/ ./apps/auth-service/
RUN npm run build --workspace=apps/auth-service

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/auth-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/libs/common ./libs/common
COPY --from=builder /app/apps/auth-service/package.json .
EXPOSE 3001
CMD ["node", "dist/main"]
