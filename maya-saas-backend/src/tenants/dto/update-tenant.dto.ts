import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

import { TenantStatus } from '../../common/domain.enums';
import { INDUSTRY_PRESET_IDS } from '../../common/industry-presets';

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

  @ApiPropertyOptional({
    enum: INDUSTRY_PRESET_IDS,
    example: 'general_service',
  })
  @IsOptional()
  @IsIn(INDUSTRY_PRESET_IDS)
  industryPresetId?: string;

  @ApiPropertyOptional({ example: 'RUB' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: 'Europe/Moscow' })
  @IsOptional()
  @IsString()
  defaultTimezone?: string;

  @ApiPropertyOptional({ example: 'ru-RU' })
  @IsOptional()
  @IsString()
  defaultLocale?: string;

  @ApiPropertyOptional({ example: 'booking.example.com' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9.-]+$/)
  customDomain?: string;

  @ApiPropertyOptional({ example: 'studio-vector' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  subdomain?: string;

  @ApiPropertyOptional({
    example: '2026-07-19T12:00:00.000Z',
    description:
      'Manual trial deadline used by the billing lifecycle. Send an empty string to clear it.',
  })
  @IsOptional()
  @ValidateIf((_, value: string | undefined) => value !== '')
  @IsDateString()
  trialEndsAt?: string;

  @ApiPropertyOptional({
    example: '2026-07-05T12:00:00.000Z',
    description:
      'Current paid billing period start. Send an empty string to clear it.',
  })
  @IsOptional()
  @ValidateIf((_, value: string | undefined) => value !== '')
  @IsDateString()
  currentPeriodStart?: string;

  @ApiPropertyOptional({
    example: '2026-08-04T12:00:00.000Z',
    description:
      'Current paid billing period end. Send an empty string to clear it.',
  })
  @IsOptional()
  @ValidateIf((_, value: string | undefined) => value !== '')
  @IsDateString()
  currentPeriodEnd?: string;

  @ApiPropertyOptional({
    example: 'pm_yookassa_saved_card_123',
    description:
      'Optional saved billing method id for recurring charges. Send an empty string to clear it.',
  })
  @IsOptional()
  @IsString()
  billingMethodId?: string;

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
