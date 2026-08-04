import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import { FINANCE_DASHBOARD_WIDGETS } from '../finance-dashboard.constants';

export class UpdateFinanceDashboardDto {
  @ApiPropertyOptional({ enum: FINANCE_DASHBOARD_WIDGETS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(FINANCE_DASHBOARD_WIDGETS, { each: true })
  enabledWidgets?: string[];

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 100_000_000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  monthlyTargetRub?: number | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'number', minimum: 0 },
  })
  @IsOptional()
  @IsObject()
  staffTargetsRub?: Record<string, unknown>;
}
