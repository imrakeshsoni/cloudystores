import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike, FindManyOptions } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { Product } from './product.entity';
import { CreateProductDto, UpdateProductDto, ProductQueryDto } from './dto/product.dto';
import { paginatedResponse, parsePagination, generateSKU, DuplicateResourceException } from '@shoposphere/common';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async create(tenantId: string, dto: CreateProductDto): Promise<Product> {
    if (!dto.sku) {
      dto.sku = generateSKU(dto.name, 'GEN');
    }

    // Check SKU uniqueness within tenant
    const existing = await this.repo.findOne({
      where: { tenantId, sku: dto.sku },
    });
    if (existing) throw new DuplicateResourceException('Product', 'SKU');

    const product = this.repo.create({ ...dto, tenantId });
    const saved = await this.repo.save(product);

    await this.invalidateCache(tenantId);
    return saved;
  }

  async findAll(tenantId: string, shopId: string | undefined, query: ProductQueryDto) {
    const { skip, take, page, perPage } = parsePagination(query);

    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.is_active = :active', { active: query.isActive ?? true });

    if (shopId) {
      qb.andWhere('(p.shop_id = :shopId OR p.shop_id IS NULL)', { shopId });
    }
    if (query.categoryId) {
      qb.andWhere('p.category_id = :categoryId', { categoryId: query.categoryId });
    }
    if (query.search) {
      qb.andWhere(
        '(p.name ILIKE :search OR p.sku ILIKE :search OR p.barcode = :barcode)',
        { search: `%${query.search}%`, barcode: query.search },
      );
    }
    if (query.lowStock) {
      // Join inventory to filter low-stock items
      qb.innerJoin(
        'inventory',
        'inv',
        'inv.product_id = p.id AND inv.quantity <= inv.reorder_level AND inv.reorder_level > 0',
      );
    }

    qb.orderBy('p.name', 'ASC').skip(skip).take(take);

    const [data, total] = await qb.getManyAndCount();
    return paginatedResponse(
      await this.attachInventoryContext(tenantId, shopId, data),
      total,
      page,
      perPage,
    );
  }

  async findOne(tenantId: string, id: string): Promise<Product> {
    const product = await this.repo.findOne({ where: { id, tenantId } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findByBarcode(tenantId: string, barcode: string, shopId?: string): Promise<Product & Record<string, unknown>> {
    const product = await this.repo.findOne({ where: { tenantId, barcode } });
    if (!product) throw new NotFoundException(`No product found with barcode: ${barcode}`);
    const [productWithInventory] = await this.attachInventoryContext(tenantId, shopId, [product]);
    return productWithInventory;
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(tenantId, id);
    Object.assign(product, dto);
    const saved = await this.repo.save(product);
    await this.invalidateCache(tenantId);
    return saved;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const product = await this.findOne(tenantId, id);
    // Soft delete — mark inactive rather than hard delete
    product.isActive = false;
    await this.repo.save(product);
    await this.invalidateCache(tenantId);
  }

  async bulkImport(tenantId: string, products: CreateProductDto[]): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    for (const dto of products) {
      try {
        await this.create(tenantId, dto);
        imported++;
      } catch {
        skipped++;
      }
    }

    return { imported, skipped };
  }

  private async invalidateCache(tenantId: string): Promise<void> {
    // Pattern delete — clear all product cache keys for this tenant
    await this.cache.del(`products:${tenantId}`);
  }

  private async attachInventoryContext(
    tenantId: string,
    shopId: string | undefined,
    products: Product[],
  ): Promise<Array<Product & Record<string, unknown>>> {
    if (!shopId || products.length === 0) {
      return products as Array<Product & Record<string, unknown>>;
    }

    const inventoryRows = await this.dataSource.query(
      `SELECT product_id, quantity, batch_details
       FROM inventory
       WHERE tenant_id = $1
         AND shop_id = $2
         AND product_id = ANY($3)`,
      [tenantId, shopId, products.map((product) => product.id)],
    );

    const inventoryByProductId = new Map(
      inventoryRows.map((row: any) => [row.product_id, row]),
    );

    return products.map((product) => {
      const inventory = inventoryByProductId.get(product.id) as
        | { quantity?: number; batch_details?: unknown[] }
        | undefined;
      return {
        ...product,
        availableQuantity: Number(inventory?.quantity ?? 0),
        batchDetails: Array.isArray(inventory?.batch_details) ? inventory.batch_details : [],
      };
    });
  }
}
