import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { PreviewAppointmentDto } from './dto/preview-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@TenantScoped()
@RequiresFeature('booking')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an appointment through the configured calendar source',
  })
  createAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAppointmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.appointmentsService.createForClient(
      user.tenantId!,
      user.userId,
      dto,
      this.actionInvocation('appointments.http.create', idempotencyKey),
    );
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Validate an appointment request without creating a live booking',
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
  @ApiOperation({
    summary: 'Read canonical appointments for the verified Client binding',
  })
  listMyAppointments(@CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.listClientAppointments(
      user.tenantId!,
      user.userId,
    );
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a verified Client appointment through the Action Engine',
  })
  cancelAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') appointmentId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.appointmentsService.cancelForClient(
      user.tenantId!,
      user.userId,
      appointmentId,
      this.actionInvocation('appointments.http.cancel', idempotencyKey),
    );
  }

  @Post(':id/reschedule')
  @ApiOperation({
    summary:
      'Reschedule a verified Client appointment through the Action Engine',
  })
  rescheduleAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') appointmentId: string,
    @Body() dto: RescheduleAppointmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.appointmentsService.rescheduleForClient(
      user.tenantId!,
      user.userId,
      appointmentId,
      dto,
      this.actionInvocation('appointments.http.reschedule', idempotencyKey),
    );
  }

  private actionInvocation(scope: string, idempotencyKey?: string) {
    const key = idempotencyKey?.trim();
    return key ? { callerIdempotency: { scope, key } } : {};
  }
}
