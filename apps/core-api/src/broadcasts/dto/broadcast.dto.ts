import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBroadcastDto {
  @IsString()
  @MaxLength(1000)
  message: string;

  @IsOptional()
  @IsISO8601()
  scheduledFor?: string;
}

export class BroadcastQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  perPage?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class SendInvoiceWhatsappDto {
  @IsString()
  phone: string;

  @IsString()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  imageDataUrl?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;
}
