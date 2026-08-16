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
import { attendanceFromWritableCode, attendanceToCode } from './crm-attendance';
import { CrmService } from './crm.service';
import { ConnectCrmIntegrationDto } from './dto/connect-crm-integration.dto';
import { DiscoverCrmCompaniesDto } from './dto/discover-crm-companies.dto';
import { ListCrmJournalDto } from './dto/list-crm-journal.dto';
import {
  CreateCrmJournalAppointmentDto,
  RescheduleCrmJournalAppointmentDto,
  SearchCrmClientsDto,
  SetCrmAttendanceDto,
  SetCrmDurationDto,
  SetCrmServicesDto,
} from './dto/crm-visit-operations.dto';

const CRM_MANAGEMENT_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
];

/**
 * Журнал и операции над визитом — работа всей смены, а не только владельца.
 * Мастер обязан видеть свою сетку и вести в ней записи, иначе кабинет
 * сотрудника отличается от PWA, где это умеет каждый.
 */
const CRM_JOURNAL_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
];

/**
 * Телефоны клиентов — ПД (152-ФЗ). В легаси-кабинете подсказку по базе видел
 * только владелец; рядовой мастер перебором выгрузил бы всю базу салона.
 */
const CRM_CLIENT_PII_ROLES = CRM_MANAGEMENT_ROLES;

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
  @Roles(...CRM_JOURNAL_ROLES)
  @ApiOperation({
    summary: 'Read the tenant operational journal from the connected CRM',
  })
  journal(
    @Query() query: ListCrmJournalDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.crmService.getJournal(this.tenantId(actor), query);
  }

  @Post('journal/appointments')
  @Roles(...CRM_JOURNAL_ROLES)
  @ApiOperation({
    summary: 'Book a client by hand from the schedule grid (admin path)',
  })
  async createJournalAppointment(
    @Body() dto: CreateCrmJournalAppointmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const tenantId = this.tenantId(actor);
    // Мастер сажает клиента только в СВОЁ кресло. Маршрут открыт смене
    // (provider, employee, staff), и без этой проверки чужой staff_id уходил в
    // CRM как есть — визит садился в чужую сетку, хотя прочитать или отменить
    // чужой визит тот же модуль запрещает.
    await this.crmService.assertJournalStaffWritable(
      tenantId,
      actor,
      dto.staff_id,
    );
    // 🔴 Сознательно НЕ через appointments/createForClient: тот путь требует
    // совпадения со свободным окном и отвечает slot_taken. Мастер в журнале
    // сажает клиента куда решил — это админская запись, allowBusy.
    const result = await this.crmService.createAppointment(tenantId, {
      clientId: actor.userId,
      clientName: dto.client_name || '',
      clientPhone: dto.client_phone || null,
      staffId: dto.staff_id,
      serviceIds: dto.service_ids,
      start: dto.start,
      notes: dto.notes ?? null,
      allowBusy: true,
      durationMinutes: dto.duration_minutes,
    });

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.appointment_created_by_staff',
      entityType: 'crm_appointment',
      entityId: result.external_id,
      metadata: {
        staff_id: dto.staff_id,
        service_count: dto.service_ids.length,
      },
    });

    return result;
  }

  @Get('journal/appointments/:externalId')
  @Roles(...CRM_JOURNAL_ROLES)
  @ApiOperation({ summary: 'Read one visit card from the connected CRM' })
  async appointmentDetail(
    @Param('externalId') externalId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const detail = await this.crmService.getAppointmentDetail(
      this.tenantId(actor),
      actor,
      externalId,
    );

    // 🔴 Числовой код возвращается на провод НЕИЗМЕННЫМ: выпущенный PWA читает
    // именно его. Внутри системы ездит канон — см. `crm-attendance.ts`.
    return { ...detail, attendance: attendanceToCode(detail.attendance) };
  }

  @Post('journal/appointments/:externalId/attendance')
  @Roles(...CRM_JOURNAL_ROLES)
  @ApiOperation({ summary: 'Mark the client as arrived or no-show' })
  async setAttendance(
    @Param('externalId') externalId: string,
    @Body() dto: SetCrmAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const tenantId = this.tenantId(actor);
    const result = await this.crmService.markAppointmentAttendance(
      tenantId,
      actor,
      externalId,
      attendanceFromWritableCode(dto.attendance),
    );
    // Провод и запись в аудит остаются числом — оба контракта уже опубликованы.
    const wire = {
      ...result,
      attendance: attendanceToCode(result.attendance),
    };

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.appointment_attendance_set',
      entityType: 'crm_appointment',
      entityId: externalId,
      metadata: { attendance: wire.attendance },
    });

    return wire;
  }

  @Post('journal/appointments/:externalId/duration')
  @Roles(...CRM_JOURNAL_ROLES)
  @ApiOperation({
    summary: 'Shrink or stretch a visit without moving its start',
  })
  async setDuration(
    @Param('externalId') externalId: string,
    @Body() dto: SetCrmDurationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const tenantId = this.tenantId(actor);
    const result = await this.crmService.setAppointmentDuration(
      tenantId,
      actor,
      externalId,
      dto.duration_minutes,
    );

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.appointment_duration_set',
      entityType: 'crm_appointment',
      entityId: externalId,
      metadata: { duration_minutes: result.duration_minutes },
    });

    return result;
  }

  @Post('journal/appointments/:externalId/services')
  @Roles(...CRM_JOURNAL_ROLES)
  @ApiOperation({ summary: 'Replace the services of a visit, keeping prices' })
  async setServices(
    @Param('externalId') externalId: string,
    @Body() dto: SetCrmServicesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const tenantId = this.tenantId(actor);
    const result = await this.crmService.setAppointmentServices(
      tenantId,
      actor,
      externalId,
      dto.service_ids,
    );

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.appointment_services_set',
      entityType: 'crm_appointment',
      entityId: externalId,
      metadata: { service_count: result.service_ids.length },
    });

    return result;
  }

  @Post('journal/appointments/:externalId/reschedule')
  @Roles(...CRM_JOURNAL_ROLES)
  @ApiOperation({ summary: 'Move a visit to another time or master' })
  async rescheduleJournalAppointment(
    @Param('externalId') externalId: string,
    @Body() dto: RescheduleCrmJournalAppointmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const tenantId = this.tenantId(actor);
    const result = await this.crmService.rescheduleJournalAppointment(
      tenantId,
      actor,
      {
        externalId,
        start: dto.start,
        staffId: dto.staff_id,
        serviceIds: dto.service_ids,
      },
    );

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.appointment_rescheduled_by_staff',
      entityType: 'crm_appointment',
      entityId: externalId,
      metadata: { start: result.start, staff_id: result.staff_id },
    });

    return result;
  }

  @Post('journal/appointments/:externalId/cancel')
  @Roles(...CRM_JOURNAL_ROLES)
  @ApiOperation({ summary: 'Cancel a visit from the schedule grid' })
  async cancelJournalAppointment(
    @Param('externalId') externalId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const tenantId = this.tenantId(actor);
    const result = await this.crmService.cancelJournalAppointment(
      tenantId,
      actor,
      externalId,
    );

    await this.auditLogService.log({
      tenantId,
      userId: actor.userId,
      action: 'crm.appointment_cancelled_by_staff',
      entityType: 'crm_appointment',
      entityId: externalId,
      metadata: { status: result.status },
    });

    return result;
  }

  @Get('clients/search')
  @Roles(...CRM_CLIENT_PII_ROLES)
  @ApiOperation({ summary: 'Suggest a returning client while booking by hand' })
  async searchClients(
    @Query() query: SearchCrmClientsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    // Подсказку в аудит не пишем: это чтение чужих ПД по подстроке, и лог
    // превратился бы во второй, никем не охраняемый список клиентов.
    const clients = await this.crmService.searchClients(
      this.tenantId(actor),
      query.query,
    );

    return { count: clients.length, clients };
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
