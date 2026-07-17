export const CANONICAL_PLAN_NAMES = [
  'solo',
  'business',
  'business_plus',
] as const;

export type CanonicalPlanName = (typeof CANONICAL_PLAN_NAMES)[number];

export const PLAN_CATALOG: Record<
  CanonicalPlanName,
  {
    legacyName: string;
    maxBranches: number;
    maxStaff: number;
    isWhiteLabelEnabled: boolean;
  }
> = {
  solo: {
    legacyName: 'start',
    maxBranches: 1,
    maxStaff: 5,
    isWhiteLabelEnabled: false,
  },
  business: {
    legacyName: 'pro',
    maxBranches: 3,
    maxStaff: 25,
    isWhiteLabelEnabled: false,
  },
  business_plus: {
    legacyName: 'max',
    maxBranches: 10,
    maxStaff: 100,
    isWhiteLabelEnabled: true,
  },
};

const PLAN_ALIASES = new Map<string, CanonicalPlanName>(
  Object.entries(PLAN_CATALOG).flatMap(([name, definition]) => [
    [name, name as CanonicalPlanName],
    [definition.legacyName, name as CanonicalPlanName],
  ]),
);

export function canonicalPlanName(name: string): string {
  const normalized = name.trim().toLowerCase();
  return PLAN_ALIASES.get(normalized) ?? normalized;
}
