import type { Prisma } from '@prisma/client';
import type { MeasurementReadService } from '../measurement/measurement.read.service';
import { canonicalFingerprint } from '../opportunities/opportunity.engine';
import type { C8ReadService } from '../valuation/c8.read';
import {
  c9Evidence,
  c9Hash,
  type C9Object,
  type C9Principal,
} from './c9.contract';
import { c9C5Fingerprint, C9Sources } from './c9.sources';

const now = new Date('2035-01-01T00:00:00.000Z');
const principal: C9Principal = {
  kind: 'USER',
  tenantId: 'tenant',
  userId: 'owner',
  membershipId: 'member',
  clientId: null,
  channelLinkId: null,
  branchRefs: [],
  staffRef: null,
  proofHash: 'f'.repeat(64),
};
function fixture(type: 'Opportunity' | 'AgentTask') {
  const row: C9Object =
    type === 'Opportunity'
      ? {
          id: 'op',
          tenantId: 'tenant',
          identityFingerprint: canonicalFingerprint('identity', ['op']),
          evidenceFingerprint: canonicalFingerprint('evidence', ['op']),
          status: 'active',
          affectedEntityRef: 'appointment-ref',
        }
      : {
          id: 'task',
          tenantId: 'tenant',
          taskFingerprint: canonicalFingerprint('task', ['op']),
          status: 'current',
          opportunityId: 'op',
        };
  row.expiresAt = '2035-01-02T00:00:00.000Z';
  const ref = {
    sourceType: type,
    id: row.id,
    tenantId: row.tenantId,
    subjectKind: type === 'Opportunity' ? 'appointment' : 'assignment',
    subjectRef: row.affectedEntityRef ?? row.id,
    contractVersion: 1,
    identityHash: c9C5Fingerprint(
      row.identityFingerprint ?? row.taskFingerprint,
    ),
    inputHash: c9C5Fingerprint(row.evidenceFingerprint ?? row.taskFingerprint),
    observedAt: now.toISOString(),
    validUntil: row.expiresAt,
    retentionUntil: null,
    status: 'VERIFIED',
    completeness: 'COMPLETE',
    unavailableReason: null,
  };
  const tx = {
    $queryRaw: jest
      .fn()
      .mockImplementation(() => Promise.resolve([{ data: row }])),
    membership: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ role: 'tenant_owner', branchId: null }),
    },
  };
  const sources = new C9Sources(
    {} as MeasurementReadService,
    {} as C8ReadService,
  );
  const check = (value: unknown = ref, p = principal) =>
    sources.check(tx as unknown as Prisma.TransactionClient, p, value, now);
  return { row, ref, tx, check };
}
describe('native C5 fingerprints at the existing C9 evidence boundary', () => {
  it.each(['Opportunity', 'AgentTask'] as const)(
    'accepts real %s namespace through the unchanged 64-hex wire and current source reader',
    async (type) => {
      const f = fixture(type);
      expect(c9Evidence(f.ref)).toEqual(f.ref);
      expect(f.ref.identityHash).toMatch(/^[a-f0-9]{64}$/);
      await expect(f.check()).resolves.toBe(f.row);
      expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1);
    },
  );
  it('retains namespace identity instead of stripping its prefix', () => {
    expect(c9C5Fingerprint('identity_' + 'a'.repeat(64))).not.toBe(
      c9C5Fingerprint('evidence_' + 'a'.repeat(64)),
    );
    for (const value of [
      'a'.repeat(64),
      'foreign_' + 'a'.repeat(64),
      null,
      'identity_short',
    ])
      expect(() => c9C5Fingerprint(value)).toThrow('c9_source_qualification');
  });
  it.each(['Opportunity', 'AgentTask'] as const)(
    'rejects changed %s source fingerprints',
    async (type) => {
      const f = fixture(type);
      if (type === 'Opportunity')
        f.row.evidenceFingerprint = canonicalFingerprint('evidence', [
          'changed',
        ]);
      else f.row.taskFingerprint = canonicalFingerprint('task', ['changed']);
      await expect(f.check()).rejects.toThrow('c9_source_changed');
    },
  );
  it('does not relax the wire or tenant/authority checks', async () => {
    const f = fixture('Opportunity');
    await expect(
      f.check({ ...f.ref, identityHash: f.row.identityFingerprint }),
    ).rejects.toThrow('c9_string');
    await expect(
      f.check(f.ref, { ...principal, tenantId: 'foreign' }),
    ).rejects.toThrow('c9_source_qualification');
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
    f.tx.membership.findFirst.mockResolvedValue(null);
    await expect(f.check()).rejects.toThrow('c9_source_reader_authority');
  });
  it('rejects a changed Opportunity identity independently of unchanged evidence', async () => {
    const f = fixture('Opportunity');
    f.row.identityFingerprint = canonicalFingerprint('identity', ['changed']);
    await expect(f.check()).rejects.toThrow('c9_source_changed');
  });
  it('leaves a non-C5 source hash comparison unchanged', async () => {
    const f = fixture('Opportunity');
    f.row.inputHash = 'c'.repeat(64);
    const ref = {
      ...f.ref,
      sourceType: 'AiToolExecution',
      identityHash: c9Hash('source-identity/1', [
        'AiToolExecution',
        principal.tenantId,
        f.row.id,
      ]),
      inputHash: f.row.inputHash,
    };
    await expect(f.check(ref)).resolves.toBe(f.row);
    f.row.inputHash = 'd'.repeat(64);
    await expect(f.check(ref)).rejects.toThrow('c9_source_changed');
  });
});
