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
      'For yclients/altegio: companyId, optional activeMasterIds and explicit branchBinding { contract: "maya.crm-branch-binding/1", companyId, branchId }. Branch must belong to this tenant; null clears binding. Install stages pending activation.',
    example: {
      companyId: 123456,
      activeMasterIds: [111, 222],
    },
  })
  @IsOptional()
  @IsObject()
  settingsJson?: Record<string, unknown>;
}
