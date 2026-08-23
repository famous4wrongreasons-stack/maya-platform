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
  'appointment_reminder',
  'shift_reminder',
  'appointment_reassigned',
  'hanging_lead',
  'owner_alert',
  'client_support_request',
  'maya_task',
  'marketing_campaign',
] as const;

export class IngestInboxItemDto {
  /**
   * 🔴 Совместимость, а не идентичность. Слаг — это ИМЯ арендатора, которое
   * владелец вправе поменять; приём по нему уже ломался (403 на каждом вызове
   * моста). Устойчивое отображение — пара ниже.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  tenant_slug!: string;

  /** Провайдер CRM источника: вместе с компанией даёт арендатора. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  provider?: string;

  /** Идентификатор компании у провайдера. Живёт в интеграции арендатора. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  external_company_id?: string;

  @IsString()
  @IsIn(INBOX_TYPES)
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

/**
 * Read-only observation of a Telegram message already sent by the legacy bot.
 * The route fixes channel, taxonomy and permissions server-side; callers may
 * provide only the tenant source, recipient and content identity inputs.
 */
export class ObserveLegacyTelegramDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  tenant_slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  external_company_id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  source_event_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  telegram_chat_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  body_text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  template_ref?: string;
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
