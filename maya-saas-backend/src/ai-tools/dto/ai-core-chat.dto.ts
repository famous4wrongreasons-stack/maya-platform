import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import type { AiCoreMessageRole } from '../ai-core.types';
import type { AiToolSurface } from '../ai-tool.types';

export class AiCoreChatMessageDto {
  @IsIn(['assistant', 'user'])
  role!: AiCoreMessageRole;

  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  content!: string;
}

export class AiCoreChatDto {
  @IsIn(['native', 'web', 'telegram', 'voice'])
  surface!: AiToolSurface;

  // Presentation hint only. Authorization always comes from server-side membership.
  @IsOptional()
  @IsIn(['client', 'staff', 'owner'])
  audience?: 'client' | 'staff' | 'owner';

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,128}$/)
  requestId!: string;

  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AiCoreChatMessageDto)
  messages!: AiCoreChatMessageDto[];
}
