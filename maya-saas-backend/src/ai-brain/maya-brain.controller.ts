import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { CreateKnowledgeSourceDto } from './dto/create-knowledge-source.dto';
import { MayaBrainKnowledgeService } from './maya-brain-knowledge.service';
import { MayaBrainMemoryService } from './maya-brain-memory.service';

const KNOWLEDGE_MANAGER_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
] as const;

@ApiTags('maya-brain')
@ApiBearerAuth()
@TenantScoped()
@Controller('ai/brain')
export class MayaBrainController {
  constructor(
    private readonly memory: MayaBrainMemoryService,
    private readonly knowledge: MayaBrainKnowledgeService,
  ) {}

  @Get('memory')
  @ApiOperation({ summary: 'List the current user safe Maya preferences' })
  async listMemory(@CurrentUser() user: AuthenticatedUser) {
    return { preferences: await this.memory.list(user) };
  }

  @Delete('memory')
  @ApiOperation({ summary: 'Forget the current user Maya preferences' })
  async forgetMemory(@CurrentUser() user: AuthenticatedUser) {
    return { forgotten: await this.memory.forget(user) };
  }

  @Get('knowledge')
  @Roles(...KNOWLEDGE_MANAGER_ROLES)
  @ApiOperation({ summary: 'List tenant Maya knowledge sources' })
  async listKnowledge(@CurrentUser() user: AuthenticatedUser) {
    return { sources: await this.knowledge.list(user) };
  }

  @Post('knowledge')
  @Roles(...KNOWLEDGE_MANAGER_ROLES)
  @ApiOperation({ summary: 'Create an encrypted tenant knowledge source' })
  createKnowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateKnowledgeSourceDto,
  ) {
    return this.knowledge.create(user, dto);
  }

  @Delete('knowledge/:sourceId')
  @Roles(...KNOWLEDGE_MANAGER_ROLES)
  @ApiOperation({ summary: 'Archive a tenant Maya knowledge source' })
  async archiveKnowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
  ) {
    if (!(await this.knowledge.archive(user, sourceId))) {
      throw new NotFoundException('Knowledge source not found');
    }
    return { archived: true };
  }
}
