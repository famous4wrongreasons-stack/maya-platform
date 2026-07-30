import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const TRIAL_ACTIVATION_SOURCES = ['maya_os', 'web', 'partner'] as const;

export class CreateTrialActivationDto {
  @ApiPropertyOptional({
    enum: TRIAL_ACTIVATION_SOURCES,
    default: 'maya_os',
  })
  @IsOptional()
  @IsIn(TRIAL_ACTIVATION_SOURCES)
  source?: (typeof TRIAL_ACTIVATION_SOURCES)[number];
}
