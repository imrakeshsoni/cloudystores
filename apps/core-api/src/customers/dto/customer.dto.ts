import {
  IsArray,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCustomerDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  customFields?: Record<string, unknown>;
}

export class UpdateCustomerDto extends CreateCustomerDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  loyaltyPoints?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  creditBalance?: number;
}

export class CustomerQueryDto {
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

export class UpsertCustomerByPhoneDto {
  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class CollectCreditPaymentDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CustomerReminderDto {
  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
