import type { Request } from 'express';

export interface AuthClientMetadata {
  clientIp: string | null;
  userAgent: string | null;
}

export function resolveAuthClientMetadata(
  request: Request,
): AuthClientMetadata {
  const clientIp = request.ip?.trim() || null;
  const userAgent = request.header('user-agent')?.trim() || null;

  return { clientIp, userAgent };
}

export function resolveAuthTrustedProxies(
  rawValue?: string | null,
): false | string[] {
  const proxies = String(rawValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return proxies.length > 0 ? proxies : false;
}
