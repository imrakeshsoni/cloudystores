import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, ProductQueryDto } from './dto/product.dto';
import {
  CurrentTenant,
  TenantContext,
  RequirePermission,
  successResponse,
} from '@shoposphere/common';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @RequirePermission('products', 'write')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateProductDto) {
    const product = await this.productsService.create(tenant.tenantId, dto);
    return successResponse(product);
  }

  @Get()
  @RequirePermission('products', 'read')
  async findAll(@CurrentTenant() tenant: TenantContext, @Query() query: ProductQueryDto) {
    return this.productsService.findAll(tenant.tenantId, tenant.shopId, query);
  }

  @Get('barcode/:barcode')
  @RequirePermission('products', 'read')
  async findByBarcode(
    @CurrentTenant() tenant: TenantContext,
    @Param('barcode') barcode: string,
  ) {
    const product = await this.productsService.findByBarcode(tenant.tenantId, barcode, tenant.shopId);
    return successResponse(product);
  }

  @Get(':id')
  @RequirePermission('products', 'read')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const product = await this.productsService.findOne(tenant.tenantId, id);
    return successResponse(product);
  }

  @Put(':id')
  @RequirePermission('products', 'write')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const product = await this.productsService.update(tenant.tenantId, id, dto);
    return successResponse(product);
  }

  @Delete(':id')
  @RequirePermission('products', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.productsService.remove(tenant.tenantId, id);
  }

  @Post('bulk-import')
  @RequirePermission('products', 'import')
  async bulkImport(@CurrentTenant() tenant: TenantContext, @Body() body: { products: CreateProductDto[] }) {
    const result = await this.productsService.bulkImport(tenant.tenantId, body.products);
    return successResponse(result);
  }
}
