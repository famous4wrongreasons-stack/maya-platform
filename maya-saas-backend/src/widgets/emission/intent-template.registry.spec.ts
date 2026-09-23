import type { IntentProposal } from '../../widget-contract/derived-shapes';
import {
  A2_GAP_REF,
  INTENT_TEMPLATE_REGISTRY,
  IntentTemplateRefusal,
  assertIntentTemplateRegistry,
  resolveIntentTemplate,
} from './intent-template.registry';

const resolve = (
  proposal: IntentProposal,
  widgetKind: Parameters<
    typeof resolveIntentTemplate
  >[0]['widgetKind'] = 'METRIC',
  deliveryChannel = 'pwa',
) => resolveIntentTemplate({ proposal, widgetKind, deliveryChannel });

const dismiss: IntentProposal = {
  intent_template_key: 'control.dismiss@1',
  capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
  role: 'escape',
};

describe('P-MINT — closed intent template registry', () => {
  it('MINT-1 derives each non-actuating effect and target from a closed server row', () => {
    const cases: Array<
      [IntentProposal, Parameters<typeof resolve>[1], string, string | null]
    > = [
      [
        { intent_template_key: 'none.passive@1', role: 'secondary' },
        'METRIC',
        'NONE',
        null,
      ],
      [
        { intent_template_key: 'navigate.account@1', role: 'handoff' },
        'LIMITATION',
        'NAVIGATE',
        's',
      ],
      [
        {
          intent_template_key: 'refine.measurement@1',
          capability: { space: 'C9', key: 'c7.measurement.read' },
          role: 'primary',
        },
        'METRIC',
        'REFINE',
        null,
      ],
      [dismiss, 'METRIC', 'CONTROL', null],
      [
        {
          intent_template_key: 'handoff.settings@1',
          handoff_capability_ref: { space: 'C9', key: 'settings.read' },
          role: 'handoff',
        },
        'SETTINGS_DRAFT',
        'HANDOFF',
        's',
      ],
    ];
    for (const [proposal, kind, effect, targetClass] of cases) {
      const result = resolve(proposal, kind);
      expect(result.kind).toBe('intent');
      if (result.kind !== 'intent') throw new Error('unreachable');
      expect([result.row.effect, result.row.target?.class ?? null]).toEqual([
        effect,
        targetClass,
      ]);
    }
    expect(INTENT_TEMPLATE_REGISTRY['navigate.account@1'].target).toEqual({
      class: 's',
      ref: { route: 'shell.account', param: null },
    });
    expect(INTENT_TEMPLATE_REGISTRY['control.dismiss@1']).toEqual(
      expect.objectContaining({
        priority: 0,
        singleUse: true,
        ttlSeconds: 600,
        label: 'Dismiss',
        utteranceTemplate: 'Dismiss',
      }),
    );
  });

  it('MINT-3 keeps DRAFT, REQUEST_APPROVAL and COMMIT behind A2.2 as limitation outcomes', () => {
    for (const key of [
      'draft.blocked@1',
      'request-approval.blocked@1',
      'commit.blocked@1',
    ] as const) {
      const result = resolve({ intent_template_key: key, role: 'primary' });
      expect(result).toEqual(
        expect.objectContaining({
          kind: 'a2_limitation',
          capabilityGapRef: A2_GAP_REF,
        }),
      );
    }
    expect(() => assertIntentTemplateRegistry()).not.toThrow();
    expect(
      Object.values(INTENT_TEMPLATE_REGISTRY).filter((r) =>
        ['DRAFT', 'REQUEST_APPROVAL', 'COMMIT'].includes(r.effect),
      ),
    ).toEqual([]);
  });

  it('MINT-9 refuses unknown and version-incompatible keys before any semantic is available', () => {
    for (const key of ['refine.measurement@2', 'made.up@1'])
      expect(() =>
        resolve({ intent_template_key: key, role: 'primary' }),
      ).toThrow(new IntentTemplateRefusal('unknown_or_version_incompatible'));
  });

  it('MINT-9 refuses a proposal attempting to author effect or target', () => {
    const hostile = {
      ...dismiss,
      effect: 'COMMIT',
      target: { class: 's', ref: { route: 'shell.pay', param: 'x' } },
    } as unknown as IntentProposal;
    expect(() => resolve(hostile)).toThrow(
      new IntentTemplateRefusal('proposal_not_closed'),
    );
  });

  it('MINT-2c emits no NAVIGATE(c) subject from the closed registry', () => {
    expect(
      Object.values(INTENT_TEMPLATE_REGISTRY).filter(
        (row) => row.effect === 'NAVIGATE' && row.target?.class === 'c',
      ),
    ).toEqual([]);
  });

  it('MINT-7 refuses projector-authored confirmation and production relations', () => {
    for (const relation of [
      { confirmation_of: { kind: 'record', ref: 'r1' } },
      { produced_by: 'token-hash' },
      { approval_of_intent_ref: 'i1' },
      { confirmation: { readback_text: 'yes' } },
    ]) {
      expect(() => resolve({ ...dismiss, ...relation })).toThrow(
        new IntentTemplateRefusal('proposal_not_closed'),
      );
    }
  });

  it('MINT-9 refuses role, kind, capability, handle and carrier mismatches', () => {
    const cases: Array<() => unknown> = [
      () => resolve({ ...dismiss, role: 'primary' }),
      () =>
        resolve(
          { intent_template_key: 'navigate.account@1', role: 'handoff' },
          'METRIC',
        ),
      () =>
        resolve({
          ...dismiss,
          capability: { space: 'CONTROL', key: 'control.run.cancel' },
        }),
      () => resolve({ ...dismiss, argument_handles: { amount: 'h_x' } }),
      () =>
        resolve(
          {
            intent_template_key: 'refine.measurement@1',
            capability: { space: 'C9', key: 'c7.measurement.read' },
            role: 'primary',
          },
          'METRIC',
          'email',
        ),
    ];
    for (const attempt of cases) expect(attempt).toThrow(IntentTemplateRefusal);
  });

  it('MINT-11 permits one closed cardinality-one slotted template and no free field', () => {
    const result = resolve({
      intent_template_key: 'refine.measurement.period@1',
      capability: { space: 'C9', key: 'c7.measurement.read' },
      role: 'primary',
    });
    if (result.kind !== 'intent') throw new Error('expected intent');
    expect(result.row.inputSchema).toEqual({
      fields: [
        expect.objectContaining({
          name: 'period',
          kind: 'enum',
          selection_min: 1,
          selection_max: 1,
        }),
      ],
      max_total_bytes: 64,
      free_input_justification: null,
    });
  });

  it('G15-7/G15-11 keeps the successor template server-only and derives its subject from an owner-class C9 source', () => {
    const proposal: IntentProposal = {
      intent_template_key: 'refine.successor@1',
      capability: { space: 'C9', key: 'c7.measurement.read' },
      role: 'remedy',
    };
    expect(() => resolve(proposal, 'METRIC')).toThrow(
      new IntentTemplateRefusal('successor_template_requires_server_source'),
    );
    const resolved = resolveIntentTemplate({
      proposal,
      widgetKind: 'METRIC',
      deliveryChannel: 'pwa',
      successorSourceCapability: {
        space: 'C9',
        key: 'c7.measurement.read',
      },
    });
    expect(resolved).toEqual(
      expect.objectContaining({
        kind: 'intent',
        row: expect.objectContaining({
          effect: 'REFINE',
          roles: ['remedy'],
          subject: { space: 'C9', key: 'c7.measurement.read' },
        }),
      }),
    );
    expect(() =>
      resolveIntentTemplate({
        proposal: {
          ...proposal,
          capability: { space: 'C9', key: 'catalog.services.read' },
        },
        widgetKind: 'METRIC',
        deliveryChannel: 'pwa',
        successorSourceCapability: {
          space: 'C9',
          key: 'catalog.services.read',
        },
      }),
    ).toThrow(new IntentTemplateRefusal('subject_not_kind_owner'));
  });
});
