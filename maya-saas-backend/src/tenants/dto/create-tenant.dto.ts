import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
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

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowSelfRegistration?: boolean;
}
