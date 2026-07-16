import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { ApprovalDecisionDto } from './dto/approval-decision.dto';
import { ExecuteAiToolDto } from './dto/execute-ai-tool.dto';
import { ListAiToolsQueryDto } from './dto/list-ai-tools-query.dto';

@ApiTags('ai-tools')
@ApiBearerAuth()
@TenantScoped()
@Controller('ai')
export class AiToolsController {
  constructor(private readonly runtime: AiToolRuntimeService) {}

  @Get('tools')
  @ApiOperation({ summary: 'List AI tools allowed for the current principal' })
  listTools(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAiToolsQueryDto,
  ) {
    return this.runtime.listTools(user, query.surface);
  }

  @Post('tools/:toolName/execute')
  @ApiOperation({ summary: 'Execute or request approval for one AI tool' })
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('toolName') toolName: string,
    @Body() dto: ExecuteAiToolDto,
  ) {
    return this.runtime.execute(user, toolName, dto);
  }

  @Get('approvals')
  @ApiOperation({ summary: 'List actionable AI approvals' })
  listApprovals(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAiToolsQueryDto,
  ) {
    return this.runtime.listApprovals(user, query.surface);
  }

  @Post('approvals/:id/approve')
  @ApiOperation({ summary: 'Approve the exact immutable AI tool payload' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') approvalId: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.runtime.approve(user, approvalId, dto);
  }

  @Post('approvals/:id/reject')
  @ApiOperation({ summary: 'Reject an AI tool payload without executing it' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') approvalId: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.runtime.reject(user, approvalId, dto);
  }
}
