import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { UserRole } from './common/domain.enums';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { AppService } from './app.service';
import { SystemMetricsService } from './system-metrics.service';

@ApiTags('system')
@Controller('health')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly metrics: SystemMetricsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  getHealth() {
    return this.appService.getHealth();
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Database-backed readiness check' })
  getReadiness() {
    return this.appService.getReadiness();
  }

  @Get('metrics')
  @ApiBearerAuth()
  @Roles(UserRole.PLATFORM_OWNER)
  @ApiOperation({ summary: 'PII-free process metrics for the platform owner' })
  getMetrics() {
    return this.metrics.snapshot();
  }
}
