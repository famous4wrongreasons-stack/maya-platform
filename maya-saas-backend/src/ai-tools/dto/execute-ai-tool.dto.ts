import { IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';

import { AI_TOOL_SURFACES } from '../ai-tool.types';
import type { AiToolSurface } from '../ai-tool.types';

export class ExecuteAiToolDto {
  @IsObject()
  arguments!: Record<string, unknown>;

  @IsIn(AI_TOOL_SURFACES)
  surface!: AiToolSurface;

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
