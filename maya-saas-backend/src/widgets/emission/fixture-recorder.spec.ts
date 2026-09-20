import { recordEmissionFixture } from './fixture-recorder';

describe('P-MINT — production emission fixture recorder', () => {
  it('10.10 records only the routing projection and never a raw token or body', () => {
    const fixture = recordEmissionFixture({
      trigger: 'T-2a',
      widgetKind: 'METRIC',
      records: [
        {
          intentTokenHash: 'a'.repeat(64),
          effect: 'REFINE',
          priority: 1,
          capabilitySpace: 'C9',
          capabilityKey: 'c7.measurement.read',
          issuedAt: new Date('2026-09-20T12:00:00.000Z'),
          erasedAt: null,
          utteranceTemplate: 'Refresh measurement',
          selectionDomainLabelsJson: null,
        },
      ],
    });
    expect(fixture).toEqual({
      trigger: 'T-2a',
      widgetKind: 'METRIC',
      records: [
        expect.objectContaining({
          intentTokenHash: 'a'.repeat(64),
          widgetKind: 'METRIC',
        }),
      ],
    });
    expect(JSON.stringify(fixture)).not.toContain('intentToken"');
    expect(JSON.stringify(fixture)).not.toContain('bodyJson');
  });

  it('refuses an empty corpus instead of making the 10.10 duty vacuous', () => {
    expect(() =>
      recordEmissionFixture({
        trigger: 'T-2a',
        widgetKind: 'METRIC',
        records: [],
      }),
    ).toThrow(/no tokened records/);
  });
});
