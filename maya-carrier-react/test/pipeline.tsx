// The proof harness's entry: the canonical pipeline, plus the React drawer rendered to a string.
//
// This file lives OUTSIDE src/, so it is not part of the shipped bundle and not walked by the gate.
// It is allowed to reach for the runtime the same way src/ does — the modules below are all
// published members of @maya/runtime.

import { renderToStaticMarkup } from 'react-dom/server';
import { project } from '../../maya-chat-shell/src/shell/view.ts';
import { verify } from '../../maya-chat-shell/src/integrity/h7.ts';
import { render } from '../../maya-chat-shell/src/renderer/render.ts';
import { WidgetCard } from '../src/widgets/WidgetCard.tsx';
import { tokens } from '../src/identity/tokens.ts';

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

export { project, verify, render };

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
