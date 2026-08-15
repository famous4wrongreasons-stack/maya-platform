import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import {
  IngestRecoveryTouchpointDto,
  RecoveryReportQueryDto,
} from './dto/recovery.dto';
import { RecoveryService } from './recovery.service';

const RECOVERY_REPORT_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.ACCOUNTANT,
] as const;

@ApiTags('recovery')
@Controller('recovery')
export class RecoveryController {
  constructor(private readonly recoveryService: RecoveryService) {}

  @Public()
  @Post('internal/touchpoints')
  @ApiOperation({ summary: 'Ingest a consent-safe recovery touchpoint' })
  ingest(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: IngestRecoveryTouchpointDto,
  ) {
    this.recoveryService.assertBridgeToken(bridgeToken);
    return this.recoveryService.ingestTouchpoint(dto);
  }

  @ApiBearerAuth()
  @TenantScoped()
  @Roles(...RECOVERY_REPORT_ROLES)
  @RequiresFeature('analytics.business')
  @Get('report')
  @ApiOperation({ summary: 'Read verified MAYA Recovered attribution' })
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RecoveryReportQueryDto,
  ) {
    return this.recoveryService.report(
      user.tenantId!,
      new Date(query.from),
      new Date(query.to),
    );
  }
}
