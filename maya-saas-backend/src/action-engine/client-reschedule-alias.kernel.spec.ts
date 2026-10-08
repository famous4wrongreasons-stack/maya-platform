import type { ActionExecution, PrismaClient } from '@prisma/client';
import { ActionEngineKernel } from './action-engine.kernel';
import { ActionIdentityService } from './action-engine.identity';

const secret = 'client-reschedule-alias-unit-secret-20261008';
const scope = 'maya.widgets.booking.commit.v1';
function fixture() {
  const identity = new ActionIdentityService(secret, secret);
  const row = {
    id: 'execution-a',
    tenantId: 'tenant-a',
    capability: 'crm.appointment.reschedule.v1',
    sourceType: 'authenticated_request',
    sourceRef: 'client-channel-link:link-a',
    targetRef: 'appointment/provider-a',
    evidenceRefsJson: [
      'client-authority:v1:link-a',
      'client-target:appointment:v1:appointment-a',
    ],
  } as ActionExecution;
  const prisma = {
    actionExecution: { findUnique: jest.fn().mockResolvedValue(row) },
  };
  const kernel = new ActionEngineKernel(prisma as unknown as PrismaClient, {
    identitySecret: secret,
    payloadEncryptionSecret: secret,
  });
  const trusted = jest
    .spyOn(kernel, 'readTrustedNormalizedInput')
    .mockResolvedValue({
      externalId: 'provider-a',
      start: '2099-09-20T10:00:00Z',
    });
  return { row, kernel, prisma, identity, trusted };
}

describe('Exact existing widget reschedule caller alias', () => {
  it('uses the exact tenant, fixed scope and canonical caller hash, with no create or legacy fallback', async () => {
    const f = fixture();
    await expect(
      f.kernel.resolveClientRescheduleCallerAlias('tenant-a', 'server-key'),
    ).resolves.toBe(f.row);
    expect(f.prisma.actionExecution.findUnique).toHaveBeenCalledTimes(1);
    expect(f.prisma.actionExecution.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_idempotencyScope_requestIdempotencyKeyHash: {
          tenantId: 'tenant-a',
          idempotencyScope: scope,
          requestIdempotencyKeyHash: f.identity.callerIdempotencyHash({
            tenantId: 'tenant-a',
            scope,
            key: 'server-key',
          }),
        },
      },
    });
    expect(f.trusted).toHaveBeenCalledWith('tenant-a', 'execution-a');
  });

  it('returns absence without looking up another identity or admitting an action', async () => {
    const f = fixture();
    f.prisma.actionExecution.findUnique.mockResolvedValue(null);
    await expect(
      f.kernel.resolveClientRescheduleCallerAlias('tenant-a', 'missing'),
    ).resolves.toBeNull();
    expect(f.prisma.actionExecution.findUnique).toHaveBeenCalledTimes(1);
    expect(f.trusted).not.toHaveBeenCalled();
  });

  it.each([
    { tenantId: 'foreign-tenant' },
    { capability: 'crm.appointment.create.v1' },
    { sourceType: 'agent_task' },
    { evidenceRefsJson: [] },
    { sourceRef: 'client-channel-link:foreign-link' },
    { targetRef: 'appointment/foreign-record' },
  ])(
    'rejects a caller binding without exact Client reschedule attribution: %j',
    async (changes) => {
      const f = fixture();
      Object.assign(f.row, changes);
      await expect(
        f.kernel.resolveClientRescheduleCallerAlias('tenant-a', 'server-key'),
      ).rejects.toThrow();
      expect(f.prisma.actionExecution.findUnique).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects empty keys before querying', async () => {
    const f = fixture();
    await expect(
      f.kernel.resolveClientRescheduleCallerAlias('tenant-a', '  '),
    ).rejects.toThrow('blank');
    expect(f.prisma.actionExecution.findUnique).not.toHaveBeenCalled();
  });
});
