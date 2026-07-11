export type RuntimeNodeEnvironment = 'development' | 'production' | 'test';

const DEVELOPMENT_CORS_ORIGINS = [
  'http://127.0.0.1:8787',
  'http://localhost:8787',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'capacitor://localhost',
  'ionic://localhost',
];

export function resolveNodeEnvironment(
  rawValue?: unknown,
): RuntimeNodeEnvironment {
  const value = configString(rawValue, 'development').toLowerCase();

  if (value === 'development' || value === 'production' || value === 'test') {
    return value;
  }

  throw new Error('NODE_ENV must be development, test or production');
}

export function splitConfigList(rawValue?: unknown): string[] {
  return configString(rawValue)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveCorsAllowlist(
  rawValue: unknown,
  environment: RuntimeNodeEnvironment,
): string[] {
  const configured = splitConfigList(rawValue);
  const values =
    configured.length > 0
      ? configured
      : environment === 'production'
        ? []
        : DEVELOPMENT_CORS_ORIGINS;

  return [
    ...new Set(values.map((value) => normalizeCorsOrigin(value, environment))),
  ];
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowlist: readonly string[],
  environment: RuntimeNodeEnvironment,
): boolean {
  if (!origin) {
    return true;
  }

  try {
    return allowlist.includes(normalizeCorsOrigin(origin, environment));
  } catch {
    return false;
  }
}

export function resolveOauthRedirectAllowlist(
  rawValue: unknown,
  environment: RuntimeNodeEnvironment,
): string[] {
  return [
    ...new Set(
      splitConfigList(rawValue).map((value) =>
        normalizeOauthRedirectUri(value, environment),
      ),
    ),
  ];
}

export function resolveAllowedOauthRedirectUri(
  rawRedirectUri: unknown,
  rawAllowlist: unknown,
  environment: RuntimeNodeEnvironment,
): string {
  const redirectUri = normalizeOauthRedirectUri(rawRedirectUri, environment);
  const allowlist = resolveOauthRedirectAllowlist(rawAllowlist, environment);

  if (allowlist.includes(redirectUri)) {
    return redirectUri;
  }

  const parsed = new URL(redirectUri);

  if (
    environment !== 'production' &&
    parsed.protocol === 'http:' &&
    isLoopbackHostname(parsed.hostname)
  ) {
    return redirectUri;
  }

  throw new Error('OAuth redirect URI is not allowlisted');
}

export function isSwaggerEnabled(
  rawValue: unknown,
  environment: RuntimeNodeEnvironment,
): boolean {
  const value = configString(rawValue).toLowerCase();

  if (!value) {
    return environment !== 'production';
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error('SWAGGER_ENABLED must be true or false');
}

function normalizeCorsOrigin(
  rawOrigin: string,
  environment: RuntimeNodeEnvironment,
): string {
  const value = rawOrigin.trim();

  if (!value || value === '*') {
    throw new Error('CORS origins must be explicit');
  }

  const parsed = parseUrl(value, 'CORS origin');

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname && parsed.pathname !== '/')
  ) {
    throw new Error('CORS allowlist entries must contain origins only');
  }

  if (parsed.protocol === 'https:') {
    return parsed.origin;
  }

  if (parsed.protocol === 'http:') {
    if (environment === 'production') {
      throw new Error('Production CORS origins must use HTTPS');
    }

    return parsed.origin;
  }

  if (
    (parsed.protocol === 'capacitor:' || parsed.protocol === 'ionic:') &&
    parsed.hostname === 'localhost'
  ) {
    return `${parsed.protocol}//${parsed.host}`;
  }

  throw new Error('Unsupported CORS origin protocol');
}

function normalizeOauthRedirectUri(
  rawRedirectUri: unknown,
  environment: RuntimeNodeEnvironment,
): string {
  const value = configString(rawRedirectUri);

  if (!value) {
    throw new Error('OAuth redirect URI is required');
  }

  const parsed = parseUrl(value, 'OAuth redirect URI');

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('OAuth redirect URI contains unsupported URL components');
  }

  if (parsed.protocol === 'https:') {
    return parsed.href;
  }

  if (
    environment !== 'production' &&
    parsed.protocol === 'http:' &&
    isLoopbackHostname(parsed.hostname)
  ) {
    return parsed.href;
  }

  throw new Error('OAuth redirect URI must use HTTPS');
}

function parseUrl(value: string, label: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} is not a valid absolute URL`);
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

function configString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  return fallback;
}
