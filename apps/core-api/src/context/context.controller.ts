import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  CurrentTenant,
  RequirePermission,
  TenantContext,
  successResponse,
} from '@shoposphere/common';
import { IsOptional, IsString } from 'class-validator';
import { ContextService } from './context.service';

class UpdateSettingsDto {
  @IsString()
  tenantName: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  tenantSettings?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  shopName?: string;

  @IsOptional()
  @IsString()
  shopType?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  gstNumber?: string;

  @IsOptional()
  address?: Record<string, unknown>;

  @IsOptional()
  shopSettings?: Record<string, unknown>;
}

@Controller('context')
export class ContextController {
  constructor(private readonly contextService: ContextService) {}

  @Get('bootstrap')
  async bootstrap(@CurrentTenant() tenant: TenantContext) {
    return successResponse(
      await this.contextService.bootstrap(tenant.tenantId, tenant.userId, tenant.shopId),
    );
  }

  @Get('settings')
  @RequirePermission('settings', 'read')
  async getSettings(@CurrentTenant() tenant: TenantContext) {
    return successResponse(
      await this.contextService.getSettings(tenant.tenantId, tenant.shopId),
    );
  }

  @Put('settings')
  @RequirePermission('settings', 'write')
  async updateSettings(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateSettingsDto,
  ) {
    return successResponse(
      await this.contextService.updateSettings(tenant.tenantId, tenant.shopId, dto),
    );
  }
}
