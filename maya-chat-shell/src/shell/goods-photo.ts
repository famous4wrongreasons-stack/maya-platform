// One ephemeral, explicit photo line review. No storage, model or automatic matching.
import type { GoodsPhotoFailureReason, GoodsPhotoFile, GoodsPhotoItem, GoodsPhotoLine, GoodsPhotoReviewFields, GoodsPhotoResponse, GoodsPhotoTransport, GoodsPhotoFailure, GoodsPhotoProposal, GoodsSearchMatch, Outcome } from '../net/types.ts';
import type { AbortHandle, Conversation } from './conversation.ts';
import type { PrivacyPort, SessionPort } from './ports.ts';
export type { GoodsPhotoFailureReason, GoodsPhotoFile, GoodsPhotoItem, GoodsPhotoLine, GoodsPhotoReviewFields, GoodsSearchMatch } from '../net/types.ts';

export interface GoodsPhotoView {
  readonly phase: 'closed' | 'photo' | 'preview' | 'matches' | 'detail' | 'reviewed' | 'uncertain';
  readonly busy: null | 'upload' | 'search' | 'detail' | 'review';
  readonly localEpoch: number;
  readonly failure: GoodsPhotoFailureReason | null;
  readonly lines: readonly GoodsPhotoLine[];
  readonly selectedLine: number | null;
  readonly query: string;
  readonly matches: readonly GoodsSearchMatch[];
  readonly mayHaveMore: boolean;
  readonly item: GoodsPhotoItem | null;
  readonly review: GoodsPhotoReviewFields;
  readonly reviewStatus: 'approval_required' | 'completed' | 'held' | null;
}
export interface GoodsPhotoPort {
  view(): GoodsPhotoView;
  subscribe(listener: (view: GoodsPhotoView) => void): () => void;
  open(): void;
  upload(photo: GoodsPhotoFile): Promise<void>;
  selectLine(sourceLine: number): void;
  editQuery(query: string): void;
  search(query?: string): Promise<void>;
  selectItem(id: string): Promise<void>;
  editReview(fields: Partial<GoodsPhotoReviewFields>): void;
  review(): Promise<void>;
  abort(): void;
  dispose(): void;
}

export interface GoodsPhotoDeps {
  readonly transport: Partial<GoodsPhotoTransport>;
  readonly conversation: Pick<Conversation, 'view' | 'runGoodsPhotoOperation'>;
  readonly session: Pick<SessionPort, 'view' | 'subscribe'>;
  readonly privacy: Pick<PrivacyPort, 'view' | 'subscribe'>;
  readonly newAbort: () => AbortHandle;
  readonly newId: () => string;
}
const blankReview = (): GoodsPhotoReviewFields => ({ storeId: '', quantity: '', unitId: '', unitCost: '', currency: '', receivedAt: '', priceKind: '' });
const empty = (localEpoch: number, phase: GoodsPhotoView['phase'] = 'closed'): GoodsPhotoView => ({ phase, localEpoch, busy: null, failure: null, lines: [], selectedLine: null, query: '', matches: [], mayHaveMore: false, item: null, review: blankReview(), reviewStatus: null });
const unavailable = (): Outcome<GoodsPhotoResponse, GoodsPhotoFailure> => ({ ok: false, failure: { reason: 'unavailable' } });

/** No bytes, source witness or request identity escape this closure. Every lookup is a gesture. */
export function createGoodsPhoto(deps: GoodsPhotoDeps): GoodsPhotoPort {
  let current = empty(0), generation = 0, disposed = false;
  let flight: AbortHandle | null = null;
  let photoSha256: string | null = null, sourceRevision: string | null = null;
  // A known prepared version is advanced only following an explicit correction and review tap.
  const prepared = new Map<number, { version: number; fingerprint: string; dirty: boolean }>();
  const listeners = new Set<(view: GoodsPhotoView) => void>();
  const set = (patch: Partial<GoodsPhotoView>): void => {
    current = { ...current, ...patch };
    for (const listener of [...listeners]) listener(current);
  };
  const reset = (phase: GoodsPhotoView['phase'] = 'closed'): void => {
    generation += 1;
    const previous = flight; flight = null;
    photoSha256 = null; sourceRevision = null; prepared.clear();
    current = empty(current.localEpoch + 1, phase);
    previous?.abort();
    set({});
  };
  const allowed = (): boolean => !disposed && flight === null && current.busy === null && current.phase !== 'uncertain' && current.reviewStatus !== 'held' && current.reviewStatus !== 'completed' && deps.session.view().signedIn && deps.conversation.view().composer.enabled && !deps.conversation.view().inFlight;
  const context = (conversationId: string | undefined) => ({ requestId: deps.newId(), ...(conversationId === undefined ? {} : { conversationId }) });
  const run = async (busy: NonNullable<GoodsPhotoView['busy']>, kind: GoodsPhotoResponse['kind'], work: Parameters<Conversation['runGoodsPhotoOperation']>[1], pending: Partial<GoodsPhotoView> = {}): Promise<GoodsPhotoResponse | null> => {
    const abort = deps.newAbort(), activeGeneration = generation;
    flight = abort; set({ ...pending, busy, failure: null });
    if (disposed || generation !== activeGeneration || flight !== abort || abort.signal.aborted) return null;
    let outcome: Outcome<GoodsPhotoResponse, GoodsPhotoFailure>;
    try { outcome = await deps.conversation.runGoodsPhotoOperation(kind, work, abort.signal); }
    catch { outcome = { ok: false, failure: { reason: kind === 'review' ? 'unknown' : 'unavailable' } }; }
    if (disposed || generation !== activeGeneration || flight !== abort || abort.signal.aborted) return null;
    flight = null;
    if (!outcome.ok) {
      set({ busy: null, failure: outcome.failure.reason, ...(kind === 'review' && outcome.failure.reason === 'unknown' ? { phase: 'uncertain' as const } : {}) });
      return null;
    }
    if (outcome.value.kind !== kind) {
      set({ busy: null, failure: kind === 'review' ? 'unknown' : 'unavailable', ...(kind === 'review' ? { phase: 'uncertain' as const } : {}) });
      return null;
    }
    // Keep the view locked until the caller atomically publishes its result. A subscriber must
    // never see an idle gap in which it can clear or replace a still-unapplied private response.
    return outcome.value;
  };
  let privacyEpoch = deps.privacy.view().localEpoch;
  const offPrivacy = deps.privacy.subscribe(view => { if (view.localEpoch !== privacyEpoch) { privacyEpoch = view.localEpoch; reset(); } });
  let signedIn = deps.session.view().signedIn;
  const offSession = deps.session.subscribe(view => { const was = signedIn; signedIn = view.signedIn; if (was && !signedIn) reset(); });
  return {
    view: () => current,
    subscribe(listener) { listeners.add(listener); return () => void listeners.delete(listener); },
    open() { if (allowed() && current.phase === 'closed') reset('photo'); },
    async upload(photo) {
      if (!allowed() || current.phase !== 'photo') return;
      const activeGeneration = generation;
      const result = await run('upload', 'preview', (_conversationId, signal) => deps.transport.goodsPhotoPreview?.(photo, signal) ?? Promise.resolve(unavailable()));
      if (result?.kind !== 'preview' || disposed || generation !== activeGeneration) return;
      photoSha256 = result.photoSha256; sourceRevision = result.sourceRevision;
      set({ busy: null, phase: 'preview', lines: result.lines });
    },
    selectLine(sourceLine) {
      if (!allowed() || !photoSha256 || !current.lines.some(line => line.sourceLine === sourceLine) || current.selectedLine === sourceLine) return;
      set({ phase: 'preview', selectedLine: sourceLine, query: '', matches: [], mayHaveMore: false, item: null, review: blankReview(), reviewStatus: null, failure: null, localEpoch: current.localEpoch + 1 });
    },
    editQuery(query) {
      if (!allowed() || current.selectedLine === null || typeof query !== 'string' || query.length > 100 || query === current.query) return;
      set({ query, phase: 'preview', matches: [], mayHaveMore: false, item: null, review: blankReview(), reviewStatus: null, failure: null });
    },
    async search(query) {
      if (!allowed() || current.selectedLine === null || !sourceRevision) return;
      const raw = query ?? current.query;
      if (typeof raw !== 'string' || raw.length > 100 || /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(raw) || raw.trim().length < 2) { set({ failure: 'invalid_request' }); return; }
      const searched = raw.trim().replace(/\s+/gu, ' '), witness = sourceRevision;
      const activeGeneration = generation;
      const result = await run('search', 'search', (conversationId, signal) => deps.transport.goodsPhotoSearch?.({ ...context(conversationId), query: searched, source_revision: witness }, signal) ?? Promise.resolve(unavailable()), { query: searched, phase: 'preview', matches: [], mayHaveMore: false, item: null, review: blankReview(), reviewStatus: null });
      if (result?.kind !== 'search' || disposed || generation !== activeGeneration) return;
      set({ busy: null, phase: 'matches', matches: result.matches, mayHaveMore: result.mayHaveMore });
    },
    async selectItem(id) {
      if (!allowed() || !sourceRevision || !current.matches.some(match => match.kind === 'item' && match.id === id)) return;
      const witness = sourceRevision;
      const activeGeneration = generation;
      const result = await run('detail', 'item', (conversationId, signal) => deps.transport.goodsPhotoItem?.({ ...context(conversationId), goods_id: id, source_revision: witness }, signal) ?? Promise.resolve(unavailable()), { item: null, review: blankReview(), reviewStatus: null });
      if (result?.kind !== 'item' || disposed || generation !== activeGeneration) return;
      set({ busy: null, phase: 'detail', item: result.item });
    },
    editReview(fields) {
      if (!allowed() || current.item?.itemKind !== 'physical' || current.selectedLine === null || !fields || typeof fields !== 'object') return;
      const keys = ['storeId', 'quantity', 'unitId', 'unitCost', 'currency', 'receivedAt', 'priceKind'] as const;
      const next = { ...current.review };
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(fields, key), value = descriptor && 'value' in descriptor ? descriptor.value : undefined;
        if (value === undefined) continue;
        if (typeof value !== 'string' || value.length > 100 || (key === 'priceKind' && value !== '' && value !== 'receipt_purchase_unit')) return;
        if (key === 'priceKind') next.priceKind = value as GoodsPhotoReviewFields['priceKind'];
        else next[key] = value;
      }
      if (keys.every(key => next[key] === current.review[key])) return;
      const previous = prepared.get(current.selectedLine);
      if (previous) previous.dirty = true;
      set({ phase: 'detail', review: next, reviewStatus: null, failure: null });
    },
    async review() {
      if (!allowed() || !photoSha256 || !sourceRevision || current.selectedLine === null || current.item?.itemKind !== 'physical') return;
      const fields = current.review, line = current.selectedLine, previous = prepared.get(line);
      const knownUnit = (fields.unitId === current.item.saleUnitId && current.item.saleUnitLabel !== null) || (fields.unitId === current.item.writeOffUnitId && current.item.writeOffUnitLabel !== null);
      if (!knownUnit || fields.priceKind !== 'receipt_purchase_unit' || Object.values(fields).some(value => value.trim().length === 0)) { set({ failure: 'invalid_request' }); return; }
      const proposal: GoodsPhotoProposal = { goods_id: current.item.id, store_id: fields.storeId, quantity: fields.quantity, unit_id: fields.unitId, unit_cost: fields.unitCost, currency: fields.currency, price_kind: fields.priceKind, received_at: fields.receivedAt, photo_sha256: photoSha256, source_line: line, review_version: previous ? previous.version + 1 : 1 };
      const fingerprint = JSON.stringify({ ...proposal, review_version: 0 });
      if (previous && (!previous.dirty || previous.fingerprint === fingerprint)) return;
      if (proposal.review_version > 20) { set({ failure: 'conflict' }); return; }
      const witness = sourceRevision;
      const activeGeneration = generation;
      const result = await run('review', 'review', (conversationId, signal) => deps.transport.goodsPhotoReview?.({ ...context(conversationId), proposal, source_revision: witness }, signal) ?? Promise.resolve(unavailable()));
      if (result?.kind !== 'review' || disposed || generation !== activeGeneration) return;
      prepared.set(line, { version: proposal.review_version, fingerprint, dirty: false });
      set({ busy: null, phase: 'reviewed', reviewStatus: result.status });
    },
    abort() { if (!disposed) reset(); },
    dispose() { if (disposed) return; disposed = true; offPrivacy(); offSession(); reset(); listeners.clear(); },
  };
}
