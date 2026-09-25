// Gate 6 as a function — the block of «Gate 6 in full» (C11:4736-4798), branch by branch.
//
// CLASS [U] and [RI]. Nothing here is evidence under §0.5: a function-level test cannot show that the
// gate RUNS. `test/widgets-live/gate6-authority.live-spec.ts` runs the same subjects through the real
// pipeline, and E1 runs them on records a production trigger minted. What this file is for is the
// cases the live path cannot reach at all this cycle:
//
//   - the AE branch. D-4 forbids minting any DRAFT, REQUEST_APPROVAL or COMMIT on the proof database
//     until P-DISCHARGE, and an AE subject is only ever one of those. So (a), (b), (c), the
//     held (d) and (e) are [RI] here and BLOCKED-DISCHARGE in the audit. Consent and identity
//     capabilities are excluded from the commit allowlist at registry startup by P-23's AL-2.
//   - the HELD LANE with a live principal present. `ctx.principal` is null on every request until the
//     integrator's IR-P-GW lands P-PRINCIPAL's principal step, so "pending U6-L3" is reachable only by
//     injecting a principal.
//
// Each refusal asserts its DETAIL, not only its code. Every branch of this gate answers
// `insufficient_authority`, so a test that asserted the code alone would be satisfied by the wrong
// fence firing — which is exactly how a deleted registry check survived the previous suite.

import { C9_CAPABILITIES } from '../../orchestration/c9.registry';
import type { C9Domain } from '../../widget-contract/ambient';
import type { GateContext, GateVerdict, PrincipalView } from '../gate.types';
import {
  AE_WIDGET_COMMIT_ALLOWLIST,
  MAYA_AI_TOOL_CATALOG_BY_NAME,
  actionCapabilityRegistry,
} from '../authority/contract-bindings';
import type { Gate6Owners } from '../owner-ports/gate6.owners.provider';
import { gate6, heldGate6Owners } from './gate6';
import {
  code,
  ctx,
  guardRegistries,
  rec,
} from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

const detail = (v: GateVerdict): string | null =>
  'detail' in v ? (v.detail ?? null) : null;

/** An owner set whose every member fails the test if slot 6 reaches it. */
const unreachableOwners = (): Gate6Owners =>
  Object.freeze({
    assertCanExecute: () => {
      throw new Error('Gate 6 reached an owner on a branch that resolves none');
    },
    grantsRequiredFeatures: () => {
      throw new Error('Gate 6 reached an owner on a branch that resolves none');
    },
    actionPolicy: () => {
      throw new Error('Gate 6 reached an owner on a branch that resolves none');
    },
  });

const admittingOwners = (): Gate6Owners =>
  Object.freeze({
    assertCanExecute: jest.fn().mockResolvedValue(undefined),
    grantsRequiredFeatures: jest.fn().mockResolvedValue(true),
    actionPolicy: jest.fn().mockReturnValue({
      allowedActorRoles: ['tenant_owner'],
      requiredFeatures: ['crm.integration'],
    }),
  });

/** A live principal, for the held lane's second arm only. No member of it is read by U6-L1. */
const PRINCIPAL: PrincipalView = Object.freeze({
  authority: Object.freeze({
    kind: 'USER',
    tenantId: 't1',
    userId: 'u1',
    membershipId: 'm1',
    clientId: null,
    channelLinkId: null,
    branchRefs: [],
    staffRef: null,
    proofHash: 'a'.repeat(64),
  }),
  role: 'tenant_owner',
  presentationMode: 'owner',
  verificationLevel: 'SESSION_VERIFIED',
  proofHash: 'a'.repeat(64),
});

const withPrincipal = (c: GateContext): GateContext => ({
  ...c,
  principal: PRINCIPAL,
});

const withRole = (c: GateContext, role: string): GateContext => ({
  ...withPrincipal(c),
  principal: { ...PRINCIPAL, role },
});

/** One of the nine non-catalogue C9 keys — the branch `WIDGET_CAPABILITY_POLICY` and `c9Capability` own. */
const NINE = 'owner_report.status';
/** One of the 47 — the branch `assertCanExecute` owns (C20). */
const CATALOGUE = 'catalog.services.read';
/** K7's allowlist, read from the binding rather than transcribed. */
const ALLOWLISTED = Object.keys(AE_WIDGET_COMMIT_ALLOWLIST);

const handoff = (key: string, cls: unknown, space = 'C9') =>
  rec({
    effect: 'HANDOFF',
    capabilitySpace: null,
    capabilityKey: null,
    handoffSpace: space,
    handoffKey: key,
    targetJson: cls === null ? null : { class: cls },
  });

describe('Gate 6 — the subject is bound once, and the dispatch is scoped by effect (G6-1)', () => {
  it('G6-5: a null subject proceeds, and no owner is reached', async () => {
    // NONE and non-reprojecting NAVIGATE classes name no authority subject. Contract V1.2 moves
    // detail/w to their sealed source capability, covered in the next test.
    for (const target of [null, { class: 's' }, { class: 'i' }]) {
      const v = await gate6(
        ctx(
          rec({
            effect: 'NAVIGATE',
            capabilitySpace: null,
            capabilityKey: null,
            targetJson: target,
          }),
        ),
        unreachableOwners(),
      );
      expect({ target, outcome: v.outcome }).toEqual({
        target,
        outcome: 'pass',
      });
    }
  });

  it('G6-V12: detail/w NAVIGATE rechecks the sealed source capability and fails closed without it', async () => {
    for (const klass of ['detail', 'w']) {
      const missing = await gate6(
        ctx(rec({ effect: 'NAVIGATE', targetJson: { class: klass } })),
        unreachableOwners(),
      );
      expect(detail(missing)).toBe(
        'NAVIGATE detail/w has no sealed source capability',
      );

      const owners = admittingOwners();
      const admitted = await gate6(
        withPrincipal(
          ctx(
            rec({
              effect: 'NAVIGATE',
              targetJson: { class: klass },
              sourceCapabilitySpace: 'C9',
              sourceCapabilityKey: CATALOGUE,
            }),
          ),
        ),
        owners,
      );
      expect(admitted).toEqual({ outcome: 'pass' });
      expect(owners.assertCanExecute).toHaveBeenCalled();
    }
  });

  it('G6-1: the dispatch reads the SUBJECT, not `record.capability` — a handoff with a null capability is dispatched on its destination', async () => {
    // `subjectCapability` falls through to `handoff_capability_ref` (§3.5). A gate that read
    // `record.capability` would see null here and pass everything.
    const v = await gate6(
      ctx(handoff('control.not.registered', 's', 'CONTROL')),
    );
    expect([code(v), detail(v)]).toEqual([
      'insufficient_authority',
      'HANDOFF destination is not registered in its space',
    ]);
  });

  it('G6-1c: a class-`c` NAVIGATE is dispatched on `target.ref` — the third arm of `subjectCapability`', async () => {
    const v = await gate6(
      ctx(
        rec({
          effect: 'NAVIGATE',
          capabilitySpace: null,
          capabilityKey: null,
          targetJson: {
            class: 'c',
            ref: { space: 'C9', key: 'c9.not.registered' },
          },
        }),
      ),
    );
    expect(detail(v)).toBe('unregistered C9 key');
  });

  it('G6-NOREC: no record is a refusal, not a pass', async () => {
    expect(detail(await gate6(ctx(rec(), { record: null })))).toBe('no record');
  });
});

describe('Gate 6 — HANDOFF resolves the DESTINATION fences only (G6-6, G6-7)', () => {
  it('G6-6-NONSENS: a registered, non-sensitive destination passes at every target class', async () => {
    for (const cls of ['s', 'w', 'i', 'detail']) {
      const v = await gate6(
        ctx(handoff('settings.update', cls)),
        unreachableOwners(),
      );
      expect({ cls, outcome: v.outcome }).toEqual({ cls, outcome: 'pass' });
    }
  });

  it('F48: a SENSITIVE destination admits a class-`s` target and nothing else (R3.5.1 at Gate 6)', async () => {
    // `owner_report.download` is `personal_data` under the signed policy, so SENSITIVE_DEST holds.
    expect(
      (await gate6(ctx(handoff('owner_report.download', 's')))).outcome,
    ).toBe('pass');
    for (const cls of ['w', 'i', 'detail', null, 7, ['s'], undefined]) {
      const v = await gate6(ctx(handoff('owner_report.download', cls)));
      expect({ cls, detail: detail(v) }).toEqual({
        cls,
        detail:
          'a sensitive HANDOFF destination admits a class-s target and nothing else',
      });
    }
  });

  it('G6-6-REG: an unregistered destination is refused in every space', async () => {
    for (const [space, key] of [
      ['C9', 'c9.not.registered'],
      ['AE', 'not.registered.v1'],
      ['CONTROL', 'control.not.registered'],
    ] as const) {
      const v = await gate6(ctx(handoff(key, 's', space)));
      expect({ space, detail: detail(v) }).toEqual({
        space,
        detail: 'HANDOFF destination is not registered in its space',
      });
    }
  });

  it('G6-7: a HANDOFF to a catalogue key, to an AE key and to a run-bearing C9 key never reaches an owner', async () => {
    // The three admission mechanisms the block forbids on this branch: `assertCanExecute`, the AE
    // commit allowlist and `c9Capability`'s domain/mode admission. The AE destination below has NO
    // allowlist row and the C9 one would fail `c9Capability` under `BUSINESS_INTELLIGENCE` — both
    // pass here, which is what "destination fences ONLY" means (C11:4790-4798).
    const owners = unreachableOwners();
    expect((await gate6(ctx(handoff(CATALOGUE, 's')), owners)).outcome).toBe(
      'pass',
    );
    expect(
      (await gate6(ctx(handoff('crm.visit.payment.v1', 's', 'AE')), owners))
        .outcome,
    ).toBe('pass');
    expect(
      (
        await gate6(
          ctx({
            ...handoff('a22.configuration', 's'),
            c9Domain: 'BUSINESS_INTELLIGENCE',
          }),
          owners,
        )
      ).outcome,
    ).toBe('pass');
  });

  it('G6-19 is total over effect classes: a TOOL-spaced destination is refused, not fenced as a destination', async () => {
    const v = await gate6(ctx(handoff(CATALOGUE, 's', 'TOOL')));
    expect(detail(v)).toBe('a TOOL ref may not be an intent subject');
  });
});

describe('Gate 6 — the C9 branch (C11:4760-4769)', () => {
  it('G6-19: a TOOL-spaced subject may never be an intent subject', async () => {
    const v = await gate6(
      ctx(rec({ capabilitySpace: 'TOOL', capabilityKey: CATALOGUE })),
    );
    expect(detail(v)).toBe('a TOOL ref may not be an intent subject');
  });

  it('S-REG-U: an unregistered key refuses at the REGISTRY check, not at the policy one', async () => {
    // The two are not redundant (a key can be registered and unclassified, or the reverse), so the
    // test names which branch fired. Asserting the code alone once let a deleted check through.
    const v = await gate6(ctx(rec({ capabilityKey: 'c9.not.registered' })));
    expect([code(v), detail(v)]).toEqual([
      'insufficient_authority',
      'unregistered C9 key',
    ]);
  });

  it('G6-15: the `WIDGET_CAPABILITY_POLICY` row is total over the nine, so its refusal cannot fire at runtime', async () => {
    // C11:4792-4795 says so explicitly, and this is the positive half of the evidence the audit
    // takes: totality at BUILD (`assertPolicyTotality`) plus a pass here, never a runtime refusal.
    const nine = C9_CAPABILITIES.filter(
      (c) => !MAYA_AI_TOOL_CATALOG_BY_NAME.has(c.capabilityKey),
    );
    expect(nine).toHaveLength(9);
    for (const cap of nine) {
      const v = await gate6(
        ctx(rec({ effect: 'REFINE', capabilityKey: cap.capabilityKey })),
        unreachableOwners(),
      );
      expect({ key: cap.capabilityKey, outcome: v.outcome }).toEqual({
        key: cap.capabilityKey,
        outcome: 'pass',
      });
    }
  });

  it('G6-17: on a run-less mint path `c9_domain` is null and the `c9Capability` half is NOT applied', async () => {
    const v = await gate6(
      ctx(rec({ effect: 'REFINE', capabilityKey: NINE, c9Domain: null })),
    );
    expect(v.outcome).toBe('pass');
  });

  it('G6-16: with `c9_domain` non-null the key must be admitted for THAT domain', async () => {
    // `owner_report.status` is registered for ADMIN and BUSINESS_INTELLIGENCE and for no other.
    for (const domain of ['ADMIN', 'BUSINESS_INTELLIGENCE'] as const) {
      const v = await gate6(
        ctx(rec({ effect: 'REFINE', capabilityKey: NINE, c9Domain: domain })),
      );
      expect({ domain, outcome: v.outcome }).toEqual({
        domain,
        outcome: 'pass',
      });
    }
    for (const domain of ['OCCUPANCY', 'CLIENT_LIFECYCLE'] as const) {
      const v = await gate6(
        ctx(rec({ effect: 'REFINE', capabilityKey: NINE, c9Domain: domain })),
      );
      expect({
        domain,
        code: code(v),
        raised: detail(v)?.startsWith('owner raised:'),
      }).toEqual({ domain, code: 'insufficient_authority', raised: true });
    }
  });

  it("G6-16: the `BUSINESS_INTELLIGENCE`/non-`READ` arm is `c9Capability`'s own, and is vacuous over today's registry", async () => {
    // The block says `c9Capability` "additionally refuses BUSINESS_INTELLIGENCE for any mode !==
    // 'READ'" (C11:4764-4768). It is NOT restated in the gate: a second copy of one rule is a second
    // thing that can disagree with the registry the rule lives in. This test records WHY the arm
    // cannot be observed through Gate 6 today — every non-catalogue key carrying BI is `READ` — so
    // the day one is added the list below stops being empty and the omission becomes visible.
    const biNonRead = C9_CAPABILITIES.filter(
      (c) =>
        !MAYA_AI_TOOL_CATALOG_BY_NAME.has(c.capabilityKey) &&
        c.domains.includes('BUSINESS_INTELLIGENCE') &&
        c.mode !== 'READ',
    );
    expect(biNonRead.map((c) => c.capabilityKey)).toEqual([]);
    // A non-`READ` key whose domains exclude BI is refused by the same call, on its domain arm.
    const v = await gate6(
      ctx(
        rec({
          effect: 'REFINE',
          capabilityKey: 'a22.configuration',
          c9Domain: 'BUSINESS_INTELLIGENCE',
        }),
      ),
    );
    expect(detail(v)).toMatch(/^owner raised: /);
  });

  it('P-F48-NONHANDOFF: a SENSITIVE subject outside a HANDOFF is Gate 6’s to pass (A1, C11:1836)', async () => {
    // The check this replaces refused it. R3.5.1 is evaluated at EP-MINT and at INV-8', and at Gate 6
    // "in its HANDOFF destination branch only" — so a `REFINE` on a `personal_data` key reaches the
    // C9 branch on its own merits.
    const v = await gate6(
      ctx(rec({ effect: 'REFINE', capabilityKey: 'owner_report.download' })),
    );
    expect(v.outcome).toBe('pass');
  });

  it('G6-14: C20 uses the live principal and the canonical owner admission', async () => {
    const base = ctx(rec({ effect: 'REFINE', capabilityKey: CATALOGUE }));
    // RI control: slot 3 would reject this on the live path before slot 6.
    expect([code(await gate6(base)), detail(await gate6(base))]).toEqual([
      'insufficient_authority',
      'C20 no live principal role',
    ]);
    const owners = admittingOwners();
    expect((await gate6(withPrincipal(base), owners)).outcome).toBe('pass');
    const assertCanExecute = owners.assertCanExecute as jest.Mock;
    expect(assertCanExecute).toHaveBeenCalledWith(
      't1',
      'u1',
      'tenant_owner',
      MAYA_AI_TOOL_CATALOG_BY_NAME.get(CATALOGUE),
    );
  });

  it('G6-14-ALL: every catalogue key passes only through its owner admission', async () => {
    const owners = admittingOwners();
    const assertCanExecute = owners.assertCanExecute as jest.Mock;
    for (const name of MAYA_AI_TOOL_CATALOG_BY_NAME.keys()) {
      const v = await gate6(
        withPrincipal(ctx(rec({ effect: 'REFINE', capabilityKey: name }))),
        owners,
      );
      expect({ name, outcome: v.outcome }).toEqual({ name, outcome: 'pass' });
    }
    expect(assertCanExecute).toHaveBeenCalledTimes(
      MAYA_AI_TOOL_CATALOG_BY_NAME.size,
    );
  });
});

describe('Gate 6 — the AE branch [RI] (no AE record may exist on the proof DB before P-DISCHARGE, D-4)', () => {
  const ae = (key: string) =>
    ctx(rec({ effect: 'COMMIT', capabilitySpace: 'AE', capabilityKey: key }));

  it('S-REG-AE: an unregistered AE key refuses at the registration check', async () => {
    expect(detail(await gate6(ae('not.registered.v1')))).toBe(
      'unregistered AE key',
    );
  });

  it('U6-L2: consent and identity keys reach ordinary condition (a); AL-2 owns their classification veto', async () => {
    for (const key of [
      'package5.wave3.record-client-consent.execute.v1',
      'package5.wave2.revoke-all-sessions.execute.v1',
    ])
      expect(detail(await gate6(ae(key)))).toBe(
        '(a) no AE_WIDGET_COMMIT_ALLOWLIST row',
      );
  });

  it('S-A: (a) a registered key with no `AE_WIDGET_COMMIT_ALLOWLIST` row refuses — MONEY included, which is why the `MONEY && !isAllowlisted` check could go', async () => {
    const v = await gate6(ae('crm.visit.payment.v1'));
    expect(detail(v)).toBe('(a) no AE_WIDGET_COMMIT_ALLOWLIST row');
  });

  it('S-B / S-C: (a) SHADOWS (b) and (c) over today’s registry, which is why their refusals need a neutraliser', () => {
    // Every registered key whose `policyDecision` is not ALLOW, and every one whose
    // `allowedSourceTypes` omits `authenticated_request`, is also outside the allowlist. So no input
    // reaches (b) or (c) and fails it: their refusals are defence in depth (§3.2 Gate 6 M17b/M18b on
    // neutralisers M17a′/M18a′, IR-G6-BATT). This test states the shadowing rather than leaving it to
    // be discovered when a mutant survives — and it goes red the day a key stops being shadowed.
    const shadowed = allowlistedRows().filter(
      (c) =>
        (c.policyDecision !== 'ALLOW' ||
          !c.allowedSourceTypes.includes('authenticated_request')) &&
        AE_WIDGET_COMMIT_ALLOWLIST[c.capability] !== undefined,
    );
    expect(shadowed.map((c) => c.capability)).toEqual([]);
  });

  it('S-B / S-C positive: each allowlisted key is carried PAST (a), (b) and (c) to the held (d)', async () => {
    // Reaching `(d)` is the statement that (a), (b) and (c) admitted, so this is their positive.
    expect(ALLOWLISTED).toHaveLength(10);
    for (const key of ALLOWLISTED) {
      const v = await gate6(ae(key));
      expect({ key, detail: detail(v) }).toEqual({
        key,
        detail: '(d) no live principal role',
      });
    }
  });

  it('N-AE-NOPRINCIPAL [RI]: (d) refuses without the in-T role and admits only after (e)', async () => {
    const base = ae(ALLOWLISTED[0]);
    expect(code(await gate6(base))).toBe('insufficient_authority');
    expect(detail(await gate6(base))).toBe('(d) no live principal role');
    expect((await gate6(withPrincipal(base), admittingOwners())).outcome).toBe(
      'pass',
    );
  });

  it('P-F78 / P-AE: an admitted role plus every canonical required feature passes', async () => {
    const owners = admittingOwners();
    const grants = owners.grantsRequiredFeatures as jest.Mock;
    const v = await gate6(withPrincipal(ae(ALLOWLISTED[0])), owners);
    expect(v.outcome).toBe('pass');
    expect(grants).toHaveBeenCalledWith('t1', ['crm.integration']);
  });

  it('N-D1: (d) refuses a role outside the canonical policy before asking entitlements', async () => {
    const owners = admittingOwners();
    const grants = owners.grantsRequiredFeatures as jest.Mock;
    const v = await gate6(
      withRole(ae(ALLOWLISTED[0]), 'platform_owner'),
      owners,
    );
    expect(detail(v)).toBe('(d) role platform_owner is not admitted');
    expect(grants).not.toHaveBeenCalled();
  });

  it('N-E: (e) refuses when the canonical feature conjunction is not granted', async () => {
    const owners: Gate6Owners = {
      assertCanExecute: jest.fn().mockResolvedValue(undefined),
      grantsRequiredFeatures: jest.fn().mockResolvedValue(false),
      actionPolicy: jest.fn().mockReturnValue({
        allowedActorRoles: ['tenant_owner'],
        requiredFeatures: ['crm.integration'],
      }),
    };
    const v = await gate6(withPrincipal(ae(ALLOWLISTED[0])), owners);
    expect(detail(v)).toBe('(e) required feature is absent');
  });
});

describe('Gate 6 — CONTROL passes with no execute-admission test (G6-18)', () => {
  it('G6-18: each registered CONTROL key passes, and no owner is reached', async () => {
    for (const key of [
      'control.widget.dismiss',
      'control.run.cancel',
      'control.delivery.resolve',
    ]) {
      const v = await gate6(
        ctx(
          rec({
            effect: 'CONTROL',
            capabilitySpace: 'CONTROL',
            capabilityKey: key,
          }),
        ),
        unreachableOwners(),
      );
      expect({ key, outcome: v.outcome }).toEqual({ key, outcome: 'pass' });
    }
  });

  it('G6-18-REG: a CONTROL key outside the closed space is refused', async () => {
    const v = await gate6(
      ctx(
        rec({
          effect: 'CONTROL',
          capabilitySpace: 'CONTROL',
          capabilityKey: 'control.not.registered',
        }),
      ),
    );
    expect(detail(v)).toBe('unregistered CONTROL key');
  });
});

describe('Gate 6 — a raise IS the refusal (G6-20, C11:4779-4781)', () => {
  it('G6-20: an owner that rejects becomes `insufficient_authority`, never a thrown request', async () => {
    const v = await gate6(
      ctx(
        rec({ effect: 'REFINE', capabilityKey: NINE, c9Domain: 'OCCUPANCY' }),
      ),
    );
    expect(code(v)).toBe('insufficient_authority');
    expect(detail(v)).toMatch(/^owner raised: /);
  });

  it('N-OWNER-THROW-E: a catalogue owner raise is the refusal', async () => {
    const owners: Gate6Owners = {
      assertCanExecute: jest
        .fn()
        .mockRejectedValue(new Error('canonical owner denied')),
      grantsRequiredFeatures: jest.fn().mockResolvedValue(true),
      actionPolicy: jest.fn().mockReturnValue({
        allowedActorRoles: ['tenant_owner'],
        requiredFeatures: ['crm.integration'],
      }),
    };
    const v = await gate6(
      withPrincipal(ctx(rec({ effect: 'REFINE', capabilityKey: CATALOGUE }))),
      owners,
    );
    expect(detail(v)).toBe('owner raised: canonical owner denied');
  });

  it('G6-20-UNBOUND: the unbound port raises rather than admitting, so an unwired build refuses', async () => {
    // `as unknown as`, not a cast to the bottom type: `gate-files.source.spec.ts` forbids that cast
    // anywhere in this directory, because it switches the compiler's own vocabulary check off — and
    // the fence is a TEXT scan, so naming the forbidden spelling here would trip it too.
    const anyTenant = 't1';
    const anyUser = 'u1';
    const anyRole = 'tenant_owner';
    const anyDefinition = {} as unknown as Parameters<
      Gate6Owners['assertCanExecute']
    >[3];
    await expect(
      heldGate6Owners.assertCanExecute(
        anyTenant,
        anyUser,
        anyRole,
        anyDefinition,
      ),
    ).rejects.toThrow(/GATE6_OWNERS is not bound/);
    await expect(
      heldGate6Owners.grantsRequiredFeatures('t1', []),
    ).rejects.toThrow(/GATE6_OWNERS is not bound/);
    expect(() => heldGate6Owners.actionPolicy('appointment.create')).toThrow(
      /GATE6_OWNERS is not bound/,
    );
  });
});

describe('R3.5.1 left slot 6’s front door (A1, C11:7399)', () => {
  it('A1-SUPERSEDED: the class-s rule fires in Gate 6’s HANDOFF branch', async () => {
    // `gateSensitiveDest` and `floor.ts#sensitiveDest` are DELETED (R6-1b, this merge commit). Their
    // body refused a `REFINE` on a `personal_data` key — exactly what A1 makes mintable — so the two
    // properties left to assert are that such a REFINE passes and that the class-`s` fence still
    // fires, in the HANDOFF branch, on the same key.
    expect(
      (
        await gate6(
          ctx(
            rec({ effect: 'REFINE', capabilityKey: 'owner_report.download' }),
          ),
        )
      ).outcome,
    ).toBe('pass');
    expect(
      detail(await gate6(ctx(handoff('owner_report.download', 'w')))),
    ).toBe(
      'a sensitive HANDOFF destination admits a class-s target and nothing else',
    );
  });
});

/** The AE registry as rows, through the binding the gate reads. */
function allowlistedRows(): readonly {
  capability: string;
  policyDecision: string;
  allowedSourceTypes: readonly string[];
}[] {
  const rows: {
    capability: string;
    policyDecision: string;
    allowedSourceTypes: readonly string[];
  }[] = [];
  for (const key of Object.keys(AE_WIDGET_COMMIT_ALLOWLIST)) {
    const cap = actionCapabilityRegistry.tryGet(key);
    if (cap)
      rows.push({
        capability: cap.capability,
        policyDecision: String(cap.policyDecision),
        allowedSourceTypes: cap.allowedSourceTypes,
      });
  }
  return rows;
}

/** Keeps the `C9Domain` import honest: every domain used above is one of the union's members. */
const DOMAINS: readonly C9Domain[] = [
  'ADMIN',
  'CLIENT_LIFECYCLE',
  'OCCUPANCY',
  'BUSINESS_INTELLIGENCE',
];
it('the four C9 domains this file names are the contract’s own union', () => {
  expect(new Set(DOMAINS).size).toBe(4);
});
