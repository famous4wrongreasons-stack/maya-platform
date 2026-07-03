import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { TenantStatus, UserRole } from '../common/domain.enums';
import { UpdateBrandingDto } from '../branding/dto/update-branding.dto';
import { CreateCrmIntegrationDto } from '../crm/dto/create-crm-integration.dto';
import { UpdateCrmIntegrationDto } from '../crm/dto/update-crm-integration.dto';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { CreateTenantDto } from '../tenants/dto/create-tenant.dto';
import { UpdateTenantDto } from '../tenants/dto/update-tenant.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/tenants')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  @Roles(UserRole.PLATFORM_OWNER)
  @ApiOperation({ summary: 'Create a new tenant/salon' })
  createTenant(
    @Body() dto: CreateTenantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.createTenant(dto, actor);
  }

  @Get()
  @Roles(UserRole.PLATFORM_OWNER)
  @ApiOperation({ summary: 'List all tenants' })
  listTenants() {
    return this.adminService.listTenants();
  }

  @Get(':id')
  @Roles(UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN)
  @TenantScoped({ paramKey: 'id', requireTenant: false })
  @ApiOperation({ summary: 'Get a tenant by id' })
  getTenant(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.adminService.getTenant(id, actor);
  }

  @Patch(':id')
  @Roles(UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN)
  @TenantScoped({ paramKey: 'id', requireTenant: false })
  @ApiOperation({ summary: 'Update tenant details' })
  updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.updateTenant(id, dto, actor);
  }

  @Patch(':id/branding')
  @Roles(UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN)
  @TenantScoped({ paramKey: 'id', requireTenant: false })
  @ApiOperation({ summary: 'Update tenant white-label branding' })
  updateBranding(
    @Param('id') id: string,
    @Body() dto: UpdateBrandingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.updateBranding(id, dto, actor);
  }

  @Post(':id/crm')
  @Roles(UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN)
  @TenantScoped({ paramKey: 'id', requireTenant: false })
  @ApiOperation({ summary: 'Connect a CRM integration for a tenant' })
  connectCrm(
    @Param('id') id: string,
    @Body() dto: CreateCrmIntegrationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.upsertCrm(id, dto, actor);
  }

  @Patch(':id/crm')
  @Roles(UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN)
  @TenantScoped({ paramKey: 'id', requireTenant: false })
  @ApiOperation({ summary: 'Update a tenant CRM integration' })
  updateCrm(
    @Param('id') id: string,
    @Body() dto: UpdateCrmIntegrationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.upsertCrm(id, dto, actor);
  }

  @Post(':id/test-crm')
  @Roles(UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN)
  @TenantScoped({ paramKey: 'id', requireTenant: false })
  @ApiOperation({ summary: 'Test the current CRM connection' })
  testCrm(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.adminService.testCrm(id, actor);
  }

  @Post(':id/suspend')
  @Roles(UserRole.PLATFORM_OWNER)
  @ApiOperation({ summary: 'Suspend a tenant' })
  suspendTenant(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.setTenantStatus(id, TenantStatus.SUSPENDED, actor);
  }

  @Post(':id/activate')
  @Roles(UserRole.PLATFORM_OWNER)
  @ApiOperation({ summary: 'Activate a tenant' })
  activateTenant(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.setTenantStatus(id, TenantStatus.ACTIVE, actor);
  }
}
