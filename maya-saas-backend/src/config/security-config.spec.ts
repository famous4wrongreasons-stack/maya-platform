import {
  isCorsOriginAllowed,
  isSwaggerEnabled,
  resolveAllowedOauthRedirectUri,
  resolveCorsAllowlist,
  resolveNodeEnvironment,
  resolveOauthRedirectAllowlist,
} from './security-config';

describe('security config', () => {
  it('provides a narrow local CORS policy outside production', () => {
    const allowlist = resolveCorsAllowlist('', 'development');

    expect(allowlist).toContain('http://127.0.0.1:8787');
    expect(allowlist).toContain('capacitor://localhost');
    expect(isCorsOriginAllowed(undefined, allowlist, 'development')).toBe(true);
    expect(
      isCorsOriginAllowed('http://127.0.0.1:8787', allowlist, 'development'),
    ).toBe(true);
    expect(
      isCorsOriginAllowed('https://attacker.example', allowlist, 'development'),
    ).toBe(false);
  });

  it('requires explicit secure production CORS origins', () => {
    const allowlist = resolveCorsAllowlist(
      'https://app.example.test,capacitor://localhost',
      'production',
    );

    expect(allowlist).toEqual([
      'https://app.example.test',
      'capacitor://localhost',
    ]);
    expect(() => resolveCorsAllowlist('*', 'production')).toThrow(
      'CORS origins must be explicit',
    );
    expect(() =>
      resolveCorsAllowlist('http://app.example.test', 'production'),
    ).toThrow('Production CORS origins must use HTTPS');
    expect(() =>
      resolveCorsAllowlist('https://app.example.test/path', 'production'),
    ).toThrow('CORS allowlist entries must contain origins only');
  });

  it('allows only exact OAuth redirects while preserving local development', () => {
    const allowlist =
      'https://app.example.test/oauth-callback.html,https://admin.example.test/callback';

    expect(
      resolveAllowedOauthRedirectUri(
        'https://app.example.test/oauth-callback.html',
        allowlist,
        'production',
      ),
    ).toBe('https://app.example.test/oauth-callback.html');
    expect(() =>
      resolveAllowedOauthRedirectUri(
        'https://attacker.example/oauth-callback.html',
        allowlist,
        'production',
      ),
    ).toThrow('OAuth redirect URI is not allowlisted');
    expect(
      resolveAllowedOauthRedirectUri(
        'http://127.0.0.1:8787/oauth-callback.html',
        '',
        'development',
      ),
    ).toBe('http://127.0.0.1:8787/oauth-callback.html');
    expect(() =>
      resolveAllowedOauthRedirectUri(
        'http://127.0.0.1:8787/oauth-callback.html',
        'http://127.0.0.1:8787/oauth-callback.html',
        'production',
      ),
    ).toThrow('OAuth redirect URI must use HTTPS');
  });

  it('rejects OAuth redirect query and fragment mutations', () => {
    expect(() =>
      resolveOauthRedirectAllowlist(
        'https://app.example.test/callback?next=attacker',
        'production',
      ),
    ).toThrow('unsupported URL components');
    expect(() =>
      resolveOauthRedirectAllowlist(
        'https://app.example.test/callback#token',
        'production',
      ),
    ).toThrow('unsupported URL components');
  });

  it('disables Swagger by default only in production', () => {
    expect(isSwaggerEnabled('', 'production')).toBe(false);
    expect(isSwaggerEnabled('', 'development')).toBe(true);
    expect(isSwaggerEnabled('true', 'production')).toBe(true);
    expect(isSwaggerEnabled('false', 'development')).toBe(false);
    expect(() => isSwaggerEnabled('sometimes', 'production')).toThrow(
      'SWAGGER_ENABLED must be true or false',
    );
  });

  it('accepts only known node environments', () => {
    expect(resolveNodeEnvironment(undefined)).toBe('development');
    expect(resolveNodeEnvironment('test')).toBe('test');
    expect(() => resolveNodeEnvironment('staging')).toThrow(
      'NODE_ENV must be development, test or production',
    );
  });
});
