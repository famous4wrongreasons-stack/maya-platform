import { IsIn } from 'class-validator';

import { AI_TOOL_SURFACES } from '../ai-tool.types';
import type { AiToolSurface } from '../ai-tool.types';

export class ListAiToolsQueryDto {
  @IsIn(AI_TOOL_SURFACES)
  surface!: AiToolSurface;
}
