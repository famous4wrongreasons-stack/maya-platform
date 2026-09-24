// P-MINT / Decision Sheet 08 Option A — one closed, versioned source of intent semantics.
//
// A projector selects a key and supplies only an already-declared capability reference and opaque
// owner handles. It cannot author an effect, target, input schema or confirmation policy because no
// such member exists on IntentProposal. Every authority-bearing member below is server-owned.

import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { IntentProposal } from '../../widget-contract/derived-shapes';
import type {
  EffectClass,
  InputSchema,
  IntentTarget,
  WidgetIntent,
} from '../../widget-contract/intent';
import type { WidgetKind } from '../../widget-contract/kinds';
import { KIND_PERMITTED_EFFECTS } from '../../widget-contract/tables';
import { carrierAdmits } from '../carriers/channel-profile';
import {
  isInheritedOwner,
  isOwnerClassKey,
} from '../../widget-contract/owner-classes';

export const INTENT_TEMPLATE_REGISTRY_VERSION = 1 as const;
export const A2_GAP_REF = 'MG-P01' as const;

type IntentRole = WidgetIntent['role'];

export type IntentTemplateKey =
  | 'none.passive@1'
  | 'navigate.account@1'
  | 'refine.measurement@1'
  | 'refine.measurement.period@1'
  | 'refine.journal.date@1'
  | 'refine.successor@1'
  | 'control.dismiss@1'
  | 'handoff.settings@1';

export type A2BlockedTemplateKey =
  'draft.blocked@1' | 'request-approval.blocked@1' | 'commit.blocked@1';

export class IntentTemplateRefusal extends Error {
  constructor(readonly code: string) {
    super(`intent template refused: ${code}`);
    this.name = 'IntentTemplateRefusal';
  }
}

export interface IntentTemplateRow {
  readonly key: IntentTemplateKey;
  readonly version: typeof INTENT_TEMPLATE_REGISTRY_VERSION;
  readonly effect: Extract<
    EffectClass,
    'NONE' | 'NAVIGATE' | 'REFINE' | 'CONTROL' | 'HANDOFF'
  >;
  readonly kinds: readonly WidgetKind[];
  readonly roles: readonly IntentRole[];
  readonly subject: CapabilityRef | null;
  readonly target: IntentTarget | null;
  readonly inputSchema: InputSchema | null;
  readonly selectionDomain: Readonly<Record<string, readonly string[]>>;
  readonly selectionDomainLabels: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
  readonly priority: number;
  readonly singleUse: boolean;
  readonly ttlSeconds: number;
  readonly label: string;
  readonly utteranceTemplate: string;
  readonly speechAliases: readonly string[];
  readonly allowedArgumentHandles: readonly string[];
  /** Only R3.9.4's server-owned successor minter may resolve the subject from stored provenance. */
  readonly sourceSubject: boolean;
}

const C9_MEASUREMENT: CapabilityRef = Object.freeze({
  space: 'C9',
  key: 'c7.measurement.read',
});
const C9_SETTINGS: CapabilityRef = Object.freeze({
  space: 'C9',
  key: 'settings.read',
});
const C9_JOURNAL: CapabilityRef = Object.freeze({
  space: 'C9',
  key: 'operations.journal.read',
});
const DISMISS: CapabilityRef = Object.freeze({
  space: 'CONTROL',
  key: 'control.widget.dismiss',
});

const PERIOD_SCHEMA: InputSchema = Object.freeze({
  fields: Object.freeze([
    Object.freeze({
      name: 'period',
      required: true,
      kind: 'enum' as const,
      domain_ref: 'measurement.period.v1',
      selection_min: 1,
      selection_max: 1,
    }),
  ]) as unknown as InputSchema['fields'],
  max_total_bytes: 64,
  free_input_justification: null,
});

const ALL_KINDS = Object.freeze(
  Object.keys(KIND_PERMITTED_EFFECTS) as WidgetKind[],
);
const CONTROL_KINDS = Object.freeze(
  ALL_KINDS.filter((kind) => KIND_PERMITTED_EFFECTS[kind].includes('CONTROL')),
);
const REFINE_KINDS = Object.freeze(
  ALL_KINDS.filter((kind) => KIND_PERMITTED_EFFECTS[kind].includes('REFINE')),
);

const row = (value: IntentTemplateRow): IntentTemplateRow =>
  Object.freeze({
    ...value,
    kinds: Object.freeze([...value.kinds]),
    roles: Object.freeze([...value.roles]),
    speechAliases: Object.freeze([...value.speechAliases]),
    allowedArgumentHandles: Object.freeze([...value.allowedArgumentHandles]),
    selectionDomain: Object.freeze(
      Object.fromEntries(
        Object.entries(value.selectionDomain).map(([field, ids]) => [
          field,
          Object.freeze([...ids]),
        ]),
      ),
    ),
    selectionDomainLabels: Object.freeze(
      Object.fromEntries(
        Object.entries(value.selectionDomainLabels).map(([field, labels]) => [
          field,
          Object.freeze({ ...labels }),
        ]),
      ),
    ),
  });

export const INTENT_TEMPLATE_REGISTRY: Readonly<
  Record<IntentTemplateKey, IntentTemplateRow>
> = Object.freeze({
  'none.passive@1': row({
    key: 'none.passive@1',
    version: 1,
    effect: 'NONE',
    kinds: ALL_KINDS,
    roles: ['secondary', 'more', 'remedy'],
    subject: null,
    target: null,
    inputSchema: null,
    selectionDomain: {},
    selectionDomainLabels: {},
    priority: 1,
    singleUse: false,
    ttlSeconds: 600,
    label: 'Close',
    utteranceTemplate: 'Close',
    speechAliases: ['close'],
    allowedArgumentHandles: [],
    sourceSubject: false,
  }),
  'navigate.account@1': row({
    key: 'navigate.account@1',
    version: 1,
    effect: 'NAVIGATE',
    kinds: ['LIMITATION', 'SOURCE_STATUS', 'SETTINGS_DRAFT'],
    roles: ['handoff', 'remedy'],
    subject: null,
    target: { class: 's', ref: { route: 'shell.account', param: null } },
    inputSchema: null,
    selectionDomain: {},
    selectionDomainLabels: {},
    priority: 1,
    singleUse: false,
    ttlSeconds: 600,
    label: 'Open account',
    utteranceTemplate: 'Open account',
    speechAliases: ['open account'],
    allowedArgumentHandles: [],
    sourceSubject: false,
  }),
  'refine.measurement@1': row({
    key: 'refine.measurement@1',
    version: 1,
    effect: 'REFINE',
    kinds: ['METRIC'],
    roles: ['primary', 'secondary', 'remedy'],
    subject: C9_MEASUREMENT,
    target: null,
    inputSchema: null,
    selectionDomain: {},
    selectionDomainLabels: {},
    priority: 1,
    singleUse: false,
    ttlSeconds: 600,
    label: 'Refresh measurement',
    utteranceTemplate: 'Refresh measurement',
    speechAliases: ['refresh measurement'],
    allowedArgumentHandles: [],
    sourceSubject: false,
  }),
  'refine.measurement.period@1': row({
    key: 'refine.measurement.period@1',
    version: 1,
    effect: 'REFINE',
    kinds: ['METRIC'],
    roles: ['primary'],
    subject: C9_MEASUREMENT,
    target: null,
    inputSchema: PERIOD_SCHEMA,
    selectionDomain: { period: ['current', 'previous'] },
    selectionDomainLabels: {
      period: { current: 'current', previous: 'previous' },
    },
    priority: 1,
    singleUse: false,
    ttlSeconds: 600,
    label: 'Change period',
    utteranceTemplate: 'Show {{selection}} period',
    speechAliases: ['change period'],
    allowedArgumentHandles: [],
    sourceSubject: false,
  }),
  'refine.journal.date@1': row({
    key: 'refine.journal.date@1',
    version: 1,
    effect: 'REFINE',
    kinds: ['SCHEDULE'],
    roles: ['primary', 'secondary', 'remedy'],
    subject: C9_JOURNAL,
    target: null,
    inputSchema: null,
    selectionDomain: {},
    selectionDomainLabels: {},
    priority: 1,
    singleUse: false,
    ttlSeconds: 600,
    label: 'Refresh journal',
    utteranceTemplate: 'Refresh journal',
    speechAliases: ['refresh journal'],
    allowedArgumentHandles: [],
    sourceSubject: false,
  }),
  'refine.successor@1': row({
    key: 'refine.successor@1',
    version: 1,
    effect: 'REFINE',
    kinds: REFINE_KINDS,
    roles: ['remedy'],
    subject: null,
    target: null,
    inputSchema: null,
    selectionDomain: {},
    selectionDomainLabels: {},
    priority: 1,
    singleUse: false,
    ttlSeconds: 600,
    label: 'Refresh',
    utteranceTemplate: 'Refresh',
    speechAliases: ['refresh'],
    allowedArgumentHandles: [],
    sourceSubject: true,
  }),
  'control.dismiss@1': row({
    key: 'control.dismiss@1',
    version: 1,
    effect: 'CONTROL',
    kinds: CONTROL_KINDS,
    roles: ['escape'],
    subject: DISMISS,
    target: null,
    inputSchema: null,
    selectionDomain: {},
    selectionDomainLabels: {},
    priority: 0,
    singleUse: true,
    ttlSeconds: 600,
    label: 'Dismiss',
    utteranceTemplate: 'Dismiss',
    speechAliases: ['dismiss', 'close'],
    allowedArgumentHandles: [],
    sourceSubject: false,
  }),
  'handoff.settings@1': row({
    key: 'handoff.settings@1',
    version: 1,
    effect: 'HANDOFF',
    kinds: ['SETTINGS_DRAFT'],
    roles: ['handoff'],
    subject: C9_SETTINGS,
    target: { class: 's', ref: { route: 'shell.account', param: null } },
    inputSchema: null,
    selectionDomain: {},
    selectionDomainLabels: {},
    priority: 1,
    singleUse: true,
    ttlSeconds: 600,
    label: 'Open settings',
    utteranceTemplate: 'Open settings',
    speechAliases: ['open settings'],
    allowedArgumentHandles: [],
    sourceSubject: false,
  }),
});

const A2_BLOCKED: Readonly<Record<A2BlockedTemplateKey, EffectClass>> =
  Object.freeze({
    'draft.blocked@1': 'DRAFT',
    'request-approval.blocked@1': 'REQUEST_APPROVAL',
    'commit.blocked@1': 'COMMIT',
  });

const sameRef = (
  actual: CapabilityRef | undefined,
  expected: CapabilityRef | null,
): boolean =>
  expected === null
    ? actual === undefined
    : actual?.space === expected.space && actual.key === expected.key;

const exactKeys = (value: object, allowed: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  return (
    actual.length === expected.length &&
    actual.every((v, i) => v === expected[i])
  );
};

export type ResolvedIntentTemplate =
  | { readonly kind: 'intent'; readonly row: IntentTemplateRow }
  | {
      readonly kind: 'a2_limitation';
      readonly requestedEffect: EffectClass;
      readonly capabilityGapRef: typeof A2_GAP_REF;
    };

/** Resolve and validate a proposal without reading any client-authored effect or target. */
export const resolveIntentTemplate = (args: {
  readonly proposal: IntentProposal;
  readonly widgetKind: WidgetKind;
  readonly deliveryChannel: string;
  /** Present only on the R3.9.4 server-owned successor path. */
  readonly successorSourceCapability?: CapabilityRef;
}): ResolvedIntentTemplate => {
  const { proposal, widgetKind, deliveryChannel } = args;
  if (
    !exactKeys(proposal, [
      'intent_template_key',
      ...(proposal.capability === undefined ? [] : ['capability']),
      ...(proposal.handoff_capability_ref === undefined
        ? []
        : ['handoff_capability_ref']),
      ...(proposal.argument_handles === undefined ? [] : ['argument_handles']),
      'role',
    ])
  )
    throw new IntentTemplateRefusal('proposal_not_closed');

  const blocked = (A2_BLOCKED as Record<string, EffectClass | undefined>)[
    proposal.intent_template_key
  ];
  if (blocked)
    return Object.freeze({
      kind: 'a2_limitation' as const,
      requestedEffect: blocked,
      capabilityGapRef: A2_GAP_REF,
    });

  const template = (
    INTENT_TEMPLATE_REGISTRY as Record<string, IntentTemplateRow | undefined>
  )[proposal.intent_template_key];
  if (!template)
    throw new IntentTemplateRefusal('unknown_or_version_incompatible');
  if (template.version !== INTENT_TEMPLATE_REGISTRY_VERSION)
    throw new IntentTemplateRefusal('version_incompatible');
  if (!template.kinds.includes(widgetKind))
    throw new IntentTemplateRefusal('kind_mismatch');
  if (!template.roles.includes(proposal.role))
    throw new IntentTemplateRefusal('role_mismatch');
  if (!KIND_PERMITTED_EFFECTS[widgetKind].includes(template.effect))
    throw new IntentTemplateRefusal('effect_not_permitted_on_kind');

  if (template.sourceSubject && args.successorSourceCapability === undefined)
    throw new IntentTemplateRefusal(
      'successor_template_requires_server_source',
    );
  if (!template.sourceSubject && args.successorSourceCapability !== undefined)
    throw new IntentTemplateRefusal('server_source_on_non_successor_template');

  const resolvedTemplate: IntentTemplateRow = template.sourceSubject
    ? Object.freeze({
        ...template,
        subject: args.successorSourceCapability ?? null,
      })
    : template;

  const expectedCapability =
    resolvedTemplate.effect === 'HANDOFF'
      ? undefined
      : (resolvedTemplate.subject ?? undefined);
  const expectedHandoff =
    resolvedTemplate.effect === 'HANDOFF' ? resolvedTemplate.subject : null;
  if (!sameRef(proposal.capability, expectedCapability ?? null))
    throw new IntentTemplateRefusal('capability_mismatch');
  if (!sameRef(proposal.handoff_capability_ref, expectedHandoff))
    throw new IntentTemplateRefusal('handoff_capability_mismatch');

  if (
    resolvedTemplate.subject?.space === 'C9' &&
    !isInheritedOwner(widgetKind) &&
    !isOwnerClassKey(widgetKind, resolvedTemplate.subject)
  )
    throw new IntentTemplateRefusal('subject_not_kind_owner');

  if (template.sourceSubject && resolvedTemplate.subject?.space !== 'C9')
    throw new IntentTemplateRefusal('successor_source_not_c9');

  const handles = proposal.argument_handles ?? {};
  if (!exactKeys(handles, template.allowedArgumentHandles))
    throw new IntentTemplateRefusal('undeclared_argument_handle');

  if (
    !carrierAdmits(
      deliveryChannel,
      template.effect,
      template.subject,
      template.priority,
    )
  )
    throw new IntentTemplateRefusal('carrier_inadmissible');

  return Object.freeze({ kind: 'intent' as const, row: resolvedTemplate });
};

/** Registry-load assertion: no actuating recipe may exist while A2.2/MG-P01 is present. */
export const assertIntentTemplateRegistry = (): void => {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(INTENT_TEMPLATE_REGISTRY)) {
    if (key !== value.key || !key.endsWith(`@${value.version}`))
      problems.push(`${key}: key/version mismatch`);
    if (['DRAFT', 'REQUEST_APPROVAL', 'COMMIT'].includes(value.effect))
      problems.push(
        `${key}: actuating recipe present while ${A2_GAP_REF} is open`,
      );
  }
  if (problems.length)
    throw new Error(
      `intent template registry invalid:\n  ${problems.join('\n  ')}`,
    );
};

assertIntentTemplateRegistry();
