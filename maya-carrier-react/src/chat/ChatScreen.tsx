// The canonical MAYA chat screen, over the headless runtime.
//
// The M5 carrier originated in app.html:21176-22335. Companion v1 (2026-10-11 owner package)
// updates its visual leaves; the Aurora fixture remains available for semantic comparison.
// This screen renders a `ConversationView`
// published by the runtime, and hands gestures back through `ConversationPort`. It owns no message
// list, mints no request id, assembles no history, and decides nothing.
//
// Specifically, and on purpose:
//   * whether the composer may send is `view.composer`, never derived from the session;
//   * one turn at a time is the runtime's `inflight` guard — the local check is cosmetic;
//   * a failed turn is retried with `conversation.retry(id)`, never by re-submitting the text,
//     which would mint a new request id and defeat the de-duplication;
//   * `submitUserTurn` returning `accepted: true` means the turn was QUEUED. It is not success,
//     and nothing here draws a tick from it — the turn's fate arrives as `state` in the next view;
//   * assistant text has exactly two writers, both server-side. There is no optimistic bubble.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type {
  ConversationView,
  TimelineItemView,
} from '../../../maya-chat-shell/src/shell/ports.ts';
import { ideas, workspaceReads, ownTasks, conversation, goodsPhoto, privacy, session, telegramLink, voice, widgets } from '../runtime/compose.ts';
import { usePortView } from '../runtime/useView.ts';
import { IdeasPanel } from './IdeasPanel.tsx';
import { WorkspaceReadsPanel } from './WorkspaceReadsPanel.tsx';
import { OwnTasksPanel } from './OwnTasksPanel.tsx';
import { ReceiptRefresh } from '../widgets/ReceiptRefresh.tsx';
import { WidgetCard } from '../widgets/WidgetCard.tsx';
import { FullscreenDetail } from '../widgets/FullscreenDetail.tsx';
import {
  COLD_START_HINT,
  composerReason,
  failureBase,
  NEW_TURN_NOTE,
  COMPOSER_LIMIT,
  noticeSentence,
  refusalSentence,
  secondsLeft,
  THINKING,
  formatElapsed,
  voiceActionLabel,
  voiceStatusSentence,
} from '../runtime/copy.ts';
import { Backdrop } from '../identity/Backdrop.tsx';
import { MayaMark, MayaMarkAnimated, MayaVolumeMark } from '../identity/MayaMark.tsx';
import { MAYA_ACCENT, MAYA_ACCENT_ON, type Tokens } from '../identity/tokens.ts';
import { ReplyText } from '../reply-link.tsx';
import { TelegramLinkPanel } from './TelegramLinkPanel.tsx';
import { PrivacyPanel } from './PrivacyPanel.tsx';
import { GoodsPhotoPanel } from './GoodsPhotoPanel.tsx';
import { GoodsPhotoSheet } from './GoodsPhotoSheet.tsx';
import { CompanionHeader } from './CompanionHeader.tsx';
import { CompanionNavigation, type CompanionSection } from './CompanionNavigation.tsx';
import { VoiceSheet } from './VoiceSheet.tsx';
import { useCompanion } from '../identity/MayaCompanion.tsx';

/** The reading face MAYA's own words are set in (app.html:21307). */
const READING = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
/**
 * The chrome face. Canonically `DISPLAY` and `BODY` are BOTH "'Montserrat', sans-serif"
 * (app.html:1954-1955), served locally from fonts.css. Montserrat is NOT shipped here: the carrier
 * may load no external resource, and the owner deferred the ~820 KB payload as its own decision.
 * The stack therefore falls through to the platform face — the tracking and sizes below are the
 * owner's, the letterforms are not.
 */
const DISPLAY = READING;

/** dom/timeline.ts:44 — the distance from the end within which the lane sticks to the end. */
const STICK_TO_END_PX = 96;

/**
 * A timeline item id, or none yet. Named rather than written inline: the carrier's closed-tag
 * scanner reads raw text, so a lowercase type argument — `useRef<string | null>` — matches its tag
 * pattern and refuses the build. An uppercase alias is unambiguous to both readers.
 */
type ItemId = string | null;
type DivOrNone = HTMLDivElement | null;
type TextAreaOrNone = HTMLTextAreaElement | null;
type ElementOrNone = HTMLElement | null;
/** Why a submit was refused before anything left the device, or none. */
type Refusal = 'empty' | 'too_long' | 'in_flight' | 'composer_disabled' | null;

/**
 * app.html:21254 — the thinking state, docked above the composer, never inside the lane.
 *
 * Decoration only. dom/timeline.ts keeps ONE permanently-mounted `role="status"` node and writes
 * into it; a status region created and destroyed with the state it describes is announced
 * unreliably, and two of them announce twice. So the dots are `aria-hidden` and the sentence lives
 * in the permanent node below the lane.
 */
function TypingDots({ dark }: { readonly dark: boolean }) {
  return (
    <div
      className={'maya-typing' + (dark ? '' : ' maya-typing-light')}
      aria-hidden="true"
      style={{ padding: '4px 2px' }}
    >
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </div>
  );
}

/**
 * dom/timeline.ts:228-232 — a failed turn that may be retried "in N seconds" re-renders on a
 * self-scheduled timer computed to land on the NEXT WHOLE SECOND. A plain 1 000 ms interval drifts
 * and double-fires on the boundary, which is why the shell does not use one either.
 */
function useCountdownClock(view: ConversationView): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let soonest: number | null = null;
    for (const item of view.items) {
      if (item.kind !== 'user' || item.state !== 'failed') continue;
      if (item.retry.retry !== 'same_request' || item.retry.notBefore === null) continue;
      if (soonest === null || item.retry.notBefore < soonest) soonest = item.retry.notBefore;
    }
    if (soonest === null) return;
    const at = Date.now();
    if (soonest <= at) return;
    const left = Math.ceil((soonest - at) / 1000);
    const wait = Math.max(1, Math.min(1000, soonest - at - (left - 1) * 1000));
    const handle = window.setTimeout(() => setNow(Date.now()), wait);
    return () => window.clearTimeout(handle);
  }, [view, now]);
  return now;
}

/** Shell chrome — a notice, a widget sentence, the cold-start hint. Never model history (P-11). */
function ChromeLine({
  t,
  text,
  recover,
}: {
  readonly t: Tokens;
  readonly text: string;
  // Named `recover`, not `action`: the sink rule matches `\baction\s*=`, so even `action ===`
  // refuses. The shell's own drawer writes `rowAction` for the same reason.
  readonly recover?: { readonly label: string; readonly onPress: () => void };
}) {
  return (
    <div
      style={{
        margin: '4px 0 14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        fontFamily: READING,
        fontSize: 13,
        lineHeight: '19px',
        letterSpacing: '-0.005em',
        textAlign: 'center',
        color: t.dark ? 'rgba(244,240,235,0.52)' : 'rgba(11,11,12,0.52)',
      }}
    >
      <span>{text}</span>
      {recover === undefined ? null : (
        <button
          type="button"
          onClick={recover.onPress}
          style={{
            appearance: 'none',
            border: '0',
            background: 'transparent',
            padding: '4px 8px',
            font: 'inherit',
            color: MAYA_ACCENT,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {recover.label}
        </button>
      )}
    </div>
  );
}

function Row({
  item,
  t,
  now,
  focusComposer,
}: {
  readonly item: TimelineItemView;
  readonly t: Tokens;
  readonly now: number;
  readonly focusComposer: () => void;
}) {
  const dark = t.dark;
  const companion = t.name === 'companion';

  if (item.kind === 'notice')
    return (
      <ChromeLine
        t={t}
        text={noticeSentence(item.notice)}
        // dom/timeline.ts:269-275 — the ONE notice that carries a control, because it is the one
        // that is otherwise a dead end: the session is real but has no business, so nothing the
        // person types can work until they sign in again. `SessionPort.signOut` already exists;
        // no capability is invented here.
        {...(item.notice === 'tenant_required'
          ? { recover: { label: 'Выйти', onPress: () => void session.signOut() } }
          : null)}
      />
    );

  // A server-authored card. It sits on MAYA's side of the lane and inside MAYA's turn — the card
  // IS the container, which is why MAYA's words still have none.
  //
  // `widgets.activate(id, ref)` returns void on purpose: the outcome is discarded at the port. What
  // happened arrives as the next view.
  if (item.kind === 'widget')
    return (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          gap: 7,
          marginBottom: 14,
          minWidth: 0,
        }}
      >
        <div style={{ width: '100%', minWidth: 0, flex: '1 1 100%' }}>
          <WidgetCard item={item} t={t} activate={widgets.activate} rendered={widgets.rendered} refreshBookingReceipt={widgets.refreshBookingReceipt} />
        </div>
      </div>
    );

  const user = item.kind === 'user';
  const failed = item.kind === 'user' && item.state === 'failed' && item.failure !== null;
  const left = item.kind === 'user' ? secondsLeft(item.retry, now) : 0;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: user ? 'flex-end' : 'flex-start',
        gap: 7,
        marginBottom: 14,
        minWidth: 0,
      }}
    >
      <div
        data-chat-message={user ? 'user' : 'maya'}
        style={{
          position: 'relative',
          zIndex: 1,
          width: user ? 'fit-content' : '100%',
          maxWidth: companion ? '95%' : user ? '78%' : '100%',
          minWidth: 0,
          flex: user ? '0 1 auto' : '1 1 100%',
          transformOrigin: user ? 'right center' : 'left center',
        }}
      >
        {/* Companion package uses two message surfaces; authority and text remain unchanged. */}
        <div
          style={{
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            borderRadius: companion ? (user ? '24px 24px 7px 24px' : '24px 24px 24px 7px') : user ? 20 : 0,
            padding: companion ? '17px 18px' : user ? '10px 15px' : 0,
            background: companion ? (user ? '#DCEEFF' : '#F1F2F3') : user ? (dark ? '#2A2A2C' : '#ECEAE5') : 'transparent',
            opacity: item.kind === 'user' && item.state === 'sending' ? 0.62 : 1,
            transition: 'opacity .18s ease',
          }}
        >
          <div
            style={{
              fontFamily: user ? DISPLAY : READING,
              fontSize: companion ? 16 : user ? 15 : 17,
              lineHeight: companion ? 1.42 : user ? '22px' : '25px',
              letterSpacing: user ? 0 : '-0.01em',
              fontWeight: 400,
              color: t.ink,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {/* Without a speaker, a screen reader hears one undifferentiated stream of turns. */}
            <span className="vh">{user ? 'Вы: ' : 'MAYA: '}</span>
            {/* Only MAYA's words are scanned for targets; the person's own text is never linkified. */}
            {user ? item.text : <ReplyText reply={item.text} accent={t.accent} />}
            {item.kind === 'user' && item.modality === 'spoken' ? (
              <>
                {' '}
                <span role="img" aria-label="голосом">
                  ◉
                </span>
              </>
            ) : null}
          </div>
        </div>

        {item.kind === 'assistant' ? <ReceiptRefresh item={item} t={t} refreshBookingReceipt={widgets.refreshBookingReceipt} /> : null}

        {/* dom/timeline.ts:224-246 — the failure line, with the runtime's own retry wording. */}
        {failed && item.kind === 'user' && item.failure !== null ? (
          <div
            style={{
              marginTop: 6,
              textAlign: 'right',
              fontFamily: READING,
              fontSize: 12,
              lineHeight: '17px',
              color: dark ? 'rgba(244,240,235,0.6)' : 'rgba(11,11,12,0.6)',
            }}
          >
            {item.retry.retry === 'same_request' && left > 0 ? (
              <span>{`${failureBase(item.failure)} — повторить можно через ${left} с`}</span>
            ) : item.retry.retry === 'same_request' ? (
              <span>
                {`${failureBase(item.failure)} — `}
                <button
                  type="button"
                  aria-label="Повторить отправку"
                  onClick={() => {
                    conversation.retry(item.id);
                    // The button is replaced by a sending state the moment this runs; without
                    // moving focus deliberately it lands on <body> and a keyboard user is lost.
                    focusComposer();
                  }}
                  style={{
                    appearance: 'none',
                    border: '0',
                    background: 'transparent',
                    padding: 0,
                    font: 'inherit',
                    color: MAYA_ACCENT,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  повторить
                </button>
              </span>
            ) : item.retry.retry === 'new_turn_only' ? (
              <span>{`${failureBase(item.failure)}. ${NEW_TURN_NOTE}`}</span>
            ) : (
              <span>{`${failureBase(item.failure)}.`}</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ChatScreen({
  t,
  view,
  role = 'Администратор',
  status = 'онлайн',
}: {
  readonly t: Tokens;
  readonly view: ConversationView;
  readonly role?: string;
  readonly status?: string;
}) {
  const dark = t.dark;
  const companion = t.name === 'companion';
  const [draft, setDraft] = useState('');
  const [composerHeight, setComposerHeight] = useState(50);
  const [refused, setRefused] = useState<Refusal>(null);
  const [editing, setEditing] = useState(false);
  const hasDraft = draft.trim().length > 0;
  const noteId = useId();
  const tooLong = draft.length > COMPOSER_LIMIT;

  const focusComposer = useCallback(() => {
    const input = composerRef.current;
    if (input && !input.readOnly) input.focus({ preventScroll: true });
  }, []);
  const now = useCountdownClock(view);
  const privacyView = usePortView(privacy);
  const telegramLinkView = usePortView(telegramLink);
  const goodsPhotoView = usePortView(goodsPhoto);
  const shellView = usePortView(widgets);
  const privacyOpen = shellView.primary === 'shell.privacy';
  const workspaceOpen = companion && shellView.workspace !== undefined;
  const tasksOpen = companion && shellView.workspace === 'tasks';
  const readsOpen = companion && (shellView.workspace === 'feed' || shellView.workspace === 'library');
  const ideasOpen = companion && shellView.workspace === 'ideas';
  const ideasView = usePortView(ideas);
  const readsView = usePortView(workspaceReads);
  const tasksView = usePortView(ownTasks);
  const voiceView = usePortView(voice);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  useEffect(() => {
    if (voiceView.state === 'idle' && voiceView.notice === null) setVoiceSheetOpen(false);
  }, [voiceView.state, voiceView.notice]);
  const sessionView = usePortView(session);
  const navigationVisible = companion && shellView.primary === 'shell.root' && shellView.fullscreen === null && goodsPhotoView.phase === 'closed';
  const mascot = useCompanion(view, draft, voiceView);
  const listening = voiceView.state === 'listening' || voiceView.state === 'held';
  const micLive = listening || voiceView.state === 'recording';
  const micUsable = view.composer.enabled && (voiceView.state === 'idle' || listening);
  const micEngaged = listening || voiceView.state === 'recording' || voiceView.state === 'arming';

  const laneRef = useRef<DivOrNone>(null);
  const composerRef = useRef<TextAreaOrNone>(null);
  const focusedRef = useRef<ElementOrNone>(null);
  const stickRef = useRef(true);
  const newestUserRef = useRef<ItemId>(null);
  const awaitingRef = useRef<{ itemId: string; text: string } | null>(null);
  const localEpochRef = useRef(privacyView.localEpoch);
  const workspaceReturnScroll = useRef(0);
  const workspaceWasOpen = useRef(false);
  const ideasReturnScroll = useRef(0);
  const ideasWasOpen = useRef(false);
  const ideasDetailOpen = ideasOpen && (ideasView.detail !== null || ideasView.reading);

  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (lane) {
      if (workspaceOpen) lane.scrollTop = 0;
      else if (workspaceWasOpen.current) lane.scrollTop = workspaceReturnScroll.current;
    }
    workspaceWasOpen.current = workspaceOpen;
  }, [workspaceOpen, shellView.workspace]);

  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (lane && ideasOpen) {
      if (ideasDetailOpen) lane.scrollTop = 0;
      else if (ideasWasOpen.current) lane.scrollTop = ideasReturnScroll.current;
    }
    ideasWasOpen.current = ideasDetailOpen;
  }, [ideasDetailOpen, ideasOpen]);

  // Freeze/sign-out invalidates local drafts and DOM selection before the next paint.
  // The epoch is only a clearing signal; the runtime owns erasure and its result.
  useLayoutEffect(() => {
    if (localEpochRef.current === privacyView.localEpoch) return;
    localEpochRef.current = privacyView.localEpoch;
    awaitingRef.current = null;
    focusedRef.current = null;
    newestUserRef.current = null;
    stickRef.current = true;
    setDraft('');
    setRefused(null);
    composerRef.current?.setSelectionRange(0, 0);
    composerRef.current?.blur();
    window.getSelection()?.removeAllRanges();
  }, [privacyView.localEpoch]);

  useLayoutEffect(() => {
    if (privacyOpen) laneRef.current?.focus({ preventScroll: true });
  }, [privacyOpen]);

  useLayoutEffect(() => {
    const input = composerRef.current;
    if (!input) return;
    const measure = () => {
      if (input.clientWidth === 0) return; // A workspace hides, but does not replace, the draft.
      input.style.height = '0px';
      const height = Math.max(50, Math.min(138, input.scrollHeight));
      input.style.height = `${height}px`;
      setComposerHeight(height);
    };
    measure();
    if (!companion) return;
    // Placeholder and draft can wrap on rotation without a keystroke. Observe width only:
    // reacting to our own height write would create a ResizeObserver feedback loop.
    let width = -1;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (next <= 0 || next === width) return;
      width = next;
      measure();
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [draft, companion]);

  const canSend = view.composer.enabled && !view.inFlight && hasDraft;

  const send = useCallback(() => {
    const text = draft;
    // Cosmetic only. The authority is the runtime's own refusal set — `empty`, `too_long`,
    // `in_flight`, `composer_disabled` — decided inside submitUserTurn against state this screen
    // cannot see. Keeping only this check would allow a double-send whenever the snapshot is stale.
    if (!view.composer.enabled || view.inFlight) return;
    const outcome = conversation.submitUserTurn(text, { modality: 'typed' });
    // `accepted: true` means QUEUED. Nothing is drawn from it. A refusal is the runtime telling the
    // person why nothing left the device — dropping it on the floor, as this did before, makes a
    // pressed Send look like a message that vanished.
    if (outcome.accepted) {
      setRefused(null);
      awaitingRef.current = { itemId: outcome.itemId, text };
      return;
    }
    setRefused(outcome.refusal);
  }, [draft, view]);

  // dom/composer.ts:141-150 — the draft clears when the turn is SENT, not when it is submitted, and
  // only if the person has not typed something else meanwhile. On a failure the text stays in the
  // field: losing it is exactly what the shell refuses to do.
  //
  // Note the two exits, and only these two: the turn reached `sent`, or the item is gone. `failed`
  // is deliberately NOT one of them — the turn is still awaited, so when a same-request retry
  // finally succeeds the draft clears then. Treating `failed` as an exit leaves the text stranded
  // in the field after a successful retry, which is what this code did before it was measured.
  useEffect(() => {
    const pending = awaitingRef.current;
    if (pending === null) return;
    const entry = view.items.find((row) => row.id === pending.itemId);
    if (entry === undefined) {
      awaitingRef.current = null;
      return;
    }
    if (entry.kind !== 'user' || entry.state !== 'sent') return;
    awaitingRef.current = null;
    setDraft((current) => (current === pending.text ? '' : current));
  }, [view]);

  // dom/timeline.ts:309-338 — stick to the end, and ALWAYS follow the person's own new turn even
  // if they had scrolled up.
  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (lane === null || workspaceOpen) return;
    let newest: ItemId = null;
    for (const item of view.items) if (item.kind === 'user') newest = item.id;
    const ownTurn = newest !== null && newest !== newestUserRef.current;
    newestUserRef.current = newest;
    if (ownTurn || stickRef.current) lane.scrollTop = lane.scrollHeight;
  }, [view, workspaceOpen]);

  // dom/timeline.ts captures the focused element before it redraws and restores it after. React
  // reconciliation will not: when the element holding focus is removed — a retry button becoming a
  // sending state, a widget collapsing — focus silently falls to <body>. Catch that and put it
  // somewhere deliberate.
  useLayoutEffect(() => {
    const previous = focusedRef.current;
    const active = document.activeElement;
    focusedRef.current = active instanceof HTMLElement ? active : null;
    if (previous === null || document.contains(previous)) return;
    const frame = window.requestAnimationFrame(focusComposer);
    return () => window.cancelAnimationFrame(frame);
  }, [view, focusComposer]);

  const onLaneScroll = useCallback(() => {
    const lane = laneRef.current;
    if (lane === null || workspaceOpen) return;
    stickRef.current = lane.scrollHeight - lane.scrollTop - lane.clientHeight <= STICK_TO_END_PX;
  }, [workspaceOpen]);

  const openWorkspace = (section: Exclude<CompanionSection, 'chat'>) => {
    if (shellView.workspace === section) return;
    if (!workspaceOpen) workspaceReturnScroll.current = laneRef.current?.scrollTop ?? 0;
    composerRef.current?.blur();
    voice.cancel();
    if (section === 'feed') workspaceReads.openFeed();
    else if (section === 'library') workspaceReads.openLibrary();
    else if (section === 'tasks') ownTasks.open();
    else ideas.open();
  };
  const chooseSection = (section: CompanionSection) => {
    if (section !== 'chat') { openWorkspace(section); return; }
    widgets.navigate('shell.root');
    // Returning to the conversation need not summon the mobile keyboard.
    window.requestAnimationFrame(() => laneRef.current?.focus({ preventScroll: true }));
  };
  const scheduleEnabled = navigationVisible && view.composer.enabled && !view.inFlight && voiceView.state === 'idle' && !voiceSheetOpen;
  const askSchedule = () => {
    if (!scheduleEnabled) return;
    // A visible user question through the sole conversation writer. The server owns date,
    // source, permissions and any NAVIGATE detail; this shortcut cannot mint a calendar.
    const outcome = conversation.submitUserTurn('Покажи расписание на сегодня', { modality: 'typed' });
    if (!outcome.accepted) { setRefused(outcome.refusal); return; }
    setRefused(null);
    // Do not claim awaitingRef: this turn did not originate in the composer's draft, even
    // when that draft happens to contain exactly the same question.
    chooseSection('chat');
  };

  return (
    <div className={companion ? 'maya-companion-chat' + (editing ? ' is-editing' : '') : undefined}
      onFocusCapture={event => setEditing(event.target instanceof HTMLElement && event.target.matches('input,textarea,select'))}
      onBlurCapture={event => setEditing(event.relatedTarget instanceof HTMLElement && event.relatedTarget.matches('input,textarea,select'))}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: t.bg }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Backdrop t={t} />
      </div>

      <section
        aria-label="Разговор с MAYA"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {companion ? <CompanionHeader
          current={privacyOpen ? 'privacy' : navigationVisible ? shellView.workspace ?? 'chat' : null}
          openChat={() => chooseSection('chat')}
          tenantName={sessionView.signedIn ? sessionView.display.tenantName : null}
          userName={sessionView.signedIn ? sessionView.display.userName : null}
          askSchedule={askSchedule} scheduleEnabled={scheduleEnabled} openPrivacy={() => widgets.navigate('shell.privacy')}
          openPhoto={() => { widgets.navigate('shell.root'); goodsPhoto.open(); }}
          openIdeas={() => openWorkspace('ideas')}
          openTasks={() => openWorkspace('tasks')}
          openFeed={() => openWorkspace('feed')}
          openLibrary={() => openWorkspace('library')} photoEnabled={view.composer.enabled && !view.inFlight}
          state={mascot.state} event={mascot.event} greet={mascot.greet}
        /> : (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 18px 16px',
            background: 'transparent',
            pointerEvents: 'none',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            {/*
              app.html:21523-21541. Mark, name and status are collected into ONE floating pill so
              that, as the lane scrolls, they do not read as part of the first message. The pill is
              filled with the brand blue in BOTH themes — so the glass edge and the inner highlight
              were removed: they belonged to the light glass and read as a foreign frame on a fill.
            */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 16px 8px 14px',
                borderRadius: 999,
                minWidth: 0,
                maxWidth: '100%',
                background: t.accent,
                border: '0',
                boxShadow: '0 8px 22px rgba(10,132,255,.38)',
              }}
            >
              <div
                aria-hidden="true"
                style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: MAYA_ACCENT_ON }}
              >
                <MayaMark size={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 500,
                    fontSize: 12.5,
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                    color: MAYA_ACCENT_ON,
                  }}
                >
                  Maya
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span
                    className="maya-status-dot"
                    style={{ width: 5, height: 5, flex: '0 0 5px', borderRadius: 999, background: 'rgba(255,255,255,.8)' }}
                  />
                  <span
                    style={{
                      fontFamily: DISPLAY,
                      fontSize: 9,
                      letterSpacing: '.16em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: 'rgba(255,255,255,.8)',
                    }}
                  >
                    {role} · {status}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-pressed={privacyOpen}
            onClick={() => widgets.navigate('shell.privacy')}
            style={{ pointerEvents: 'auto', maxWidth: 130, padding: '9px 12px', border: '1px solid', borderRadius: 12, background: t.bg, color: t.ink, fontFamily: READING, fontSize: 12, lineHeight: '17px', cursor: 'pointer' }}
          >
            Приватность и данные
          </button>
        </div>
        )}

        {/* app.html:21647-21658 — the one scroller. 84px clears the header, 212px the composer. */}
        {/*
          dom/timeline.ts:177-181 — the lane IS the live region: one permanent polite log with a
          name. Without it an assistant reply is never announced, and the region cannot be reached
          by landmark navigation. A widget's own aria-live nests inside and overrides it, which is
          how a blocking limitation still announces assertively inside a polite log.
        */}
        <div
          className="maya-chat-lane"
          ref={laneRef}
          tabIndex={privacyOpen || companion ? -1 : undefined}
          onScroll={onLaneScroll}
          role={privacyOpen || workspaceOpen ? 'region' : 'log'}
          aria-live={privacyOpen || workspaceOpen ? 'off' : 'polite'}
          aria-label={privacyOpen ? 'Приватность' : ideasOpen ? 'Идеи' : tasksOpen ? 'Мои задачи' : readsOpen ? readsView.workspace === 'feed' ? 'Лента' : 'Библиотека' : 'Сообщения'}
          style={{
            flex: 1,
            minHeight: 0,
            boxSizing: 'border-box',
            overflow: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            padding: companion
              ? `calc(var(--maya-chat-header-height, 150px) + 8px) 14px calc(env(safe-area-inset-bottom, 0px) + ${workspaceOpen ? 16 : composerHeight + 62}px + ${navigationVisible ? 'var(--maya-navigation-space, 0px)' : '0px'})`
              : `calc(env(safe-area-inset-top, 0px) + 84px) 18px calc(env(safe-area-inset-bottom, 0px) + ${composerHeight + 62}px)`,
          }}
        >
          {ideasOpen ? <IdeasPanel view={ideasView} port={{ ...ideas, read: key => { ideasReturnScroll.current = laneRef.current?.scrollTop ?? 0; return ideas.read(key); } }} close={() => { ideas.close(); window.requestAnimationFrame(focusComposer); }} /> : readsOpen ? <WorkspaceReadsPanel key={shellView.workspace} view={readsView} port={workspaceReads} close={() => { workspaceReads.close(); window.requestAnimationFrame(focusComposer); }} /> : tasksOpen ? <OwnTasksPanel view={tasksView} port={ownTasks} close={() => { ownTasks.close(); window.requestAnimationFrame(focusComposer); }} /> : privacyOpen ? (
            <>
            <TelegramLinkPanel view={telegramLinkView} t={t} start={() => void telegramLink.start()} cancel={() => telegramLink.cancel()} />
            <PrivacyPanel
              view={privacyView}
              t={t}
              requestConfirmation={() => privacy.requestConfirmation()}
              cancelConfirmation={() => privacy.cancelConfirmation()}
              confirmErasure={() => void privacy.confirmErasure()}
              retry={() => void privacy.retry()}
              signOut={() => void session.signOut()}
              close={() => {
                if (privacyView.phase === 'confirming') privacy.cancelConfirmation();
                widgets.navigate('shell.root');
              }}
            />
            </>
          ) : (
            <>
              {view.items.length === 0 ? <ChromeLine t={t} text={COLD_START_HINT} /> : null}
              {view.items.map((item) => (
                <Row key={item.id} item={item} t={t} now={now} focusComposer={focusComposer} />
              ))}
              {companion ? null : <GoodsPhotoPanel view={goodsPhotoView} port={goodsPhoto} disabled={!view.composer.enabled || view.inFlight} t={t} />}
            </>
          )}
        </div>

        {/*
          app.html:21766-21775 — the voice orb: SMALL and low over the bar, so the conversation
          stays visible behind it. The canonical condition was hands-free or recording; here it is
          the states where the person is actually engaged with the microphone.
        */}
        {micEngaged && !companion ? (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 'calc(134px + env(safe-area-inset-bottom, 0px))',
              zIndex: 4,
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'center',
              padding: '2px 0 10px',
              pointerEvents: 'none',
              transition: 'opacity .14s ease, transform .3s cubic-bezier(.4,0,.2,1)',
            }}
          >
            <div style={{ color: t.ink, display: 'flex' }}>
              <MayaMarkAnimated size={36} mode="listen" state="recording" level={voiceView.level / 3} />
            </div>
          </div>
        ) : null}

        {/*
          dom/timeline.ts:183-187 — ONE status node, mounted always and written into. Mounting it
          with the state it describes is the classic way to have it never announced at all.
        */}
        <p className="vh" role="status">
          {view.inFlight ? THINKING : ''}
        </p>

        {/* The voice machine's own polite announcement; `unavailable` echoes the runtime's Cell. */}
        <p className="vh" role="status">
          {voiceStatusSentence(voiceView)}
        </p>
        {companion ? <VoiceSheet open={voiceSheetOpen} view={voiceView} enabled={view.composer.enabled && !view.inFlight} port={voice}
          close={() => { voice.cancel(); setVoiceSheetOpen(false); }}
          focusFallback={() => laneRef.current?.focus({ preventScroll: true })} /> : null}

        {/* app.html:21759-21762 — the footer overlays the lane; only the pill takes pointer events. */}
        <div className="maya-chat-composer-dock" hidden={workspaceOpen}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: navigationVisible ? 'var(--maya-navigation-space, 0px)' : 0,
            zIndex: 5,
            display: workspaceOpen ? 'none' : 'flex',
            flexDirection: 'column',
            pointerEvents: 'none',
          }}
        >
          {view.inFlight ? (
            <div
              data-maya-thinking-dock="true"
              style={{
                position: 'relative',
                zIndex: 3,
                width: '100%',
                minHeight: 24,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                padding: '0 20px 3px',
                pointerEvents: 'none',
              }}
            >
              <TypingDots dark={dark} />
            </div>
          ) : null}

          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 8,
              position: 'relative',
              padding: '8px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
              background: 'transparent',
              pointerEvents: 'auto',
            }}
          >
            {/* app.html:21806-21823 — the soft ground, so messages under the bar do not compete. */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                top: -40,
                pointerEvents: 'none',
                zIndex: 0,
                background: companion ? 'linear-gradient(to top, #fff 0%, rgba(255,255,255,.96) 65%, rgba(255,255,255,0) 100%)' : dark
                  ? 'linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.88) 38%, rgba(0,0,0,0.45) 68%, rgba(0,0,0,0) 100%)'
                  : 'linear-gradient(to top, rgba(244,240,235,0.99) 0%, rgba(244,240,235,0.92) 38%, rgba(244,240,235,0.5) 68%, rgba(244,240,235,0) 100%)',
              }}
            />

            {refused === null || refusalSentence(refused) === null ? null : (
              <p
                id={noteId}
                role="status"
                style={{
                  position: 'relative',
                  zIndex: 1,
                  margin: 0,
                  padding: '0 6px',
                  fontFamily: READING,
                  fontSize: 12,
                  lineHeight: '17px',
                  color: dark ? 'rgba(244,240,235,0.68)' : 'rgba(11,11,12,0.68)',
                }}
              >
                {refused === null ? '' : refusalSentence(refused)}
              </p>
            )}

            <div style={{ position: 'relative', zIndex: 1, width: '100%', height: composerHeight + 2 }}>

              <div
                className="maya-composer-pill"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: companion ? 2 : 6,
                  width: '100%',
                  height: '100%',
                  minHeight: 52,
                  borderRadius: 26,
                  boxSizing: 'border-box',
                  background: companion ? 'rgba(255,255,255,.92)' : dark ? 'rgba(18,18,20,0.98)' : 'rgba(252,249,244,0.98)',
                  border: '1px solid ' + (dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'),
                  boxShadow: companion ? 'inset 0 2px 2px #fff, 0 7px 25px #34394407' : dark
                    ? '0 12px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)'
                    : '0 12px 28px rgba(24,22,15,0.14), inset 0 1px 0 rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(32px) saturate(1.2)',
                  WebkitBackdropFilter: 'blur(32px) saturate(1.2)',
                  padding: companion ? '0 5px' : '0 8px 0 17px',
                  overflow: 'hidden',
                }}
              >
                {/*
                  Canonically an <input type="text">. The carrier's closed tag set has no `input` —
                  the shell reaches one only through a separate, type-restricted door — so this is a
                  single-row <textarea> styled to the same metrics. Disclosed, not hidden.

                  `readOnly` + `aria-disabled` rather than `disabled`, so the reason stays reachable
                  to a screen reader instead of the control vanishing from the tab order.
                */}
                {companion ? <button type="button" className="companion-compose-control" aria-label="Товар по фото накладной"
                  disabled={!view.composer.enabled || view.inFlight} onClick={() => goodsPhoto.open()}><span aria-hidden="true">+</span></button> : null}
                {listening ? (
                  // app.html:21830-21836 — while listening the field IS the status: a pulsing dot,
                  // the elapsed time in tabular figures so it does not jitter, and the one hint
                  // that says how to finish. `level` is the runtime's 0..3, shown as it is sampled.
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      height: 50,
                    }}
                  >
                    <span
                      className="maya-rec-dot"
                      aria-hidden="true"
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 999,
                        background: dark ? '#f4f0eb' : '#18160f',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: DISPLAY,
                        fontSize: 14,
                        color: t.ink,
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Слушаю… {formatElapsed(voiceView.elapsedMs)}
                    </span>
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontFamily: READING,
                        fontSize: 10.5,
                        color: dark ? 'rgba(244,240,235,0.4)' : 'rgba(24,22,15,0.4)',
                        paddingRight: 6,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ещё раз — отправить
                    </span>
                  </div>
                ) : null}
                <label className="vh" htmlFor={noteId + '-input'}>
                  Сообщение для MAYA
                </label>
                <textarea
                  id={noteId + '-input'}
                  ref={composerRef}
                  rows={1}
                  value={draft}
                  readOnly={!view.composer.enabled}
                  aria-disabled={!view.composer.enabled}
                  aria-describedby={refused === null ? undefined : noteId}
                  aria-invalid={tooLong ? 'true' : undefined}
                  placeholder={
                    view.composer.enabled ? 'Сообщение Maya…' : composerReason(view.composer.reason)
                  }
                  autoComplete="off"
                  enterKeyHint="send"
                  onChange={(event) => {
                    if (!view.composer.enabled) return;
                    setDraft(event.target.value);
                    setRefused(null);
                  }}
                  onKeyDown={(event) => {
                    // dom/composer.ts:171 — BOTH IME guards. An Enter during composition is the IME
                    // accepting a candidate, not the person sending.
                    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                    if (event.key !== 'Enter') return;
                    if (event.shiftKey) return;
                    event.preventDefault();
                    if (event.altKey || event.ctrlKey || event.metaKey) return;
                    send();
                  }}
                  style={{
                    flex: listening ? '0 0 0px' : 1,
                    minWidth: 0,
                    width: listening ? 0 : '100%',
                    height: composerHeight,
                    opacity: listening ? 0 : 1,
                    border: 'none',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    background: 'transparent',
                    padding: '14px 4px',
                    boxSizing: 'border-box',
                    margin: 0,
                    resize: 'none',
                    overflowY: 'auto',
                    fontFamily: DISPLAY,
                    fontSize: 16,
                    lineHeight: '22px',
                    color: t.ink,
                    outline: 'none',
                  }}
                />

                {/*
                  app.html:21855 — a round blue ground, the same asymmetric MAYA wave, in white; the
                  ground inverts while recording, as it did canonically. One control: tap to record,
                  tap again to send, exactly the owner's «Нажмите — запись, ещё раз — отправить».

                  The proof is minted from the NATIVE event and freshly, every time. React's
                  SyntheticEvent has a different timeStamp basis, and the runtime spends a proof by
                  object identity — a memoised one silently does nothing the second time.
                */}
                <button
                  type="button"
                  disabled={!view.composer.enabled}
                  aria-disabled={micUsable ? undefined : 'true'}
                  aria-label={voiceActionLabel(voiceView.state)}
                  title={voiceActionLabel(voiceView.state)}
                  onClick={(event) => {
                    const native = event.nativeEvent;
                    if (!micUsable || native.isTrusted !== true) return;
                    const proof = {
                      isTrusted: true as const,
                      type: 'click' as const,
                      timeStamp: native.timeStamp,
                    };
                    if (companion) setVoiceSheetOpen(true);
                    if (voiceView.state === 'idle') voice.arm(proof);
                    else voice.send(proof);
                  }}
                  style={{
                    width: companion ? 44 : 36,
                    height: companion ? 44 : 36,
                    borderRadius: 999,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '0',
                    padding: 0,
                    background: micLive ? t.ink : companion ? 'transparent' : t.accent,
                    color: micLive ? t.bg : companion ? t.ink : t.accentOn,
                    opacity: micUsable ? 1 : 0.38,
                    cursor: micUsable ? 'pointer' : 'default',
                    touchAction: 'none',
                    transform: micLive ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform .16s ease, background .16s ease',
                  }}
                >
                  {companion ? <span className="companion-mic-icon" aria-hidden="true" /> : <MayaVolumeMark size={18} />}
                </button>

                {/* app.html:21861-21863 */}
                <button
                  type="button"
                  aria-label="Отправить"
                  disabled={!view.composer.enabled}
                  aria-disabled={!canSend}
                  onClick={() => send()}
                  style={{
                    width: companion ? 44 : 36,
                    height: companion ? 44 : 36,
                    borderRadius: 999,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '0',
                    padding: 0,
                    cursor: canSend ? 'pointer' : 'default',
                    background: t.accent,
                    color: MAYA_ACCENT_ON,
                    boxShadow: companion ? 'none' : '0 6px 16px rgba(10,132,255,.4)',
                    opacity: view.inFlight ? 0.5 : canSend ? 1 : 0.55,
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 600 }}>↑</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        {navigationVisible ? <CompanionNavigation current={shellView.workspace ?? 'chat'} choose={chooseSection} /> : null}
      </section>

      {/* The detail sheet lives beside the conversation, not inside its scroller. */}
      <FullscreenDetail t={t} focusFallback={focusComposer} />
      {companion ? <GoodsPhotoSheet view={goodsPhotoView} port={goodsPhoto} disabled={!view.composer.enabled || view.inFlight} t={t}
        focusFallback={() => laneRef.current?.focus({ preventScroll: true })} /> : null}
    </div>
  );
}
