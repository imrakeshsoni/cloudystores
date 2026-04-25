import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('CoreAPI');

  app.use(helmet());
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ extended: true, limit: '12mb' }));
  app.enableCors({
    origin: (origin, cb) => {
      const allowed = /^https?:\/\/(.*\.shoposphere\.in|localhost|127\.0\.0\.1|(\[[0-9a-fA-F:]+\]))(:\d+)?$/;
      if (!origin || allowed.test(origin)) cb(null, true);
      else cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
  );
  app.setGlobalPrefix('v1');

  const port = Number(process.env.CORE_API_PORT ?? process.env.PORT ?? 3003);
  await app.listen(port);
  logger.log(`Core API running on port ${port}`);
}

bootstrap();
