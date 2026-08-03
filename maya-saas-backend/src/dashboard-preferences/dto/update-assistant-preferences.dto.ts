import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

import { ASSISTANT_CAPABILITIES } from '../assistant-capabilities.constants';

export class UpdateAssistantPreferencesDto {
  @ApiPropertyOptional({
    enum: ASSISTANT_CAPABILITIES,
    isArray: true,
    description: 'MAYA analytics capabilities enabled for this user',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(ASSISTANT_CAPABILITIES, { each: true })
  enabledCapabilities?: string[];
}
