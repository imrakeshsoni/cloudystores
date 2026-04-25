import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { IsString, IsNumber, IsOptional, IsIn, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryService } from './inventory.service';
import {
  CurrentTenant,
  TenantContext,
  RequirePermission,
  successResponse,
} from '@shoposphere/common';

class AdjustStockDto {
  @IsString()
  shopId: string;

  @IsString()
  productId: string;

  @IsNumber()
  quantity: number;

  @IsIn(['sale', 'purchase', 'return', 'adjustment', 'transfer'])
  type: 'sale' | 'purchase' | 'return' | 'adjustment' | 'transfer';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsString()
  manufactureDate?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  movementDate?: string;

  @IsOptional()
  @IsString()
  challanNumber?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;
}

class ImportInventoryRowDto {
  @IsString()
  productName: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  mrp?: number;

  @IsOptional()
  @IsNumber()
  sellingPrice?: number;

  @IsOptional()
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @IsNumber()
  gstRate?: number;

  @IsOptional()
  @IsNumber()
  lowStockQuantity?: number;

  @IsOptional()
  @IsNumber()
  totalUnits?: number;

  @IsOptional()
  @IsNumber()
  looseSellingPrice?: number;

  @IsOptional()
  @IsBoolean()
  nrx?: boolean;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsString()
  manufactureDate?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  supplierName?: string;
}

class ImportInventoryDto {
  @IsString()
  shopId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportInventoryRowDto)
  rows: ImportInventoryRowDto[];
}

class StockAuditRowDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsString()
  manufactureDate?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsNumber()
  expectedQuantity: number;

  @IsNumber()
  actualQuantity: number;
}

class FinalizeStockAuditDto {
  @IsString()
  shopId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockAuditRowDto)
  rows: StockAuditRowDto[];
}

class ReturnExpiredStockDto {
  @IsString()
  shopId: string;

  @IsString()
  productId: string;

  @IsNumber()
  quantity: number;

  @IsString()
  batchNo: string;

  @IsOptional()
  @IsString()
  manufactureDate?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class TransferStockDto {
  @IsString()
  fromShopId: string;

  @IsString()
  toShopId: string;

  @IsString()
  productId: string;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsString()
  manufactureDate?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermission('inventory', 'read')
  async getStockList(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
    @Query() query: { page?: number; perPage?: number },
  ) {
    return this.inventoryService.getStockList(
      tenant.tenantId,
      shopId ?? tenant.shopId!,
      query,
    );
  }

  @Get('alerts')
  @RequirePermission('inventory', 'read')
  async getLowStockAlerts(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
  ) {
    const alerts = await this.inventoryService.getLowStockAlerts(
      tenant.tenantId,
      shopId ?? tenant.shopId!,
    );
    return successResponse(alerts);
  }

  @Get('expiry-alerts')
  @RequirePermission('inventory', 'read')
  async getExpiryAlerts(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
    @Query('days') days?: string,
  ) {
    const alerts = await this.inventoryService.getExpiryAlerts(
      tenant.tenantId,
      shopId ?? tenant.shopId!,
      Number(days ?? 90),
    );
    return successResponse(alerts);
  }

  @Get(':productId/movements')
  @RequirePermission('inventory', 'read')
  async getMovements(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('shopId') shopId: string,
    @Query() query: { page?: number; perPage?: number },
  ) {
    return this.inventoryService.getMovements(
      tenant.tenantId,
      shopId ?? tenant.shopId!,
      productId,
      query,
    );
  }

  @Post('adjust')
  @RequirePermission('inventory', 'adjust')
  async adjust(@CurrentTenant() tenant: TenantContext, @Body() dto: AdjustStockDto) {
    await this.inventoryService.adjustStock(tenant.tenantId, dto, tenant.userId);
    return successResponse({ message: 'Stock adjusted' });
  }

  @Post('import')
  @RequirePermission('inventory', 'adjust')
  async importInventory(@CurrentTenant() tenant: TenantContext, @Body() dto: ImportInventoryDto) {
    const result = await this.inventoryService.importInventory(tenant.tenantId, dto.shopId, tenant.userId, dto.rows);
    return successResponse(result);
  }

  @Post('audit/finalize')
  @RequirePermission('inventory', 'adjust')
  async finalizeAudit(@CurrentTenant() tenant: TenantContext, @Body() dto: FinalizeStockAuditDto) {
    const result = await this.inventoryService.finalizeStockAudit(tenant.tenantId, dto.shopId, tenant.userId, dto.rows);
    return successResponse(result);
  }

  @Post('return-expired')
  @RequirePermission('inventory', 'adjust')
  async returnExpired(@CurrentTenant() tenant: TenantContext, @Body() dto: ReturnExpiredStockDto) {
    const result = await this.inventoryService.returnExpiredStock(tenant.tenantId, dto.shopId, tenant.userId, dto);
    return successResponse(result);
  }

  @Post('transfer')
  @RequirePermission('inventory', 'adjust')
  async transfer(@CurrentTenant() tenant: TenantContext, @Body() dto: TransferStockDto) {
    const result = await this.inventoryService.transferStock(tenant.tenantId, tenant.userId, dto);
    return successResponse(result);
  }
}
