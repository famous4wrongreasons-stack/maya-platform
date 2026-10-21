import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { PersonalClientContextService } from './personal-client-context.service';
import { PersonalClientReadService } from './personal-client-read.service';
import { PersonalCreateAppointmentDto } from './dto/personal-create-appointment.dto';
import {
  PersonalAppointmentMoveDto,
  PersonalAppointmentTargetDto,
} from './dto/personal-appointment-action.dto';

/** Explicit personal authority on each request. No global mode or role switch. */
@Controller('personal-client')
@TenantScoped()
@RequiresFeature('booking')
export class PersonalClientController {
  constructor(
    private readonly contexts: PersonalClientContextService,
    private readonly appointments: AppointmentsService,
    private readonly reads: PersonalClientReadService,
  ) {}

  @Get('appointments/my')
  async ownAppointments(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-maya-authority-context') selection: string | undefined,
  ) {
    await this.contexts.select(user, selection);
    return this.appointments.listClientAppointments(
      user.tenantId!,
      user.userId,
    );
  }

  @Post('appointments/cancel')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-maya-authority-context') selection: string | undefined,
    @Body() dto: PersonalAppointmentTargetDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const personalContext = await this.contexts.select(user, selection);
    return this.appointments.cancelForClient(
      user.tenantId!,
      user.userId,
      dto.appointmentId,
      {
        personalContext,
        ...(key?.trim()
          ? {
              callerIdempotency: {
                scope: 'personal-client.http.cancel',
                key: key.trim(),
              },
            }
          : {}),
      },
    );
  }

  @Post('appointments/reschedule')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-maya-authority-context') selection: string | undefined,
    @Body() dto: PersonalAppointmentMoveDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const personalContext = await this.contexts.select(user, selection);
    return this.appointments.rescheduleForClient(
      user.tenantId!,
      user.userId,
      dto.appointmentId,
      { start: dto.start },
      {
        personalContext,
        ...(key?.trim()
          ? {
              callerIdempotency: {
                scope: 'personal-client.http.reschedule',
                key: key.trim(),
              },
            }
          : {}),
      },
    );
  }

  @Get('appointments/results')
  results(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-maya-authority-context') selection: string | undefined,
  ) {
    return this.reads.results(user, selection);
  }

  @Post('appointments/preview')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-maya-authority-context') selection: string | undefined,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.reads.preview(user, selection, dto);
  }

  @Post('appointments')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-maya-authority-context') selection: string | undefined,
    @Body() dto: PersonalCreateAppointmentDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const personalContext = await this.contexts.select(user, selection);
    const { previewFactsHash, ...booking } = dto;
    return this.appointments.createForClient(
      user.tenantId!,
      user.userId,
      booking,
      {
        personalContext,
        expectedBookingFactsHash: previewFactsHash,
        ...(key?.trim()
          ? {
              callerIdempotency: {
                scope: 'personal-client.http.create',
                key: key.trim(),
              },
            }
          : {}),
      },
    );
  }
}
