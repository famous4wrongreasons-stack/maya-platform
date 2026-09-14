import { Injectable } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { EncryptionService } from '../encryption/encryption.service';
import {
  C9_DAY,
  C9Principal,
  c9Deny,
  c9Enum,
  c9Hash,
  c9HashValue,
  c9Id,
  c9Instant,
  c9Shape,
} from './c9.contract';

const envelopeSchema = c9Shape({
  purpose: c9Enum('c9_request_v1'),
  eventId: c9Id,
  tenantId: c9Id,
  principalHash: c9HashValue,
  issuedAt: c9Instant,
  expiresAt: c9Instant,
});
type Envelope = {
  purpose: 'c9_request_v1';
  eventId: string;
  tenantId: string;
  principalHash: string;
  issuedAt: string;
  expiresAt: string;
};
export const c9PrincipalHash = (p: C9Principal) =>
  c9Hash('principal/1', [
    p.kind,
    p.tenantId,
    p.userId,
    p.membershipId,
    p.clientId,
    p.channelLinkId,
    p.branchRefs,
    p.staffRef,
    p.proofHash,
  ]);
/** A purpose-bound age receipt, never bearer authorization. Current auth is required on every use. */
@Injectable()
export class C9RequestIdentity {
  constructor(private readonly encryption: EncryptionService) {}
  issue(
    principal: C9Principal,
    now: Date,
    validUntil = new Date(now.getTime() + C9_DAY),
  ): string {
    if (validUntil <= now || validUntil.getTime() > now.getTime() + C9_DAY)
      c9Deny('event_validity');
    const e: Envelope = {
      purpose: 'c9_request_v1',
      eventId: randomUUID(),
      tenantId: principal.tenantId,
      principalHash: c9PrincipalHash(principal),
      issuedAt: now.toISOString(),
      expiresAt: validUntil.toISOString(),
    };
    const encoded = Buffer.from(JSON.stringify(e)).toString('base64url');
    return (
      encoded +
      '.' +
      this.encryption.opaqueReference('c9:request-age:v1', encoded)
    );
  }
  verify(token: string, principal: C9Principal, now: Date) {
    if (
      typeof token !== 'string' ||
      token.length > 4096 ||
      !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token)
    )
      c9Deny('event_receipt');
    const [encoded, mac] = token.split('.');
    const expected = this.encryption.opaqueReference(
      'c9:request-age:v1',
      encoded,
    );
    if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex')))
      c9Deny('event_signature');
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as unknown;
    } catch {
      c9Deny('event_encoding');
    }
    const e = envelopeSchema(parsed) as Envelope;
    if (
      e.tenantId !== principal.tenantId ||
      e.principalHash !== c9PrincipalHash(principal)
    )
      c9Deny('event_principal');
    const start = Date.parse(e.issuedAt),
      end = Date.parse(e.expiresAt);
    if (
      start > now.getTime() ||
      end <= now.getTime() ||
      end <= start ||
      end - start > C9_DAY
    )
      c9Deny('event_expired');
    return {
      envelope: e,
      hash: c9Hash('request-age/1', [encoded, mac]),
      keyHash: c9Hash('request-key/1', [e.tenantId, e.eventId]),
    };
  }
}
