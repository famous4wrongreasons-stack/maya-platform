import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListCatalogQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  lowStockOnly?: boolean;
}

export class UpsertCatalogItemDto {
  @ApiPropertyOptional({
    description:
      'Server-supported canonical template. Required only when creating a membership or certificate offer.',
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  canonicalTemplateKey?: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: 'Price in kopecks.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  priceKopecks?: number;

  @ApiPropertyOptional({ default: 'RUB', maxLength: 3 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Current stock for inventory items.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Low-stock warning threshold.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  lowStockThreshold?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ default: 'manual', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalRef?: string;
}
