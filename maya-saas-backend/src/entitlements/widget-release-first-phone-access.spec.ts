import {
  WidgetReleaseAccessService,
  type ReleaseIntentFacts,
} from './widget-release-access.service';
import {
  NO_PRICE_GOODS_PROFILE,
  NO_PRICE_GOODS_DIGEST,
  PROFILE_MANIFEST,
  PROFILE_REGISTRY_DIGEST,
  PRICE_GOODS_TEMPLATES,
} from './widget-release-profile.contract';
import { RELEASE_STATE, releaseHash } from './widget-release.contract';
import { singleOperatorProof } from '../../test/widgets-live/support/widget-single-operator-proof';
import { firstPhoneCertificate } from '../../test/widgets-live/support/widget-first-phone-proof';
import { releaseUnitDatabase } from '../../test/widgets-live/support/widget-release-unit-database';
const fixture = (narrow = true) => {
  const p = singleOperatorProof(releaseUnitDatabase(), 'tenant');
  const command = p.command();
  if (narrow) {
    command.certificate = firstPhoneCertificate(command.certificate);
    command.authorization = p.signOwner({
      ...command.authorization.payload,
      profileId: NO_PRICE_GOODS_PROFILE,
      profileDigest: NO_PRICE_GOODS_DIGEST,
      certificateDigest: releaseHash(command.certificate),
    });
  }
  const row = {
    enabled: true,
    expiresAt: new Date(command.authorization.payload.grantExpiresAt!),
    configJson: {
      contract: RELEASE_STATE,
      version: releaseHash('grant generation 1'),
      appliedAt: new Date().toISOString(),
      command,
    },
  };
  const records: { metadataJson: unknown }[] = [];
  const log = jest.fn().mockImplementation((args: { metadata: unknown }) => {
    records.push({ metadataJson: args.metadata });
    return Promise.resolve();
  });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ now: new Date() }]),
    tenantEntitlement: { findUnique: jest.fn().mockResolvedValue(row) },
    auditLog: { findMany: jest.fn().mockResolvedValue(records) },
  };
  const owner = new WidgetReleaseAccessService(p.policy, { log } as never);
  const facts: ReleaseIntentFacts = {
    tenantId: 'tenant',
    widgetId: 'widget',
    intentTokenHash: releaseHash('token'),
    bodyHash: releaseHash('body'),
    principalProofHash: releaseHash('principal'),
    effect: 'NAVIGATE',
    widgetKind: 'SCHEDULE',
    capabilitySpace: null,
    capabilityKey: null,
    sourceCapabilitySpace: null,
    sourceCapabilityKey: null,
    targetJson: { class: 's', ref: { route: 'shell.root', param: null } },
    inputSchemaHash: null,
    selectionDomain: '{}',
  };
  const mint = (
    r = facts,
    template = 'navigate.schedule@1',
    registry = PROFILE_REGISTRY_DIGEST,
  ) =>
    owner.bindMint(
      'tenant',
      [{ template, record: r }],
      registry,
      tx as never,
      r.widgetKind,
    );
  const admit = (
    r = facts,
    tenant = 'tenant',
    registry = PROFILE_REGISTRY_DIGEST,
  ) => owner.admits(tenant, r, registry, tx as never);
  return { p, row, tx, owner, facts, records, log, mint, admit };
};

describe('FIRST-PHONE immutable mint/resolve/intent release binding', () => {
  it('FP-TOKEN read-only schedule binds exact new scope and remains admissible', async () => {
    const f = fixture();
    await f.mint();
    expect(await f.admit()).toBe(true);
    expect(f.records[0].metadataJson).toMatchObject({
      scope: NO_PRICE_GOODS_PROFILE,
      profileDigest: NO_PRICE_GOODS_DIGEST,
    });
  });
  it.each(PRICE_GOODS_TEMPLATES)(
    'FP-TEMPLATE refuses canonical %s tuple previously admitted by old profile',
    async (template) => {
      const tuple =
        PROFILE_MANIFEST.combinations.tuples[
          template as keyof typeof PROFILE_MANIFEST.combinations.tuples
        ];
      const f = fixture(),
        old = fixture(false);
      const facts: ReleaseIntentFacts = {
        ...f.facts,
        widgetKind: 'APPROVAL',
        effect: tuple.effect,
        capabilitySpace: tuple.subject?.space ?? null,
        capabilityKey: tuple.subject?.key ?? null,
        targetJson: tuple.target,
        inputSchemaHash: tuple.inputSchemaHash,
      };
      await old.mint(facts, template);
      expect(await old.admit(facts)).toBe(true);
      await expect(f.mint(facts, template)).rejects.toThrow(
        'widget_release_profile_unavailable',
      );
      expect(f.log).not.toHaveBeenCalled();
      f.records.push(...old.records);
      expect(await f.admit(facts)).toBe(false);
    },
  );
  it.each(['catalog.service.price.update', 'inventory.goods.receipt.prepare'])(
    'FP-SUCCESSOR no generic refine substitute for %s',
    async (key) => {
      const f = fixture();
      await expect(
        f.mint(
          {
            ...f.facts,
            effect: 'REFINE',
            capabilitySpace: 'C9',
            capabilityKey: key,
            targetJson: null,
          },
          'refine.successor@1',
        ),
      ).rejects.toThrow();
      expect(f.log).not.toHaveBeenCalled();
    },
  );
  it('FP-OLD-TOKEN a valid old scope token cannot be relabelled to the new profile', async () => {
    const f = fixture(false);
    await f.mint();
    expect(await f.admit()).toBe(true);
    f.row.configJson.command.certificate = firstPhoneCertificate(
      f.row.configJson.command.certificate,
    );
    f.row.configJson.command.authorization = f.p.signOwner({
      ...f.row.configJson.command.authorization.payload,
      profileId: NO_PRICE_GOODS_PROFILE,
      profileDigest: NO_PRICE_GOODS_DIGEST,
      certificateDigest: releaseHash(f.row.configJson.command.certificate),
    });
    expect(await f.admit()).toBe(false);
  });
  it.each([
    'version',
    'scope',
    'profileDigest',
    'certificateDigest',
    'factsDigest',
  ])('FP-SEAL cannot substitute %s', async (key) => {
    const f = fixture();
    await f.mint();
    (f.records[0].metadataJson as Record<string, unknown>)[key] = 'foreign';
    expect(await f.admit()).toBe(false);
  });
  it.each([
    'revoke',
    'expiry',
    'allowlist',
    'candidate',
    'missing-audit',
    'tenant',
  ])('FP-CURRENT refuses %s', async (mode) => {
    const f = fixture();
    await f.mint();
    if (mode === 'revoke') f.row.enabled = false;
    if (mode === 'expiry')
      f.tx.$queryRaw.mockResolvedValue([{ now: f.row.expiresAt }]);
    if (mode === 'allowlist')
      f.p.config.set('WIDGET_RELEASE_PRODUCTION_TENANTS_JSON', '[]');
    if (mode === 'candidate')
      f.p.config.set('WIDGET_RELEASE_CANDIDATE_SHA', 'b'.repeat(40));
    if (mode === 'missing-audit') f.records.length = 0;
    expect(
      await f.admit(f.facts, mode === 'tenant' ? 'foreign' : 'tenant'),
    ).toBe(false);
  });
  it('FP-UNKNOWN cannot fall through to the full-contract path', async () => {
    const f = fixture();
    jest.spyOn(f.p.policy, 'view').mockReturnValue({
      scope: 'unknown',
      version: 'v',
      profileDigest: null,
      certificateDigest: 'd',
    } as never);
    await expect(f.mint()).rejects.toThrow();
    expect(await f.admit()).toBe(false);
    expect(f.log).not.toHaveBeenCalled();
  });
  it('FP-HANDOFF remains refused even with an otherwise valid new profile', async () => {
    const f = fixture();
    await expect(f.mint({ ...f.facts, effect: 'HANDOFF' })).rejects.toThrow();
    await expect(
      f.owner.bindMint(
        'tenant',
        [],
        PROFILE_REGISTRY_DIGEST,
        f.tx as never,
        'SETTINGS_DRAFT',
      ),
    ).rejects.toThrow();
  });
});
