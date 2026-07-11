import type { Request } from 'express';

export interface AuthClientMetadata {
  clientIp: string | null;
  userAgent: string | null;
}

export function resolveAuthClientMetadata(
  request: Request,
): AuthClientMetadata {
  const forwarded = request.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(',')[0];
  const clientIp = forwardedIp?.trim() || request.ip?.trim() || null;
  const userAgent = request.header('user-agent')?.trim() || null;

  return { clientIp, userAgent };
}
