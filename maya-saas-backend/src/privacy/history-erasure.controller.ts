import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { HistoryErasureDto } from '../widgets/consent/history-erasure.dto';
import { HistoryErasureOwner } from '../widgets/consent/history-erasure.owner';

/** Explicit verified privacy confirmation; never a chat or widget COMMIT route. */
@ApiTags('privacy')
@ApiBearerAuth()
@TenantScoped()
@Controller('privacy/conversations')
export class HistoryErasureController {
  constructor(private readonly erasure: HistoryErasureOwner) {}

  @Post(':conversationId/erasure')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Erase current-principal content of one exact conversation',
  })
  erase(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Body() body: HistoryErasureDto,
  ) {
    return this.erasure.erase(actor, conversationId, body);
  }
}
