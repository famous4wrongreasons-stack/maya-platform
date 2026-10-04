import {
  WidgetReleaseAccessService,
  type ReleaseIntentFacts,
} from './widget-release-access.service';
import {
  NO_HANDOFF_PROFILE,
  PROFILE_DIGEST,
  PROFILE_REGISTRY_DIGEST,
} from './widget-release-profile.contract';
import { RELEASE_STATE, releaseHash } from './widget-release.contract';
import { releaseProof } from '../../test/widgets-live/support/widget-release-proof';
import { profileCommand } from '../../test/widgets-live/support/widget-profile-proof';
import { releaseUnitDatabase } from '../../test/widgets-live/support/widget-release-unit-database';

const fixture = () => {
  const p = releaseProof(releaseUnitDatabase());
  const command = profileCommand(p, 'tenant');
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
    owner.bindMint('tenant', [{ template, record: r }], registry, tx as never);
  const admit = (
    r = facts,
    tenant = 'tenant',
    registry = PROFILE_REGISTRY_DIGEST,
  ) => owner.admits(tenant, r, registry, tx as never);
  return { p, row, tx, owner, facts, records, log, mint, admit };
};

describe('profile current admission and immutable emission binding', () => {
  it('binds a signed profile to the exact grant and facts in the caller transaction', async () => {
    const f = fixture();
    expect(await f.admit()).toBe(false);
    await f.mint();
    expect(f.log).toHaveBeenCalledWith(expect.any(Object), f.tx);
    expect(await f.admit()).toBe(true);
    expect(f.records[0].metadataJson).toMatchObject({
      scope: NO_HANDOFF_PROFILE,
      profileDigest: PROFILE_DIGEST,
    });
  });
  it.each([
    'HANDOFF',
    'unknown-template',
    'new-registry-row',
    'foreign-tenant',
  ])('refuses %s before writing a binding', async (kind) => {
    const f = fixture();
    await expect(
      f.mint(
        kind === 'HANDOFF'
          ? { ...f.facts, effect: 'HANDOFF' }
          : kind === 'foreign-tenant'
            ? { ...f.facts, tenantId: 'foreign' }
            : f.facts,
        kind === 'unknown-template' ? 'new.template@1' : 'navigate.schedule@1',
        kind === 'new-registry-row'
          ? releaseHash('new registry')
          : PROFILE_REGISTRY_DIGEST,
      ),
    ).rejects.toThrow();
    expect(f.log).not.toHaveBeenCalled();
  });
  it.each([
    'widgetKind',
    'capabilitySpace',
    'targetJson',
    'inputSchemaHash',
  ] as const)(
    'PROFILE-TUPLE refuses a known template with substituted %s at mint',
    async (field) => {
      const f = fixture();
      await expect(
        f.mint({ ...f.facts, [field]: 'substituted' }),
      ).rejects.toThrow();
      expect(f.log).not.toHaveBeenCalled();
    },
  );
  it.each([
    'tenantId',
    'widgetId',
    'intentTokenHash',
    'effect',
    'widgetKind',
    'bodyHash',
    'principalProofHash',
    'capabilityKey',
    'capabilitySpace',
    'sourceCapabilityKey',
    'sourceCapabilitySpace',
    'targetJson',
    'inputSchemaHash',
    'selectionDomain',
  ] as const)('refuses sealed fact substitution: %s', async (field) => {
    const f = fixture();
    await f.mint();
    expect(await f.admit({ ...f.facts, [field]: 'substitution' })).toBe(false);
  });
  it.each([
    'version',
    'certificateDigest',
    'profileDigest',
    'scope',
    'factsDigest',
    'template',
    'contract',
  ])('refuses changed durable binding: %s', async (field) => {
    const f = fixture();
    await f.mint();
    (f.records[0].metadataJson as Record<string, unknown>)[field] = 'changed';
    expect(await f.admit()).toBe(false);
  });
  it('refuses missing and ambiguous bindings without reacquiring authority from matching timestamps', async () => {
    const f = fixture();
    await f.mint();
    f.records.push(f.records[0]);
    expect(await f.admit()).toBe(false);
    f.records.length = 0;
    expect(await f.admit()).toBe(false);
  });
  it('refuses old-profile tokens after a new grant even at the same timestamp', async () => {
    const f = fixture();
    await f.mint();
    f.row.configJson.version = releaseHash('grant generation 2');
    expect(await f.admit()).toBe(false);
  });
  it.each([
    'revoked',
    'expiry',
    'cross-tenant',
    'registry',
    'forged',
    'candidate',
  ])('refuses current-state %s', async (kind) => {
    const f = fixture();
    await f.mint();
    if (kind === 'revoked') f.row.enabled = false;
    if (kind === 'expiry')
      f.tx.$queryRaw.mockResolvedValue([{ now: f.row.expiresAt }]);
    if (kind === 'forged')
      f.row.configJson.command.certificate.signature = 'A'.repeat(86);
    if (kind === 'candidate')
      f.p.config.set('WIDGET_RELEASE_CANDIDATE_SHA', 'b'.repeat(40));
    expect(
      await f.admit(
        f.facts,
        kind === 'cross-tenant' ? 'other' : 'tenant',
        kind === 'registry' ? releaseHash('registry') : PROFILE_REGISTRY_DIGEST,
      ),
    ).toBe(false);
  });
});
