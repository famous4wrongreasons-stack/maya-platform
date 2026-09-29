// K5 — the DOM-typed half of the ports, split out of `ports.ts` so the runtime can be proved
// headless.
//
// These four declarations are the ONLY DOM types outside `dom/` and `entry/`. They name
// `HTMLElementTagNameMap`, `HTMLInputElement`, `Text` and `HTMLElement`, so any module that reads
// them needs the DOM lib — which is exactly why they cannot live beside the runtime ports.
//
// `tsconfig.headless.json` type-checks `shell/` and `net/` with `lib: ["ES2022","WebWorker"]` and
// EXCLUDES this file. A worker has fetch, AbortSignal, crypto and timers but no `HTMLElement`, so
// the runtime gets every platform global it legitimately uses and a DOM UI type in it is a build
// error. That is the ratchet the React presentation carrier will rest on: once the view layer is
// React, this file and `dom/` are the only places a document may be named.
//
// Types only; this module emits no runtime bytes.

// ── the element factory (N-3, V2-15) ───────────────────────────────────────────────────────────

/**
 * The CLOSED tag set. No element that can initiate a request by itself is a member: no `img`,
 * `picture`, `source`, `video`, `audio`, `iframe`, `frame`, `object`, `embed`, `form`, `link`,
 * `script`, `style`, `base`, `meta`, `svg` or `math`. A non-member tag is a type error.
 */
export type DomTag =
  | 'div'
  | 'span'
  | 'p'
  | 'section'
  | 'article'
  | 'header'
  | 'footer'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'ul'
  | 'ol'
  | 'li'
  | 'button'
  | 'textarea'
  | 'label'
  | 'nav'
  | 'main'
  | 'dialog'
  | 'table'
  | 'caption'
  | 'thead'
  | 'tbody'
  | 'tr'
  | 'th'
  | 'td'
  | 'time'
  | 'output'
  | 'a';

/** Inputs exist for the sign-in fields only — never `image`, `file` or `submit`. */
export type DomInputType = 'text' | 'email' | 'password';

export interface DomFactory {
  create<T extends DomTag>(tag: T): HTMLElementTagNameMap[T];
  createInput(type: DomInputType): HTMLInputElement;
  text(value: string): Text;
}

/** What `entry/` hands every `dom/` module: the one mount root and the factory. Nothing else. */
export interface DomPort {
  readonly root: HTMLElement;
  readonly factory: DomFactory;
}
