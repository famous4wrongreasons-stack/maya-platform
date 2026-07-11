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
  });

  it('rejects unsafe proxy, CORS and numeric settings', () => {
    const config = productionConfig();
    config.AUTH_TRUST_PROXY = '*';
    config.CORS_ALLOWED_ORIGINS = '*';
    config.JWT_ACCESS_TTL_SECONDS = '30';
    config.PHONE_AUTH_CODE_TTL = '300';
    config.PHONE_AUTH_RESEND_COOLDOWN_SECONDS = '600';
    const message = validationMessage(config);

    expect(message).toContain('CORS origins must be explicit');
    expect(message).toContain('AUTH_TRUST_PROXY contains unsafe value: *');
    expect(message).toContain(
      'JWT_ACCESS_TTL_SECONDS must be an integer from 300 to 3600',
    );
    expect(message).toContain(
      'PHONE_AUTH_RESEND_COOLDOWN_SECONDS cannot exceed PHONE_AUTH_CODE_TTL',
    );
  });
});
