import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
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

@ApiTags('internal-calendar')
@ApiBearerAuth()
@TenantScoped()
@Roles(...INTERNAL_CALENDAR_MANAGER_ROLES)
@Controller('internal-calendar')
export class InternalCalendarController {
  constructor(
    private readonly internalCalendarService: InternalCalendarService,
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
  ) {
    return this.internalCalendarService.createService(user.tenantId!, dto);
  }

  @Patch('services/:serviceId')
  @ApiOperation({ summary: 'Update a Maya-managed service' })
  updateService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateInternalServiceDto,
  ) {
    return this.internalCalendarService.updateService(
      user.tenantId!,
      serviceId,
      dto,
    );
  }

  @Delete('services/:serviceId')
  @ApiOperation({ summary: 'Deactivate a Maya-managed service' })
  deactivateService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceId') serviceId: string,
  ) {
    return this.internalCalendarService.deactivateService(
      user.tenantId!,
      serviceId,
    );
  }

  @Patch('providers/:providerId')
  @ApiOperation({ summary: 'Update a Maya-managed provider profile' })
  updateProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Body() dto: UpdateInternalProviderDto,
  ) {
    return this.internalCalendarService.updateProvider(
      user.tenantId!,
      providerId,
      dto,
    );
  }

  @Post('providers')
  @ApiOperation({ summary: 'Create a Maya-managed provider without a login' })
  createProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInternalProviderDto,
  ) {
    return this.internalCalendarService.createProvider(user.tenantId!, dto);
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
  ) {
    return this.internalCalendarService.replaceWeeklyAvailability(
      user.tenantId!,
      providerId,
      dto.rules,
    );
  }

  @Post('providers/:providerId/time-off')
  @ApiOperation({ summary: 'Block time in a Maya-managed calendar' })
  createTimeOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Body() dto: CreateTimeOffDto,
  ) {
    return this.internalCalendarService.createTimeOff(
      user.tenantId!,
      providerId,
      dto,
    );
  }

  @Delete('providers/:providerId/time-off/:exceptionId')
  @ApiOperation({ summary: 'Remove a Maya-managed time-off block' })
  deleteTimeOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Param('exceptionId') exceptionId: string,
  ) {
    return this.internalCalendarService.deleteTimeOff(
      user.tenantId!,
      providerId,
      exceptionId,
    );
  }
}
