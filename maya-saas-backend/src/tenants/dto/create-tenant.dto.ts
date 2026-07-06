import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

import { TenantStatus } from '../../common/domain.enums';

export class CreateTenantDto {
  @ApiProperty({ example: 'Demo Salon' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'demo-salon' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiPropertyOptional({ enum: TenantStatus, default: TenantStatus.TRIAL })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({
    example: '2026-07-19T12:00:00.000Z',
    description:
      'Optional explicit trial end timestamp. If omitted for a trial tenant, backend defaults it to about 14 days from creation.',
  })
  @IsOptional()
  @ValidateIf((_, value: string | undefined) => value !== '')
  @IsDateString()
  trialEndsAt?: string;

  @ApiPropertyOptional({
    example: '2026-07-05T12:00:00.000Z',
  })
  @IsOptional()
  @ValidateIf((_, value: string | undefined) => value !== '')
  @IsDateString()
  currentPeriodStart?: string;

  @ApiPropertyOptional({
    example: '2026-08-04T12:00:00.000Z',
  })
  @IsOptional()
  @ValidateIf((_, value: string | undefined) => value !== '')
  @IsDateString()
  currentPeriodEnd?: string;

  @ApiPropertyOptional({
    example: 'pm_yookassa_saved_card_123',
    description:
      'Optional saved billing method id for future recurring charges.',
  })
  @IsOptional()
  @IsString()
  billingMethodId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowSelfRegistration?: boolean;

  @ApiPropertyOptional({ example: 'Main Branch' })
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiPropertyOptional({ example: 'Moscow, Tverskaya 1' })
  @IsOptional()
  @IsString()
  branchAddress?: string;

  @ApiPropertyOptional({ example: '+79990000000' })
  @IsOptional()
  @IsString()
  branchPhone?: string;

  @ApiPropertyOptional({ example: 'Europe/Moscow' })
  @IsOptional()
  @IsString()
  branchTimezone?: string;
}
