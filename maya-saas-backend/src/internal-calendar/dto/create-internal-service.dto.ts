import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateInternalServiceDto {
  @ApiProperty({ example: 'Индивидуальная консультация' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 2500, description: 'Price in whole currency units.' })
  @IsInt()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 'RUB', default: 'RUB' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes!: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  bufferBeforeMinutes?: number;

  @ApiPropertyOptional({ example: 15, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  bufferAfterMinutes?: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
