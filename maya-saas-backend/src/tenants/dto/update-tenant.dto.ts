import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

import { TenantStatus } from '../../common/domain.enums';

const BOOKING_MODE_VALUES = ['preview', 'live'] as const;

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @ApiPropertyOptional({ enum: TenantStatus })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowSelfRegistration?: boolean;

  @ApiPropertyOptional({
    enum: BOOKING_MODE_VALUES,
    description:
      'Requested booking mode for the client app. Effective live mode still requires an active tenant and a real active CRM integration.',
  })
  @IsOptional()
  @IsIn(BOOKING_MODE_VALUES)
  bookingMode?: (typeof BOOKING_MODE_VALUES)[number];
}
