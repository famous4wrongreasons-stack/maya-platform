// K5 — the renderer.
//
// Its security property is NEGATIVE, and the mapping states it plainly: "A renderer that can reach a
// capability owner is a second authority path." So this module can reach nothing: no fetch, no
// storage, no clock, no host global, no provider SDK, and no token-bearing input. The shell hands it
// an allowlist view of an envelope that `integrity/h7.ts` already verified, plus that verdict (R-2,
// R-5, D1). A renderer that held a token could spend it; this one is never given one.
//
// It composes no user-visible text (R-3). Every string it places is minted: the text equivalent,
// Cell/Measure/Phrase leaves, intent labels and the sealed accessible names. It derives neither the
// reading order nor a name: both are sealed in `presentation.a11y` and are drawn as given, and a
// structured drawing is used only when its interactive order reproduces the sealed one.
//
// Three modes (nodes.ts RenderMode):
//   structured    the kind's own branch — the 16 emittable kinds plus ARTIFACT
//   prose         the text equivalent, every non-KNOWN Cell's label, limitations and every sealed
//                 control in sealed order — the five prose kinds, the TEXT_ONLY tier, and any
//                 envelope whose structured drawing would not reproduce its sealed reading order
//   frozen_prose  a non-valid verdict or an EXPIRED lifecycle: the text equivalent plus the one
//                 server REFINE, never an error surface (H7, L5); a terminal lifecycle: the text and
//                 no control, never a disabled button (FR2)
//
// Tier comes from the envelope (`view.render.render_tier`), never from the environment (R-4).

import type {
  FormField,
  InteractiveRef,
  InteractiveRefKey,
  LifecycleState,
  OptionItem,
  TextEquivalent,
  WidgetKind,
} from '../contract.ts';
import type {
  ActionNode,
  BlockNode,
  ChoiceNode,
  EnvelopeView,
  FieldNode,
  FocusRule,
  HeadingNode,
  IntentView,
  LeafNode,
  LimitationNode,
  RenderInput,
  RenderMode,
  RenderNode,
  RenderResult,
  TextNode,
} from './nodes.ts';
import { KIND_A11Y_FLOOR, type KindFloorRow } from './kinds.ts';
import { UnreadableEnvelope, cellLeaf, isUsable, leaves, measureLeaf, phraseLeaf, stateOf, unknownLeaves, valueLeaf } from './cells.ts';
import { drawTable, type TableContext } from './tables.ts';

// ── keys and the interactive walk ──────────────────────────────────────────────────────────────

/** `${ref.k}:${ref.id}` — the contract's key form, spelled here without redeclaring its function. */
export const keyOf = (ref: InteractiveRef): InteractiveRefKey => `${ref.k}:${ref.id}`;

/**
 * The interactive elements of a node tree, in DOM order: actions, choices, fields, and table rows (a
 * row in the reading order counts once, whether or not it carries an in-row control with the same
 * ref). The DOM host draws in this order, so "DOM order equals reading order" is this list equalling
 * the sealed one.
 */
export const interactiveRefs = (nodes: readonly RenderNode[]): InteractiveRefKey[] => {
  const out: InteractiveRefKey[] = [];
  const walk = (list: readonly RenderNode[]): void => {
    for (const n of list) {
      switch (n.t) {
        case 'action':
        case 'field':
          out.push(n.ref);
          break;
        case 'choice':
          out.push(n.ref);
          walk(n.children);
          break;
        case 'block':
          walk(n.children);
          break;
        case 'table':
          for (const group of n.groups)
            for (const row of group.rows) {
              if (row.ref !== null) out.push(row.ref);
              for (const a of row.actions) if (a.ref !== row.ref) out.push(a.ref);
            }
          break;
        case 'text':
        case 'leaf':
        case 'heading':
        case 'limitation':
          break;
        default:
          unreachableNode(n);
      }
    }
  };
  walk(nodes);
  return out;
};

const unreachableNode = (n: never): void => {
  void n;
};

// ── the drawing context ────────────────────────────────────────────────────────────────────────

interface Draw {
  readonly view: EnvelopeView;
  readonly names: Readonly<Record<string, string>>;
  readonly order: ReadonlySet<string>;
  readonly intents: ReadonlyMap<string, IntentView>;
}

const nameOf = (d: Draw, key: InteractiveRefKey): string => d.names[key] ?? '';

/** The intent ref when that intent was emitted, else null: a withheld intent draws nothing. */
const emitted = (d: Draw, intentRef: string | null): string | null =>
  intentRef !== null && d.intents.has(intentRef) ? intentRef : null;

const actionNode = (d: Draw, intent: IntentView, ref: InteractiveRefKey): ActionNode => ({
  t: 'action',
  ref,
  intent_ref: intent.intent_ref,
  name: nameOf(d, ref),
  label: intent.label,
  role: intent.role,
  effect: intent.effect,
  enabled: stateOf(intent.enabled.state),
  explanation: isUsable(intent.enabled) ? null : cellLeaf(intent.enabled),
});

/** Buttons for the emitted intents among `refs`, in order; nulls and withheld intents draw nothing. */
const actions = (d: Draw, refs: readonly (string | null)[]): ActionNode[] => {
  const out: ActionNode[] = [];
  for (const r of refs) {
    const intent = r === null ? undefined : d.intents.get(r);
    if (intent !== undefined) out.push(actionNode(d, intent, `intent:${intent.intent_ref}`));
  }
  return out;
};

const block = (
  kind: BlockNode['block'],
  children: readonly RenderNode[],
  label: string | null = null,
  roleHint: BlockNode['roleHint'] = null,
): BlockNode => ({ t: 'block', block: kind, roleHint, label, children });
const para = (children: readonly RenderNode[]): BlockNode => block('paragraph', children);
const list = (items: readonly (readonly RenderNode[])[]): BlockNode => block('list', items.map((children) => block('item', children)));
const optional = <T>(value: T | null, draw: (v: T) => LeafNode): LeafNode[] => (value === null ? [] : [draw(value)]);

/** The group the sealed role hint names (radiogroup, listbox, grid, form), labelled by a minted string. */
const hinted = (d: Draw, children: readonly RenderNode[], label: string | null): BlockNode =>
  block('group', children, label, d.view.presentation.a11y.role_hint);

const tableContext = (d: Draw): TableContext => ({
  inOrder: (key) => d.order.has(key),
  rowAction: (intentRef, ref) => {
    const intent = d.intents.get(intentRef);
    return intent === undefined ? null : actionNode(d, intent, ref);
  },
});

const optionChoice = (d: Draw, option: OptionItem, extra: readonly LeafNode[]): ChoiceNode => {
  const ref: InteractiveRefKey = `option:${option.option_id}`;
  return {
    t: 'choice',
    ref,
    name: nameOf(d, ref),
    selects: emitted(d, option.intent_ref),
    children: [
      cellLeaf(option.label),
      ...optional(option.sublabel, cellLeaf),
      ...option.badges.map(phraseLeaf),
      ...extra,
      ...option.measures.map(measureLeaf),
      ...(option.media === null ? [] : [phraseLeaf(option.media.alt)]),
      ...(isUsable(option.enabled) ? [] : [cellLeaf(option.enabled)]),
    ],
  };
};

/** A field is refused when a limitation names a pointer at or under it (FORM: focus moves there). */
const isRefused = (d: Draw, index: number): boolean =>
  d.view.limitations.some((l) => l.affects.some((p) => p === `/fields/${index}` || p.startsWith(`/fields/${index}/`)));

const fieldNode = (d: Draw, field: FormField, index: number): FieldNode => {
  const ref: InteractiveRefKey = `field:${field.field_key}`;
  const secure = field.sensitivity === 'SECURE_SURFACE_ONLY';
  return {
    t: 'field',
    ref,
    name: nameOf(d, ref),
    input: secure ? 'none' : field.control === 'select' || field.control === 'toggle' ? 'choice' : 'text',
    help: [
      ...optional(field.help, phraseLeaf),
      ...(field.bound === null
        ? []
        : [phraseLeaf(field.bound.basis), ...leaves([field.bound.min, field.bound.max, field.bound.max_abs_delta], measureLeaf)]),
      ...(field.options ?? []).map((o) => cellLeaf(o.label)),
    ],
    // A-15: prefilled from `current`, except where the value may be shown on a secure surface only.
    value: secure ? null : cellLeaf(field.current),
    refused: isRefused(d, index),
  };
};

// ── the structured branches (the 16 emittable kinds plus ARTIFACT) ─────────────────────────────

const unreadable = (kind: WidgetKind): never => {
  throw new UnreadableEnvelope(`${kind}: the body does not have its kind's shape`);
};

const unreachableKind = (kind: never): never => {
  throw new UnreadableEnvelope(`unknown kind ${String(kind)}`);
};

const structured = (d: Draw, kind: WidgetKind): RenderNode[] => {
  const b = d.view.body;
  switch (kind) {
    case 'CHOICE': {
      if (!('min_select' in b)) return unreadable(kind);
      return [
        phraseLeaf(b.prompt),
        hinted(d, b.options.map((o) => optionChoice(d, o, [])), b.prompt.rendered),
        ...actions(d, [b.more_intent]),
      ];
    }
    case 'SERVICE_SELECTOR': {
      if (!('category_path' in b)) return unreadable(kind);
      return [
        phraseLeaf(b.prompt),
        ...(b.category_path.length === 0 ? [] : [para(b.category_path.map(phraseLeaf))]),
        hinted(
          d,
          b.options.map((o) => optionChoice(d, o, [measureLeaf(o.duration), measureLeaf(o.price), cellLeaf(o.requires_consultation)])),
          b.prompt.rendered,
        ),
        ...optional(b.total_preview, measureLeaf),
        ...actions(d, [b.more_intent]),
      ];
    }
    case 'STAFF_SELECTOR': {
      if (!('any_staff_option' in b)) return unreadable(kind);
      const staff = b.options.map((o) =>
        optionChoice(d, o, [cellLeaf(o.role_label), measureLeaf(o.nearest_availability), ...optional(o.rating, measureLeaf)]),
      );
      const any = b.any_staff_option === null ? [] : [optionChoice(d, b.any_staff_option, [])];
      return [phraseLeaf(b.prompt), hinted(d, [...staff, ...any], b.prompt.rendered), ...actions(d, [b.more_intent])];
    }
    case 'TIME_SLOT_SELECTOR': {
      if (!('none_fit_intent' in b)) return unreadable(kind);
      const groups = b.groups.map((g) =>
        block(
          'group',
          g.slots.map((s): ChoiceNode => {
            const ref: InteractiveRefKey = `slot:${s.slot_ref}`;
            return {
              t: 'choice',
              ref,
              name: nameOf(d, ref),
              selects: emitted(d, s.intent_ref),
              children: [measureLeaf(s.start), measureLeaf(s.duration), ...optional(s.price, measureLeaf), cellLeaf(s.availability)],
            };
          }),
          g.label.rendered,
        ),
      );
      return [
        phraseLeaf(b.prompt),
        hinted(d, groups, b.prompt.rendered),
        ...actions(d, [b.more_intent, b.widen_window_intent, b.none_fit_intent]),
      ];
    }
    case 'BOOKING_CONFIRMATION': {
      if (!('confirmation_subject' in b)) return unreadable(kind);
      return [
        list(b.lines.map((l) => [phraseLeaf(l.label), cellLeaf(l.detail), ...l.measures.map(measureLeaf)])),
        para([
          measureLeaf(b.when),
          ...optional(b.when_previous, measureLeaf),
          cellLeaf(b.staff_label),
          measureLeaf(b.duration_total),
          measureLeaf(b.price_total),
          ...leaves([b.price_delta, b.refund_preview, b.loyalty_applied], measureLeaf),
        ]),
        ...(b.policy_notices.length === 0 ? [] : [para(b.policy_notices.map(phraseLeaf))]),
        ...actions(d, [b.commit_intent, ...b.amend_intents, b.dismiss_intent]),
      ];
    }
    case 'SCHEDULE': {
      if (!('lanes' in b)) return unreadable(kind);
      // Lane = row header; each entry is a control inside its lane, in the order the entries are sealed.
      const lanes = b.lanes.map((lane) =>
        block(
          'group',
          [
            cellLeaf(lane.label),
            ...b.entries
              .filter((e) => e.lane_id === lane.lane_id)
              .map((e): ChoiceNode => {
                const ref: InteractiveRefKey = `entry:${e.entry_ref}`;
                return {
                  t: 'choice',
                  ref,
                  name: nameOf(d, ref),
                  selects: emitted(d, e.detail_intent),
                  children: [cellLeaf(e.title), ...optional(e.subtitle, cellLeaf), cellLeaf(e.state)],
                };
              }),
          ],
          lane.label.label,
        ),
      );
      return [
        hinted(d, lanes, null),
        ...(b.gaps.length === 0 ? [] : [para(b.gaps.map((g) => measureLeaf(g.recoverable)))]),
        ...actions(d, [b.detail_intent]),
      ];
    }
    case 'CLIENT_LIST': {
      if (!('segment_ref' in b)) return unreadable(kind);
      return [
        phraseLeaf(b.segment_label),
        drawTable(b.table, tableContext(d), true),
        // Bulk intents sit outside the table; the audience size is stated before its control (CLIENT.1).
        ...b.bulk_intents.flatMap((bulk): RenderNode[] => [measureLeaf(bulk.audience_size), ...actions(d, [bulk.intent_ref])]),
      ];
    }
    case 'METRIC': {
      if (!('headline_metric_key' in b)) return unreadable(kind);
      const headline = b.metrics.find((m) => m.key === b.headline_metric_key);
      if (headline === undefined) return unreadable(kind);
      const ordered = [headline, ...b.metrics.filter((m) => m !== headline)];
      return [
        phraseLeaf(b.period_label),
        list(
          ordered.map((m) => [
            measureLeaf(m),
            ...(m.comparison === null ? [] : [phraseLeaf(m.comparison.baseline_label), ...optional(m.comparison.baseline, measureLeaf)]),
          ]),
        ),
        ...actions(d, [b.compare_intent, b.drill_intent]),
      ];
    }
    case 'REPORT': {
      if (!('top_summary' in b)) return unreadable(kind);
      return [
        phraseLeaf(b.period_label),
        ...(b.top_summary.length === 0 ? [] : [list(b.top_summary.map((m) => [measureLeaf(m)]))]),
        // Interactive paths order: fullscreen_intent, export_intent, then the section rows.
        ...actions(d, [b.fullscreen_intent, b.export_intent]),
        ...b.sections.flatMap((s): RenderNode[] => [
          { t: 'heading', level: s.depth === 1 ? 3 : 4, text: s.heading.rendered, focusTarget: false },
          para([phraseLeaf(s.narrative)]),
          ...(s.table === null ? [] : [drawTable(s.table, tableContext(d), true)]),
          ...(s.metrics.length === 0 ? [] : [list(s.metrics.map((m) => [measureLeaf(m)]))]),
        ]),
      ];
    }
    case 'STRATEGY_OPTIONS': {
      if (!('no_action_option' in b)) return unreadable(kind);
      const alternatives = b.alternatives.map((a): ChoiceNode => {
        const ref: InteractiveRefKey = `option:${a.option_id}`;
        return {
          t: 'choice',
          ref,
          name: nameOf(d, ref),
          selects: emitted(d, a.select_intent),
          children: [
            cellLeaf(a.title),
            phraseLeaf(a.reasoning),
            ...optional(a.expected_effect, measureLeaf),
            cellLeaf(a.risk_tier),
            cellLeaf(a.reversible),
            ...optional(a.audience_size, measureLeaf),
          ],
        };
      });
      // NO_ACTION is an option in the same group, never styled as a dismissal.
      const none: RenderNode[] = [
        phraseLeaf(b.no_action_option.title),
        phraseLeaf(b.no_action_option.consequence),
        ...actions(d, [b.no_action_option.select_intent]),
      ];
      return [phraseLeaf(b.question), hinted(d, [...alternatives, ...none], b.question.rendered), phraseLeaf(b.review_disclaimer)];
    }
    case 'APPROVAL': {
      if (!('approval_ref' in b)) return unreadable(kind);
      return [
        cellLeaf(b.subject),
        list(b.effect_preview.map((e) => [phraseLeaf(e.label), valueLeaf(e.value)])),
        para([
          ...optional(b.audience_size, measureLeaf),
          cellLeaf(b.risk_tier),
          cellLeaf(b.reversible),
          cellLeaf(b.state),
          cellLeaf(b.requested_by_label),
        ]),
        ...optional(b.blocked_reason, phraseLeaf),
        ...actions(d, [b.approve_intent, b.reject_intent, b.detail_intent]),
      ];
    }
    case 'PROGRESS': {
      if (!('run_ref' in b)) return unreadable(kind);
      return [
        cellLeaf(b.headline),
        ...optional(b.budget_note, phraseLeaf),
        // Interactive paths order: cancel_intent, then each step's next_intent_ref.
        ...actions(d, [b.cancel_intent]),
        list(b.steps.map((s) => [phraseLeaf(s.label), cellLeaf(s.state), ...actions(d, [s.state.next_intent_ref])])),
      ];
    }
    case 'LIMITATION': {
      if (!('source_limitation_codes' in b)) return unreadable(kind);
      return [phraseLeaf(b.headline), phraseLeaf(b.detail), ...actions(d, b.remedy_intents)];
    }
    case 'SOURCE_STATUS': {
      if (!('sources' in b)) return unreadable(kind);
      return [
        cellLeaf(b.overall),
        list(
          b.sources.map((s) => [
            cellLeaf(s.label),
            cellLeaf(s.state),
            cellLeaf(s.as_of),
            phraseLeaf(s.impact_text),
            ...actions(d, [s.reconnect_intent]),
          ]),
        ),
      ];
    }
    case 'SETTINGS_DRAFT': {
      if (!('diff' in b)) return unreadable(kind);
      return [
        cellLeaf(b.scope_label),
        list(b.diff.map((r) => [phraseLeaf(r.label), cellLeaf(r.from), cellLeaf(r.to), phraseLeaf(r.effect_text), cellLeaf(r.reversible)])),
        ...actions(d, [b.apply_intent, b.discard_intent, b.editor_handoff_intent]),
      ];
    }
    case 'FORM': {
      if (!('form_ref' in b)) return unreadable(kind);
      return [
        hinted(d, b.fields.map((f, i) => fieldNode(d, f, i)), null),
        ...actions(d, [b.submit_intent, b.discard_intent, b.editor_handoff_intent]),
      ];
    }
    case 'ARTIFACT': {
      if (!('artifact_ref' in b)) return unreadable(kind);
      return [
        para([
          cellLeaf(b.filename),
          cellLeaf(b.format),
          measureLeaf(b.size_bytes),
          phraseLeaf(b.contains_text),
          cellLeaf(b.contains_pii),
          cellLeaf(b.produced_at),
        ]),
        ...actions(d, [b.fetch_intent, b.regenerate_intent]),
      ];
    }
    // The five prose branches never draw structured; asking one to is unreadable by definition.
    case 'CHART':
    case 'CONSENT_STATE':
    case 'IDENTITY_BINDING':
    case 'PAYMENT_HANDOFF':
    case 'MEDIA_PREVIEW':
      return unreadable(kind);
    default:
      return unreachableKind(kind);
  }
};

// ── prose ──────────────────────────────────────────────────────────────────────────────────────

/** Draw a part; an unreadable part of the envelope draws nothing instead of failing the item. */
const guarded = <T>(draw: () => T[]): T[] => {
  try {
    return draw();
  } catch {
    return [];
  }
};

const textNode = (text: string): TextNode => ({ t: 'text', text });

/** The text equivalent, verbatim: body, itemized lines, completeness and unknowns sentences. */
const equivalentText = (te: TextEquivalent): RenderNode[] =>
  guarded((): RenderNode[] => {
    const out: RenderNode[] = [];
    if (typeof te.body === 'string' && te.body !== '') out.push(para([textNode(te.body)]));
    const items = Array.isArray(te.itemized) ? te.itemized.filter((s) => typeof s === 'string') : [];
    if (items.length > 0) out.push(list(items.map((s) => [textNode(s)])));
    for (const s of [te.completeness_sentence, te.unknowns_sentence]) if (typeof s === 'string' && s !== '') out.push(para([textNode(s)]));
    return out;
  });

/** `limitations` are always drawn (R-6); severity is carried as data, never as a colour alone. */
const limitationNodes = (d: Draw): LimitationNode[] =>
  guarded(() => d.view.limitations.map((l): LimitationNode => ({ t: 'limitation', code: l.code, severity: l.severity, text: l.text.rendered })));

/** What a prose kind draws beyond its text: CHART's table equivalent in full (A-8), MEDIA_PREVIEW's alt. */
const proseExtras = (d: Draw, kind: WidgetKind): RenderNode[] =>
  guarded((): RenderNode[] => {
    const b = d.view.body;
    if (kind === 'CHART' && 'table_equivalent' in b) return [drawTable(b.table_equivalent, tableContext(d), false)];
    if (kind === 'MEDIA_PREVIEW' && 'media_ref' in b) return [para([phraseLeaf(b.alt)])];
    return [];
  });

/** The control a sealed ref names: an intent as a button, a field as a field, a body element as a choice. */
const sealedControl = (d: Draw, ref: InteractiveRef, key: InteractiveRefKey): RenderNode[] =>
  guarded((): RenderNode[] => {
    const b = d.view.body;
    const choice = (children: LeafNode[], selects: string | null): ChoiceNode[] => [
      { t: 'choice', ref: key, name: nameOf(d, key), selects: emitted(d, selects), children },
    ];
    switch (ref.k) {
      case 'intent': {
        const intent = d.intents.get(ref.id);
        return intent === undefined ? [] : [actionNode(d, intent, key)];
      }
      case 'field': {
        if (!('form_ref' in b)) return [];
        const index = b.fields.findIndex((f) => f.field_key === ref.id);
        const field = b.fields[index];
        return field === undefined ? [] : [fieldNode(d, field, index)];
      }
      case 'option': {
        if ('alternatives' in b) {
          const a = b.alternatives.find((x) => x.option_id === ref.id);
          return a === undefined ? [] : choice([cellLeaf(a.title)], a.select_intent);
        }
        if (!('options' in b)) return [];
        const pool: readonly OptionItem[] =
          'any_staff_option' in b && b.any_staff_option !== null ? [...b.options, b.any_staff_option] : b.options;
        const o = pool.find((x) => x.option_id === ref.id);
        return o === undefined ? [] : choice([cellLeaf(o.label)], o.intent_ref);
      }
      case 'slot': {
        if (!('none_fit_intent' in b)) return [];
        const s = b.groups.flatMap((g) => g.slots).find((x) => x.slot_ref === ref.id);
        return s === undefined ? [] : choice([measureLeaf(s.start)], s.intent_ref);
      }
      case 'entry': {
        if (!('lanes' in b)) return [];
        const e = b.entries.find((x) => x.entry_ref === ref.id);
        return e === undefined ? [] : choice([cellLeaf(e.title)], e.detail_intent);
      }
      case 'row': {
        const tables =
          'segment_ref' in b
            ? [b.table]
            : 'top_summary' in b
              ? b.sections.flatMap((s) => (s.table === null ? [] : [s.table]))
              : 'table_equivalent' in b
                ? [b.table_equivalent]
                : [];
        for (const t of tables) {
          const row = t.rows.find((r) => r.row_key === ref.id);
          const header = t.columns.find((c) => c.is_row_header);
          const cell = row === undefined || header === undefined ? undefined : row.cells[header.key];
          if (row !== undefined && cell !== undefined && cell !== null) return choice([valueLeaf(cell)], t.row_intents?.[row.row_key] ?? null);
        }
        return [];
      }
      case 'section': {
        if (!('top_summary' in b)) return [];
        const s = b.sections.find((x) => x.section_id === ref.id);
        return s === undefined ? [] : choice([phraseLeaf(s.heading)], null);
      }
      default:
        return [];
    }
  });

/** Every sealed ref, in sealed order, each drawn once; a ref the envelope cannot resolve draws nothing. */
const sealedControls = (d: Draw): RenderNode[] => {
  const out: RenderNode[] = [];
  const seen = new Set<string>();
  for (const ref of d.view.presentation.a11y.reading_order) {
    const key = keyOf(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(...sealedControl(d, ref, key));
  }
  return out;
};

const prose = (d: Draw, kind: WidgetKind): RenderNode[] => {
  const unknown = guarded(() => unknownLeaves(d.view.body));
  return [
    ...equivalentText(d.view.presentation.text_equivalent),
    ...proseExtras(d, kind),
    ...(unknown.length === 0 ? [] : [block('group', unknown)]),
    ...limitationNodes(d),
    ...sealedControls(d),
  ];
};

/** H7's fallback: the text, the limitations, and — when `withRefine` — the first REFINE in sealed order. */
const frozen = (d: Draw, withRefine: boolean): RenderNode[] => {
  const refine = withRefine
    ? guarded((): ActionNode[] => {
        for (const ref of d.view.presentation.a11y.reading_order) {
          const intent = ref.k === 'intent' ? d.intents.get(ref.id) : undefined;
          if (intent !== undefined && intent.effect === 'REFINE') return [actionNode(d, intent, keyOf(ref))];
        }
        return [];
      })
    : [];
  return [...equivalentText(d.view.presentation.text_equivalent), ...limitationNodes(d), ...refine];
};

// ── render ─────────────────────────────────────────────────────────────────────────────────────

/** The lifecycle states in which an envelope's intents may still be consumed. */
const LIVE: ReadonlySet<LifecycleState> = new Set<LifecycleState>(['MINTED', 'DELIVERED', 'LIVE']);

const sameOrder = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((k, i) => k === b[i]);

/** The kind branch, the limitations, then — per WC A-0 — every sealed intent ref the branch did not draw. */
const structuredOrThrow = (d: Draw, kind: WidgetKind): RenderNode[] => {
  const drawn: RenderNode[] = [...structured(d, kind), ...limitationNodes(d)];
  const drawnKeys = new Set<string>(interactiveRefs(drawn));
  const appended = d.view.presentation.a11y.reading_order
    .filter((ref) => ref.k === 'intent' && !drawnKeys.has(keyOf(ref)))
    .flatMap((ref) => actions(d, [ref.id]));
  const candidate = [...drawn, ...appended];
  if (!sameOrder(interactiveRefs(candidate), d.view.presentation.a11y.reading_order.map(keyOf)))
    throw new UnreadableEnvelope('the structured drawing does not reproduce the sealed reading order');
  return candidate;
};

/**
 * Render a verified, projected envelope. Pure: same input, same output; no clock, no randomness,
 * no I/O. The result is a value the DOM host draws.
 */
export const render = (input: RenderInput): RenderResult => {
  const { view, verdict, env, density } = input;
  const a11y = view.presentation.a11y;
  const d: Draw = {
    view,
    names: a11y.accessible_names,
    order: new Set(a11y.reading_order.map(keyOf)),
    intents: new Map(view.intents.map((i) => [i.intent_ref, i])),
  };
  const row: KindFloorRow | undefined = KIND_A11Y_FLOOR[view.kind];

  let mode: RenderMode;
  let body: RenderNode[];
  if (row === undefined) {
    mode = 'frozen_prose';
    body = frozen(d, false);
  } else if (verdict !== 'valid' || view.lifecycle.state === 'EXPIRED') {
    mode = 'frozen_prose';
    body = frozen(d, true);
  } else if (!LIVE.has(view.lifecycle.state)) {
    // CONSUMED, SUPERSEDED, CANCELLED, HISTORISED, BODY_DROPPED, REDACTED: static text, no control (FR2).
    mode = 'frozen_prose';
    body = frozen(d, false);
  } else if (row.branch === 'prose' || view.render.render_tier === 'TEXT_ONLY') {
    mode = 'prose';
    body = prose(d, view.kind);
  } else {
    try {
      body = structuredOrThrow(d, view.kind);
      mode = 'structured';
    } catch {
      mode = 'prose';
      body = prose(d, view.kind);
    }
  }

  const rule: FocusRule = row === undefined ? 'none' : row.focus;
  const refusedField = (list: readonly RenderNode[]): boolean =>
    list.some((n) => (n.t === 'field' && n.refused) || (n.t === 'block' && refusedField(n.children)));
  const focus: FocusRule = rule !== 'first_refused_field' ? rule : mode === 'structured' && refusedField(body) ? 'first_refused_field' : 'none';

  const te = view.presentation.text_equivalent;
  const heading: HeadingNode = { t: 'heading', level: 2, text: typeof te.headline === 'string' ? te.headline : '', focusTarget: focus === 'heading' };
  const nodes: RenderNode[] = [heading, ...body];
  const readingOrder = interactiveRefs(nodes);
  const accessibleNames: Record<string, string> = {};
  for (const key of readingOrder) {
    const name = d.names[key];
    if (name !== undefined) accessibleNames[key] = name;
  }

  return {
    kind: view.kind,
    tier: view.render.render_tier,
    density,
    mode,
    roleHint: a11y.role_hint,
    label: a11y.label,
    description: a11y.description,
    nodes,
    // The server's text equivalent, as given: a renderer that composed its own could disagree with
    // what the spoken tier says, and two surfaces would then describe one widget differently.
    textEquivalent: te,
    readingOrder,
    accessibleNames,
    liveRegion: a11y.live_region,
    announceIntervalMs: row === undefined ? 0 : row.liveRegion.minIntervalMs,
    focus,
    motion: env.reduced_motion ? 'none' : 'standard',
    lifecycle: view.lifecycle,
  };
};
