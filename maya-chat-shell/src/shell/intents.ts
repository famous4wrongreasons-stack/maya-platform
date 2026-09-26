// K5 — widget items: the token vault, ingest, and activation (SHELL-PLAN v2.1 §1.5B/C/D/E; D1, D9).
//
// INGEST. `integrity/h7.ts` verifies the FULL envelope first (R-5: `stripIntentToken` removes only
// `intent_token`, class-'i' refs stay hash terms). Then the intent tokens go into the vault, and
// `shell/view.ts` builds the allowlist view the renderer receives with the verdict (D1, SH-07). The
// full envelope stays here, on the vault side, for activation and for the voice capture gate (V6);
// it never reaches `renderer/` or `dom/`. A successor (`lifecycle.supersedes_widget_id`) replaces
// its predecessor at its original position (L7); a `widget_id` already seen renders once (P-25).
//
// ACTIVATION is by item and interactive ref, and only for a ref the drawn result contains: a withheld
// intent is never re-enabled (CH3) and a bare key opens nothing.
//   * effect NONE (the RICH_INTERACTIVE escape, token null): dismissed locally, 0 requests (F60).
//   * NAVIGATE(detail): only when the key equals the envelope's own `fullscreen_detail.route_key`, is
//     one of the nine `fs.*` keys (R7-E3 default) and the item is not itself a detail (R3.3.4). The
//     detail opens in PROGRESS while the submission runs.
//   * a class-'s' target must resolve through the registry; its route switch waits for an outcome.
//   * everything else: one activation in flight per item, then a `WidgetIntentSubmission` (the
//     contract type) to the `SubmissionPort`. No local state changes before an outcome (L6).
// The P1 binding answers `unavailable` (D9): the item shows a neutral sentence, the control is usable
// again, and an opened detail closes. Every activation of a drawn control ends in a state change or a
// sentence — silent outcomes are 0. The receipt consumer arrives with R7-E1 and B3, not here.

import type { InteractiveRefKey, WidgetEnvelope, WidgetIntent, WidgetIntentSubmission } from '../contract.ts';
import { parseInstant, verify } from '../integrity/h7.ts';
import type { EnvelopeView, IntegrityVerdict, RenderNode, RenderResult } from '../renderer/nodes.ts';
import { resolveTarget } from '../routes/registry.ts';
import type { AbortHandle, TimelineWriter, WidgetItemView } from './conversation.ts';
import type {
  Cancel,
  EnvironmentProbe,
  RenderFn,
  Scheduler,
  SubmissionOutcome,
  SubmissionPort,
  Transport,
  WidgetSentence,
} from './ports.ts';
import type { DetailOpener, DetailSource, ShellChrome } from './shell.ts';
import { conformanceProblems, project } from './view.ts';

// ── the vault ──────────────────────────────────────────────────────────────────────────────────

/**
 * Tokens by item and intent ref. Nothing here enumerates tokens: a token leaves only as the one
 * member of a submission built for an activation. Keyed by the shell's item id, so a timeline item
 * and a detail that happen to carry the same emission never share or release each other's tokens.
 */
export interface TokenVault {
  put(itemId: string, intentRef: string, token: string): void;
  get(itemId: string, intentRef: string): string | null;
  /** The intent ref a token of this item belongs to (receipt pointers, `shell/view.ts`). */
  refOf(itemId: string, token: string): string | null;
  drop(itemId: string): void;
  /** The number of tokens held (evidence for tests; never the tokens). */
  size(): number;
  clear(): void;
}

export const createTokenVault = (): TokenVault => {
  const byItem = new Map<string, Map<string, string>>();
  return {
    put(itemId, intentRef, token) {
      let refs = byItem.get(itemId);
      if (refs === undefined) {
        refs = new Map();
        byItem.set(itemId, refs);
      }
      refs.set(intentRef, token);
    },
    get: (itemId, intentRef) => byItem.get(itemId)?.get(intentRef) ?? null,
    refOf(itemId, token) {
      for (const [ref, held] of byItem.get(itemId) ?? []) if (held === token) return ref;
      return null;
    },
    drop: (itemId) => void byItem.delete(itemId),
    size: () => [...byItem.values()].reduce((n, refs) => n + refs.size, 0),
    clear: () => byItem.clear(),
  };
};

// ── the P1 submission binding ──────────────────────────────────────────────────────────────────

/** D9: until R7-E1 and B3, every submission answers `unavailable`. It sends nothing. */
export const createUnavailableSubmission = (): SubmissionPort => ({
  submit: () => Promise.resolve({ status: 'unavailable' }),
});

/** FBE2E-1/3: the sole authenticated widget ingress and bounded receipt reread. */
export const createLiveSubmission = (
  transport: Pick<Transport, 'widgetIntent' | 'resolveWidgets'>,
): SubmissionPort => ({
  async submit(submission, signal) {
    const sent = await transport.widgetIntent(submission, signal);
    if (!sent.ok) {
      if (sent.failure.reason === 'forbidden' || sent.failure.reason === 'signed_out') return { status: 'forbidden' };
      if (sent.failure.reason === 'no_connection') return { status: 'no_connection' };
      if (sent.failure.reason === 'server_error') return { status: 'server_error' };
      return { status: 'unexpected_response' };
    }
    if (sent.value.next_envelope !== null) return { status: 'advanced', envelope: sent.value.next_envelope };
    if (sent.value.outcome !== 'terminate' || sent.value.receipt_outcome !== 'ACCEPTED') {
      return { status: 'forbidden' };
    }
    const page = await transport.resolveWidgets({ thread_page: { limit: 20 } }, signal);
    if (!page.ok) return { status: 'accepted' };
    const current = page.value.widgets.find((widget) => widget.envelope.widget_id === submission.widget_id);
    return current !== undefined && current.terminal_lines.length > 0
      ? { status: 'settled', lines: current.terminal_lines }
      : { status: 'accepted' };
  },
});

// ── types ──────────────────────────────────────────────────────────────────────────────────────

type Display = WidgetItemView['display'];

export type ActivationOutcome =
  | { readonly outcome: 'dismissed' }
  | { readonly outcome: 'sentence'; readonly sentence: WidgetSentence; readonly submitted: boolean }
  | { readonly outcome: 'ignored'; readonly reason: 'unknown_item' | 'not_drawn' | 'in_flight' };

export type IngestOutcome =
  | { readonly ingested: 'added'; readonly itemId: string; readonly verdict: IntegrityVerdict }
  | { readonly ingested: 'replaced'; readonly itemId: string; readonly verdict: IntegrityVerdict }
  | { readonly ingested: 'duplicate' };

/** For the silent-outcome count (D9): activations − (state changes + sentences) must be 0. */
export interface ActivationCounters {
  readonly activations: number;
  readonly stateChanges: number;
  readonly sentences: number;
  readonly submissions: number;
}

export interface WidgetsDeps {
  readonly timeline: TimelineWriter;
  readonly render: RenderFn;
  readonly environment: Pick<EnvironmentProbe, 'a11y' | 'onA11yChange'>;
  readonly submission: SubmissionPort;
  readonly scheduler: Pick<Scheduler, 'now' | 'after'>;
  readonly newAbort: () => AbortHandle;
  readonly newNonce: () => string;
  readonly chrome: ShellChrome;
}

export interface Widgets extends DetailSource {
  ingest(envelope: WidgetEnvelope): IngestOutcome;
  /** Assignable to `WidgetPort.activate`; the outcome is for tests and the dev fixture host. */
  activate(itemId: string, ref: InteractiveRefKey): Promise<ActivationOutcome>;
  /** V6: the live envelopes, vault side (never the view). */
  lockSources(): readonly WidgetEnvelope[];
  counters(): ActivationCounters;
  /** How many tokens the vault holds (evidence; never the tokens). */
  heldTokens(): number;
  dispose(): void;
}

interface Entry {
  readonly itemId: string;
  readonly place: 'timeline' | 'detail';
  envelope: WidgetEnvelope;
  view: EnvelopeView;
  verdict: IntegrityVerdict;
  result: RenderResult;
  display: Display;
  pending: InteractiveRefKey | null;
  sentence: WidgetSentence | null;
  inflight: AbortHandle | null;
  expiry: Cancel | null;
  /** Bumped whenever the entry's emission changes, so a late outcome for a predecessor is ignored. */
  emission: number;
}

// ── helpers ────────────────────────────────────────────────────────────────────────────────────

const LIVE_STATES: ReadonlySet<string> = new Set(['MINTED', 'DELIVERED', 'LIVE']);
/** `setTimeout`'s ceiling; a later expiry is re-checked when this much time has passed. */
const MAX_TIMER_MS = 2_147_483_647;

const isoOf = (ms: number): string => new Date(ms).toISOString();

/** How the item is shown: L8 (expiry is quiet, per `on_expiry`), FR2 (terminal is static text). */
export const displayOf = (envelope: WidgetEnvelope, verdict: IntegrityVerdict): { readonly display: Display; readonly sentence: WidgetSentence | null } => {
  const state = envelope.lifecycle.state;
  if (verdict === 'expired' || state === 'EXPIRED') {
    switch (envelope.lifecycle.on_expiry) {
      case 'mark_stale':
        return { display: 'stale', sentence: null };
      case 'collapse_to_summary':
        return { display: 'collapsed', sentence: null };
      case 're_resolve':
        // P1: no resolve exists yet (B3), so the summary is shown with a neutral sentence.
        return { display: 'collapsed', sentence: 'expired_not_resolved' };
    }
  }
  if (!LIVE_STATES.has(state)) return { display: 'terminal', sentence: null };
  return { display: 'live', sentence: null };
};

/** The intent a drawn interactive ref activates: an action's own, or the one a choice selects. */
export const intentRefFor = (nodes: readonly RenderNode[], key: InteractiveRefKey): string | null => {
  for (const node of nodes) {
    switch (node.t) {
      case 'action':
        if (node.ref === key) return node.intent_ref;
        break;
      case 'choice': {
        if (node.ref === key) return node.selects;
        const inner = intentRefFor(node.children, key);
        if (inner !== null) return inner;
        break;
      }
      case 'block': {
        const inner = intentRefFor(node.children, key);
        if (inner !== null) return inner;
        break;
      }
      case 'table':
        for (const group of node.groups)
          for (const row of group.rows) for (const action of row.actions) if (action.ref === key) return action.intent_ref;
        break;
      default:
        break;
    }
  }
  return null;
};

const isUsable = (intent: WidgetIntent): boolean => intent.enabled?.state === 'KNOWN' && intent.enabled.value === true;

const sentenceFor = (outcome: SubmissionOutcome): WidgetSentence => {
  switch (outcome.status) {
    case 'forbidden':
      return 'activation_forbidden';
    case 'no_connection':
      return 'no_connection';
    case 'unavailable':
    case 'server_error':
    case 'unexpected_response':
      return 'activation_unavailable';
    case 'advanced':
    case 'settled':
    case 'accepted':
      return 'activation_unavailable';
  }
};

/** A drawn option may echo only one value from the server-declared closed input schema. */
export const inputsForActivation = (
  intent: WidgetIntent,
  ref: InteractiveRefKey,
): WidgetIntentSubmission['inputs'] | undefined => {
  if (intent.input_schema === null) return ref.startsWith('intent:') ? null : undefined;
  const fields = intent.input_schema.fields;
  if (fields.length !== 1) return undefined;
  const field = fields[0];
  if (field === undefined || !field.required || (field.kind !== 'enum' && field.kind !== 'ref')) return undefined;
  if (field.selection_min !== 1 || field.selection_max !== 1) return undefined;
  const separator = ref.indexOf(':');
  if (separator < 1 || separator === ref.length - 1) return undefined;
  if (!ref.startsWith('option:') && !ref.startsWith('slot:')) return undefined;
  return { [field.name]: ref.slice(separator + 1) };
};

// ── the store ──────────────────────────────────────────────────────────────────────────────────

export const createWidgets = (deps: WidgetsDeps): Widgets => {
  const vault = createTokenVault();
  const entries = new Map<string, Entry>();
  /** Every emission this conversation has drawn or replaced; a repeat renders nothing (P-25, L7). */
  const seen = new Set<string>();
  let serial = 0;
  let counters = { activations: 0, stateChanges: 0, sentences: 0, submissions: 0 };

  const nextItemId = (place: Entry['place']): string => {
    serial += 1;
    return `${place === 'detail' ? 'd' : 'w'}${serial}`;
  };

  // The density comes from the projected view, whose closed-set members are checked (shell/view.ts).
  const renderEntry = (view: EnvelopeView, verdict: IntegrityVerdict, place: Entry['place']): RenderResult =>
    deps.render({ view, verdict, env: deps.environment.a11y(), density: place === 'detail' ? 'SHEET' : view.presentation.density });

  /** H7 on the full envelope; a hash-valid envelope with a member outside its closed set is not valid. */
  const verdictOf = (envelope: WidgetEnvelope): IntegrityVerdict => {
    const verdict = verify(envelope, isoOf(deps.scheduler.now()));
    return verdict === 'valid' && conformanceProblems(envelope).length > 0 ? 'body_mismatch' : verdict;
  };

  const itemView = (entry: Entry): WidgetItemView => ({
    kind: 'widget',
    id: entry.itemId,
    result: entry.result,
    display: entry.pending !== null && entry.display === 'live' ? 'pending' : entry.display,
    pending: entry.pending,
    sentence: entry.sentence,
  });

  const publish = (entry: Entry): void => {
    if (entry.place === 'timeline') deps.timeline.replaceWidget(itemView(entry));
    else deps.chrome.updateDetail(entry.itemId, entry.result);
  };

  const cancelWork = (entry: Entry): void => {
    entry.expiry?.();
    entry.expiry = null;
    entry.inflight?.abort();
    entry.inflight = null;
    entry.pending = null;
  };

  const release = (itemId: string): void => {
    const entry = entries.get(itemId);
    if (entry === undefined) return;
    cancelWork(entry);
    vault.drop(itemId);
    entries.delete(itemId);
  };

  /** Verify on the full envelope, vault its tokens, project, render. Nothing is drawn before H7 ran. */
  const prepare = (itemId: string, envelope: WidgetEnvelope, place: Entry['place']) => {
    const verdict = verdictOf(envelope);
    vault.drop(itemId);
    for (const intent of envelope.intents)
      if (typeof intent.intent_token === 'string' && intent.intent_token.length > 0) vault.put(itemId, intent.intent_ref, intent.intent_token);
    const view = project(envelope, (token) => vault.refOf(itemId, token));
    const result = renderEntry(view, verdict, place);
    return { verdict, view, result, ...displayOf(envelope, verdict) };
  };

  /** Re-check H7 when the envelope expires, so an item on screen follows `on_expiry` quietly. */
  const scheduleExpiry = (entry: Entry): void => {
    entry.expiry?.();
    entry.expiry = null;
    if (entry.verdict !== 'valid' || entry.display !== 'live') return;
    const expires = parseInstant(entry.envelope.lifecycle.expires_at);
    if (expires === null) return;
    const wait = Math.min(Math.max(0, Math.ceil(expires - deps.scheduler.now())), MAX_TIMER_MS);
    const emission = entry.emission;
    entry.expiry = deps.scheduler.after(wait, () => {
      if (entries.get(entry.itemId) !== entry || entry.emission !== emission) return;
      entry.expiry = null;
      const verdict = verdictOf(entry.envelope);
      if (verdict === entry.verdict) return scheduleExpiry(entry);
      entry.verdict = verdict;
      entry.result = renderEntry(entry.view, verdict, entry.place);
      const shown = displayOf(entry.envelope, verdict);
      entry.display = shown.display;
      entry.sentence = shown.sentence;
      if (entry.display === 'collapsed') vault.drop(entry.itemId);
      counters = { ...counters, stateChanges: counters.stateChanges + 1 };
      publish(entry);
    });
  };

  const ingest = (envelope: WidgetEnvelope): IngestOutcome => {
    if (seen.has(envelope.widget_id)) return { ingested: 'duplicate' };
    const predecessorId = envelope.lifecycle.supersedes_widget_id;
    const predecessor =
      typeof predecessorId === 'string'
        ? [...entries.values()].find((e) => e.place === 'timeline' && e.envelope.widget_id === predecessorId)
        : undefined;
    seen.add(envelope.widget_id);
    if (typeof predecessorId === 'string') seen.add(predecessorId);

    if (predecessor !== undefined) {
      cancelWork(predecessor);
      const next = prepare(predecessor.itemId, envelope, 'timeline');
      Object.assign(predecessor, {
        envelope,
        view: next.view,
        verdict: next.verdict,
        result: next.result,
        display: next.display,
        sentence: next.sentence,
        emission: predecessor.emission + 1,
      });
      if (predecessor.display === 'collapsed') vault.drop(predecessor.itemId);
      scheduleExpiry(predecessor);
      deps.timeline.replaceWidget(itemView(predecessor));
      return { ingested: 'replaced', itemId: predecessor.itemId, verdict: predecessor.verdict };
    }

    const itemId = nextItemId('timeline');
    const next = prepare(itemId, envelope, 'timeline');
    const entry: Entry = {
      itemId,
      place: 'timeline',
      envelope,
      view: next.view,
      verdict: next.verdict,
      result: next.result,
      display: next.display,
      pending: null,
      sentence: next.sentence,
      inflight: null,
      expiry: null,
      emission: 0,
    };
    entries.set(itemId, entry);
    if (entry.display === 'collapsed') vault.drop(itemId);
    scheduleExpiry(entry);
    deps.timeline.appendWidget(itemView(entry));
    return { ingested: 'added', itemId, verdict: entry.verdict };
  };

  /** detail item id → the timeline item whose control opened it. */
  const detailOpeners = new Map<string, string>();

  const openDetail = (envelope: WidgetEnvelope, opener: DetailOpener): { readonly itemId: string; readonly result: RenderResult } | null => {
    const itemId = nextItemId('detail');
    const next = prepare(itemId, envelope, 'detail');
    const entry: Entry = {
      itemId,
      place: 'detail',
      envelope,
      view: next.view,
      verdict: next.verdict,
      result: next.result,
      display: next.display,
      pending: null,
      sentence: next.sentence,
      inflight: null,
      expiry: null,
      emission: 0,
    };
    entries.set(itemId, entry);
    detailOpeners.set(itemId, opener.itemId);
    scheduleExpiry(entry);
    return { itemId, result: entry.result };
  };

  /**
   * End an activation in a sentence. On a timeline item the item carries it. On a detail, the detail
   * closes (focus returns to its opener) and the opener's timeline item carries it (§1.5D).
   */
  const endInSentence = (entry: Entry, sentence: WidgetSentence, submitted: boolean): ActivationOutcome => {
    const carrier = entry.place === 'timeline' ? entry : entries.get(detailOpeners.get(entry.itemId) ?? '');
    if (entry.place === 'detail') deps.chrome.closeDetail();
    if (carrier !== undefined && entries.get(carrier.itemId) === carrier) {
      carrier.sentence = sentence;
      publish(carrier);
    }
    counters = { ...counters, sentences: counters.sentences + 1 };
    return { outcome: 'sentence', sentence, submitted };
  };

  /** Where a NAVIGATE/HANDOFF target may go; null when it may be submitted. */
  const targetRefusal = (entry: Entry, intent: WidgetIntent): 'route_refused' | 'opens_detail' | null => {
    if (intent.effect !== 'NAVIGATE' && intent.effect !== 'HANDOFF') return null;
    const target = intent.target;
    if (target === null || typeof target !== 'object') return 'route_refused';
    const resolved = resolveTarget(target);
    switch (target.class) {
      case 'detail': {
        // R3.3.4: the envelope's own detail, one of the nine keys, never from inside a detail.
        const own = entry.envelope.presentation.fullscreen_detail?.route_key;
        const allowed = intent.effect === 'NAVIGATE' && entry.place === 'timeline' && resolved.kind === 'detail' && typeof own === 'string' && own === target.ref;
        return allowed ? 'opens_detail' : 'route_refused';
      }
      case 's':
        return resolved.kind === 'base' || resolved.kind === 'handoff' ? null : 'route_refused';
      default:
        // 'w', 'i', 'c' re-resolve server-side; a HANDOFF may only name a shell destination (R3.3.3).
        return intent.effect === 'HANDOFF' ? 'route_refused' : null;
    }
  };

  const activate = async (itemId: string, ref: InteractiveRefKey): Promise<ActivationOutcome> => {
    const entry = entries.get(itemId);
    if (entry === undefined) return { outcome: 'ignored', reason: 'unknown_item' };
    const drawn = entry.display === 'collapsed' ? [] : entry.result.readingOrder;
    if (!drawn.includes(ref)) return { outcome: 'ignored', reason: 'not_drawn' };
    // One activation in flight per item; the busy control is already drawn as pending.
    if (entry.pending !== null) return { outcome: 'ignored', reason: 'in_flight' };
    counters = { ...counters, activations: counters.activations + 1 };

    const intentRef = intentRefFor(entry.result.nodes, ref);
    const intent = intentRef === null ? undefined : entry.envelope.intents.find((i) => i.intent_ref === intentRef);
    if (intent === undefined) return endInSentence(entry, 'activation_unavailable', false);

    // F60: the RICH_INTERACTIVE escape is local. Nothing is sent, whatever else the intent carries.
    if (intent.effect === 'NONE') {
      cancelWork(entry);
      vault.drop(entry.itemId);
      entry.display = 'collapsed';
      entry.sentence = null;
      counters = { ...counters, stateChanges: counters.stateChanges + 1 };
      if (entry.place === 'detail') deps.chrome.closeDetail();
      else publish(entry);
      return { outcome: 'dismissed' };
    }

    if (!isUsable(intent)) return endInSentence(entry, 'activation_unavailable', false);
    const route = targetRefusal(entry, intent);
    if (route === 'route_refused') return endInSentence(entry, 'route_refused', false);
    const token = vault.get(entry.itemId, intent.intent_ref);
    if (token === null) return endInSentence(entry, 'activation_unavailable', false);

    const inputs = inputsForActivation(intent, ref);
    if (inputs === undefined) return endInSentence(entry, 'activation_unavailable', false);
    const submission: WidgetIntentSubmission = {
      contract: 'maya.widget.intent.submission/1',
      widget_id: entry.envelope.widget_id,
      intent_token: token,
      inputs,
      client_nonce: deps.newNonce(),
      profile_id: entry.envelope.render.profile_id,
    };

    const emission = entry.emission;
    const abort = deps.newAbort();
    entry.inflight = abort;
    entry.pending = ref;
    entry.sentence = null;
    publish(entry);
    if (route === 'opens_detail') deps.chrome.openProgress({ itemId: entry.itemId, ref });
    counters = { ...counters, submissions: counters.submissions + 1 };

    let outcome: SubmissionOutcome;
    try {
      outcome = await deps.submission.submit(submission, abort.signal);
    } catch {
      outcome = { status: 'unexpected_response' };
    }

    if (route === 'opens_detail') deps.chrome.closeProgress(entry.itemId);
    // The item left, or its emission was replaced, while the submission ran: that change is what
    // the screen shows, and there is nothing left to put a sentence on.
    if (entries.get(entry.itemId) !== entry || entry.emission !== emission || entry.inflight !== abort) {
      counters = { ...counters, stateChanges: counters.stateChanges + 1 };
      return { outcome: 'ignored', reason: 'unknown_item' };
    }
    entry.inflight = null;
    entry.pending = null;
    if (outcome.status === 'advanced') {
      const ingested = ingest(outcome.envelope);
      if (ingested.ingested === 'duplicate') return endInSentence(entry, 'activation_unavailable', true);
      counters = { ...counters, stateChanges: counters.stateChanges + 1 };
      return { outcome: 'dismissed' };
    }
    if (outcome.status === 'settled') {
      for (const line of outcome.lines) deps.timeline.appendServerLine(line.text);
      entry.display = 'terminal';
      entry.sentence = null;
      publish(entry);
      counters = { ...counters, stateChanges: counters.stateChanges + 1 };
      return { outcome: 'dismissed' };
    }
    if (outcome.status === 'accepted') {
      entry.display = 'terminal';
      entry.sentence = null;
      publish(entry);
      counters = { ...counters, stateChanges: counters.stateChanges + 1 };
      return { outcome: 'dismissed' };
    }
    return endInSentence(entry, sentenceFor(outcome), true);
  };

  const offEnvironment = deps.environment.onA11yChange(() => {
    for (const entry of entries.values()) {
      entry.result = renderEntry(entry.view, entry.verdict, entry.place);
      publish(entry);
    }
  });

  const offDropped = deps.timeline.onDropped((ids, reason) => {
    for (const id of ids) release(id);
    // A cleared conversation (sign-out) is a new one: what it receives next is drawn afresh.
    if (reason === 'cleared') seen.clear();
  });

  return {
    ingest,
    activate,
    openDetail,
    releaseDetail(itemId) {
      if (entries.get(itemId)?.place !== 'detail') return;
      release(itemId);
      detailOpeners.delete(itemId);
    },
    hasTimelineItem: (itemId) => entries.get(itemId)?.place === 'timeline',
    lockSources: () => [...entries.values()].filter((e) => e.display === 'live' || e.display === 'stale').map((e) => e.envelope),
    counters: () => counters,
    heldTokens: () => vault.size(),
    dispose() {
      offEnvironment();
      offDropped();
      for (const id of [...entries.keys()]) release(id);
      vault.clear();
      seen.clear();
      detailOpeners.clear();
    },
  };
};
