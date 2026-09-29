// The ONLY module in this bundle that writes an `href` (N-3, V2-15).
//
// The build names this exact path as the sole href owner — `HREF_OWNER = 'src/reply-link.tsx'` in
// build.mjs — and refuses the attribute in every other file. That is the whole mechanism: one
// module, one check, and a ratchet that makes the rule unforgeable rather than a convention.
//
// Re-typed from dom/timeline.ts:117-157 rather than imported, because `src/dom/**` is outside the
// published runtime package. 🔴 That duplication is the hazard here: a scheme check that exists in
// two places can drift in one of them. So the regexes are transcribed character for character, and
// test/reply-link.test.mjs pins the behaviour against the shell's own fixture, which deliberately
// carries `javascript:` and `data:` strings alongside the three admissible schemes.
//
// Everything that is not one of those three stays TEXT. A reply is model output: it is exactly the
// kind of string that must never become a live target on trust.

const HTTPS_HREF = /^https:\/\/[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?(?::\d{1,5})?(?:[/?#][^\s<>"'`\\]*)?$/u;
const TEL_HREF = /^tel:\+?\d[\d()-]{2,31}$/;
const MAILTO_HREF = /^mailto:[\p{L}\p{N}._%+-]+@[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?$/u;
const LINK_CANDIDATE = /(?:https:\/\/|tel:|mailto:)[^\s<>"'`]+/gu;
const TRAILING_PUNCTUATION = /[.,;:!?»)\]]+$/u;
const BOUNDARY_BEFORE = /[\s(«"']$/u;

/** True only for an https:, tel: or mailto: target with nothing that could smuggle a scheme or markup. */
export const isReplyHref = (candidate: string): boolean =>
  HTTPS_HREF.test(candidate) || TEL_HREF.test(candidate) || MAILTO_HREF.test(candidate);

export type ReplySegment =
  | { readonly link: false; readonly text: string }
  | { readonly link: true; readonly text: string };

/** A reply split into text and link candidates that pass `isReplyHref`. Everything else is text. */
export const replySegments = (reply: string): ReplySegment[] => {
  const out: ReplySegment[] = [];
  let at = 0;
  for (const match of reply.matchAll(LINK_CANDIDATE)) {
    const start = match.index;
    const before = reply.slice(0, start);
    // A candidate must start at a word boundary: `xhttps://…` inside a longer token is not a link.
    if (start > 0 && !BOUNDARY_BEFORE.test(before)) continue;
    const candidate = match[0].replace(TRAILING_PUNCTUATION, '');
    if (!isReplyHref(candidate)) continue;
    if (start > at) out.push({ link: false, text: reply.slice(at, start) });
    out.push({ link: true, text: candidate });
    at = start + candidate.length;
  }
  if (at < reply.length) out.push({ link: false, text: reply.slice(at) });
  return out;
};

/** A reply's text, with checked targets as anchors and everything else as text nodes. */
export function ReplyText({ reply, accent }: { readonly reply: string; readonly accent: string }) {
  const segments = replySegments(reply);
  if (segments.length === 1 && !segments[0]?.link) return <>{reply}</>;
  return (
    <>
      {segments.map((segment, i) =>
        segment.link ? (
          <a
            key={i}
            href={segment.text}
            rel="noopener noreferrer"
            target={segment.text.startsWith('https:') ? '_blank' : undefined}
            className="reply-link"
            style={{ color: accent, textDecoration: 'underline' }}
          >
            {segment.text}
          </a>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}
