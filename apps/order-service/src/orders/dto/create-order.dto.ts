import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsNumber,
  IsIn,
  ValidateNested,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  gstRate?: number;

  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsString()
  manufactureDate?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;
}

export class PaymentDto {
  @IsIn(['cash', 'upi', 'card', 'credit', 'cheque', 'multiple'])
  method: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class CreateOrderDto {
  @IsUUID()
  shopId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsIn(['sale', 'return', 'quotation'])
  type?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDto)
  payment?: PaymentDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  globalDiscount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyPointsRedeemed?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
