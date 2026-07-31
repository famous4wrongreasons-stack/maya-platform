import type { CalendarSource } from '../common/domain.enums';
import type { IndustryPresetId } from '../common/industry-presets';
import type {
  AiOnboardingCategoryId,
  AiOnboardingWorkMode,
} from './onboarding-categories';

export type AiOnboardingMissingField =
  | 'work_mode'
  | 'category'
  | 'crm_import'
  | 'business_name'
  | 'provider_count'
  | 'services'
  | 'calendar_source';

export interface AiOnboardingServiceItem {
  name: string;
  price: number;
  durationMinutes: number;
}

export interface AiOnboardingWeeklyRule {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface AiOnboardingQuickReply {
  label: string;
  message: string;
  action?: 'confirm' | 'edit' | 'focus' | 'connect_crm' | 'disabled';
  templateId?: string;
}

export interface AiOnboardingBlueprint {
  templateId: string;
  workMode?: AiOnboardingWorkMode | null;
  categoryId?: AiOnboardingCategoryId | null;
  businessName: string | null;
  businessNameDeferred?: boolean;
  businessNameGenerated?: boolean;
  summary: string;
  industryPresetId: IndustryPresetId;
  calendarSource: CalendarSource;
  calendarSourceConfirmed?: boolean;
  providerCount: number | null;
  providerTitle: string;
  services: AiOnboardingServiceItem[];
  servicesDeferred?: boolean;
  weeklyRules: AiOnboardingWeeklyRule[];
  scheduleAssumed: boolean;
  crmImported?: boolean;
  crmProvider?: string | null;
  crmCompanyId?: string | null;
  crmLogoUrl?: string | null;
  crmAddress?: string | null;
  crmTimezone?: string | null;
  crmScheduleLabel?: string | null;
  crmServiceCount?: number | null;
  crmStaffCount?: number | null;
}

export interface AiOnboardingInterpretation {
  assistantMessage: string;
  blueprint: AiOnboardingBlueprint;
  confidence: number;
  missingFields: AiOnboardingMissingField[];
  needsClarification: boolean;
  quickReplies: AiOnboardingQuickReply[];
  source: 'deepseek' | 'openai' | 'safe_fallback';
}
