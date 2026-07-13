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

export const MAYA_FEATURE_RUNTIMES = [
  'current_maya',
  'platform_backend',
  'platform_frontend',
] as const;

export type MayaFeatureRuntime = (typeof MAYA_FEATURE_RUNTIMES)[number];

export const MAYA_FEATURE_IMPLEMENTATION_STATUSES = [
  'platform_ready',
  'current_runtime_only',
  'partial',
  'planned',
] as const;

export type MayaFeatureImplementationStatus =
  (typeof MAYA_FEATURE_IMPLEMENTATION_STATUSES)[number];

export interface MayaFeatureReadiness {
  implementationStatus: MayaFeatureImplementationStatus;
  availableIn: readonly MayaFeatureRuntime[];
  limitations?: readonly string[];
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

const defineReadiness = (
  implementationStatus: MayaFeatureImplementationStatus,
  availableIn: readonly MayaFeatureRuntime[],
  limitations?: readonly string[],
): MayaFeatureReadiness => ({
  implementationStatus,
  availableIn,
  ...(limitations?.length ? { limitations } : {}),
});

const CURRENT_MAYA = ['current_maya'] as const;
const PLATFORM = ['platform_backend', 'platform_frontend'] as const;
const CURRENT_AND_PLATFORM = [
  'current_maya',
  'platform_backend',
  'platform_frontend',
] as const;

// Entitlements describe commercial access. This map separately describes
// implementation maturity so a paid flag cannot be mistaken for shipped code.
export const MAYA_FEATURE_READINESS: Record<
  MayaFeatureKey,
  MayaFeatureReadiness
> = {
  booking: defineReadiness('platform_ready', CURRENT_AND_PLATFORM),
  branding: defineReadiness('platform_ready', CURRENT_AND_PLATFORM),
  client_app: defineReadiness('partial', CURRENT_AND_PLATFORM, [
    'The universal role-aware app and final trial experience are still being unified in the platform frontend.',
  ]),
  loyalty: defineReadiness('current_runtime_only', CURRENT_MAYA),
  shop: defineReadiness('current_runtime_only', CURRENT_MAYA),
  tg_basic: defineReadiness('current_runtime_only', CURRENT_MAYA),
  tg_marketing: defineReadiness('current_runtime_only', CURRENT_MAYA),
  journal: defineReadiness('current_runtime_only', CURRENT_MAYA),
  staff_cabinet: defineReadiness('current_runtime_only', CURRENT_MAYA),
  analytics: defineReadiness('current_runtime_only', CURRENT_MAYA),
  video_analytics: defineReadiness(
    'planned',
    [],
    ['Registry key only; no universal runtime module is implemented.'],
  ),
  cutmatch: defineReadiness('partial', CURRENT_MAYA, [
    'Founder-only in the current application.',
    'Not available in the universal platform backend.',
  ]),
  ai_chatbot: defineReadiness('current_runtime_only', CURRENT_MAYA, [
    'The platform backend currently implements AI onboarding, not the full role-aware assistant runtime.',
  ]),
  priority_support: defineReadiness(
    'planned',
    [],
    ['No support-queue module is implemented.'],
  ),
  'calendar.internal': defineReadiness('platform_ready', PLATFORM),
  'calendar.external': defineReadiness(
    'partial',
    ['current_maya', 'platform_backend', 'platform_frontend'],
    ['The platform backend currently supports YClients and Altegio only.'],
  ),
  'booking.public': defineReadiness('partial', CURRENT_AND_PLATFORM, [
    'The platform API currently requires an authenticated customer session for booking mutations.',
  ]),
  'booking.customer_app': defineReadiness(
    'platform_ready',
    CURRENT_AND_PLATFORM,
  ),
  'customers.core': defineReadiness('partial', CURRENT_AND_PLATFORM, [
    'The platform backend has customer identity and profile primitives but not the complete universal customer module.',
  ]),
  'expenses.core': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'analytics.solo': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'analytics.employee': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'analytics.location': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'analytics.business': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'crm.integration': defineReadiness(
    'partial',
    ['current_maya', 'platform_backend', 'platform_frontend'],
    [
      'YClients and Altegio are implemented; DIKIDI, Whitelines and Salon Online are planned.',
    ],
  ),
  'commerce.store': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'commerce.certificates': defineReadiness(
    'current_runtime_only',
    CURRENT_MAYA,
  ),
  'commerce.memberships': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'commerce.redemption': defineReadiness('current_runtime_only', CURRENT_MAYA),
  referrals: defineReadiness('current_runtime_only', CURRENT_MAYA),
  'team.chat': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'notifications.core': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'customer.portal': defineReadiness('partial', CURRENT_AND_PLATFORM, [
    'Core appointment history and actions are available, but the final universal customer experience is still being unified.',
  ]),
  'ai.owner': defineReadiness('current_runtime_only', CURRENT_MAYA, [
    'The role-aware owner tool runtime has not yet been tenantized in the platform backend.',
  ]),
  'ai.admin': defineReadiness('current_runtime_only', CURRENT_MAYA, [
    'The role-aware administrator tool runtime has not yet been tenantized in the platform backend.',
  ]),
  'ai.consultant': defineReadiness('current_runtime_only', CURRENT_MAYA, [
    'The role-aware customer tool runtime has not yet been tenantized in the platform backend.',
  ]),
  'telegram.owner': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'telegram.admin': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'telegram.consultant': defineReadiness('current_runtime_only', CURRENT_MAYA),
  'branding.custom': defineReadiness('platform_ready', CURRENT_AND_PLATFORM, [
    'Conversational owner onboarding intentionally exposes logo-only branding.',
  ]),
  'domain.custom': defineReadiness(
    'planned',
    [],
    [
      'Domain ownership verification and automated routing are not implemented.',
    ],
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
  start: [
    'booking',
    'branding',
    'client_app',
    'loyalty',
    'tg_basic',
    'calendar.internal',
    'customers.core',
    'expenses.core',
    'analytics.solo',
  ],
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
