import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString, Matches } from 'class-validator';

export class AvailableDaysQueryDto {
  @ApiProperty({
    example: '2026-07-05',
    description: 'Start day in local YYYY-MM-DD format',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @ApiProperty({
    example: '2026-08-04',
    description: 'End day in local YYYY-MM-DD format',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['svc-haircut', 'svc-beard'],
  })
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value as string[];
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [] as string[];
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[];
}
