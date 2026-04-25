import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateSupplierDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  gstNumber?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  paymentTerms?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  customFields?: Record<string, unknown>;
}

export class UpdateSupplierDto extends CreateSupplierDto {
  @IsOptional()
  isActive?: boolean;
}

export class SupplierQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  perPage?: number;

  @IsOptional()
  @IsString()
  search?: string;
}

export class PurchaseOrderItemDto {
  @IsUUID()
  productId: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  gstRate?: number;

  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsDateString()
  manufactureDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  shopId: string;

  @IsUUID()
  supplierId: string;

  @IsOptional()
  @IsString()
  poNumber?: string;

  @IsOptional()
  @IsIn(['draft', 'received'])
  status?: 'draft' | 'received';

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}

export class SettleSupplierPaymentDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReceivePurchaseOrderItemDto {
  @IsUUID()
  purchaseOrderItemId: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsDateString()
  manufactureDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class ReceivePurchaseOrderDto {
  @IsUUID()
  purchaseOrderId: string;

  @IsUUID()
  shopId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderItemDto)
  items: ReceivePurchaseOrderItemDto[];
}
