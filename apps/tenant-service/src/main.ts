import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('TenantService');

  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('v1');

  const port = Number(process.env.TENANT_SERVICE_PORT ?? 3002);
  await app.listen(port);
  logger.log(`Tenant Service running on port ${port}`);
}

bootstrap();
