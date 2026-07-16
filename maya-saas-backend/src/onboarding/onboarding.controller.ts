import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { CreateTrialSignupDto } from './dto/create-trial-signup.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Public()
  @Post('trial')
  @ApiOperation({
    summary:
      'Create a self-serve trial tenant with mock CRM and a tenant admin session',
  })
  createTrialSignup(@Body() dto: CreateTrialSignupDto) {
    return this.onboardingService.createTrialSignup(dto);
  }
}
