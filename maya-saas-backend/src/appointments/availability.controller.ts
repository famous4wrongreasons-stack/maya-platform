import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { AvailableSlotsQueryDto } from '../crm/dto/available-slots-query.dto';
import { AppointmentsService } from './appointments.service';

@ApiTags('appointments')
@ApiBearerAuth()
@TenantScoped()
@Controller('available-slots')
export class AvailabilityController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List available booking slots from the tenant CRM adapter',
  })
  getAvailableSlots(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AvailableSlotsQueryDto,
  ) {
    return this.appointmentsService.getAvailableSlots(user.tenantId!, query);
  }
}
