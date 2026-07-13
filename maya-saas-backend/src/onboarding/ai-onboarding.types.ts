import type { CalendarSource } from '../common/domain.enums';
import type { IndustryPresetId } from '../common/industry-presets';

export type AiOnboardingMissingField =
  'business_name' | 'provider_count' | 'services';

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

export interface AiOnboardingBlueprint {
  templateId: string;
  businessName: string | null;
  summary: string;
  industryPresetId: IndustryPresetId;
  calendarSource: CalendarSource;
  providerCount: number | null;
  providerTitle: string;
  services: AiOnboardingServiceItem[];
  weeklyRules: AiOnboardingWeeklyRule[];
  scheduleAssumed: boolean;
}

export interface AiOnboardingInterpretation {
  assistantMessage: string;
  blueprint: AiOnboardingBlueprint;
  missingFields: AiOnboardingMissingField[];
}
