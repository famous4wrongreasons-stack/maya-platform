import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { resolveAuthClientMetadata } from '../auth/auth-client-metadata';
import { Public } from '../decorators/public.decorator';
import { CreateTrialSignupDto } from './dto/create-trial-signup.dto';
import { CreateTrialActivationDto } from './dto/create-trial-activation.dto';
import {
  ConfirmAiOnboardingDraftDto,
  ContinueAiOnboardingDraftDto,
  CreateAiOnboardingDraftDto,
  ReadAiOnboardingDraftDto,
} from './dto/ai-onboarding.dto';
import { AiOnboardingService } from './ai-onboarding.service';
import { OnboardingService } from './onboarding.service';
import { TrialActivationService } from './trial-activation.service';

@ApiTags('onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly aiOnboardingService: AiOnboardingService,
    private readonly trialActivationService: TrialActivationService,
  ) {}

  @Public()
  @Post('trial-activations')
  @ApiOperation({
    summary: 'Create an activation after the MAYA OS trial swipe',
  })
  createTrialActivation(
    @Body() dto: CreateTrialActivationDto,
    @Req() request: Request,
  ) {
    return this.trialActivationService.createActivation(
      dto.source,
      resolveAuthClientMetadata(request),
    );
  }

  @Public()
  @Get('templates')
  @ApiOperation({ summary: 'List ready-to-use MAYA business templates' })
  listTemplates() {
    return this.aiOnboardingService.listTemplates();
  }

  @Public()
  @Post('ai/drafts')
  @ApiOperation({ summary: 'Start privacy-safe conversational onboarding' })
  createAiDraft(
    @Body() dto: CreateAiOnboardingDraftDto,
    @Req() request: Request,
  ) {
    return this.aiOnboardingService.createDraft(
      dto,
      resolveAuthClientMetadata(request),
    );
  }

  @Public()
  @Post('ai/drafts/:draftId/messages')
  @HttpCode(200)
  @ApiOperation({ summary: 'Add an answer to an AI onboarding draft' })
  continueAiDraft(
    @Param('draftId') draftId: string,
    @Body() dto: ContinueAiOnboardingDraftDto,
    @Req() request: Request,
  ) {
    return this.aiOnboardingService.continueDraft(
      draftId,
      dto,
      resolveAuthClientMetadata(request),
    );
  }

  @Public()
  @Post('ai/drafts/:draftId/read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Read an AI onboarding draft using its secret token',
  })
  readAiDraft(
    @Param('draftId') draftId: string,
    @Body() dto: ReadAiOnboardingDraftDto,
  ) {
    return this.aiOnboardingService.readDraft(draftId, dto.draftToken);
  }

  @Public()
  @Post('ai/drafts/:draftId/confirm')
  @ApiOperation({
    summary: 'Confirm a blueprint and create the trial business',
  })
  confirmAiDraft(
    @Param('draftId') draftId: string,
    @Body() dto: ConfirmAiOnboardingDraftDto,
    @Req() request: Request,
  ) {
    return this.aiOnboardingService.confirmDraft(
      draftId,
      dto,
      resolveAuthClientMetadata(request),
    );
  }

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
