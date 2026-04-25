import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule, TenantMiddleware, EventBusService } from '@shoposphere/common';
import { Order, OrderItem, Payment, BillSequence } from './orders/order.entity';
import { OrdersService } from './orders/orders.service';
import { OrdersController } from './orders/orders.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    DatabaseModule.forRoot([Order, OrderItem, Payment, BillSequence]),
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    TypeOrmModule.forFeature([Order, OrderItem, Payment, BillSequence]),
  ],
  providers: [OrdersService, EventBusService],
  controllers: [OrdersController],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
