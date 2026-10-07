// The explicit A11 shell.privacy HANDOFF. Memory-only retry identity; backend re-resolves
// authority on every attempt. No chat intent, optimistic completion, timer or auto retry.
import type { HistoryErasureRequest, HistoryErasureCompletion, HistoryErasureFailure, Outcome } from '../net/types.ts';
import type { AbortHandle, Conversation, ConversationErasureTarget } from './conversation.ts';
import type { PrivacyPort, PrivacyView, SessionPort, Transport } from './ports.ts';

export interface Privacy extends PrivacyPort { dispose(): void }

export const createPrivacy = (deps: {
  readonly transport: Pick<Transport, 'eraseConversation'>;
  readonly session: Pick<SessionPort, 'view' | 'subscribe'>;
  readonly conversation: Pick<Conversation, 'erasureTarget' | 'freezeForErasure' | 'finishErasure' | 'subscribe'>;
  readonly beforeFreeze: () => void;
  readonly newAbort: () => AbortHandle;
  readonly newId: () => string;
}): Privacy => {
  let signedIn = deps.session.view().signedIn;
  let sessionEpoch = 0;
  let localEpoch = 0;
  let phase: PrivacyView['phase'] = 'idle';
  let failure: PrivacyView['failure'] = null;
  let erasedAt: string | null = null;
  let candidate: ConversationErasureTarget | null = null;
  let operation: { readonly request: HistoryErasureRequest; readonly sessionEpoch: number; abort: AbortHandle | null } | null = null;
  const listeners = new Set<(view: PrivacyView) => void>();
  const snapshot = (): PrivacyView => ({
    phase, localEpoch, failure, erasedAt,
    available: signedIn && operation === null && deps.transport.eraseConversation !== undefined && deps.conversation.erasureTarget() !== null,
  });
  let current = snapshot();
  const emit = (): void => {
    current = snapshot();
    for (const listener of [...listeners]) listener(current);
  };

  const send = (): void => {
    const owned = operation;
    const erase = deps.transport.eraseConversation;
    if (!signedIn || !owned || owned.abort !== null || !erase) return;
    const abort = deps.newAbort();
    owned.abort = abort;
    phase = 'erasing';
    failure = null;
    emit();
    // Subscribers are synchronous. A replacement login during publication must not
    // send the old target using the new session, even if a transport ignores abort.
    if (operation !== owned || !signedIn || owned.sessionEpoch !== sessionEpoch || abort.signal.aborted) return;
    const settle = (result: Outcome<HistoryErasureCompletion, HistoryErasureFailure>): void => {
      if (!signedIn || operation !== owned || owned.sessionEpoch !== sessionEpoch || owned.abort !== abort || abort.signal.aborted) return;
      owned.abort = null;
      if (result.ok && result.value.requestId === owned.request.requestId && result.value.conversationId === owned.request.conversationId) {
        phase = 'completed';
        erasedAt = result.value.erasedAt;
        operation = null;
        deps.conversation.finishErasure();
      } else if (!result.ok && result.failure.reason !== 'unknown') {
        phase = 'refused';
        failure = result.failure.reason;
      } else {
        // Lost response may follow a committed erase. Preserve the EXACT tuple until a
        // verified completion or session loss, and keep old actions/new turns frozen.
        phase = 'uncertain';
      }
      emit();
    };
    try {
      erase(owned.request, abort.signal).then(settle, () => settle({ ok: false, failure: { reason: 'unknown' } }));
    } catch { settle({ ok: false, failure: { reason: 'unknown' } }); }
  };

  const offConversation = deps.conversation.subscribe(() => {
    // The completion describes only the erased conversation. Once a new server-owned
    // conversation exists, do not present that old receipt as its deletion status.
    if (phase === 'completed' && deps.conversation.erasureTarget() !== null) {
      phase = 'idle';
      erasedAt = null;
    }
    emit();
  });
  const offSession = deps.session.subscribe(view => {
    const wasSignedIn = signedIn;
    signedIn = view.signedIn;
    if (wasSignedIn && !signedIn) {
      sessionEpoch += 1;
      const abort = operation?.abort;
      operation = null;
      candidate = null;
      phase = 'idle';
      failure = null;
      erasedAt = null;
      localEpoch += 1;
      abort?.abort();
    }
    emit();
  });

  return {
    view: () => current,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    requestConfirmation() {
      if (!snapshot().available) return;
      candidate = deps.conversation.erasureTarget();
      phase = 'confirming';
      failure = null;
      erasedAt = null;
      emit();
    },
    cancelConfirmation() {
      if (phase !== 'confirming') return;
      candidate = null;
      phase = 'idle';
      emit();
    },
    confirmErasure() {
      if (phase !== 'confirming' || !signedIn || operation !== null || candidate === null || !deps.transport.eraseConversation) return;
      const target = candidate;
      candidate = null;
      const actual = deps.conversation.erasureTarget();
      if (actual?.conversationId !== target.conversationId || actual.generation !== target.generation) { phase = 'idle'; emit(); return; }
      // Reserve the immutable identity BEFORE notifying voice, forms or conversation
      // subscribers. They may synchronously end this session and start another one.
      const owned = { request: Object.freeze({ conversationId: target.conversationId, requestId: deps.newId() }), sessionEpoch, abort: null };
      operation = owned;
      phase = 'erasing';
      localEpoch += 1;
      const active = (): boolean => operation === owned && signedIn && owned.sessionEpoch === sessionEpoch;
      // Close personal forms and cancel voice before any await. The conversation clear
      // releases ALL widget entries, vault tokens and callbacks through its drop protocol.
      deps.beforeFreeze();
      if (!active()) return;
      const frozen = deps.conversation.freezeForErasure(target);
      if (!active()) return;
      if (!frozen) { operation = null; phase = 'idle'; emit(); return; }
      send();
    },
    retry() { if (phase === 'uncertain') send(); },
    dispose() {
      offConversation();
      offSession();
      const abort = operation?.abort;
      operation = null;
      candidate = null;
      abort?.abort();
      listeners.clear();
    },
  };
};
