import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../common/domain.enums';
import { BUSINESS_TEMPLATE_IDS } from '../business-templates';

export class CreateAiOnboardingDraftDto {
  @ApiProperty({
    description: 'Natural-language or transcribed business story.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({ enum: BUSINESS_TEMPLATE_IDS })
  @IsOptional()
  @IsIn(BUSINESS_TEMPLATE_IDS)
  templateId?: string;

  @ApiPropertyOptional({
    description:
      'Secret returned after the user completes the trial activation swipe.',
  })
  @IsOptional()
  @IsString()
  @MinLength(32)
  trialActivationToken?: string;
}

export class ContinueAiOnboardingDraftDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  draftToken!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}

export class ReadAiOnboardingDraftDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  draftToken!: string;
}

export class DiscoverAiOnboardingCrmDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  draftToken!: string;

  @ApiProperty({ enum: CrmProvider })
  @IsEnum(CrmProvider)
  provider!: CrmProvider;

  @ApiProperty({
    description:
      'CRM credential used only for discovery. It is not persisted in the onboarding draft.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  apiToken!: string;
}

export class ImportAiOnboardingCrmDto extends DiscoverAiOnboardingCrmDto {
  @ApiProperty({ example: '503759' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  companyId!: string;
}

export class AiOnboardingServiceDto {
  @ApiProperty({ example: 'Мужская стрижка' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 2000 })
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  price!: number;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes!: number;
}

export class AiOnboardingWeeklyRuleDto {
  @ApiProperty({
    example: 1,
    description: '0=Sunday, 1=Monday, ... 6=Saturday',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ example: '09:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}

const ONBOARDING_TEAM_ROLES = [UserRole.ADMINISTRATOR, UserRole.STAFF] as const;

export class AiOnboardingTeamMemberDto {
  @ApiProperty({ example: '12345' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  externalStaffId!: string;

  @ApiProperty({ example: 'Илья Третьяков' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @ApiPropertyOptional({ example: 'Барбер' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiProperty({ enum: ONBOARDING_TEAM_ROLES, example: UserRole.STAFF })
  @IsIn(ONBOARDING_TEAM_ROLES)
  role!: (typeof ONBOARDING_TEAM_ROLES)[number];

  @ApiPropertyOptional({ example: 'barber@example.ru' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+79990000000' })
  @IsOptional()
  @IsString()
  @Matches(/^(?=(?:\D*\d){10,15}\D*$)\+?[\d\s().-]+$/)
  phone?: string;
}

export class ConfirmAiOnboardingDraftDto {
  @ApiProperty({
    description: 'Exact server revision shown in the approved preview',
  })
  @IsInt()
  @Min(0)
  expectedDraftRevision!: number;

  @ApiProperty()
  @IsString()
  @MinLength(32)
  draftToken!: string;

  @ApiPropertyOptional({
    description:
      'Required when the draft was started from a trial activation swipe.',
  })
  @IsOptional()
  @IsString()
  @MinLength(32)
  trialActivationToken?: string;

  @ApiProperty({ example: 'owner@example.ru' })
  @IsEmail()
  ownerEmail!: string;

  @ApiProperty({ example: 'Алексей' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerName!: string;

  @ApiProperty({
    example: '+79990000000',
    description:
      'Required recovery/login channel until social identity binding is part of onboarding.',
  })
  @IsString()
  @Matches(/^(?=(?:\D*\d){10,15}\D*$)\+?[\d\s().-]+$/)
  ownerPhone!: string;

  @ApiPropertyOptional({
    example: '12345',
    description:
      'CRM staff identity that belongs to the owner. The owner role itself is immutable during onboarding.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  ownerExternalStaffId?: string;

  @ApiPropertyOptional({ type: [AiOnboardingTeamMemberDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AiOnboardingTeamMemberDto)
  teamMembers?: AiOnboardingTeamMemberDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName?: string;

  @ApiPropertyOptional({ enum: BUSINESS_TEMPLATE_IDS })
  @IsOptional()
  @IsIn(BUSINESS_TEMPLATE_IDS)
  templateId?: string;

  @ApiPropertyOptional({ enum: CalendarSource })
  @IsOptional()
  @IsEnum(CalendarSource)
  calendarSource?: CalendarSource;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  providerCount?: number;

  @ApiPropertyOptional({ type: [AiOnboardingServiceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AiOnboardingServiceDto)
  services?: AiOnboardingServiceDto[];

  @ApiPropertyOptional({ type: [AiOnboardingWeeklyRuleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => AiOnboardingWeeklyRuleDto)
  weeklyRules?: AiOnboardingWeeklyRuleDto[];
}
