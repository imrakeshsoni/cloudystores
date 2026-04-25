import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CurrentTenant,
  RequirePermission,
  TenantContext,
  successResponse,
} from '@shoposphere/common';
import { SuppliersService } from './suppliers.service';
import { CreatePurchaseOrderDto, CreateSupplierDto, ReceivePurchaseOrderDto, SettleSupplierPaymentDto, SupplierQueryDto, UpdateSupplierDto } from './dto/supplier.dto';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @RequirePermission('suppliers', 'read')
  async findAll(@CurrentTenant() tenant: TenantContext, @Query() query: SupplierQueryDto) {
    return this.suppliersService.findAll(tenant.tenantId, query);
  }

  @Get(':id')
  @RequirePermission('suppliers', 'read')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.suppliersService.findOne(tenant.tenantId, id));
  }

  @Post()
  @RequirePermission('suppliers', 'write')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateSupplierDto) {
    return successResponse(await this.suppliersService.create(tenant.tenantId, dto));
  }

  @Get('purchase-orders/list')
  @RequirePermission('suppliers', 'read')
  async findPurchaseOrders(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
    @Query() query: SupplierQueryDto,
  ) {
    return this.suppliersService.findPurchaseOrders(tenant.tenantId, shopId ?? tenant.shopId!, query);
  }

  @Post('purchase-orders')
  @RequirePermission('suppliers', 'write')
  @HttpCode(HttpStatus.CREATED)
  async createPurchaseOrder(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return successResponse(await this.suppliersService.createPurchaseOrder(tenant.tenantId, tenant.userId, dto));
  }

  @Post('purchase-orders/receive')
  @RequirePermission('suppliers', 'write')
  async receivePurchaseOrder(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return successResponse(
      await this.suppliersService.receivePurchaseOrder(tenant.tenantId, tenant.userId, dto),
    );
  }

  @Post(':id/settle-payment')
  @RequirePermission('suppliers', 'write')
  async settlePayment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleSupplierPaymentDto,
  ) {
    return successResponse(
      await this.suppliersService.settleSupplierPayment(tenant.tenantId, id, dto.amount, dto.notes),
    );
  }

  @Put(':id')
  @RequirePermission('suppliers', 'write')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return successResponse(await this.suppliersService.update(tenant.tenantId, id, dto));
  }

  @Delete(':id')
  @RequirePermission('suppliers', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.suppliersService.remove(tenant.tenantId, id);
  }
}
