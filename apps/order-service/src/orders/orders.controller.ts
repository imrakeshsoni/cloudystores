import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  CurrentTenant,
  TenantContext,
  RequirePermission,
  successResponse,
} from '@shoposphere/common';

class VoidOrderDto {
  @IsString()
  reason: string;
}

class ReturnOrderDto {
  @IsString()
  reason: string;
}

class PartialReturnItemDto {
  @IsString()
  orderItemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

class PartialReturnOrderDto {
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  refundMethod?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartialReturnItemDto)
  items: PartialReturnItemDto[];
}

class ConvertQuotationDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDto)
  payment?: PaymentDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyPointsRedeemed?: number;
}

class PaymentDto {
  @IsString()
  method: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermission('orders', 'write')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateOrderDto) {
    const order = await this.ordersService.create(tenant.tenantId, tenant.userId, dto);
    return successResponse(order);
  }

  @Get()
  @RequirePermission('orders', 'read')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
    @Query() query: any,
  ) {
    return this.ordersService.findAll(
      tenant.tenantId,
      shopId ?? tenant.shopId!,
      query,
    );
  }

  @Get(':id')
  @RequirePermission('orders', 'read')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const order = await this.ordersService.findOne(tenant.tenantId, id);
    return successResponse(order);
  }

  @Post(':id/void')
  @RequirePermission('orders', 'void')
  @HttpCode(HttpStatus.OK)
  async void(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidOrderDto,
  ) {
    await this.ordersService.voidOrder(tenant.tenantId, id, tenant.userId, dto.reason);
    return successResponse({ message: 'Order voided and stock restored' });
  }

  @Post(':id/return')
  @RequirePermission('orders', 'write')
  @HttpCode(HttpStatus.OK)
  async returnOrder(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnOrderDto,
  ) {
    const order = await this.ordersService.returnOrder(tenant.tenantId, id, tenant.userId, dto.reason);
    return successResponse(order);
  }

  @Post(':id/return-items')
  @RequirePermission('orders', 'write')
  @HttpCode(HttpStatus.OK)
  async returnOrderItems(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PartialReturnOrderDto,
  ) {
    const order = await this.ordersService.returnOrderItems(tenant.tenantId, id, tenant.userId, dto);
    return successResponse(order);
  }

  @Post(':id/convert')
  @RequirePermission('orders', 'write')
  @HttpCode(HttpStatus.OK)
  async convertQuotation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertQuotationDto,
  ) {
    const order = await this.ordersService.convertQuotation(tenant.tenantId, id, tenant.userId, dto);
    return successResponse(order);
  }
}
