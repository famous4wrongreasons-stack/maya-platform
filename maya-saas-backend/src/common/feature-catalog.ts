export const MAYA_FEATURE_KEYS = [
  // Compatibility keys already consumed by the existing frontend.
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
  // Canonical namespaced registry keys for new modules.
  'calendar.internal',
  'calendar.external',
  'booking.public',
  'booking.customer_app',
  'customers.core',
  'expenses.core',
  'analytics.solo',
  'analytics.employee',
  'analytics.location',
  'analytics.business',
  'crm.integration',
  'commerce.store',
  'commerce.certificates',
  'commerce.memberships',
  'commerce.redemption',
  'referrals',
  'team.chat',
  'notifications.core',
  'customer.portal',
  'ai.owner',
  'ai.admin',
  'ai.consultant',
  'telegram.owner',
  'telegram.admin',
  'telegram.consultant',
  'branding.custom',
  'domain.custom',
] as const;

export type MayaFeatureKey = (typeof MAYA_FEATURE_KEYS)[number];

export interface MayaFeatureDefinition {
  name: string;
  description: string;
  module: string;
  status: 'active' | 'preview' | 'deprecated';
  dependencies?: readonly MayaFeatureKey[];
}

const defineFeature = (
  name: string,
  module: string,
  description: string,
  dependencies?: readonly MayaFeatureKey[],
): MayaFeatureDefinition => ({
  name,
  description,
  module,
  status: 'active',
  ...(dependencies ? { dependencies } : {}),
});

export const MAYA_FEATURE_REGISTRY: Record<
  MayaFeatureKey,
  MayaFeatureDefinition
> = {
  booking: defineFeature('Legacy booking', 'bookings', 'Compatibility flag.'),
  branding: defineFeature('Legacy branding', 'branding', 'Compatibility flag.'),
  client_app: defineFeature(
    'Legacy client app',
    'client-app',
    'Compatibility flag.',
  ),
  loyalty: defineFeature('Legacy loyalty', 'commerce', 'Compatibility flag.'),
  shop: defineFeature('Legacy shop', 'commerce', 'Compatibility flag.'),
  tg_basic: defineFeature(
    'Legacy Telegram basics',
    'messaging',
    'Compatibility flag.',
  ),
  tg_marketing: defineFeature(
    'Legacy Telegram marketing',
    'messaging',
    'Compatibility flag.',
  ),
  journal: defineFeature(
    'Legacy booking journal',
    'bookings',
    'Compatibility flag.',
  ),
  staff_cabinet: defineFeature(
    'Legacy staff cabinet',
    'workforce',
    'Compatibility flag.',
  ),
  analytics: defineFeature(
    'Legacy analytics',
    'analytics',
    'Compatibility flag.',
  ),
  video_analytics: defineFeature(
    'Legacy video analytics',
    'analytics',
    'Compatibility flag.',
  ),
  cutmatch: defineFeature('CutMatch', 'ai', 'AI appearance consultation.'),
  ai_chatbot: defineFeature('Legacy AI chatbot', 'ai', 'Compatibility flag.'),
  priority_support: defineFeature(
    'Priority support',
    'platform',
    'Priority support queue.',
  ),
  'calendar.internal': defineFeature(
    'Internal calendar',
    'scheduling',
    'Maya-managed availability and calendar.',
  ),
  'calendar.external': defineFeature(
    'External calendar',
    'crm-integrations',
    'Calendar backed by an external CRM.',
    ['crm.integration'],
  ),
  'booking.public': defineFeature(
    'Public booking',
    'bookings',
    'Public booking entry point.',
  ),
  'booking.customer_app': defineFeature(
    'Customer app booking',
    'bookings',
    'Authenticated booking inside the customer app.',
  ),
  'customers.core': defineFeature(
    'Customer records',
    'customers',
    'Core tenant customer records.',
  ),
  'expenses.core': defineFeature(
    'Expenses',
    'finance',
    'Tenant expense records.',
  ),
  'analytics.solo': defineFeature(
    'Solo analytics',
    'analytics',
    'Analytics for an independent provider.',
  ),
  'analytics.employee': defineFeature(
    'Employee analytics',
    'analytics',
    'Employee-scoped performance analytics.',
  ),
  'analytics.location': defineFeature(
    'Location analytics',
    'analytics',
    'Location-scoped analytics.',
  ),
  'analytics.business': defineFeature(
    'Business analytics',
    'analytics',
    'Organization and tenant analytics.',
  ),
  'crm.integration': defineFeature(
    'CRM integration',
    'crm-integrations',
    'External CRM connector support.',
  ),
  'commerce.store': defineFeature(
    'Store',
    'commerce',
    'Tenant product storefront.',
  ),
  'commerce.certificates': defineFeature(
    'Certificates',
    'commerce',
    'Certificate purchase and ownership.',
    ['commerce.store'],
  ),
  'commerce.memberships': defineFeature(
    'Customer memberships',
    'commerce',
    'Customer membership plans and subscriptions.',
    ['commerce.store'],
  ),
  'commerce.redemption': defineFeature(
    'Commerce redemption',
    'commerce',
    'Ledger-based certificate and membership redemption.',
  ),
  referrals: defineFeature(
    'Referrals',
    'commerce',
    'Tenant referral programs.',
  ),
  'team.chat': defineFeature(
    'Team chat',
    'messaging',
    'Internal team messaging.',
  ),
  'notifications.core': defineFeature(
    'Notifications',
    'notifications',
    'Transactional notification delivery.',
  ),
  'customer.portal': defineFeature(
    'Customer portal',
    'client-app',
    'Customer profile, history and upcoming visits.',
  ),
  'ai.owner': defineFeature('Maya OS', 'ai', 'Owner AI capabilities.'),
  'ai.admin': defineFeature('Maya Admin', 'ai', 'Administrator AI tools.'),
  'ai.consultant': defineFeature(
    'Maya Consult',
    'ai',
    'Customer consultation capabilities.',
  ),
  'telegram.owner': defineFeature(
    'Telegram owner',
    'telegram',
    'Owner channel adapter.',
    ['ai.owner'],
  ),
  'telegram.admin': defineFeature(
    'Telegram admin',
    'telegram',
    'Administrator channel adapter.',
    ['ai.admin'],
  ),
  'telegram.consultant': defineFeature(
    'Telegram consultant',
    'telegram',
    'Customer channel adapter.',
    ['ai.consultant'],
  ),
  'branding.custom': defineFeature(
    'Custom branding',
    'branding',
    'Tenant-managed white-label tokens and assets.',
  ),
  'domain.custom': defineFeature(
    'Custom domain',
    'branding',
    'Verified custom tenant domain.',
    ['branding.custom'],
  ),
};

export const LEGACY_FEATURE_ALIASES: Partial<
  Record<MayaFeatureKey, readonly MayaFeatureKey[]>
> = {
  booking: ['booking.public', 'booking.customer_app'],
  branding: ['branding.custom'],
  client_app: ['customer.portal'],
  shop: [
    'commerce.store',
    'commerce.certificates',
    'commerce.memberships',
    'commerce.redemption',
  ],
  tg_basic: ['telegram.consultant'],
  journal: ['crm.integration', 'calendar.external'],
  staff_cabinet: ['analytics.employee'],
  analytics: ['analytics.location', 'analytics.business'],
  ai_chatbot: ['ai.admin', 'ai.consultant'],
};

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

export function isMayaFeatureKey(value: string): value is MayaFeatureKey {
  return FEATURE_KEY_SET.has(value);
}

export function expandFeatureKeys(
  featureKeys: ReadonlyArray<string>,
): MayaFeatureKey[] {
  const expanded = new Set<MayaFeatureKey>();

  for (const key of featureKeys) {
    if (!isMayaFeatureKey(key)) {
      continue;
    }

    expanded.add(key);

    for (const alias of LEGACY_FEATURE_ALIASES[key] ?? []) {
      expanded.add(alias);
    }
  }

  return MAYA_FEATURE_KEYS.filter((key) => expanded.has(key));
}

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
