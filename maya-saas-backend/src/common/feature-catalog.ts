export const MAYA_FEATURE_KEYS = [
  'booking',
  'branding',
  'client_app',
  'loyalty',
  'shop',
  'tg_basic',
  'tg_marketing',
  'journal',
  'staff_cabinet',
  'analytics',
  'video_analytics',
  'cutmatch',
  'ai_chatbot',
  'priority_support',
] as const;

export type MayaFeatureKey = (typeof MAYA_FEATURE_KEYS)[number];

export const MAYA_PLAN_FEATURES: Record<string, MayaFeatureKey[]> = {
  start: ['booking', 'branding', 'client_app', 'loyalty', 'tg_basic'],
  pro: [
    'booking',
    'branding',
    'client_app',
    'loyalty',
    'shop',
    'tg_basic',
    'tg_marketing',
    'journal',
    'staff_cabinet',
    'analytics',
    'priority_support',
  ],
  max: [
    'booking',
    'branding',
    'client_app',
    'loyalty',
    'shop',
    'tg_basic',
    'tg_marketing',
    'journal',
    'staff_cabinet',
    'analytics',
    'video_analytics',
    'priority_support',
  ],
};

const FEATURE_KEY_SET = new Set<string>(MAYA_FEATURE_KEYS);

export function buildFeatureFlags(
  featureKeys: ReadonlyArray<string>,
): Record<string, boolean> {
  const flags: Record<string, boolean> = {};

  for (const key of featureKeys) {
    if (FEATURE_KEY_SET.has(key)) {
      flags[key] = true;
    }
  }

  return flags;
}

export function normalizeFeatureFlags(value: unknown): Record<string, boolean> {
  if (Array.isArray(value)) {
    return buildFeatureFlags(
      value.filter((item): item is string => typeof item === 'string'),
    );
  }

  if (!value || typeof value !== 'object') {
    return {};
  }

  const flags: Record<string, boolean> = {};

  for (const [key, raw] of Object.entries(value)) {
    if (FEATURE_KEY_SET.has(key) && raw === true) {
      flags[key] = true;
    }
  }

  return flags;
}

export function featureKeysFromFlags(value: unknown): MayaFeatureKey[] {
  const normalized = normalizeFeatureFlags(value);

  return MAYA_FEATURE_KEYS.filter((key) => normalized[key] === true);
}
