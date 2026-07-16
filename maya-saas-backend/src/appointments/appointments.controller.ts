import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { PreviewAppointmentDto } from './dto/preview-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@TenantScoped()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an appointment through the tenant CRM adapter',
  })
  createAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.createForClient(
      user.tenantId!,
      user.userId,
      dto,
    );
  }

  @Post('preview')
  @ApiOperation({
    summary:
      'Validate an appointment request against the tenant CRM without creating a live booking',
  })
  previewAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PreviewAppointmentDto,
  ) {
    return this.appointmentsService.previewForClient(
      user.tenantId!,
      user.userId,
      dto,
    );
  }

  @Get('my')
  @ApiOperation({ summary: 'List appointments for the current client user' })
  listMyAppointments(@CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.listClientAppointments(
      user.tenantId!,
      user.userId,
    );
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a client appointment' })
  cancelAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') appointmentId: string,
  ) {
    return this.appointmentsService.cancelForClient(
      user.tenantId!,
      user.userId,
      appointmentId,
    );
  }

  @Post(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule a client appointment' })
  rescheduleAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') appointmentId: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.rescheduleForClient(
      user.tenantId!,
      user.userId,
      appointmentId,
      dto,
    );
  }
}
