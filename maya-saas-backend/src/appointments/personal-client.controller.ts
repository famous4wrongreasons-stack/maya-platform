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
    @Body() dto: CreateAppointmentDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const personalContext = await this.contexts.select(user, selection);
    return this.appointments.createForClient(user.tenantId!, user.userId, dto, {
      personalContext,
      ...(key?.trim()
        ? {
            callerIdempotency: {
              scope: 'personal-client.http.create',
              key: key.trim(),
            },
          }
        : {}),
    });
  }
}
