import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const INBOX_TYPES = [
  'daily_report',
  'morning_brief',
  'growth_plan',
  'new_appointment',
  'appointment_cancelled',
  'appointment_deleted',
  'appointment_rescheduled',
  'shift_reminder',
  'appointment_reassigned',
  'hanging_lead',
  'owner_alert',
] as const;

export class IngestInboxItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  tenant_slug!: string;

  @IsString()
  @IsIn(INBOX_TYPES as unknown as string[])
  type!: (typeof INBOX_TYPES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  source_event_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  body_text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  deep_link?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  /** Telegram chat ids of recipients (legacy bot). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @Type(() => String)
  telegram_chat_ids?: string[];

  /** Explicit Nest user ids when known. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  user_ids?: string[];

  /**
   * When true/omitted: also deliver to all owners/admins (additive to
   * user_ids / telegram matches). When false: only explicit recipients.
   */
  @IsOptional()
  fanout_owners?: boolean;
}

export class RegisterPushTokenDto {
  @IsString()
  @IsIn(['ios', 'android', 'web'])
  platform!: 'ios' | 'android' | 'web';

  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  token!: string;
}
