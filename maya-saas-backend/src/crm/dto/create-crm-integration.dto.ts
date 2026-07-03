import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

import { CrmIntegrationStatus, CrmProvider } from '../../common/domain.enums';

export class CreateCrmIntegrationDto {
  @ApiProperty({ enum: CrmProvider })
  @IsEnum(CrmProvider)
  provider!: CrmProvider;

  @ApiProperty({ example: 'crm-token-value' })
  @IsString()
  apiToken!: string;

  @ApiPropertyOptional({ example: 'https://api.crm.example' })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional({ enum: CrmIntegrationStatus })
  @IsOptional()
  @IsEnum(CrmIntegrationStatus)
  status?: CrmIntegrationStatus;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Provider-specific settings. For yclients/altegio include at least companyId and optionally activeMasterIds.',
    example: {
      companyId: 123456,
      activeMasterIds: [111, 222],
    },
  })
  @IsOptional()
  @IsObject()
  settingsJson?: Record<string, unknown>;
}
