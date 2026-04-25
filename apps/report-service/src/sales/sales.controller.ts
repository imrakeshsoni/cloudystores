import { Controller, Get, Query } from '@nestjs/common';
import { SalesService } from './sales.service';
import {
  CurrentTenant,
  TenantContext,
  RequirePermission,
  successResponse,
} from '@shoposphere/common';

@Controller('reports')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('sales')
  @RequirePermission('reports', 'read')
  async getSalesSummary(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') groupBy: 'day' | 'week' | 'month',
  ) {
    const result = await this.salesService.getSalesSummary(tenant.tenantId, {
      shopId: shopId ?? tenant.shopId!,
      from: from ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
      to: to ?? new Date().toISOString().split('T')[0],
      groupBy: groupBy ?? 'day',
    });
    return successResponse(result);
  }

  @Get('sales/today')
  @RequirePermission('reports', 'read')
  async getDailySummary(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
  ) {
    const today = new Date().toISOString().split('T')[0];
    const result = await this.salesService.getDailySummary(
      tenant.tenantId,
      shopId ?? tenant.shopId!,
      today,
    );
    return successResponse(result);
  }

  @Get('sales/top-products')
  @RequirePermission('reports', 'read')
  async getTopProducts(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
    @Query('days') days: string,
    @Query('limit') limit: string,
  ) {
    const result = await this.salesService.getTopProducts(
      tenant.tenantId,
      shopId ?? tenant.shopId!,
      Number(days ?? 180),
      Number(limit ?? 50),
    );
    return successResponse(result);
  }

  @Get('gst')
  @RequirePermission('reports', 'read')
  async getGSTReport(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
    @Query('month') month: string,  // YYYY-MM
  ) {
    const result = await this.salesService.getGSTReport(
      tenant.tenantId,
      shopId ?? tenant.shopId!,
      month ?? new Date().toISOString().substring(0, 7),
    );
    return successResponse(result);
  }

  @Get('inventory-valuation')
  @RequirePermission('reports', 'read')
  async getInventoryValuation(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
  ) {
    const result = await this.salesService.getInventoryValuation(
      tenant.tenantId,
      shopId ?? tenant.shopId!,
    );
    return successResponse(result);
  }

  @Get('daily-closing')
  @RequirePermission('reports', 'read')
  async getDailyClosing(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
    @Query('date') date: string,
  ) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];
    const result = await this.salesService.getDailyClosing(
      tenant.tenantId,
      shopId ?? tenant.shopId!,
      targetDate,
    );
    return successResponse(result);
  }

  @Get('audit-log')
  @RequirePermission('reports', 'read')
  async getAuditLog(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
    @Query('limit') limit: string,
  ) {
    const result = await this.salesService.getAuditLog(
      tenant.tenantId,
      shopId ?? tenant.shopId!,
      Number(limit ?? 100),
    );
    return successResponse(result);
  }

  @Get('margin')
  @RequirePermission('reports', 'read')
  async getMarginReport(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return successResponse(
      await this.salesService.getMarginReport(
        tenant.tenantId,
        shopId ?? tenant.shopId!,
        from ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
        to ?? new Date().toISOString().split('T')[0],
      ),
    );
  }

  @Get('customers')
  @RequirePermission('reports', 'read')
  async getCustomerInsights(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return successResponse(
      await this.salesService.getCustomerInsights(
        tenant.tenantId,
        shopId ?? tenant.shopId!,
        from ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
        to ?? new Date().toISOString().split('T')[0],
      ),
    );
  }

  @Get('inventory-intelligence')
  @RequirePermission('reports', 'read')
  async getInventoryIntelligence(
    @CurrentTenant() tenant: TenantContext,
    @Query('shopId') shopId: string,
  ) {
    return successResponse(
      await this.salesService.getInventoryIntelligence(
        tenant.tenantId,
        shopId ?? tenant.shopId!,
      ),
    );
  }
}
