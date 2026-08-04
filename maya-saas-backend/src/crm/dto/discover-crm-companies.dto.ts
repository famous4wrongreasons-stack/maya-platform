import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { CrmProvider } from '../../common/domain.enums';

export class DiscoverCrmCompaniesDto {
  @ApiProperty({ enum: CrmProvider })
  @IsEnum(CrmProvider)
  provider!: CrmProvider;

  @ApiProperty({
    description:
      'Tenant CRM credential used only for discovery and never persisted by this endpoint.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  apiToken!: string;
}
