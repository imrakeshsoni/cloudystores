import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { CacheModule } from '@nestjs/cache-manager';
import { DatabaseModule, TenantMiddleware, EventBusService } from '@shoposphere/common';

import { Product } from './products/product.entity';
import { Inventory, StockMovement } from './inventory/inventory.entity';
import { Customer } from './customers/customer.entity';
import { Category } from './categories/category.entity';
import { Supplier, PurchaseOrder, PurchaseOrderItem } from './suppliers/supplier.entity';
import { CustomFieldDefinition } from './custom-fields/custom-field.entity';

import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { InventoryController } from './inventory/inventory.controller';
import { InventoryService } from './inventory/inventory.service';
import { CustomersService } from './customers/customers.service';
import { CustomersController } from './customers/customers.controller';
import { SuppliersService } from './suppliers/suppliers.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import { ContextController } from './context/context.controller';
import { ContextService } from './context/context.service';
import { Broadcast } from './broadcasts/broadcast.entity';
import { BroadcastsController } from './broadcasts/broadcasts.controller';
import { BroadcastsService } from './broadcasts/broadcasts.service';
import { WhatsAppService } from './broadcasts/whatsapp.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    DatabaseModule.forRoot([Product, Inventory, StockMovement, Customer, Category, Supplier, PurchaseOrder, PurchaseOrderItem, CustomFieldDefinition, Broadcast]),
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    CacheModule.register({
      isGlobal: true,
      ttl: 300,
      // In production: use cache-manager-ioredis-yet with Redis
    }),
    TypeOrmModule.forFeature([
      Product,
      Inventory,
      StockMovement,
      Customer,
      Category,
      Supplier,
      PurchaseOrder,
      PurchaseOrderItem,
      CustomFieldDefinition,
      Broadcast,
    ]),
  ],
  controllers: [ProductsController, InventoryController, CustomersController, SuppliersController, ContextController, BroadcastsController],
  providers: [ProductsService, InventoryService, CustomersService, SuppliersService, ContextService, BroadcastsService, WhatsAppService, EventBusService],
  exports: [ProductsService, InventoryService, CustomersService, SuppliersService, ContextService, BroadcastsService, WhatsAppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
