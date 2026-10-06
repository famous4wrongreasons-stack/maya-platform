import { INTENT_TEMPLATE_INVENTORY } from '../widgets/emission/intent-template.inventory';
import { PROFILE_REGISTRY } from './widget-release-profile.registry';
import { C9_CAPABILITIES } from '../orchestration/c9.registry';
import { bookingTemplateAsIntentRow } from '../widgets/booking/booking-intent-template.registry';
import { parseInputSchema } from '../widgets/input-schema/parse-input-schema';
import { inputSchemaHash } from '../widgets/input-schema/input-schema-hash';
import { certificate, releaseHash } from './widget-release.contract';
import { releaseProof } from '../../test/widgets-live/support/widget-release-proof';
import {
  NO_HANDOFF_PROFILE,
  PROFILE_CERT,
  PROFILE_DIGEST,
  PROFILE_MANIFEST,
  PROFILE_REGISTRY_DIGEST,
  profileCertificate,
} from './widget-release-profile.contract';
import { INTENT_TEMPLATE_REGISTRY } from '../widgets/emission/intent-template.registry';
import { BOOKING_INTENT_TEMPLATE_REGISTRY } from '../widgets/booking/booking-intent-template.registry';

const fixture = () => {
  const p = releaseProof(
    'postgresql://proof@127.0.0.1:55729/maya_widget_gate_proof_profile',
  );
  const full = p.command('tenant').certificate.payload;
  const matrix = full.matrix.map((row) =>
    ['G6-6', 'G13-R8'].includes(row.id) ? { ...row, state: 'STOP' } : row,
  );
  return {
    ...full,
    contract: PROFILE_CERT,
    scope: NO_HANDOFF_PROFILE,
    certification: 'CERTIFIED_FOR_PROFILE',
    profileDigest: PROFILE_DIGEST,
    registryDigest: PROFILE_REGISTRY_DIGEST,
    globalAuditDigest: releaseHash(matrix),
    isolationProofDigest: releaseHash('synthetic isolation'),
    dependencyProofDigest: releaseHash('synthetic dependency map'),
    matrix,
  };
};

describe('fixed no-handoff certificate threshold', () => {
  it('retains exactly 165 global duties, with two STOP and 163 mandatory applicable duties', () => {
    const c = profileCertificate(fixture());
    expect(c.matrix).toHaveLength(165);
    expect(
      c.matrix
        .filter((row) => row.state === 'STOP')
        .map((row) => row.id)
        .sort(),
    ).toEqual(['G13-R8', 'G6-6']);
    expect(() => certificate(c)).toThrow();
  });
  it('pins the actual complete server registries; adding or changing a row needs review', () => {
    expect(releaseHash(INTENT_TEMPLATE_INVENTORY)).toBe(
      PROFILE_REGISTRY_DIGEST,
    );
    expect(
      releaseHash({
        ...INTENT_TEMPLATE_INVENTORY,
        general: {
          ...INTENT_TEMPLATE_REGISTRY,
          extra: INTENT_TEMPLATE_REGISTRY['navigate.account@1'],
        },
        booking: BOOKING_INTENT_TEMPLATE_REGISTRY,
      }),
    ).not.toBe(PROFILE_REGISTRY_DIGEST);
  });
  it('pins every allowed template/effect/kind/capability/target/closed-schema combination', () => {
    const tuples = Object.fromEntries(
      [
        ...Object.entries(INTENT_TEMPLATE_REGISTRY),
        ...Object.entries(BOOKING_INTENT_TEMPLATE_REGISTRY).map(
          ([key, row]) => [key, bookingTemplateAsIntentRow(row)] as const,
        ),
        ...Object.entries(INTENT_TEMPLATE_INVENTORY.servicePrice),
        ...Object.entries(INTENT_TEMPLATE_INVENTORY.schedule),
      ]
        .map(
          ([key, row]) =>
            [
              key,
              {
                ...row,
                kinds: row.kinds.filter((kind) => kind !== 'SETTINGS_DRAFT'),
              },
            ] as const,
        )
        .filter(([, row]) => row.kinds.length > 0)
        .filter(([, row]) => row.effect !== 'HANDOFF')
        .map(([key, row]) => {
          const schema =
            row.inputSchema === null ? null : parseInputSchema(row.inputSchema);
          if (schema !== null && !schema.ok)
            throw new Error('canonical schema invalid');
          return [
            key,
            {
              effect: row.effect,
              kinds: row.kinds,
              subject: row.subject,
              target: row.target,
              inputSchemaHash:
                schema === null ? null : inputSchemaHash(schema.schema),
              sourceSubject: row.sourceSubject,
            },
          ];
        }),
    );
    expect(PROFILE_REGISTRY.tuples).toEqual(tuples);
    expect(PROFILE_REGISTRY.successorCapabilities).toEqual(
      C9_CAPABILITIES.map((row) => row.capabilityKey).sort(),
    );
  });
  it('refuses the preserved previous pin and excludes the complete settings editor card', () => {
    expect(PROFILE_MANIFEST.unavailableKinds).toEqual(['SETTINGS_DRAFT']);
    expect(PROFILE_MANIFEST.templates).not.toContain('commit.schedule.day@1');
    expect(PROFILE_MANIFEST.templates).not.toContain('handoff.settings@1');
    expect(PROFILE_MANIFEST.templates).toEqual(
      expect.arrayContaining([
        'navigate.schedule@1',
        'commit.service-price.approve@1',
        'commit.service-price.reject@1',
        'navigate.service-price.detail@1',
      ]),
    );
    expect(
      Object.values(PROFILE_REGISTRY.tuples).every(
        (row) => !(row.kinds as string[]).includes('SETTINGS_DRAFT'),
      ),
    ).toBe(true);
    expect(() =>
      profileCertificate({
        ...fixture(),
        registryDigest:
          '21ffeb2426d9629e8e9110bbecdbdc7b45c0869e70f9395024e0fa728418a49a',
      }),
    ).toThrow();
    for (const family of [
      'general',
      'booking',
      'servicePrice',
      'schedule',
    ] as const) {
      const partial = { ...INTENT_TEMPLATE_INVENTORY };
      delete (partial as Partial<typeof partial>)[family];
      expect(releaseHash(partial)).not.toBe(PROFILE_REGISTRY_DIGEST);
    }
  });
  it('requires a new profile digest after the one owner-approved successor admission', () => {
    const previousProfileDigest = releaseHash({
      ...PROFILE_MANIFEST,
      combinations: {
        ...PROFILE_REGISTRY,
        successorCapabilities: PROFILE_REGISTRY.successorCapabilities.filter(
          (key) => key !== 'business.rules.read',
        ),
      },
    });
    expect(previousProfileDigest).not.toBe(PROFILE_DIGEST);
    expect(() =>
      profileCertificate({
        ...profileCertificate(fixture()),
        profileDigest: previousProfileDigest,
      }),
    ).toThrow();
  });
  it.each([
    '9.6',
    'G7-5',
    'G7-BOOK1',
    'G11-I9',
    'G13-I3',
    'G12-R1b',
    'G12-I11',
    'G13-R2',
  ])('does not exclude %s', (id) => {
    const c = fixture();
    expect(c.matrix.some((row) => row.id === id)).toBe(true);
    c.matrix = c.matrix.map((row) =>
      row.id === id ? { ...row, state: 'STOP' } : row,
    );
    c.globalAuditDigest = releaseHash(c.matrix);
    expect(() => profileCertificate(c)).toThrow();
  });
  it.each([
    'scope',
    'contract',
    'certification',
    'profileDigest',
    'registryDigest',
    'globalAuditDigest',
    'isolationProofDigest',
    'dependencyProofDigest',
  ])('refuses missing or forged %s', (field) => {
    const c = fixture();
    expect(() => profileCertificate({ ...c, [field]: '' })).toThrow();
    // A well-shaped foreign digest must not pass the pinned registry/profile binding.
    if (field === 'registryDigest' || field === 'profileDigest')
      expect(() =>
        profileCertificate({ ...c, [field]: releaseHash('foreign registry') }),
      ).toThrow();
    const missing = { ...c } as Record<string, unknown>;
    delete missing[field];
    expect(() => profileCertificate(missing)).toThrow();
  });
  it('refuses caller exclusions, duplicate/missing rows and STOP relabelling', () => {
    const c = fixture();
    expect(() => profileCertificate({ ...c, exclusions: ['9.6'] })).toThrow();
    for (const matrix of [
      c.matrix.slice(1),
      [...c.matrix.slice(1), c.matrix[1]],
      c.matrix.map((row) =>
        row.state === 'STOP' ? { ...row, state: 'L' } : row,
      ),
    ])
      expect(() =>
        profileCertificate({
          ...c,
          matrix,
          globalAuditDigest: releaseHash(matrix),
        }),
      ).toThrow();
  });
  it('PROFILE-AUDIT refuses a well-formed but substituted global audit digest', () => {
    const c = fixture();
    c.globalAuditDigest = releaseHash('different audit');
    expect(() => profileCertificate(c)).toThrow();
  });
  it('keeps all four OD-3 duties mandatory for U', () => {
    const c = fixture();
    c.matrix[0] = { ...c.matrix[0], state: 'U' };
    c.globalAuditDigest = releaseHash(c.matrix);
    expect(() => profileCertificate(c)).toThrow();
  });
});
