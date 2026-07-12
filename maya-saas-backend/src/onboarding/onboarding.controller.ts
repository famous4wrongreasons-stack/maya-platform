import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { resolveAuthClientMetadata } from '../auth/auth-client-metadata';
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
    summary: 'Create a self-serve trial tenant and owner session',
  })
  createTrialSignup(
    @Body() dto: CreateTrialSignupDto,
    @Req() request: Request,
  ) {
    return this.onboardingService.createTrialSignup(
      dto,
      resolveAuthClientMetadata(request),
    );
  }
}
