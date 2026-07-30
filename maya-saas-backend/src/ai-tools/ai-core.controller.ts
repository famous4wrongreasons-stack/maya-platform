import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { AiCoreService } from './ai-core.service';
import { AiCoreChatDto } from './dto/ai-core-chat.dto';

@ApiTags('ai-core')
@ApiBearerAuth()
@TenantScoped()
@Controller('ai')
export class AiCoreController {
  constructor(private readonly aiCore: AiCoreService) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Run one privacy-safe, role-aware MAYA AI conversation turn',
  })
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: AiCoreChatDto) {
    return this.aiCore.chat(user, dto);
  }
}
