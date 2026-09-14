import { C8ResultRevision } from '@prisma/client';
import { MeasurementService } from '../measurement/measurement.service';
import { C8Store } from './c8.store';
import { C8Sources } from './c8.sources';
import { C8LabelCollector, c8CaseFor } from './c8.labels';

describe('limited-data prospective labels', () => {
  const now = new Date('2030-01-02T00:00:00Z');
  const capture = () =>
    ({
      id: 'capture-a',
      tenantId: 'tenant-a',
      kind: 'PREDICTION',
      state: 'UNAVAILABLE',
      eligibility: 'INSUFFICIENT_DATA',
      subjectKind: 'appointment',
      subjectId: 'appointment-a',
      snapshotHash: 'a'.repeat(64),
      t0: new Date('2030-01-01T00:00:00Z'),
      horizonEnd: new Date('2030-01-03T01:00:00Z'),
      expiresAt: new Date('2030-12-01T00:00:00Z'),
      scopeJson: {
        targetKey: 'appointment_no_show',
        branchIds: [],
        serviceScope: [],
      },
      evidenceRefsJson: [
        { owner: 'Client', id: 'client-a', tenantId: 'tenant-a' },
      ],
      inputSnapshotJson: {
        missingness: ['qualified_model_unavailable'],
        features: [
          { key: 'scheduled_start_at', value: '2030-01-03T00:00:00.000Z' },
          { key: 'scheduled_end_at', value: '2030-01-03T01:00:00.000Z' },
        ],
      },
    }) as unknown as C8ResultRevision;
  const tx = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'client-a' }) },
    appointment: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'appointment-a',
        mayaClientId: 'client-a',
        startAt: new Date('2030-01-03T00:00:00Z'),
        endAt: new Date('2030-01-03T01:00:00Z'),
        status: 'confirmed',
      }),
    },
  };
  const store = {
    tenant: () => 'tenant-a',
    transaction: (fn: (db: typeof tx) => unknown) => fn(tx),
  } as unknown as C8Store;
  const collector = new C8LabelCollector(
    store,
    {} as C8Sources,
    {} as MeasurementService,
  );
  it('unqualified model does not erase a valid prospective input-only capture', async () => {
    const p = capture();
    const before = JSON.stringify(p);
    expect(await collector.collect(p, now)).toMatchObject({
      labelState: 'IMMATURE',
      labelValue: null,
    });
    expect(JSON.stringify(p)).toBe(before);
  });
  it('unsupported source stays excluded, with no fabricated negative label', async () => {
    expect(
      await collector.collect(
        { ...capture(), eligibility: 'UNSUPPORTED' },
        now,
      ),
    ).toMatchObject({ labelState: 'EXCLUDED', labelValue: null });
  });
  it('cross-tenant capture cannot be evaluated', async () => {
    await expect(
      collector.collect({ ...capture(), tenantId: 'tenant-b' }, now),
    ).rejects.toThrow('c8_prospective_label_origin');
  });
  it('two Appointment captures for one Client remain one independent cluster', () => {
    const a = c8CaseFor(capture(), 'UNKNOWN', null, [], []);
    const b = c8CaseFor(
      { ...capture(), id: 'capture-b', subjectId: 'appointment-b' },
      'IMMATURE',
      null,
      [],
      [],
    );
    expect(a.caseKey).not.toBe(b.caseKey);
    expect(a.clusterRef).toBe(b.clusterRef);
    expect(
      c8CaseFor({ ...capture(), tenantId: 'other' }, 'UNKNOWN', null, [], [])
        .clusterRef,
    ).not.toBe(a.clusterRef);
  });
});
