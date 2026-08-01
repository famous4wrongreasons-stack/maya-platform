import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { AllowSubscriptionRequired } from '../decorators/allow-subscription-required.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UpdateCrmTeamAccessDto } from '../users/dto/update-crm-team-access.dto';
import { UsersService } from '../users/users.service';
import { CrmService } from './crm.service';
import { ConnectCrmIntegrationDto } from './dto/connect-crm-integration.dto';
import { DiscoverCrmCompaniesDto } from './dto/discover-crm-companies.dto';
import { ListCrmJournalDto } from './dto/list-crm-journal.dto';

const CRM_MANAGEMENT_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
];

const CRM_TEAM_ACCESS_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
];

@ApiTags('crm integrations')
@ApiBearerAuth()
@Controller('integrations/crm')
@Roles(...CRM_MANAGEMENT_ROLES)
@TenantScoped()
export class CrmIntegrationController {
  constructor(
    private readonly crmService: CrmService,
    private readonly auditLogService: AuditLogService,
    private readonly tenantContext: TenantContextService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  @AllowSubscriptionRequired()
  @ApiOperation({ summary: 'Get the current tenant CRM connection status' })
  status(@CurrentUser() actor: AuthenticatedUser) {
    return this.crmService.getIntegrationStatus(this.tenantId(actor));
  }

  @Post('discover')
  @ApiOperation({
    summary: 'Discover CRM companies available to the supplied credential',
  })
  async discover(
    @Body() dto: DiscoverCrmCompaniesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const tenantId = this.tenantId(actor);
    const result = await this.crmService.discoverCompanies(tenantId, dto);

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.companies_discovered',
      entityType: 'crm_integration',
      entityId: tenantId,
      metadata: {
        provider: result.provider,
        company_count: result.companies.length,
      },
    });

    return result;
  }

  @Post('connect')
  @ApiOperation({
    summary: 'Verify CRM credentials, store them encrypted and return preview',
  })
  async connect(
    @Body() dto: ConnectCrmIntegrationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const tenantId = this.tenantId(actor);
    const result = await this.crmService.stageIntegration(tenantId, dto);

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.connection_staged',
      entityType: 'crm_integration',
      entityId: result.connection.id,
      metadata: {
        provider: result.connection.provider,
        service_count: result.preview.services.count,
        staff_count: result.preview.staff.count,
      },
    });

    return result;
  }

  @Get('preview')
  @ApiOperation({ summary: 'Refresh the safe CRM import preview' })
  async preview(@CurrentUser() actor: AuthenticatedUser) {
    const tenantId = this.tenantId(actor);
    const result = await this.crmService.getImportPreview(tenantId);

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.preview_loaded',
      entityType: 'crm_integration',
      entityId: result.connection.id,
      metadata: {
        provider: result.connection.provider,
        service_count: result.preview.services.count,
        staff_count: result.preview.staff.count,
      },
    });

    return result;
  }

  @Get('journal')
  @ApiOperation({
    summary: 'Read the tenant operational journal from the connected CRM',
  })
  journal(
    @Query() query: ListCrmJournalDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crmService.getJournal(this.tenantId(actor), query);
  }

  @Get('team-access')
  @Roles(...CRM_TEAM_ACCESS_ROLES)
  @ApiOperation({
    summary: 'List CRM team roles and MAYA login readiness for this tenant',
  })
  async teamAccess(@CurrentUser() actor: AuthenticatedUser) {
    const tenantId = this.tenantId(actor);
    const synchronization =
      await this.crmService.synchronizeCrmTeamAccess(tenantId);
    const access = await this.usersService.listCrmTeamAccess(
      tenantId,
      actor.userId,
    );

    return { ...access, crm_sync: synchronization };
  }

  @Patch('team-access/:externalStaffId')
  @Roles(...CRM_TEAM_ACCESS_ROLES)
  @ApiOperation({
    summary: 'Assign a MAYA role and login contact to an active CRM employee',
  })
  async updateTeamAccess(
    @Param('externalStaffId') externalStaffId: string,
    @Body() dto: UpdateCrmTeamAccessDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const tenantId = this.tenantId(actor);
    await this.crmService.synchronizeCrmTeamAccess(tenantId);
    const result = await this.usersService.updateCrmTeamAccess({
      tenantId,
      actorUserId: actor.userId,
      externalStaffId,
      update: dto,
    });

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.team_access_updated',
      entityType: 'crm_staff_access',
      entityId: externalStaffId,
      metadata: {
        role: result?.role ?? dto.role ?? null,
        access_status: result?.access_status ?? null,
        email_login_configured: Boolean(result?.email),
        phone_login_configured: Boolean(result?.phone),
      },
    });

    return result;
  }

  @Patch('team-access/:externalStaffId/claim-owner')
  @Roles(...CRM_TEAM_ACCESS_ROLES)
  @ApiOperation({
    summary: 'Link the authenticated tenant owner to an active CRM employee',
  })
  async claimTeamOwner(
    @Param('externalStaffId') externalStaffId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const tenantId = this.tenantId(actor);
    await this.crmService.synchronizeCrmTeamAccess(tenantId);
    const result = await this.usersService.claimCrmTeamOwner({
      tenantId,
      actorUserId: actor.userId,
      externalStaffId,
    });

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.team_owner_linked',
      entityType: 'crm_staff_access',
      entityId: externalStaffId,
      metadata: { role: result?.role ?? null },
    });

    return result;
  }

  @Post('activate')
  @ApiOperation({ summary: 'Recheck and activate the staged CRM connection' })
  async activate(@CurrentUser() actor: AuthenticatedUser) {
    const tenantId = this.tenantId(actor);
    const result = await this.crmService.activateIntegration(tenantId);

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.activated',
      entityType: 'crm_integration',
      entityId: result.connection.id,
      metadata: { provider: result.connection.provider },
    });

    return result;
  }

  @Post('recheck')
  @ApiOperation({ summary: 'Recheck the current CRM connection health' })
  async recheck(@CurrentUser() actor: AuthenticatedUser) {
    const tenantId = this.tenantId(actor);
    const result = await this.crmService.recheckIntegration(tenantId);

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.rechecked',
      entityType: 'crm_integration',
      entityId: result.connection.id,
      metadata: {
        provider: result.provider,
        ok: result.ok,
      },
    });

    return result;
  }

  @Delete()
  @AllowSubscriptionRequired()
  @ApiOperation({ summary: 'Delete the tenant CRM credential and disconnect' })
  async disconnect(@CurrentUser() actor: AuthenticatedUser) {
    const tenantId = this.tenantId(actor);
    const result = await this.crmService.disconnectIntegration(tenantId);

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.disconnected',
      entityType: 'crm_integration',
      entityId: tenantId,
      metadata: { provider: result.disconnected_provider },
    });

    return result;
  }

  private tenantId(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }

    return this.tenantContext.assertTenantId(actor.tenantId);
  }
}
