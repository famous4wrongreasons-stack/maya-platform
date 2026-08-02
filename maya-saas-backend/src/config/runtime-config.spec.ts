import { validateRuntimeConfig } from './runtime-config';

describe('runtime config validation', () => {
  const secret = (name: string) => `${name}-${'x'.repeat(40)}`;
  const productionConfig = (): Record<string, string> => ({
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgresql://maya:strong-database-password@db.internal:5432/maya',
    JWT_SECRET: secret('jwt'),
    AUTH_REFRESH_TOKEN_SECRET: secret('refresh'),
    AUTH_SESSION_METADATA_SECRET: secret('metadata'),
    AUTH_RATE_LIMIT_SECRET: secret('rate-limit'),
    PHONE_AUTH_SECRET: secret('phone'),
    CRM_ENCRYPTION_KEY: secret('crm'),
    CORS_ALLOWED_ORIGINS: 'https://app.example.test,capacitor://localhost',
    PHONE_AUTH_PROVIDER: 'smsru',
    PHONE_AUTH_DEBUG: 'false',
    PHONE_AUTH_FIXED_CODE: '',
    SMSRU_API_ID: 'smsru-api-id',
    SMSRU_TEST: 'false',
    EMAIL_LOGIN_ENABLED: 'false',
    EMAIL_AUTH_DEBUG: 'false',
    YANDEX_LOGIN_ENABLED: 'false',
    TELEGRAM_LOGIN_ENABLED: 'false',
  });
  const validationMessage = (config: Record<string, unknown>): string => {
    try {
      validateRuntimeConfig(config);
      return '';
    } catch (error) {
      return error instanceof Error
        ? error.message
        : 'Unknown validation error';
    }
  };

  it('keeps development usable without production credentials', () => {
    expect(validateRuntimeConfig({})).toMatchObject({
      NODE_ENV: 'development',
    });
  });

  it('rejects ambiguous boolean casing instead of silently changing behavior', () => {
    expect(() => validateRuntimeConfig({ SWAGGER_ENABLED: 'TRUE' })).toThrow(
      'SWAGGER_ENABLED must be true or false',
    );
  });

  it('accepts independent production secrets and explicit boundaries', () => {
    expect(validateRuntimeConfig(productionConfig())).toMatchObject({
      NODE_ENV: 'production',
      PHONE_AUTH_PROVIDER: 'smsru',
    });
  });

  it('accepts tenant PWA URLs only on one HTTPS origin', () => {
    const config = productionConfig();
    config.PWA_TENANT_INSTALL_ENABLED = 'true';
    config.PWA_PUBLIC_APP_URL = 'https://staging.example.test/app.html';
    config.PWA_PUBLIC_API_URL = 'https://staging.example.test/api';

    expect(validateRuntimeConfig(config)).toMatchObject({
      PWA_TENANT_INSTALL_ENABLED: 'true',
    });

    config.PWA_PUBLIC_API_URL = 'https://api.example.test/api';
    expect(validationMessage(config)).toContain(
      'PWA_PUBLIC_APP_URL and PWA_PUBLIC_API_URL must share one origin',
    );

    config.PWA_PUBLIC_APP_URL = 'http://staging.example.test/app.html';
    expect(validationMessage(config)).toContain(
      'PWA_PUBLIC_APP_URL must be an HTTPS URL',
    );
  });

  it('rejects missing, placeholder and shared production secrets', () => {
    const config = productionConfig();
    config.JWT_SECRET = 'change-me-in-production';
    config.AUTH_RATE_LIMIT_SECRET = config.AUTH_REFRESH_TOKEN_SECRET;
    delete config.CRM_ENCRYPTION_KEY;
    const message = validationMessage(config);

    expect(message).toContain('JWT_SECRET contains a known placeholder');
    expect(message).toContain(
      'AUTH_RATE_LIMIT_SECRET must be independent from AUTH_REFRESH_TOKEN_SECRET',
    );
    expect(message).toContain('CRM_ENCRYPTION_KEY is required in production');
  });

  it('rejects production debug delivery and missing SMS transport', () => {
    const config = productionConfig();
    config.PHONE_AUTH_PROVIDER = 'debug';
    config.PHONE_AUTH_DEBUG = 'true';
    config.PHONE_AUTH_FIXED_CODE = '123456';
    config.SMSRU_TEST = 'true';
    delete config.SMSRU_API_ID;
    const message = validationMessage(config);

    expect(message).toContain(
      'PHONE_AUTH_PROVIDER must be auto or smsru in production',
    );
    expect(message).toContain(
      'PHONE_AUTH_FIXED_CODE must be empty in production',
    );
    expect(message).toContain(
      'SMSRU_API_ID is required for production phone auth',
    );
  });

  it('allows production-like staging to disable phone login before SMS approval', () => {
    const config = productionConfig();
    config.PHONE_LOGIN_ENABLED = 'false';
    config.PHONE_AUTH_PROVIDER = 'debug';
    delete config.SMSRU_API_ID;

    expect(validateRuntimeConfig(config)).toMatchObject({
      PHONE_LOGIN_ENABLED: 'false',
    });
  });

  it('requires complete provider config and redirect allowlist', () => {
    const config = productionConfig();
    config.YANDEX_LOGIN_ENABLED = 'true';
    config.TELEGRAM_LOGIN_ENABLED = 'true';
    config.TELEGRAM_JWKS_URL = 'http://telegram.example/jwks';
    delete config.OAUTH_ALLOWED_REDIRECT_URIS;
    const message = validationMessage(config);

    expect(message).toContain(
      'YANDEX_CLIENT_ID is required when its provider is enabled',
    );
    expect(message).toContain('TELEGRAM_JWKS_URL must be an HTTPS URL');
    expect(message).toContain(
      'OAUTH_ALLOWED_REDIRECT_URIS is required when social login is enabled',
    );
    expect(message).toContain(
      'OAUTH_NATIVE_REDIRECT_URI is required when its provider is enabled',
    );
  });

  it('requires the native callback to be in the exact OAuth allowlist', () => {
    const config = productionConfig();
    config.YANDEX_LOGIN_ENABLED = 'true';
    config.YANDEX_CLIENT_ID = 'yandex-client-id';
    config.YANDEX_CLIENT_SECRET = secret('yandex');
    config.OAUTH_ALLOWED_REDIRECT_URIS =
      'https://maya.example/oauth-callback.html';
    config.OAUTH_NATIVE_REDIRECT_URI =
      'https://maya.example/api/auth/oauth/native/callback';

    expect(validationMessage(config)).toContain(
      'OAUTH_NATIVE_REDIRECT_URI must be an exact entry in OAUTH_ALLOWED_REDIRECT_URIS',
    );

    config.OAUTH_ALLOWED_REDIRECT_URIS +=
      ',https://maya.example/api/auth/oauth/native/callback';
    expect(validateRuntimeConfig(config)).toMatchObject({
      OAUTH_NATIVE_REDIRECT_URI:
        'https://maya.example/api/auth/oauth/native/callback',
    });
  });

  it('requires independent secrets and SMTP when email login is enabled', () => {
    const config = productionConfig();
    config.EMAIL_LOGIN_ENABLED = 'true';
    config.EMAIL_AUTH_PROVIDER = 'smtp';
    config.EMAIL_AUTH_SECRET = secret('email');
    config.EMAIL_AUTH_DEBUG = 'false';
    config.EMAIL_AUTH_FIXED_CODE = '';
    config.EMAIL_AUTH_FROM = 'MAYA <no-reply@example.test>';
    config.SMTP_HOST = 'smtp.example.test';
    config.SMTP_PORT = '587';
    config.SMTP_SECURE = 'false';
    config.SMTP_USER = 'smtp-user';
    config.SMTP_PASSWORD = secret('smtp-password');

    expect(validateRuntimeConfig(config)).toMatchObject({
      EMAIL_LOGIN_ENABLED: 'true',
      EMAIL_AUTH_PROVIDER: 'smtp',
    });

    config.EMAIL_AUTH_PROVIDER = 'debug';
    config.EMAIL_AUTH_DEBUG = 'true';
    config.EMAIL_AUTH_FIXED_CODE = '123456';
    delete config.SMTP_PASSWORD;
    const message = validationMessage(config);

    expect(message).toContain(
      'EMAIL_AUTH_PROVIDER must be auto or smtp in production',
    );
    expect(message).toContain(
      'EMAIL_AUTH_DEBUG cannot be enabled in production',
    );
    expect(message).toContain(
      'EMAIL_AUTH_FIXED_CODE must be empty in production',
    );
    expect(message).toContain(
      'SMTP_PASSWORD is required when its provider is enabled',
    );
  });

  it('rejects unsafe proxy, CORS and numeric settings', () => {
    const config = productionConfig();
    config.AUTH_TRUST_PROXY = '*';
    config.CORS_ALLOWED_ORIGINS = '*';
    config.JWT_ACCESS_TTL_SECONDS = '30';
    config.PHONE_AUTH_CODE_TTL = '300';
    config.PHONE_AUTH_RESEND_COOLDOWN_SECONDS = '600';
    config.EMAIL_AUTH_CODE_TTL = '300';
    config.EMAIL_AUTH_RESEND_COOLDOWN_SECONDS = '600';
    config.AI_TOOL_RETENTION_DAYS = '2';
    config.AI_TOOL_STALE_EXECUTION_MINUTES = '121';
    config.AI_CORE_TIMEOUT_MS = '999';
    config.AI_CORE_MAX_TOOL_STEPS = '4';
    config.AI_CORE_PROVIDER = 'unrestricted';
    const message = validationMessage(config);

    expect(message).toContain('CORS origins must be explicit');
    expect(message).toContain('AUTH_TRUST_PROXY contains unsafe value: *');
    expect(message).toContain(
      'JWT_ACCESS_TTL_SECONDS must be an integer from 300 to 3600',
    );
    expect(message).toContain(
      'PHONE_AUTH_RESEND_COOLDOWN_SECONDS cannot exceed PHONE_AUTH_CODE_TTL',
    );
    expect(message).toContain(
      'EMAIL_AUTH_RESEND_COOLDOWN_SECONDS cannot exceed EMAIL_AUTH_CODE_TTL',
    );
    expect(message).toContain(
      'AI_TOOL_RETENTION_DAYS must be an integer from 7 to 365',
    );
    expect(message).toContain(
      'AI_TOOL_STALE_EXECUTION_MINUTES must be an integer from 5 to 120',
    );
    expect(message).toContain(
      'AI_CORE_TIMEOUT_MS must be an integer from 1000 to 60000',
    );
    expect(message).toContain(
      'AI_CORE_MAX_TOOL_STEPS must be an integer from 1 to 3',
    );
    expect(message).toContain(
      'AI_CORE_PROVIDER must be auto, deepseek, openai or safe',
    );
  });
});
