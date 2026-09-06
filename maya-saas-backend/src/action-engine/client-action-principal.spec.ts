import { ActionPolicyDecision } from '@prisma/client';
import {
  clientPrincipalEvidence,
  readClientActionPrincipal,
} from './client-action-principal.contract';
import {
  ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
  CanonicalActionPolicyResolver,
  type ActionPolicyResolutionRequestV1,
} from './action-engine.policy-resolver';
import { createCanonicalProductionPolicyRegistry } from './action-engine.policy-registry';

const HASH = 'a'.repeat(64);
const NOW = new Date('2026-09-06T12:00:00.000Z');
function setup(provider = 'telegram', userId: string | null = null) {
  const link = {
    id: 'link-a',
    tenantId: 'tenant-a',
    clientId: 'client-a',
    provider,
    providerSubjectHash: HASH,
    verificationEvidenceHash: HASH,
    verificationIdentityHash: HASH,
    verificationVersion: 1,
    subjectHashVersion: 1,
    revokedAt: null as Date | null,
  };
  const client = { id: 'client-a', mergedIntoClientId: null, userId };
  const appointment = {
    id: 'appointment-a',
    tenantId: 'tenant-a',
    mayaClientId: 'client-a',
    source: 'external',
    crmProvider: 'yclients',
    crmExternalId: 'record-a',
  };
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'tenant-a',
        status: 'active',
        planId: 'plan-a',
        trialEndsAt: null,
        trialFullAccess: false,
        currentPeriodEnd: new Date('2099-01-01'),
        pastDueAt: null,
        graceEndsAt: null,
        updatedAt: NOW,
      }),
    },
    membership: { findUnique: jest.fn() },
    clientChannelLink: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: { id_tenantId: { id: string; tenantId: string } };
        }) =>
          Promise.resolve(
            where.id_tenantId.id === link.id &&
              where.id_tenantId.tenantId === link.tenantId
              ? link
              : null,
          ),
      ),
    },
    client: { findUnique: jest.fn().mockResolvedValue(client) },
    appointment: {
      findFirst: jest.fn(({ where }: { where: Record<string, string> }) =>
        Promise.resolve(
          Object.entries(where).every(
            ([key, value]) =>
              appointment[key as keyof typeof appointment] === value,
          )
            ? appointment
            : null,
        ),
      ),
    },
    crmIntegration: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ provider: 'yclients', status: 'active' }),
    },
  };
  const resolver = new CanonicalActionPolicyResolver(
    prisma as never,
    {
      resolveFeatureRequirements: jest.fn().mockResolvedValue({
        contract: 'maya.feature-requirement-decision/1',
        tenantId: 'tenant-a',
        planId: 'plan-a',
        requiredFeatures: [],
        allowed: true,
        evaluatedAt: NOW,
        validUntil: new Date('2099-01-01'),
      }),
    },
    {
      attestationSecret: 'b32-canonical-principal-unit-test-secret',
      now: () => NOW,
    },
    createCanonicalProductionPolicyRegistry(),
  );
  return { link, client, appointment, prisma, resolver };
}

function request(
  capability = 'crm.appointment.create.v1',
): ActionPolicyResolutionRequestV1 {
  const create = capability === 'crm.appointment.create.v1';
  const targetRef = create ? 'create/booking-a' : 'appointment/record-a';
  return {
    contract: ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
    tenantId: 'tenant-a',
    capability,
    sourceType: 'authenticated_request',
    sourceRef: 'client-channel-link:link-a',
    targetRef,
    normalizedInputHash: HASH,
    clientPrincipal: readClientActionPrincipal({
      capability,
      sourceType: 'authenticated_request',
      targetRef,
      input: create
        ? {
            clientId: 'client-a',
            clientName: 'Synthetic',
            clientPhone: '+79990001122',
            staffId: 'staff-a',
            serviceIds: ['service-a'],
            start: '2099-01-01T10:00:00Z',
            creationMode: 'client',
            allowBusy: false,
            notifyBySmsHours: 0,
          }
        : capability === 'crm.appointment.services.v1'
          ? { serviceIds: ['service-a'] }
          : {
              externalId: 'record-a',
              start: '2099-01-01T10:00:00Z',
              serviceIds: ['service-a'],
            },
      evidenceRefs: clientPrincipalEvidence(
        'link-a',
        create ? undefined : 'appointment-a',
      ),
      hasBookingIntent: create,
    }),
  };
}

describe('B32 common Client action principal policy', () => {
  it.each(['telegram', 'maya_user'])(
    '%s supports a Client with or without a Maya User',
    async (provider) => {
      for (const userId of [null, 'optional-real-user']) {
        const { resolver, prisma } = setup(provider, userId);
        const result = await resolver.resolve(request());
        expect(result.policyDecision).toBe(ActionPolicyDecision.ALLOW);
        expect(result.reasonCodes).not.toContain('actor_required');
        expect(result.policyEvidenceJson.actor).toMatchObject({
          kind: 'client_channel',
          role: 'client',
          membershipRef: null,
          client: { contract: 'maya.client-action-principal/1', provider },
        });
        expect(prisma.membership.findUnique).not.toHaveBeenCalled();
        const evidence = JSON.stringify(result.policyEvidenceJson);
        for (const secret of [
          'client-a',
          'link-a',
          'optional-real-user',
          '+79990001122',
          'raw-telegram-id',
          'raw-channel-secret',
        ])
          expect(evidence).not.toContain(JSON.stringify(secret));
      }
    },
  );

  it.each(['missing', 'revoked', 'wrong-tenant', 'other-client', 'merged'])(
    'rejects %s binding/Client',
    async (kind) => {
      const { resolver, link, client, prisma } = setup();
      if (kind === 'missing')
        prisma.clientChannelLink.findUnique.mockResolvedValue(null);
      if (kind === 'revoked') link.revokedAt = NOW;
      if (kind === 'wrong-tenant') link.tenantId = 'tenant-b';
      if (kind === 'other-client') client.id = 'client-b';
      if (kind === 'merged')
        Object.assign(client, { mergedIntoClientId: 'client-b' });
      await expect(resolver.resolve(request())).rejects.toThrow();
    },
  );

  it.each(['cancel', 'reschedule', 'services'])(
    'authorizes only the owned canonical Appointment for %s',
    async (operation) => {
      const { resolver, appointment, prisma } = setup();
      const action = request(`crm.appointment.${operation}.v1`);
      expect((await resolver.resolve(action)).policyDecision).toBe('ALLOW');
      appointment.mayaClientId = 'client-b';
      await expect(resolver.resolve(action)).rejects.toThrow(
        'Client does not own',
      );
      appointment.mayaClientId = 'client-a';
      prisma.crmIntegration.findUnique.mockResolvedValue({
        provider: 'altegio',
        status: 'active',
      });
      await expect(resolver.resolve(action)).rejects.toThrow(
        'provider Appointment target mismatch',
      );
    },
  );

  it('distinguishes canonical internal id from a provider record id', async () => {
    const { resolver, appointment } = setup();
    appointment.source = 'internal';
    const action = request('crm.appointment.cancel.v1');
    await expect(resolver.resolve(action)).rejects.toThrow(
      'Internal Appointment target mismatch',
    );
    action.targetRef = 'appointment/appointment-a';
    action.clientPrincipal = {
      linkId: 'link-a',
      target: {
        kind: 'appointment',
        appointmentId: 'appointment-a',
        externalId: 'appointment-a',
      },
    };
    expect((await resolver.resolve(action)).policyDecision).toBe('ALLOW');
  });

  it('does not turn Client evidence into universal permission or fall back to a User', async () => {
    const { resolver } = setup();
    await expect(
      resolver.resolve({
        ...request(),
        capability: 'loyalty.internal-adjust.execute.v1',
      }),
    ).rejects.toThrow();
    await expect(
      resolver.resolve({ ...request(), actorUserId: 'fake-user' }),
    ).rejects.toThrow('Invalid Client action principal');
    await expect(
      resolver.resolve({ ...request(), sourceType: 'legacy_bridge' }),
    ).rejects.toThrow('Invalid Client action principal');
  });

  it.each([
    'package5.client-preferences.visit-mood.execute.v1',
    'package5.client-habits.add.execute.v1',
    'package5.client-wanted-slot.add.execute.v1',
    'package5.wave3.record-client-consent.execute.v1',
  ])(
    'preserves the approved Client-target contract: %s',
    async (capability) => {
      const { resolver, link } = setup();
      const action = {
        ...request(),
        capability,
        targetRef: 'client-a',
        clientPrincipal: undefined,
        clientChannel: {
          linkId: link.id,
          provider: 'telegram' as const,
          providerSubjectHash: HASH,
          verificationEvidenceHash: HASH,
        },
      };
      const result = await resolver.resolve(action);
      expect(result.policyDecision).toBe('ALLOW');
      expect(result.policyEvidenceJson.actor).toMatchObject({
        kind: 'client_channel',
        role: 'client',
      });
    },
  );

  it('rejects raw/ambiguous/unknown authority and a create without immutable intent', () => {
    const base = {
      capability: 'crm.appointment.create.v1',
      sourceType: 'authenticated_request',
      targetRef: 'create/a',
      input: {},
      hasBookingIntent: true,
    };
    for (const evidenceRefs of [
      ['client-authority:telegram:123456789'],
      ['client-authority:v2:link-a'],
      ['client-authority:v1:link-a', 'client-authority:v1:link-b'],
      ['client-target:appointment:v1:appointment-a'],
    ])
      expect(() =>
        readClientActionPrincipal({ ...base, evidenceRefs }),
      ).toThrow();
    expect(() =>
      readClientActionPrincipal({
        ...base,
        evidenceRefs: clientPrincipalEvidence('link-a'),
        hasBookingIntent: false,
      }),
    ).toThrow();
  });
});
