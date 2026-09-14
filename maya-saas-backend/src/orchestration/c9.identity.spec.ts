import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../encryption/encryption.service';
import { C9RequestIdentity } from './c9.identity';
import { C9Principal, C9_DAY, c9Hash, c9Shape, c9Id } from './c9.contract';

describe('C9 P01 durable request age/identity', () => {
  const cipher = new EncryptionService(
    new ConfigService({ CRM_ENCRYPTION_KEY: 'synthetic-c9-tests-only' }),
  );
  const issuer = new C9RequestIdentity(cipher),
    now = new Date('2026-09-13T10:00:00.000Z');
  const p: C9Principal = {
    kind: 'USER',
    tenantId: 'tenant-a',
    userId: 'user-a',
    membershipId: 'membership-a',
    clientId: null,
    channelLinkId: null,
    branchRefs: [],
    staffRef: null,
    proofHash: 'a'.repeat(64),
  };
  test('retry and restart preserve signed event identity, not current desired state', () => {
    const token = issuer.issue(p, now),
      first = issuer.verify(token, p, now);
    const retry = new C9RequestIdentity(cipher).verify(
      token,
      p,
      new Date(now.getTime() + 60000),
    );
    expect(retry).toEqual(first);
    expect(issuer.verify(issuer.issue(p, now), p, now).keyHash).not.toBe(
      first.keyHash,
    );
  });
  test.each(['tenantId', 'userId', 'membershipId', 'proofHash'] as const)(
    'current %s change rejects the old event',
    (key) => {
      const token = issuer.issue(p, now);
      expect(() =>
        issuer.verify(token, { ...p, [key]: 'b'.repeat(64) }, now),
      ).toThrow('c9_event_principal');
    },
  );
  test('expired event cannot recreate a cleaned root', () => {
    const token = issuer.issue(p, now);
    expect(() =>
      issuer.verify(token, p, new Date(now.getTime() + C9_DAY)),
    ).toThrow('c9_event_expired');
    expect(() =>
      issuer.issue(p, now, new Date(now.getTime() + C9_DAY + 1)),
    ).toThrow('c9_event_validity');
  });
  test('signature manipulation and future envelope fail closed', () => {
    const token = issuer.issue(p, now),
      [encoded, mac] = token.split('.');
    const e = JSON.parse(
      Buffer.from(encoded, 'base64url').toString(),
    ) as Record<string, unknown>;
    e.expiresAt = '2099-01-01T00:00:00.000Z';
    expect(() =>
      issuer.verify(
        Buffer.from(JSON.stringify(e)).toString('base64url') + '.' + mac,
        p,
        now,
      ),
    ).toThrow('c9_event_signature');
    expect(() => issuer.verify(token, p, new Date(now.getTime() - 1))).toThrow(
      'c9_event_expired',
    );
  });
  test('canonical tuples ignore object property order while preserving sequence and exact identity', () => {
    expect(c9Hash('test/1', [{ a: 1, b: 2 }])).toBe(
      c9Hash('test/1', [{ b: 2, a: 1 }]),
    );
    expect(c9Hash('test/1', [[1, 2]])).not.toBe(c9Hash('test/1', [[2, 1]]));
    expect(c9Hash('test/1', ['ClientA'])).not.toBe(
      c9Hash('test/1', ['clienta']),
    );
    expect(() =>
      c9Shape({ id: c9Id })({ id: 'a', phone: '+79990000000' }),
    ).toThrow('c9_unknown_field');
  });
  test('verified Client principal needs no invented Maya User', () => {
    const client: C9Principal = {
      ...p,
      kind: 'CLIENT_CHANNEL',
      userId: null,
      membershipId: null,
      clientId: 'client-a',
      channelLinkId: 'link-a',
    };
    const e = issuer.verify(issuer.issue(client, now), client, now);
    expect(e.envelope.tenantId).toBe('tenant-a');
    expect(() =>
      issuer.verify(
        issuer.issue(client, now),
        { ...client, clientId: 'client-b' },
        now,
      ),
    ).toThrow();
  });
});
