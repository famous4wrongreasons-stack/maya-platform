import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { AvailableSlotsQueryDto } from '../crm/dto/available-slots-query.dto';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { AvailableDaysQueryDto } from './dto/available-days-query.dto';
import { AppointmentsService } from './appointments.service';

@ApiTags('appointments')
@ApiBearerAuth()
@TenantScoped()
@RequiresFeature('booking')
@Controller()
export class AvailabilityController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get('available-slots')
  @ApiOperation({
    summary: 'List available booking slots from the tenant CRM adapter',
  })
  getAvailableSlots(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AvailableSlotsQueryDto,
  ) {
    return this.appointmentsService.getAvailableSlots(user.tenantId!, query);
  }

  @Get('available-days')
  @ApiOperation({
    summary: 'List days with at least one available booking slot',
  })
  getAvailableDays(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AvailableDaysQueryDto,
  ) {
    return this.appointmentsService.getAvailableDays(user.tenantId!, query);
  }
}
