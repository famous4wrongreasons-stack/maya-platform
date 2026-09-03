import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

import type { UploadedLogoFile } from '../branding/branding.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { QuotaResource } from '../quotas/quota-resource';
import { RequiresQuota } from '../quotas/requires-quota.decorator';
import { Package5Wave4CanonicalCutoverService } from '../package5-wave4/package5-wave4-canonical-cutover.service';
import { CreateInternalServiceDto } from './dto/create-internal-service.dto';
import { CreateInternalProviderDto } from './dto/create-internal-provider.dto';
import { CreateTimeOffDto } from './dto/create-time-off.dto';
import { ListCalendarJournalDto } from './dto/list-calendar-journal.dto';
import { ReplaceWeeklyAvailabilityDto } from './dto/replace-weekly-availability.dto';
import { UpdateInternalProviderDto } from './dto/update-internal-provider.dto';
import { UpdateInternalServiceDto } from './dto/update-internal-service.dto';
import { InternalCalendarService } from './internal-calendar.service';

const INTERNAL_CALENDAR_MANAGER_ROLES = [
  UserRole.TENANT_ADMIN,
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.ADMINISTRATOR,
] as const;

type ProviderAvatarUploadFields = {
  avatar?: UploadedLogoFile[];
  file?: UploadedLogoFile[];
};

@ApiTags('internal-calendar')
@ApiBearerAuth()
@TenantScoped()
@Roles(...INTERNAL_CALENDAR_MANAGER_ROLES)
@Controller('internal-calendar')
export class InternalCalendarController {
  constructor(
    private readonly internalCalendarService: InternalCalendarService,
    private readonly canonicalWave4: Package5Wave4CanonicalCutoverService,
  ) {}

  @Get('setup')
  @ApiOperation({ summary: 'Read the Maya-managed calendar setup' })
  getSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.internalCalendarService.getSetup(user.tenantId!);
  }

  @Get('journal')
  @ApiOperation({
    summary: 'Read the tenant-scoped operational appointment journal',
  })
  getJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCalendarJournalDto,
  ) {
    return this.internalCalendarService.getJournal(user.tenantId!, query);
  }

  @Post('services')
  @ApiOperation({ summary: 'Create a Maya-managed service' })
  createService(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInternalServiceDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.canonicalWave4.createService(
      user.tenantId!,
      user.userId,
      dto,
      idempotencyKey,
    );
  }

  @Patch('services/:serviceId')
  @ApiOperation({ summary: 'Update a Maya-managed service' })
  updateService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateInternalServiceDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.canonicalWave4.updateService(
      user.tenantId!,
      user.userId,
      serviceId,
      dto,
      idempotencyKey,
    );
  }

  @Delete('services/:serviceId')
  @ApiOperation({ summary: 'Deactivate a Maya-managed service' })
  deactivateService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceId') serviceId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.canonicalWave4.archiveService(
      user.tenantId!,
      user.userId,
      serviceId,
      idempotencyKey,
    );
  }

  @Patch('providers/:providerId')
  @ApiOperation({ summary: 'Update a Maya-managed provider profile' })
  updateProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Body() dto: UpdateInternalProviderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.canonicalWave4.updateProvider(
      user.tenantId!,
      user.userId,
      providerId,
      dto,
      idempotencyKey,
    );
  }

  @Post('providers/:providerId/avatar')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'avatar', maxCount: 1 },
      ],
      { limits: { fileSize: 2 * 1024 * 1024 } },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a Maya-managed provider profile image' })
  uploadProviderAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @UploadedFiles() files: ProviderAvatarUploadFields,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const file = files?.avatar?.[0] ?? files?.file?.[0];
    return this.canonicalWave4.uploadProviderAvatar(
      user.tenantId!,
      user.userId,
      providerId,
      file,
      idempotencyKey,
    );
  }

  @Post('providers')
  @RequiresQuota(QuotaResource.STAFF)
  @ApiOperation({ summary: 'Create a Maya-managed provider without a login' })
  createProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInternalProviderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.canonicalWave4.createProvider(
      user.tenantId!,
      user.userId,
      dto,
      idempotencyKey,
    );
  }

  @Get('providers/:providerId/schedule')
  @ApiOperation({ summary: 'Read weekly availability and time off' })
  getProviderSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
  ) {
    return this.internalCalendarService.getProviderSchedule(
      user.tenantId!,
      providerId,
    );
  }

  @Put('providers/:providerId/schedule')
  @ApiOperation({ summary: 'Replace weekly availability atomically' })
  replaceProviderSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Body() dto: ReplaceWeeklyAvailabilityDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.canonicalWave4.replaceWeeklyAvailability(
      user.tenantId!,
      user.userId,
      providerId,
      dto.rules,
      idempotencyKey,
    );
  }

  @Post('providers/:providerId/time-off')
  @ApiOperation({ summary: 'Block time in a Maya-managed calendar' })
  createTimeOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Body() dto: CreateTimeOffDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.canonicalWave4.createTimeOff(
      user.tenantId!,
      user.userId,
      providerId,
      dto,
      idempotencyKey,
    );
  }

  @Delete('providers/:providerId/time-off/:exceptionId')
  @ApiOperation({ summary: 'Remove a Maya-managed time-off block' })
  deleteTimeOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Param('exceptionId') exceptionId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.canonicalWave4.deleteTimeOff(
      user.tenantId!,
      user.userId,
      providerId,
      exceptionId,
      idempotencyKey,
    );
  }
}
