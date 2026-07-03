import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { PreviewAppointmentDto } from './dto/preview-appointment.dto';

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
}
