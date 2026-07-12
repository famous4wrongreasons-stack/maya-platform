import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { UploadedLogoFile } from '../branding/branding.service';
import { TenantStatus, UserRole } from '../common/domain.enums';
import { UpdateBrandingDto } from '../branding/dto/update-branding.dto';
import { CreateCrmIntegrationDto } from '../crm/dto/create-crm-integration.dto';
import { UpdateCrmIntegrationDto } from '../crm/dto/update-crm-integration.dto';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { CreateTenantDto } from '../tenants/dto/create-tenant.dto';
import { UpdateTenantDto } from '../tenants/dto/update-tenant.dto';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/tenants')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  @Roles(UserRole.PLATFORM_OWNER)
  @ApiOperation({ summary: 'Create a new service-business tenant' })
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

  @Post(':id/logo')
  @Roles(UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN)
  @TenantScoped({ paramKey: 'id', requireTenant: false })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 2 * 1024 * 1024,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a tenant logo file' })
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: UploadedLogoFile,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.uploadTenantLogo(id, file, actor);
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

  @Post(':id/users')
  @Roles(UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN)
  @TenantScoped({ paramKey: 'id', requireTenant: false })
  @ApiOperation({ summary: 'Create a tenant-scoped admin/staff user' })
  createTenantUser(
    @Param('id') id: string,
    @Body() dto: CreateTenantUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.createTenantUser(id, dto, actor);
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
