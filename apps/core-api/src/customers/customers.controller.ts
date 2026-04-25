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
import { CustomersService } from './customers.service';
import {
  CollectCreditPaymentDto,
  CustomerReminderDto,
  CreateCustomerDto,
  CustomerQueryDto,
  UpdateCustomerDto,
  UpsertCustomerByPhoneDto,
} from './dto/customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermission('customers', 'read')
  async findAll(@CurrentTenant() tenant: TenantContext, @Query() query: CustomerQueryDto) {
    return this.customersService.findAll(tenant.tenantId, query);
  }

  @Get(':id')
  @RequirePermission('customers', 'read')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.customersService.findOne(tenant.tenantId, id));
  }

  @Post()
  @RequirePermission('customers', 'write')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCustomerDto) {
    return successResponse(await this.customersService.create(tenant.tenantId, dto));
  }

  @Post('upsert-by-phone')
  @RequirePermission('customers', 'write')
  async upsertByPhone(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertCustomerByPhoneDto,
  ) {
    return successResponse(
      await this.customersService.findOrCreate(tenant.tenantId, dto.phone, dto.name),
    );
  }

  @Post(':id/collect-payment')
  @RequirePermission('customers', 'write')
  async collectPayment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CollectCreditPaymentDto,
  ) {
    return successResponse(
      await this.customersService.collectCreditPayment(tenant.tenantId, id, dto.amount, dto.method, dto.notes),
    );
  }

  @Post(':id/send-reminder')
  @RequirePermission('customers', 'write')
  async sendReminder(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CustomerReminderDto,
  ) {
    return successResponse(
      await this.customersService.sendCreditReminder(tenant.tenantId, id, dto.channel, dto.notes),
    );
  }

  @Put(':id')
  @RequirePermission('customers', 'write')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return successResponse(await this.customersService.update(tenant.tenantId, id, dto));
  }

  @Delete(':id')
  @RequirePermission('customers', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.customersService.remove(tenant.tenantId, id);
  }
}
