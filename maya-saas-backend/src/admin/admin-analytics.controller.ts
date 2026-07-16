import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { UserRole } from '../common/domain.enums';
import { Roles } from '../decorators/roles.decorator';
import { TrialActivationService } from '../onboarding/trial-activation.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(
    private readonly trialActivationService: TrialActivationService,
  ) {}

  @Get('trials')
  @Roles(UserRole.PLATFORM_OWNER)
  @ApiOperation({
    summary: 'Get verified trial and connected-business metrics for God Mode',
  })
  getTrialAnalytics() {
    return this.trialActivationService.getGodModeAnalytics();
  }
}
