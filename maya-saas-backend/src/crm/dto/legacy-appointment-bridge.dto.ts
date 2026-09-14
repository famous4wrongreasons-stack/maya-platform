import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const LEGACY_APPOINTMENT_BRIDGE_CONTRACT =
  'maya.legacy-appointment-bridge/1' as const;

export const LEGACY_APPOINTMENT_ACTIONS = [
  'create_appointment',
  'reschedule_appointment',
  'cancel_appointment',
  'pay_visit',
  'set_appointment_attendance',
  'set_appointment_duration',
  'set_appointment_services',
  'set_appointment_fields',
] as const;

export type LegacyAppointmentAction =
  (typeof LEGACY_APPOINTMENT_ACTIONS)[number];

export const LEGACY_APPOINTMENT_ORIGINS = [
  'client_record_actions',
  'legacy.residual_appointment',
  'webhook.loyalty',
  'webhook.chat',
  'webhook.panel',
  'telegram.bot',
  'claude_ai',
] as const;

export type LegacyAppointmentOrigin =
  (typeof LEGACY_APPOINTMENT_ORIGINS)[number];

export class LegacyAppointmentOutcomeDto {
  @IsBoolean()
  success!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  http_status?: number;

  @IsOptional()
  @IsBoolean()
  unknown?: boolean;
}

/**
 * Untrusted legacy initiator envelope.
 *
 * There is deliberately no tenant, executor, policy, autonomy or approval
 * field. The bridge authenticates the caller, then resolves the tenant from
 * the active CRM integration and derives every trusted execution decision in
 * NestJS.
 */
export class LegacyAppointmentBridgeDto {
  @IsIn([LEGACY_APPOINTMENT_BRIDGE_CONTRACT])
  contract!: typeof LEGACY_APPOINTMENT_BRIDGE_CONTRACT;

  @IsString()
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MaxLength(64)
  external_company_id!: string;

  @IsIn(LEGACY_APPOINTMENT_ORIGINS)
  origin!: LegacyAppointmentOrigin;

  /** Opaque diagnostic reference only. Names, phones and e-mail are refused. */
  @IsOptional()
  @IsString()
  @MaxLength(96)
  @Matches(/^[a-zA-Z0-9._:/-]+$/)
  requester_ref?: string;

  /** Transport alias. Action Engine remains the owner of logical identity. */
  @IsString()
  @MaxLength(128)
  @Matches(/^[a-zA-Z0-9._:/-]+$/)
  idempotency_key!: string;

  @IsIn(LEGACY_APPOINTMENT_ACTIONS)
  action_class!: LegacyAppointmentAction;

  @IsObject()
  payload!: Record<string, unknown>;

  /** Shadow-only, PII-free observation of the old execution owner. */
  @IsOptional()
  @ValidateNested()
  @Type(() => LegacyAppointmentOutcomeDto)
  legacy_outcome?: LegacyAppointmentOutcomeDto;
}

export class LegacyAppointmentBridgeStatusQueryDto {
  @IsString()
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MaxLength(64)
  external_company_id!: string;
}
