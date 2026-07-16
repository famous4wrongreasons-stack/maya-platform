import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { CrmIntegrationStatus, CrmProvider } from '../../common/domain.enums';

export class UpdateCrmIntegrationDto {
  @ApiPropertyOptional({
    enum: CrmProvider,
    description:
      'Check GET /api/crm/providers before selection. Planned providers are rejected until their adapter is implemented.',
  })
  @IsOptional()
  @IsEnum(CrmProvider)
  provider?: CrmProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiToken?: string;

  @ApiPropertyOptional()
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
