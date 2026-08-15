import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const RECOVERY_KINDS = [
  'cycle',
  'reactivation',
  'freed_slot',
  'manual',
] as const;

export const RECOVERY_CHANNELS = [
  'maya_inbox',
  'push',
  'telegram',
  'email',
] as const;

export const RECOVERY_TOUCHPOINT_STATUSES = [
  'sent',
  'delivered',
  'failed',
] as const;

export class IngestRecoveryTouchpointDto {
  @IsString()
  @MaxLength(80)
  tenant_slug!: string;

  @IsString()
  @MaxLength(160)
  external_event_id!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  subject_ref!: string;

  @IsIn(RECOVERY_KINDS)
  kind!: (typeof RECOVERY_KINDS)[number];

  @IsIn(RECOVERY_CHANNELS)
  channel!: (typeof RECOVERY_CHANNELS)[number];

  @IsIn(RECOVERY_TOUCHPOINT_STATUSES)
  status!: (typeof RECOVERY_TOUCHPOINT_STATUSES)[number];

  @IsISO8601({ strict: true })
  occurred_at!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  attribution_window_days?: number;
}

export class RecoveryReportQueryDto {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;
}
