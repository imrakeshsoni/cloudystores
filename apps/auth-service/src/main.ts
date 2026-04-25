import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('AuthService');

  app.use(helmet());

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests from *.shoposphere.in subdomains + common local dev hosts
      const allowed = /^https?:\/\/(.*\.shoposphere\.in|localhost|127\.0\.0\.1|(\[[0-9a-fA-F:]+\]))(:\d+)?$/;
      if (!origin || allowed.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('v1');

  const port = Number(process.env.AUTH_SERVICE_PORT ?? 3001);
  await app.listen(port);
  logger.log(`Auth Service running on port ${port}`);
}

bootstrap();
