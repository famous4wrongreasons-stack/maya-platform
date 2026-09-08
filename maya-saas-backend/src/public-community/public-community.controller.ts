import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { communityObject, type CommunityOperation } from './public-community.contract';
import { PublicCommunityGatewayService } from './public-community-gateway.service';
import { PublicCommunityService } from './public-community.service';

@Controller('public-community/source')
@Public()
export class PublicCommunitySourceController {
  constructor(private readonly gateway: PublicCommunityGatewayService, private readonly context: TenantContextService, private readonly owner: PublicCommunityService) {}
  @Post() accept(@Body() body: unknown, @Headers('x-community-time') timestamp: string | undefined, @Headers('x-community-signature') signature: string | undefined) {
    const accepted = this.gateway.verify(body, timestamp, signature);
    return this.context.runAsPublicTenant(accepted.source.tenantId, () => {
      const { source, operation, command, requestKey } = accepted;
      if (operation === 'comment') return this.owner.acceptComment(source, command, requestKey);
      if (operation === 'status') { communityObject(command, []); if (requestKey !== null) throw new BadRequestException('Status has no mutation key'); return this.owner.status(source); }
      return this.owner.observe(source, operation, command, requestKey);
    });
  }
}
@Controller('public-community/moderation')
@TenantScoped()
@Roles(UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER, UserRole.TENANT_ADMIN, UserRole.ADMINISTRATOR)
export class PublicCommunityModerationController {
  constructor(private readonly owner: PublicCommunityService) {}
  @Get() queue(@CurrentUser() actor: AuthenticatedUser, @Query('cursor') cursor?: string) { return this.owner.queue(actor.tenantId!, actor.userId, cursor); }
  @Post(':operation') act(@CurrentUser() actor: AuthenticatedUser, @Param('operation') operation: string, @Body() value: unknown, @Headers('idempotency-key') key: string | undefined) {
    if (!['moderate', 'reply'].includes(operation)) throw new BadRequestException('Explicit moderation operation required');
    return this.owner.act(actor.tenantId!, actor.userId, operation as CommunityOperation, value, key);
  }
}
