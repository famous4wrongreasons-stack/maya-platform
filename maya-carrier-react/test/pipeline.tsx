// The proof harness's entry: the canonical pipeline, plus the React drawer rendered to a string.
//
// This file lives OUTSIDE src/, so it is not part of the shipped bundle and not walked by the gate.
// It is allowed to reach for the runtime the same way src/ does — the modules below are all
// published members of @maya/runtime.

import { renderToStaticMarkup } from 'react-dom/server';
import { project } from '../../maya-chat-shell/src/shell/view.ts';
import { verify } from '../../maya-chat-shell/src/integrity/h7.ts';
import { render } from '../../maya-chat-shell/src/renderer/render.ts';
import { ReceiptRefresh } from '../src/widgets/ReceiptRefresh.tsx';
import { WidgetCard } from '../src/widgets/WidgetCard.tsx';
import { tokens, companionTokens } from '../src/identity/tokens.ts';

const A11Y = {
  reduced_motion: false,
  forced_colors: false,
  text_scale: 1,
  pointer: 'fine',
  keyboard_only_hint: false,
  caption_preference: false,
} as const;

/** envelope → the sealed RenderResult, exactly as the shell computes it. */
export function resultOf(envelope: unknown, nowIso: string, density?: string) {
  const anyEnvelope = envelope as never;
  const view = project(anyEnvelope);
  const verdict = verify(anyEnvelope, nowIso);
  return render({
    view,
    verdict,
    env: A11Y,
    density: (density ?? view.presentation.density) as never,
  });
}

/** The React drawer's markup for one item. */
export function markupOf(item: unknown, dark = true): string {
  return renderToStaticMarkup(
    <WidgetCard item={item as never} t={tokens(dark)} activate={() => undefined} />,
  );
}

export function companionMarkup(item: unknown): string {
  const unexpected = () => { throw Error('Decoration must not invoke authority'); };
  return renderToStaticMarkup(<WidgetCard item={item as never} t={companionTokens()}
    activate={unexpected} rendered={unexpected} refreshBookingReceipt={unexpected} />);
}

/** SSR must never activate an intent or initiate even a receipt READ. */
export function receiptRefreshMarkup(item: unknown, withCallback = true): string {
  const unexpected = () => { throw new Error('Rendering called a runtime operation'); };
  return renderToStaticMarkup(
    <WidgetCard
      item={item as never}
      t={tokens(true)}
      activate={unexpected}
      {...(withCallback ? { refreshBookingReceipt: unexpected } : {})}
    />,
  );
}

export { project, verify, render };

// Explicit occupancy proof: the current conversation owner and wire projectors,
// not a replacement timeline. These exports are test-only.
export { createConversation } from '../../maya-chat-shell/src/shell/conversation.ts';
export { projectChat, projectConversationHistory } from '../../maya-chat-shell/src/net/project.ts';

// The carrier's sole href owner, and the shell's original, side by side. The test compares them.
export { isReplyHref, replySegments } from '../src/reply-link.tsx';
import { ReplyText as ReplyTextLocal } from '../src/reply-link.tsx';
export {
  isReplyHref as shellIsReplyHref,
  replySegments as shellReplySegments,
} from '../../maya-chat-shell/src/dom/timeline.ts';

export function replyMarkup(reply: string): string {
  return renderToStaticMarkup(<ReplyTextLocal reply={reply} accent="#0A84FF" />);
}

// The carrier's voice encoder and capture port, beside the shell's originals.
export {
  encodeWavPcm16Mono16k,
  wavDataUrl,
  base64Encode,
  WAV_HEADER_BYTES,
  WAV_SAMPLE_RATE,
} from '../src/voice/wav.ts';
export {
  encodeWavPcm16Mono16k as shellEncodeWav,
  wavDataUrl as shellWavDataUrl,
} from '../../maya-chat-shell/src/voice/wav.ts';
export { createCapture, MIME_CANDIDATES, CAPTURE_CONSTRAINTS } from '../src/voice/capture.ts';

// The fullscreen detail sheet, rendered without any port.
import { DetailSheet } from '../src/widgets/DetailSheet.tsx';
export function detailMarkup(view: unknown, dark = true, companion = false): string {
  return renderToStaticMarkup(
    <DetailSheet
      view={view as never}
      t={companion ? companionTokens() : tokens(dark)}
      activate={() => undefined}
      close={() => undefined}
      focusFallback={() => undefined}
    />,
  );
}

export function restoredReceiptMarkup(item: unknown): string {
  return renderToStaticMarkup(<ReceiptRefresh item={item as never} t={tokens(true)} refreshBookingReceipt={() => { throw Error('Passive rendering must not read'); }} />);
}

export { companionContext, MayaCompanion } from '../src/identity/MayaCompanion.tsx';
export { companionTokens } from '../src/identity/tokens.ts';
export { OwnTasksPanel } from '../src/chat/OwnTasksPanel.tsx';

export { WorkspaceReadsPanel } from '../src/chat/WorkspaceReadsPanel.tsx';

export { IdeasPanel } from '../src/chat/IdeasPanel.tsx';
export { CompanionNavigation } from '../src/chat/CompanionNavigation.tsx';

export { CompanionHeader } from '../src/chat/CompanionHeader.tsx';
export { VoiceSheet } from '../src/chat/VoiceSheet.tsx';
