export interface CurrentSalonPythonConfig {
  BARBERSHOP_NAME?: unknown;
  APP_URL?: unknown;
  SITE_URL?: unknown;
  YCLIENTS_BASE_URL?: unknown;
  YCLIENTS_PARTNER_TOKEN?: unknown;
  YCLIENTS_USER_TOKEN?: unknown;
  YCLIENTS_COMPANY_ID?: unknown;
  ACTIVE_MASTER_IDS?: unknown;
  BARBERSHOP_PHONE?: unknown;
  BARBERSHOP_ADDRESS?: unknown;
}

export interface CurrentSalonImportData {
  tenantName: string;
  tenantSlug: string;
  branchName: string;
  phone: string | null;
  address: string | null;
  appUrl: string | null;
  siteUrl: string | null;
  yclientsBaseUrl: string;
  yclientsPartnerToken: string;
  yclientsUserToken: string;
  yclientsCompanyId: number;
  activeMasterIds: number[];
  themeJson: Record<string, unknown>;
}

const DEFAULT_TENANT_NAME = 'Maya Imported Salon';
const DEFAULT_TENANT_SLUG = 'maya-imported-salon';
const DEFAULT_YCLIENTS_BASE_URL = 'https://api.yclients.com/api/v1';

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function transliterateToLatin(value: string): string {
  return Array.from(value.normalize('NFKD'))
    .map((character) => {
      const lowerCased = character.toLowerCase();

      return CYRILLIC_TO_LATIN[lowerCased] ?? lowerCased;
    })
    .join('');
}

export function slugifyValue(value: string): string {
  return transliterateToLatin(value)
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    try {
      return new URL(`https://${value}`);
    } catch {
      return null;
    }
  }
}

function extractSlugFromUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsedUrl = parseUrl(value);

  if (!parsedUrl) {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();

  if (
    hostname === 'localhost' ||
    /^[0-9.]+$/.test(hostname) ||
    hostname.includes(':')
  ) {
    return null;
  }

  const labels = hostname.split('.').filter(Boolean);

  for (const label of labels) {
    if (label === 'api' || label === 'app' || label.startsWith('xn--')) {
      continue;
    }

    const slug = slugifyValue(label);

    if (slug.length >= 3) {
      return slug;
    }
  }

  return null;
}

function coercePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);

    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

export function normalizePositiveIntList(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => coercePositiveInt(item))
      .filter((item): item is number => item !== null);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const trimmed = value.trim();

    try {
      const parsed = JSON.parse(trimmed) as unknown;

      return normalizePositiveIntList(parsed);
    } catch {
      return trimmed
        .split(',')
        .map((item) => coercePositiveInt(item))
        .filter((item): item is number => item !== null);
    }
  }

  return [];
}

function requireConfigString(value: unknown, fieldName: string): string {
  const normalized = normalizeString(value);

  if (!normalized) {
    throw new Error(`${fieldName} is missing in the current Python config`);
  }

  return normalized;
}

function requireConfigPositiveInt(value: unknown, fieldName: string): number {
  const normalized = coercePositiveInt(value);

  if (!normalized) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return normalized;
}

export function deriveTenantSlug(
  appUrl: string | null,
  siteUrl: string | null,
  tenantName: string,
): string {
  const fromAppUrl = extractSlugFromUrl(appUrl);

  if (fromAppUrl) {
    return fromAppUrl;
  }

  const fromSiteUrl = extractSlugFromUrl(siteUrl);

  if (fromSiteUrl) {
    return fromSiteUrl;
  }

  const fromName = slugifyValue(tenantName);

  if (fromName.length >= 3) {
    return fromName;
  }

  return DEFAULT_TENANT_SLUG;
}

export function buildCurrentSalonImportData(
  config: CurrentSalonPythonConfig,
  overrides?: {
    tenantSlug?: string;
    branchName?: string;
  },
): CurrentSalonImportData {
  const tenantName =
    normalizeString(config.BARBERSHOP_NAME) ?? DEFAULT_TENANT_NAME;
  const appUrl = normalizeString(config.APP_URL);
  const siteUrl = normalizeString(config.SITE_URL);
  const tenantSlug =
    overrides?.tenantSlug && overrides.tenantSlug.trim().length > 0
      ? slugifyValue(overrides.tenantSlug)
      : deriveTenantSlug(appUrl, siteUrl, tenantName);

  if (tenantSlug.length < 3) {
    throw new Error(
      'Unable to derive a valid tenant slug. Pass --slug explicitly.',
    );
  }

  const branchName =
    normalizeString(overrides?.branchName) ?? tenantName ?? 'Main Branch';

  return {
    tenantName,
    tenantSlug,
    branchName,
    phone: normalizeString(config.BARBERSHOP_PHONE),
    address: normalizeString(config.BARBERSHOP_ADDRESS),
    appUrl,
    siteUrl,
    yclientsBaseUrl:
      normalizeString(config.YCLIENTS_BASE_URL) ?? DEFAULT_YCLIENTS_BASE_URL,
    yclientsPartnerToken: requireConfigString(
      config.YCLIENTS_PARTNER_TOKEN,
      'YCLIENTS_PARTNER_TOKEN',
    ),
    yclientsUserToken: requireConfigString(
      config.YCLIENTS_USER_TOKEN,
      'YCLIENTS_USER_TOKEN',
    ),
    yclientsCompanyId: requireConfigPositiveInt(
      config.YCLIENTS_COMPANY_ID,
      'YCLIENTS_COMPANY_ID',
    ),
    activeMasterIds: normalizePositiveIntList(config.ACTIVE_MASTER_IDS),
    themeJson: {
      appearance: 'premium-light',
      source: 'python-config-import',
      app_url: appUrl,
      site_url: siteUrl,
    },
  };
}
