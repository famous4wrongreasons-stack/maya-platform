import type { Request } from 'express';

import {
  resolveAuthClientMetadata,
  resolveAuthTrustedProxies,
} from './auth-client-metadata';

describe('auth client metadata', () => {
  it('uses only the IP already resolved by Express', () => {
    const request = {
      headers: {
        'x-forwarded-for': '198.51.100.99',
      },
      ip: '203.0.113.20',
      header: jest.fn((name: string) =>
        name === 'user-agent' ? 'Maya Test Browser' : undefined,
      ),
    } as unknown as Request;

    expect(resolveAuthClientMetadata(request)).toEqual({
      clientIp: '203.0.113.20',
      userAgent: 'Maya Test Browser',
    });
  });

  it('requires an explicit trusted proxy allowlist', () => {
    expect(resolveAuthTrustedProxies(undefined)).toBe(false);
    expect(resolveAuthTrustedProxies('')).toBe(false);
    expect(
      resolveAuthTrustedProxies('loopback, 10.0.0.0/8, 192.168.0.0/16'),
    ).toEqual(['loopback', '10.0.0.0/8', '192.168.0.0/16']);
  });
});
