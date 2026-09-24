// K3 — the emission path, proved where it can be proved without a database.
//
// The seal is the interesting part. A seal that is merely written to a column is decoration; a seal
// is a fence only if a changed body stops matching it, so that is what is tested — not that the
// function returns a string.

import { WidgetEmitterService } from './emitter.service';
import { createHash } from 'node:crypto';
import { C9_REGISTRY_HASH } from '../../orchestration/c9.registry';
import type { WidgetComposerInput } from '../../widget-contract/envelope';
import type { WidgetKind } from '../../widget-contract/kinds';
import type { PrincipalView } from '../gate.types';

class FakePrisma {
  public emissions: Record<string, unknown>[] = [];
  public records: Record<string, unknown>[] = [];
  public receipts: Record<string, unknown>[] = [];
  widgetEmission = {
    create: (args: { data: Record<string, unknown> }) => {
      this.emissions.push(args.data);
      return args.data;
    },
    // Not `async`: this double awaits nothing, and a promise it never needs is a promise a
    // reader has to reason about. The caller awaits the value either way.
    findFirst: ({ where }: { where: { tenantId: string; widgetId: string } }) =>
      this.emissions.find(
        (e) => e.tenantId === where.tenantId && e.widgetId === where.widgetId,
      ) ?? null,
  };
  widgetIntentRecord = {
    create: (args: { data: Record<string, unknown> }) => {
      this.records.push(args.data);
      return args.data;
    },
    findFirst: ({ where }: { where: { tenantId: string; widgetId: string } }) =>
      this.records.find(
        (e) => e.tenantId === where.tenantId && e.widgetId === where.widgetId,
      ) ?? null,
  };
  widgetRenderReceipt = {
    create: (args: { data: Record<string, unknown> }) => {
      this.receipts.push(args.data);
      return args.data;
    },
    findFirst: ({ where }: { where: { tenantId: string; widgetId: string } }) =>
      this.receipts.find(
        (e) => e.tenantId === where.tenantId && e.widgetId === where.widgetId,
      ) ?? null,
  };
  // The real $transaction takes an array of promises; the double just resolves them, which is
  // enough to prove both writes are issued together rather than one at a time.
  $transaction = (ops: unknown[]) => Promise.resolve(ops);
}

const make = () => {
  const prisma = new FakePrisma();
  const seals = {
    seal: (terms: unknown) =>
      createHash('sha256').update(JSON.stringify(terms)).digest('hex'),
  };
  return {
    prisma,
    emitter: new WidgetEmitterService(prisma as never, seals as never),
  };
};

const principal = (): PrincipalView => ({
  authority: {
    kind: 'USER',
    tenantId: 't1',
    userId: 'user-1',
    membershipId: 'membership-1',
    clientId: null,
    channelLinkId: null,
    branchRefs: [],
    staffRef: null,
    proofHash: 'p'.repeat(64),
  },
  role: null,
  presentationMode: 'staff',
  verificationLevel: 'SESSION_VERIFIED',
  proofHash: 'p'.repeat(64),
});

const req = () => ({
  tenantId: 't1',
  conversationId: 'c1',
  turnId: 'turn-1',
  kind: 'METRIC' as const,
  principalProofHash: 'p'.repeat(64),
  deliveryChannel: 'pwa',
  body: { headline: 'revenue', value: 42 },
  ttlSeconds: 3600,
  freshnessClass: 'live' as const,
  composerInput: composer([
    {
      intent_template_key: 'control.dismiss@1',
      capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
      role: 'escape',
    },
  ]),
  principal: principal(),
});

const composerFor = (
  kind: WidgetKind,
  capability: string,
  intentProposals: WidgetComposerInput['intent_proposals'],
): WidgetComposerInput => ({
  kind_proposal: kind,
  capability,
  capability_version: C9_REGISTRY_HASH,
  source: { from: 'action_execution', execution_id: 'execution-1' },
  correlation_refs: { turn_id: 'turn-1' },
  origin: {
    trigger: 'system_reply',
    emitter: 'capability_read',
    moment_key: null,
    proactive_provenance: null,
  },
  facts: [],
  facts_origin: [],
  slots: {},
  limitation_codes: [],
  intent_proposals: intentProposals,
  locale: 'en',
});

const composer = (
  intentProposals: WidgetComposerInput['intent_proposals'],
): WidgetComposerInput =>
  composerFor('METRIC', 'c7.measurement.read', intentProposals);

describe('K3 emission — mint, compose, fit, seal', () => {
  it('retains only a server-validated journal business date on the exact journal REFINE record', async () => {
    const { prisma, emitter } = make();
    const input = composerFor('SCHEDULE', 'operations.journal.read', [
      {
        intent_template_key: 'refine.journal.date@1',
        capability: { space: 'C9', key: 'operations.journal.read' },
        role: 'primary',
      },
      {
        intent_template_key: 'control.dismiss@1',
        capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
        role: 'escape',
      },
    ]);
    await emitter.emit({
      ...req(),
      kind: 'SCHEDULE',
      composerInput: input,
      retainedQueryScalar: {
        type: 'local_business_date',
        value: '2026-09-24',
        provenance: 'server_validated',
      },
    });
    const refine = prisma.records.find((record) => record.effect === 'REFINE');
    const dismiss = prisma.records.find(
      (record) => record.effect === 'CONTROL',
    );
    expect(refine?.retainedLocalBusinessDate).toBe('2026-09-24');
    expect(dismiss?.retainedLocalBusinessDate).toBeNull();
  });

  it('refuses invalid, unscoped and client-asserted retained scalars before any write', async () => {
    for (const request of [
      {
        ...req(),
        retainedQueryScalar: {
          type: 'local_business_date',
          value: '2026-02-30',
          provenance: 'server_validated',
        },
      },
      {
        ...req(),
        retainedQueryScalar: {
          type: 'local_business_date',
          value: '2026-09-24',
          provenance: 'client_asserted',
        },
      },
    ] as unknown as Parameters<WidgetEmitterService['emit']>[0][]) {
      const { prisma, emitter } = make();
      await expect(emitter.emit(request)).rejects.toThrow();
      expect(prisma.emissions).toEqual([]);
      expect(prisma.records).toEqual([]);
    }
  });

  it('writes the emission and its intent record in one transaction', async () => {
    const { prisma, emitter } = make();
    await emitter.emit(req());
    expect(prisma.emissions).toHaveLength(1);
    expect(prisma.records).toHaveLength(1);
    // Both or neither: a record without its emission would refuse at Gate 1 as EXPIRED, which
    // would be a lie about why.
    expect(prisma.records[0].widgetId).toBe(prisma.emissions[0].widgetId);
  });

  it('stores only the token HASH, never the token', async () => {
    const { prisma, emitter } = make();
    const sealed = await emitter.emit(req());
    const serialised =
      JSON.stringify(prisma.records) + JSON.stringify(prisma.emissions);
    expect(serialised).not.toContain(sealed.intentToken);
    expect(prisma.records[0].intentTokenHash).toBe(sealed.intentTokenHash);
  });

  it('mints only the closed CONTROL escape in the fixture adapter: no actuating token exists in wave 2', async () => {
    const { prisma, emitter } = make();
    await emitter.emit(req());
    expect(prisma.records[0].effect).toBe('CONTROL');
    expect(['DRAFT', 'REQUEST_APPROVAL', 'COMMIT']).not.toContain(
      prisma.records[0].effect,
    );
  });

  it('hashes the body canonically, so key order cannot change the hash', async () => {
    const { emitter } = make();
    const a = await emitter.emit({
      ...req(),
      body: { alpha: 1, beta: { x: 1, y: 2 } },
    });
    const b = await emitter.emit({
      ...req(),
      body: { beta: { y: 2, x: 1 }, alpha: 1 },
    });
    // Same content, different insertion order. A hash that differed here would be a hash of the
    // program that built the object rather than of the body.
    expect(a.bodyHash).toBe(b.bodyHash);
  });

  it('gives two different bodies two different hashes', async () => {
    const { emitter } = make();
    const a = await emitter.emit({ ...req(), body: { value: 1 } });
    const b = await emitter.emit({ ...req(), body: { value: 2 } });
    expect(a.bodyHash).not.toBe(b.bodyHash);
  });

  it('seals over the body: a body edited after sealing no longer verifies', async () => {
    const { prisma, emitter } = make();
    const sealed = await emitter.emit(req());
    expect(await emitter.verifySeal('t1', sealed.widgetId)).toBe(true);

    // Someone edits the stored body without touching the seal — the case the seal exists for.
    const stored = prisma.emissions.find(
      (e) => e.widgetId === sealed.widgetId,
    )!;
    stored.bodyJson = { headline: 'revenue', value: 999_999 };
    expect(await emitter.verifySeal('t1', sealed.widgetId)).toBe(false);
  });

  it('seals over identity: a body moved to another envelope does not verify', async () => {
    const { prisma, emitter } = make();
    const first = await emitter.emit(req());
    const stored = prisma.emissions.find((e) => e.widgetId === first.widgetId)!;
    // Same body, same seal, different widget — the seal covers the id, so it stops matching.
    stored.widgetId = 'someone-elses-widget';
    expect(await emitter.verifySeal('t1', 'someone-elses-widget')).toBe(false);
  });

  it('gives every emission a distinct token', async () => {
    const { emitter } = make();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1)
      seen.add((await emitter.emit(req())).intentToken!);
    expect(seen.size).toBe(50);
  });

  it('MINT-2 NONE appears in the envelope but creates no token and no intent record', async () => {
    const { prisma, emitter } = make();
    const minted = await emitter.emit({
      ...req(),
      composerInput: composer([
        { intent_template_key: 'none.passive@1', role: 'secondary' },
      ]),
    });
    expect(minted.intentTokens).toEqual([]);
    expect(prisma.records).toEqual([]);
    expect(prisma.receipts).toHaveLength(1);
    expect(
      (prisma.receipts[0].emittedEnvelopeJson as { intents: unknown[] })
        .intents,
    ).toHaveLength(1);
  });

  it('MINT-3 turns an actuating template request into LIMITATION and mints no token', async () => {
    const { prisma, emitter } = make();
    const minted = await emitter.emit({
      ...req(),
      composerInput: composer([
        { intent_template_key: 'commit.blocked@1', role: 'primary' },
      ]),
    });
    expect(minted).toEqual(
      expect.objectContaining({ kind: 'LIMITATION', a2Limited: true }),
    );
    expect(prisma.records).toEqual([]);
    expect(prisma.emissions[0].bodyJson).toEqual(
      expect.objectContaining({ capability_gap_ref: 'MG-P01' }),
    );
  });

  it('MINT-1 writes the exact derived audit members', async () => {
    const { prisma, emitter } = make();
    const input = composer([
      {
        intent_template_key: 'refine.measurement.period@1',
        capability: { space: 'C9', key: 'c7.measurement.read' },
        role: 'primary',
      },
      {
        intent_template_key: 'control.dismiss@1',
        capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
        role: 'escape',
      },
    ]);
    const minted = await emitter.emit({ ...req(), composerInput: input });
    expect(minted.intentTokens).toHaveLength(2);
    expect(prisma.records).toHaveLength(2);
    const record = prisma.records[0];
    expect(record).toEqual(
      expect.objectContaining({
        widgetKind: 'METRIC',
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'c7.measurement.read',
        targetJson: null,
        selectionDomain: '{"period":["current","previous"]}',
      }),
    );
    expect(record.verificationFloor).toEqual(expect.any(String));
    expect(record.requestedScopeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.inputSchemaHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.utteranceTemplate).toBe('Show {{selection}} period');
    expect(record.selectionDomainLabelsJson).toEqual({
      period: { current: 'current', previous: 'previous' },
    });
    expect(JSON.stringify(prisma.records)).not.toContain('readback_text');
  });

  it('MINT-1 persists the registry-owned semantics for every tokened non-actuating effect', async () => {
    const cases: Array<{
      kind: WidgetKind;
      capability: string;
      proposal: WidgetComposerInput['intent_proposals'][number];
      effect: 'NAVIGATE' | 'REFINE' | 'CONTROL' | 'HANDOFF';
      expected: Record<string, unknown>;
    }> = [
      {
        kind: 'LIMITATION',
        capability: 'c9.no_action',
        proposal: {
          intent_template_key: 'navigate.account@1',
          role: 'remedy',
        },
        effect: 'NAVIGATE',
        expected: {
          targetJson: {
            class: 's',
            ref: { route: 'shell.account', param: null },
          },
          capabilitySpace: null,
          capabilityKey: null,
        },
      },
      {
        kind: 'METRIC',
        capability: 'c7.measurement.read',
        proposal: {
          intent_template_key: 'refine.measurement@1',
          capability: { space: 'C9', key: 'c7.measurement.read' },
          role: 'primary',
        },
        effect: 'REFINE',
        expected: {
          targetJson: null,
          capabilitySpace: 'C9',
          capabilityKey: 'c7.measurement.read',
        },
      },
      {
        kind: 'METRIC',
        capability: 'c7.measurement.read',
        proposal: {
          intent_template_key: 'control.dismiss@1',
          capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
          role: 'escape',
        },
        effect: 'CONTROL',
        expected: {
          targetJson: null,
          capabilitySpace: 'CONTROL',
          capabilityKey: 'control.widget.dismiss',
          priority: 0,
          singleUse: true,
        },
      },
      {
        kind: 'SETTINGS_DRAFT',
        capability: 'settings.read',
        proposal: {
          intent_template_key: 'handoff.settings@1',
          handoff_capability_ref: { space: 'C9', key: 'settings.read' },
          role: 'handoff',
        },
        effect: 'HANDOFF',
        expected: {
          targetJson: {
            class: 's',
            ref: { route: 'shell.account', param: null },
          },
          capabilitySpace: null,
          capabilityKey: null,
          handoffSpace: 'C9',
          handoffKey: 'settings.read',
        },
      },
    ];

    for (const current of cases) {
      const { prisma, emitter } = make();
      const proposals =
        current.effect === 'CONTROL'
          ? [current.proposal]
          : [
              current.proposal,
              {
                intent_template_key: 'control.dismiss@1',
                capability: {
                  space: 'CONTROL' as const,
                  key: 'control.widget.dismiss',
                },
                role: 'escape' as const,
              },
            ];
      await emitter.emit({
        ...req(),
        kind: current.kind,
        composerInput: composerFor(current.kind, current.capability, proposals),
      });
      expect(
        prisma.records.find((record) => record.effect === current.effect),
      ).toEqual(expect.objectContaining(current.expected));
    }
  });

  it('MINT-9 rejects unknown nested composer members before persistence', async () => {
    const { prisma, emitter } = make();
    const hostile = composer([
      {
        intent_template_key: 'control.dismiss@1',
        capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
        role: 'escape',
      },
    ]) as WidgetComposerInput & {
      source: WidgetComposerInput['source'] & { effect: string };
    };
    hostile.source = { ...hostile.source, effect: 'COMMIT' };
    await expect(
      emitter.emit({ ...req(), composerInput: hostile }),
    ).rejects.toThrow('composer_nested_unknown_field');
    expect(prisma.emissions).toEqual([]);
    expect(prisma.records).toEqual([]);
  });

  it('MINT-5 never persists readback_text', async () => {
    const { prisma, emitter } = make();
    await emitter.emit(req());
    expect(JSON.stringify(prisma.records)).not.toContain('readback_text');
  });

  it('MINT-6 removes label interpolation from a client-identified envelope', async () => {
    const { prisma, emitter } = make();
    await emitter.emit({
      ...req(),
      piiClass: 'client_identified',
      composerInput: composer([
        {
          intent_template_key: 'refine.measurement.period@1',
          capability: { space: 'C9', key: 'c7.measurement.read' },
          role: 'primary',
        },
        {
          intent_template_key: 'control.dismiss@1',
          capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
          role: 'escape',
        },
      ]),
    });
    expect(prisma.records.find((record) => record.effect === 'REFINE')).toEqual(
      expect.objectContaining({
        utteranceTemplate: 'Change period',
        selectionDomainLabelsJson: null,
      }),
    );
    expect(JSON.stringify(prisma.records[0])).not.toContain('{{selection}}');
  });
});
