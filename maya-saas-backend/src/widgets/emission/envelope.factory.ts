import type {
  Completeness,
  WidgetComposerInput,
  WidgetEnvelope,
} from '../../widget-contract/envelope';
import type { WidgetIntent } from '../../widget-contract/intent';
import type { WidgetKind } from '../../widget-contract/kinds';
import type { RenderTier } from '../../widget-contract/lifecycle';
import { stableActionJson } from '../authority/contract-bindings';
import type { PrincipalView } from '../gate.types';
import { sha256Hex } from '../token.util';
import type { FitResult } from '../carriers/fitter';
import type { F88NestedShape } from '../validation/f88-walk';

const CELL_PATHS_BY_KIND: Readonly<
  Record<
    'METRIC' | 'SCHEDULE' | 'SOURCE_STATUS' | 'PROGRESS' | 'LIMITATION',
    readonly string[]
  >
> = Object.freeze({
  METRIC: Object.freeze(['body.metrics']),
  SCHEDULE: Object.freeze([
    'body.lanes[].label',
    'body.entries[].title',
    'body.entries[].subtitle',
    'body.entries[].state',
    'body.gaps[].recoverable',
  ]),
  SOURCE_STATUS: Object.freeze([
    'body.sources[].label',
    'body.sources[].state',
    'body.sources[].as_of',
    'body.overall',
  ]),
  PROGRESS: Object.freeze(['body.headline', 'body.steps[].state']),
  LIMITATION: Object.freeze([]),
});

/**
 * F88.2 permissions are structural: this declares where the contract's nested declared shapes
 * begin. It does not add a forbidden-key allowlist or another exemption. The set is total over the
 * currently emittable K3 kinds; widening `emittable` must add that kind's certified body paths.
 */
export const f88NestedShapesForEnvelope = (
  kind: WidgetKind,
): readonly F88NestedShape[] => {
  const cellPaths =
    kind in CELL_PATHS_BY_KIND
      ? CELL_PATHS_BY_KIND[kind as keyof typeof CELL_PATHS_BY_KIND]
      : [];
  return Object.freeze([
    { at: 'lifecycle', shape: 'Lifecycle' },
    { at: 'render', shape: 'RenderReceipt' },
    { at: 'intents', shape: 'WidgetIntent' },
    { at: 'enabled', shape: 'Cell' },
    // A Measure extends Cell; its optional comparison baseline is another declared Measure.
    { at: 'comparison.baseline', shape: 'Cell' },
    ...cellPaths.map((at) => ({ at, shape: 'Cell' })),
  ]);
};

const fallbackCompleteness = (
  requestedScopeHash: string,
): Completeness => ({
  status: 'UNAVAILABLE',
  requestedScopeHash,
  returnedCount: 0,
  totalCount: null,
  hasMore: false,
  cursorRef: null,
  truncated: false,
  reasonCodes: ['NOT_COLLECTED'],
});

const sourceKind = (source: WidgetComposerInput['source']) => {
  switch (source.from) {
    case 'agent_result':
      return 'agent_result' as const;
    case 'orchestrator_state':
      return 'orchestrator_state' as const;
    case 'action_execution':
    case 'action_intent':
      return 'action_execution' as const;
    default:
      return 'capability_read' as const;
  }
};

const roleHint = (kind: WidgetKind) => {
  switch (kind) {
    case 'SCHEDULE':
      return 'grid' as const;
    case 'SERVICE_SELECTOR':
    case 'STAFF_SELECTOR':
    case 'TIME_SLOT_SELECTOR':
    case 'CHOICE':
      return 'listbox' as const;
    case 'CLIENT_LIST':
      return 'table' as const;
    case 'PROGRESS':
      return 'progressbar' as const;
    case 'FORM':
    case 'SETTINGS_DRAFT':
      return 'form' as const;
    case 'MEDIA_PREVIEW':
      return 'img' as const;
    case 'PAYMENT_HANDOFF':
      return 'link' as const;
    case 'REPORT':
    case 'ARTIFACT':
      return 'document' as const;
    case 'SOURCE_STATUS':
    case 'LIMITATION':
      return 'status' as const;
    default:
      return 'group' as const;
  }
};

const textEquivalent = (
  kind: WidgetKind,
  body: Readonly<Record<string, unknown>>,
  fitted: string,
) => {
  if (kind === 'SCHEDULE' && Array.isArray(body.lanes)) {
    const lanes = body.lanes as Array<Record<string, unknown>>;
    const entries = Array.isArray(body.entries)
      ? (body.entries as Array<Record<string, unknown>>)
      : [];
    const itemized = lanes.map((lane) => {
      const laneId = lane.lane_id;
      const label = cellLabel(lane.label) ?? 'Расписание';
      const items = entries
        .filter((entry) => entry.lane_id === laneId)
        .map((entry) => cellLabel(entry.title) ?? 'Занято');
      return `${label}: ${items.length === 0 ? 'нет записей' : items.join(', ')}`;
    });
    const headline = `Расписание · ${lanes.length} ${lanes.length === 1 ? 'мастер' : 'мастера'}`;
    return {
      headline,
      body: itemized.join('. '),
      itemized,
      completeness_sentence: null,
      unknowns_sentence: null,
    };
  }
  const plain = fitted.length > 1_600 ? `${fitted.slice(0, 1_599)}…` : fitted;
  return {
    headline: kind,
    body: plain,
    itemized: [],
    completeness_sentence: null,
    unknowns_sentence: null,
  };
};

const cellLabel = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  return typeof record.label === 'string' ? record.label : null;
};

const interactiveRefs = (
  kind: WidgetKind,
  body: Readonly<Record<string, unknown>>,
  intents: readonly WidgetIntent[],
) => {
  const refs: Array<{ k: 'entry' | 'intent'; id: string }> = [];
  const names: Record<string, string> = {};
  if (kind === 'SCHEDULE' && Array.isArray(body.entries)) {
    for (const entry of body.entries as Array<Record<string, unknown>>) {
      if (typeof entry.entry_ref !== 'string') continue;
      refs.push({ k: 'entry', id: entry.entry_ref });
      names[`entry:${entry.entry_ref}`] = cellLabel(entry.title) ?? 'Запись';
    }
  }
  for (const intent of intents) {
    refs.push({ k: 'intent', id: intent.intent_ref });
    names[`intent:${intent.intent_ref}`] = intent.label;
  }
  return { refs, names };
};

const leafPaths = (value: unknown): readonly string[] => {
  const paths: string[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, `${path}/${index}`));
      return;
    }
    if (typeof node === 'object' && node !== null) {
      const entries = Object.entries(node as Record<string, unknown>).sort(
        ([a], [b]) => a.localeCompare(b),
      );
      if (entries.length === 0) paths.push(path || '/');
      else
        for (const [key, child] of entries)
          visit(child, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
      return;
    }
    paths.push(path || '/');
  };
  visit(value, '');
  return Object.freeze(paths);
};

const stripToken = (intent: WidgetIntent) => {
  const { intent_token: _token, ...rest } = intent;
  return rest;
};

export const envelopeBodyHashTerms = (
  envelope: Readonly<Record<string, unknown>>,
) => ({
  contract: envelope.contract,
  kind: envelope.kind,
  body_version: envelope.body_version,
  body: envelope.body,
  cell_index_digest: (envelope.integrity as Record<string, unknown>)
    .cell_index_digest,
  provenance: envelope.provenance,
  limitations: envelope.limitations,
  intents: (envelope.intents as WidgetIntent[]).map(stripToken),
  presentation: envelope.presentation,
  render_tier: (envelope.render as Record<string, unknown>).render_tier,
});

export const envelopeBodyHash = (
  envelope: Readonly<Record<string, unknown>>,
): string => sha256Hex(stableActionJson(envelopeBodyHashTerms(envelope)));

export const buildEnvelopeWithoutSeal = (args: {
  widgetId: string;
  tenantId: string;
  turnId: string;
  kind: WidgetKind;
  body: Readonly<Record<string, unknown>>;
  intents: readonly WidgetIntent[];
  input: WidgetComposerInput;
  principal: PrincipalView;
  fitting: FitResult;
  deliveryChannel: string;
  freshnessClass: 'live' | 'scenario' | 'proactive_once' | 'static';
  piiClass: 'none' | 'business_aggregate' | 'client_identified';
  issuedAt: Date;
  expiresAt: Date;
  ttlSeconds: number;
  limitations: readonly string[];
  textEquivalentOverride?: Readonly<Record<string, unknown>> | null;
}) => {
  const completeness =
    args.input.facts[0]?.completeness ??
    fallbackCompleteness(sha256Hex(stableActionJson(args.input.correlation_refs)));
  const evidence = [
    ...new Set(args.input.facts.flatMap((fact) => fact.evidence_refs)),
  ];
  const text =
    args.textEquivalentOverride ??
    textEquivalent(args.kind, args.body, args.fitting.textEquivalent);
  const textRecord = text as Record<string, unknown>;
  const headline =
    typeof textRecord.headline === 'string' ? textRecord.headline : args.kind;
  const bodyText =
    typeof textRecord.body === 'string' ? textRecord.body : headline;
  const interactive = interactiveRefs(args.kind, args.body, args.intents);
  const cellIndexDigest = sha256Hex(
    stableActionJson(leafPaths(args.body)),
  );
  const limitations = args.limitations.map((code) => ({
    code,
    text: {
      phrase_key: `limitation.${code.toLowerCase()}`,
      rendered: code,
    },
    severity: code === 'MG-P01' ? 'blocking' : 'limitation',
    affects: [],
    capability_gap_ref: code === 'MG-P01' ? code : null,
  }));
  const envelope: Record<string, unknown> = {
    contract: 'maya.widget.envelope/1',
    widget_id: args.widgetId,
    kind: args.kind,
    body_version: 1,
    tenant_id: args.tenantId,
    correlation: {
      run_id: args.input.correlation_refs.run_id ?? null,
      turn_id: args.input.correlation_refs.turn_id ?? args.turnId,
      message_id: args.input.correlation_refs.message_id ?? null,
      agent_id: null,
      parent_widget_id: args.input.correlation_refs.parent_id ?? null,
      step_index: null,
      step_total: null,
      trace_id: sha256Hex(
        stableActionJson([
          args.tenantId,
          args.turnId,
          args.input.correlation_refs,
        ]),
      ).slice(0, 32),
    },
    source: args.input.source,
    origin: args.input.origin,
    authority: {
      verification_level: args.principal.verificationLevel,
      pii_class: args.piiClass,
      data_scope: { masked_fields: [] },
    },
    body: args.body,
    intents: args.intents,
    provenance: {
      source_capability: args.input.capability,
      capability_version: args.input.capability_version,
      projector_id: `${args.input.capability}@1`,
      source_kind: sourceKind(args.input.source),
      facts_used: args.input.facts,
      facts_origin: args.input.facts_origin,
      facts_digest: sha256Hex(stableActionJson(args.input.facts)),
      completeness,
      completeness_envelope_hash: sha256Hex(stableActionJson(completeness)),
      evidence_refs: evidence.map((ref) => ({
        ref,
        class: 'c9_invocation_handle',
        dereferenceable_until: null,
      })),
      confidence:
        completeness.status === 'COMPLETE'
          ? 'high'
          : completeness.status === 'PARTIAL'
            ? 'medium'
            : 'low',
      authorship: {
        body_values: 'server_formatter',
        body_phrases: 'server_catalogue',
        narrative: 'none',
        narrative_template_id: null,
        narrative_template_version: null,
        model_contribution: 'none',
        model_contribution_ref: null,
      },
    },
    limitations,
    lifecycle: {
      freshness_class: args.freshnessClass,
      state: 'MINTED',
      issued_at: args.issuedAt.toISOString(),
      expires_at: args.expiresAt.toISOString(),
      flow_ttl_s: args.freshnessClass === 'scenario' ? args.ttlSeconds : null,
      input_lock: 'none',
      on_expiry:
        args.freshnessClass === 'proactive_once'
          ? 'mark_stale'
          : 'collapse_to_summary',
      supersedes_widget_id: null,
      superseded_by_widget_id: null,
      delivery: {
        delivery_state: 'live',
        answered_at: null,
        answering_channel: null,
        action_receipt_ref: null,
      },
      historised_form: 'summary_bubble',
      timeline_placement: 'chronological',
      dedupe_key: `${args.kind}:${args.widgetId}`,
      retention_sec: args.ttlSeconds,
      delivery_channel: args.deliveryChannel,
    },
    presentation: {
      presentation_mode: args.principal.presentationMode,
      density:
        args.fitting.tier === 'RICH_INTERACTIVE' ||
        args.fitting.tier === 'RICH_CONSTRAINED'
          ? 'CARD'
          : 'INLINE',
      text_equivalent: {
        headline,
        body: bodyText,
        itemized: Array.isArray(textRecord.itemized)
          ? textRecord.itemized
          : [],
        completeness_sentence:
          typeof textRecord.completeness_sentence === 'string'
            ? textRecord.completeness_sentence
            : null,
        unknowns_sentence:
          typeof textRecord.unknowns_sentence === 'string'
            ? textRecord.unknowns_sentence
            : null,
      },
      speech: null,
      a11y: {
        role_hint: roleHint(args.kind),
        label: headline,
        description: bodyText,
        reading_order: interactive.refs,
        live_region: args.kind === 'PROGRESS' ? 'polite' : 'off',
        accessible_names: interactive.names,
      },
      fullscreen_detail: null,
    },
    render: {
      contract: 'maya.render.receipt/1',
      profile_id: args.fitting.profileId,
      profile_version: 1,
      render_tier: args.fitting.tier as RenderTier,
      intents_minted: args.fitting.intentsMinted,
      intents_emitted: args.intents.length,
      intents_withheld: args.fitting.intentsWithheld.map((entry) => ({
        role: entry.role,
        reason: entry.reason,
        reachable_via: entry.reachableVia,
      })),
      body_reductions: args.fitting.bodyReductions.map((entry) => ({
        path: entry.path,
        reduction: entry.reduction,
        restored_by: entry.restoredBy,
      })),
      text_equivalent_is_canonical: args.fitting.textEquivalentIsCanonical,
      escalation: null,
      degraded_at: args.issuedAt.toISOString(),
    },
    integrity: {
      body_hash: '',
      cell_index_digest: cellIndexDigest,
      envelope_seal: '',
      seal_key_version: 1,
      principal_proof_hash: args.principal.proofHash,
      approval_echo: null,
      policy_context_echo: null,
    },
  };
  return envelope as unknown as Omit<
    WidgetEnvelope,
    never
  > & Readonly<Record<string, unknown>>;
};
