import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CacheModule } from '@nestjs/cache-manager';
import { DatabaseModule, TenantMiddleware } from '@shoposphere/common';
import { SalesService } from './sales/sales.service';
import { SalesController } from './sales/sales.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    DatabaseModule.forRoot(),
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    CacheModule.register({ isGlobal: true, ttl: 1800 }),
  ],
  providers: [SalesService],
  controllers: [SalesController],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
