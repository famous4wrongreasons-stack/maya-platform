import assert from 'node:assert/strict';

export const PRODUCTION_NATIVE_API = 'https://mayaos.ru/api';

/** Explicit build input only. No runtime setting, proxy, ATS exception or remote web shell. */
export function nativeApiTarget(developmentApi) {
  if (developmentApi === undefined) return {
    mode: 'production', apiBase: PRODUCTION_NATIVE_API, connectSrc: "'self' https://mayaos.ru",
  };
  assert.equal(typeof developmentApi, 'string', 'development API must be a URL');
  const url = new URL(developmentApi);
  assert.equal(url.protocol, 'https:', 'development API requires trusted HTTPS');
  assert.ok(!url.username && !url.password && !url.search && !url.hash, 'credentials, query and fragment are forbidden');
  assert.equal(url.pathname, '/api', 'development API path must be exactly /api');
  assert.match(url.hostname, /^[a-z0-9.-]+$/, 'development API requires a plain hostname or IPv4 address');
  assert.ok(!url.hostname.endsWith('.'), 'trailing-dot hostname aliases are forbidden');
  assert.ok(!['mayaos.ru', 'www.mayaos.ru'].includes(url.hostname), 'production endpoint is not a development target');
  assert.equal(url.href, developmentApi, 'development API must be a canonical URL');
  return { mode: 'development', apiBase: url.href, connectSrc: `'self' ${url.origin}` };
}

/** Xcode may select development bytes only for Debug, with an explicit build setting. */
export function xcodeDevelopmentApi(configuration, value) {
  if (!value) return undefined;
  assert.equal(configuration, 'Debug', 'development API payload is forbidden outside Debug');
  nativeApiTarget(value);
  return value;
}

export function parseDevelopmentApi(args) {
  const flags = args.filter((arg) => arg.startsWith('--development-api='));
  assert.ok(flags.length <= 1, 'only one development API may be selected');
  const value = flags[0]?.slice('--development-api='.length);
  if (value !== undefined) nativeApiTarget(value);
  return value;
}
