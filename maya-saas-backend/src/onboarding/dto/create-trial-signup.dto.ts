import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

import { CalendarSource } from '../../common/domain.enums';
import { INDUSTRY_PRESET_IDS } from '../../common/industry-presets';

export class CreateTrialSignupDto {
  @ApiProperty({ example: 'Studio Vector' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'studio-vector' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty({ example: 'owner@studio-vector.ru' })
  @IsEmail()
  ownerEmail!: string;

  @ApiPropertyOptional({
    enum: INDUSTRY_PRESET_IDS,
    example: 'general_service',
    default: 'general_service',
  })
  @IsOptional()
  @IsIn(INDUSTRY_PRESET_IDS)
  industryPresetId?: string;

  @ApiPropertyOptional({
    enum: CalendarSource,
    description:
      'Use internal for a Maya-managed calendar or external when connecting a CRM.',
  })
  @IsOptional()
  @IsEnum(CalendarSource)
  calendarSource?: CalendarSource;

  @ApiPropertyOptional({ example: 'Илья' })
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional({ example: '+79990000000' })
  @IsOptional()
  @IsString()
  @Matches(/^[+\d\s().-]+$/)
  ownerPhone?: string;

  @ApiPropertyOptional({
    example: 'StrongPass123',
    description:
      'Optional. If omitted, backend generates a temporary password and returns it once.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ example: 'Main Location' })
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

  @ApiPropertyOptional({
    example: 'cm-demo-plan',
    description:
      'Optional. Useful when the frontend wants to preselect a plan.',
  })
  @IsOptional()
  @IsString()
  planId?: string;
}
