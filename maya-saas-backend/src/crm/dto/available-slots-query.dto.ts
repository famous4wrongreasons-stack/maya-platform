import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';

export class AvailableSlotsQueryDto {
  @ApiProperty({
    example: '2026-07-05T00:00:00.000Z',
    description: 'ISO date or datetime for the requested day',
  })
  @IsDateString()
  date!: string;

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
