import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { CrmProvider } from '../../common/domain.enums';

export class ConnectCrmIntegrationDto {
  @ApiProperty({ enum: CrmProvider })
  @IsEnum(CrmProvider)
  provider!: CrmProvider;

  @ApiPropertyOptional({
    description:
      'Tenant CRM credential. It is verified before persistence and is never returned by the API.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiToken?: string;

  @ApiPropertyOptional({
    type: Object,
    example: { companyId: 123456, activeMasterIds: [111, 222] },
  })
  @IsOptional()
  @IsObject()
  settingsJson?: Record<string, unknown>;
}
