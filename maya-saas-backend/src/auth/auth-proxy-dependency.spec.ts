import express, { type Request } from 'express';
import {
  resolveAuthClientMetadata,
  resolveAuthTrustedProxies,
} from './auth-client-metadata';

/** Exercise Express's real req.ip resolver. No listener, credentials or provider.
 * GHSA-jqcg-44mw-7w3h: an IPv6 subnet must not trust arbitrary IPv4 peers. */
function metadata(trust: string, peer: string, forwarded: string) {
  const app = express();
  app.set('trust proxy', resolveAuthTrustedProxies(trust));
  const request = Object.assign(Object.create(app.request) as Request, {
    app,
    socket: { remoteAddress: peer },
    headers: { 'x-forwarded-for': forwarded },
  });
  return resolveAuthClientMetadata(request);
}

describe('Express proxy dependency security', () => {
  it.each(['::ffff:10.0.0.0/8', '::/1'])(
    'does not trust an unrelated IPv4 peer through IPv6 subnet %s',
    (subnet) => {
      expect(metadata(subnet, '203.0.113.20', '198.51.100.99').clientIp).toBe(
        '203.0.113.20',
      );
    },
  );

  it.each(['10.0.0.0/8', '::ffff:10.0.0.0/104'])(
    'preserves forwarding through the correctly bounded subnet %s',
    (subnet) => {
      expect(metadata(subnet, '10.0.0.2', '198.51.100.99').clientIp).toBe(
        '198.51.100.99',
      );
      expect(metadata(subnet, '203.0.113.20', '198.51.100.99').clientIp).toBe(
        '203.0.113.20',
      );
    },
  );
});
