import {
  ActionIdentityService,
  stableActionJson,
} from './action-engine.identity';

describe('ActionIdentityService', () => {
  const identity = new ActionIdentityService(
    'identity-secret-used-only-for-action-engine-unit-tests',
    'payload-secret-used-only-for-action-engine-unit-tests',
  );

  it('produces stable canonical JSON and logical identities', () => {
    expect(stableActionJson({ z: 1, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"z":1}',
    );
    const request = {
      tenantId: 'tenant-a',
      identityVersion: 1,
      actionClass: 'kernel_safe_retry',
      capability: 'kernel.test.safe-retry',
      capabilityVersion: 1,
      targetKind: 'synthetic_target',
      targetRef: 'target/one',
      normalizedInputHash: 'input-hash',
      occurrenceScope: 'occurrence/one',
    };
    expect(identity.logicalIdentity(request)).toBe(
      identity.logicalIdentity({ ...request }),
    );
    expect(
      identity.logicalIdentity({ ...request, tenantId: 'tenant-b' }),
    ).not.toBe(identity.logicalIdentity(request));
  });

  it('encrypts normalized payloads without changing their content', () => {
    const payload = stableActionJson({ valueRef: 'safe/ref' });
    const encrypted = identity.encryptNormalizedPayload(payload);
    expect(encrypted).not.toContain('safe/ref');
    expect(identity.decryptNormalizedPayload(encrypted)).toBe(payload);
  });

  it('keeps caller idempotency aliases outside logical identity', () => {
    const logical = {
      tenantId: 'tenant-a',
      identityVersion: 1,
      actionClass: 'create_appointment',
      capability: 'crm.appointment.create.v1',
      capabilityVersion: 1,
      targetKind: 'appointment',
      targetRef: 'booking/request-1',
      normalizedInputHash: 'input-hash',
      occurrenceScope: 'appointment/create/request-1',
    };
    const httpAlias = {
      ...logical,
      idempotencyScope: 'http',
      requestIdempotencyKeyHash: 'http-key',
    };
    const aiAlias = {
      ...logical,
      idempotencyScope: 'ai',
      requestIdempotencyKeyHash: 'ai-key',
    };

    expect(identity.logicalIdentity(httpAlias)).toBe(
      identity.logicalIdentity(aiAlias),
    );
  });
});
