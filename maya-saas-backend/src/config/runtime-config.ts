import {
  resolveCorsAllowlist,
  resolveNodeEnvironment,
  resolveOauthRedirectAllowlist,
  splitConfigList,
} from './security-config';

const PRODUCTION_SECRET_NAMES = [
  'JWT_SECRET',
  'AUTH_REFRESH_TOKEN_SECRET',
  'AUTH_SESSION_METADATA_SECRET',
  'AUTH_RATE_LIMIT_SECRET',
  'PHONE_AUTH_SECRET',
  'CRM_ENCRYPTION_KEY',
] as const;

const BOOLEAN_NAMES = [
  'PHONE_AUTH_DEBUG',
  'SMSRU_TEST',
  'SELF_SERVE_TRIAL_SIGNUP',
  'SWAGGER_ENABLED',
  'YANDEX_LOGIN_ENABLED',
  'TELEGRAM_LOGIN_ENABLED',
] as const;

const INTEGER_RULES = [
  ['PORT', 1, 65_535],
  ['JWT_ACCESS_TTL_SECONDS', 300, 3_600],
  ['AUTH_REFRESH_TOKEN_TTL_DAYS', 1, 90],
  ['PHONE_AUTH_CODE_TTL', 60, 900],
  ['PHONE_AUTH_RESEND_COOLDOWN_SECONDS', 1, 900],
  ['PHONE_AUTH_MAX_ATTEMPTS', 1, 10],
  ['AUTH_FLOW_STATE_TTL_SECONDS', 60, 1_800],
  ['OAUTH_PROVIDER_TIMEOUT_MS', 1_000, 60_000],
  ['SMSRU_TIMEOUT_MS', 1_000, 60_000],
  ['AUTH_RETENTION_SESSION_DAYS', 7, 365],
  ['AUTH_RETENTION_CHALLENGE_HOURS', 1, 168],
  ['AUTH_RETENTION_RATE_LIMIT_HOURS', 1, 720],
  ['AUTH_RETENTION_BATCH_SIZE', 1, 10_000],
] as const;

export function validateRuntimeConfig(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const issues: string[] = [];
  const environment = resolveNodeEnvironment(input.NODE_ENV);
  const config: Record<string, unknown> = { ...input, NODE_ENV: environment };

  for (const name of BOOLEAN_NAMES) {
    validateBoolean(config[name], name, issues);
  }

  for (const [name, minimum, maximum] of INTEGER_RULES) {
    validateInteger(config[name], name, minimum, maximum, issues);
  }

  validatePhoneAuthTiming(config, issues);

  validateConfiguredPolicies(config, environment, issues);

  if (environment === 'production') {
    validateProductionConfig(config, issues);
  }

  if (issues.length > 0) {
    throw new Error(
      [
        'Runtime configuration is unsafe:',
        ...issues.map((issue) => `- ${issue}`),
      ].join('\n'),
    );
  }

  return config;
}

function validateConfiguredPolicies(
  config: Record<string, unknown>,
  environment: ReturnType<typeof resolveNodeEnvironment>,
  issues: string[],
): void {
  try {
    resolveCorsAllowlist(config.CORS_ALLOWED_ORIGINS, environment);
  } catch (error) {
    issues.push(errorMessage(error));
  }

  try {
    resolveOauthRedirectAllowlist(
      config.OAUTH_ALLOWED_REDIRECT_URIS,
      environment,
    );
  } catch (error) {
    issues.push(errorMessage(error));
  }
}

function validateProductionConfig(
  config: Record<string, unknown>,
  issues: string[],
): void {
  validateDatabaseUrl(config.DATABASE_URL, issues);
  validateProductionSecrets(config, issues);

  if (!stringValue(config.CORS_ALLOWED_ORIGINS)) {
    issues.push('CORS_ALLOWED_ORIGINS is required in production');
  }

  validateTrustedProxy(config.AUTH_TRUST_PROXY, issues);

  const phoneProvider = stringValue(config.PHONE_AUTH_PROVIDER).toLowerCase();
  const phoneDebug = booleanValue(config.PHONE_AUTH_DEBUG);
  const smsRuTest = booleanValue(config.SMSRU_TEST);

  if (!['auto', 'smsru'].includes(phoneProvider)) {
    issues.push('PHONE_AUTH_PROVIDER must be auto or smsru in production');
  }

  if (phoneDebug) {
    issues.push('PHONE_AUTH_DEBUG cannot be enabled in production');
  }

  if (stringValue(config.PHONE_AUTH_FIXED_CODE)) {
    issues.push('PHONE_AUTH_FIXED_CODE must be empty in production');
  }

  if (smsRuTest) {
    issues.push('SMSRU_TEST cannot be enabled in production');
  }

  const smsRuApiId = stringValue(config.SMSRU_API_ID);

  if (!smsRuApiId) {
    issues.push('SMSRU_API_ID is required for production phone auth');
  } else if (containsPlaceholder(smsRuApiId)) {
    issues.push('SMSRU_API_ID contains a known placeholder');
  }

  const yandexEnabled = booleanValue(config.YANDEX_LOGIN_ENABLED);
  const telegramEnabled = booleanValue(config.TELEGRAM_LOGIN_ENABLED);

  if (yandexEnabled) {
    requireSetting(config, 'YANDEX_CLIENT_ID', issues);
    requireSetting(config, 'YANDEX_CLIENT_SECRET', issues);
  }

  if (telegramEnabled) {
    requireSetting(config, 'TELEGRAM_CLIENT_ID', issues);
    requireSetting(config, 'TELEGRAM_CLIENT_SECRET', issues);
    validateHttpsUrl(config.TELEGRAM_JWKS_URL, 'TELEGRAM_JWKS_URL', issues);
  }

  if (
    (yandexEnabled || telegramEnabled) &&
    splitConfigList(config.OAUTH_ALLOWED_REDIRECT_URIS).length === 0
  ) {
    issues.push(
      'OAUTH_ALLOWED_REDIRECT_URIS is required when social login is enabled',
    );
  }
}

function validateDatabaseUrl(value: unknown, issues: string[]): void {
  const raw = stringValue(value);

  if (!raw) {
    issues.push('DATABASE_URL is required in production');
    return;
  }

  try {
    const parsed = new URL(raw);

    if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
      issues.push('DATABASE_URL must use PostgreSQL');
    }
  } catch {
    issues.push('DATABASE_URL must be a valid absolute PostgreSQL URL');
  }
}

function validateProductionSecrets(
  config: Record<string, unknown>,
  issues: string[],
): void {
  const seen = new Map<string, string>();

  for (const name of PRODUCTION_SECRET_NAMES) {
    const value = stringValue(config[name]);

    if (!value) {
      issues.push(`${name} is required in production`);
      continue;
    }

    if (value.length < 32) {
      issues.push(`${name} must contain at least 32 characters`);
    }

    if (containsPlaceholder(value)) {
      issues.push(`${name} contains a known placeholder`);
    }

    const previous = seen.get(value);

    if (previous) {
      issues.push(`${name} must be independent from ${previous}`);
    } else {
      seen.set(value, name);
    }
  }
}

function validateTrustedProxy(value: unknown, issues: string[]): void {
  const dangerous = new Set([
    '*',
    '0',
    '1',
    'true',
    'false',
    '0.0.0.0/0',
    '::/0',
  ]);

  for (const proxy of splitConfigList(value)) {
    if (dangerous.has(proxy.toLowerCase())) {
      issues.push(`AUTH_TRUST_PROXY contains unsafe value: ${proxy}`);
    }
  }
}

function validateBoolean(value: unknown, name: string, issues: string[]): void {
  const raw = stringValue(value);

  if (raw && raw !== 'true' && raw !== 'false') {
    issues.push(`${name} must be true or false`);
  }
}

function validatePhoneAuthTiming(
  config: Record<string, unknown>,
  issues: string[],
): void {
  const codeTtl = configuredInteger(config.PHONE_AUTH_CODE_TTL, 300);
  const cooldown = configuredInteger(
    config.PHONE_AUTH_RESEND_COOLDOWN_SECONDS,
    60,
  );

  if (codeTtl !== null && cooldown !== null && cooldown > codeTtl) {
    issues.push(
      'PHONE_AUTH_RESEND_COOLDOWN_SECONDS cannot exceed PHONE_AUTH_CODE_TTL',
    );
  }
}

function validateInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
  issues: string[],
): void {
  const raw = stringValue(value);

  if (!raw) {
    return;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    issues.push(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
}

function requireSetting(
  config: Record<string, unknown>,
  name: string,
  issues: string[],
): void {
  const value = stringValue(config[name]);

  if (!value) {
    issues.push(`${name} is required when its provider is enabled`);
  } else if (containsPlaceholder(value)) {
    issues.push(`${name} contains a known placeholder`);
  }
}

function validateHttpsUrl(
  value: unknown,
  name: string,
  issues: string[],
): void {
  const raw = stringValue(value);

  try {
    if (!raw || new URL(raw).protocol !== 'https:') {
      issues.push(`${name} must be an HTTPS URL`);
    }
  } catch {
    issues.push(`${name} must be an HTTPS URL`);
  }
}

function booleanValue(value: unknown): boolean {
  return stringValue(value).toLowerCase() === 'true';
}

function configuredInteger(value: unknown, fallback: number): number | null {
  const raw = stringValue(value);

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  return Number.isInteger(parsed) ? parsed : null;
}

function containsPlaceholder(value: string): boolean {
  return /change-me|replace-me|dev[-_ ]?secret/i.test(value);
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  return '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid security policy';
}
