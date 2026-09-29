// The widget card's palette.
//
// Ported verbatim from `meWidgetTheme(t, dark)` in the canonical app.html:16265 — the one function
// every one of the owner's widget cards reads. It is the reason those cards look like one family,
// and it is why nothing here is invented: the card border, its ground, the inverted primary button
// and the muted body text are the owner's values, not a new scheme chosen for this unit.
//
// `BODYF`/`DISPF` are both Montserrat canonically and both fall through to the platform face here,
// the same disclosed substitution the chat makes.

import type { Tokens } from './tokens.ts';

export interface WidgetTheme {
  readonly ink: string;
  readonly muted: string;
  readonly faint: string;
  readonly line: string;
  readonly line2: string;
  readonly surf: string;
  readonly surf2: string;
  readonly bg2: string;
  readonly invBg: string;
  readonly invText: string;
  readonly errc: string;
}

export const widgetTheme = (t: Tokens): WidgetTheme => {
  const dark = t.dark;
  return {
    ink: t.ink,
    muted: dark ? 'rgba(244,240,235,0.55)' : 'rgba(24,22,15,0.55)',
    faint: dark ? 'rgba(244,240,235,0.4)' : 'rgba(24,22,15,0.4)',
    line: dark ? 'rgba(244,240,235,0.12)' : 'rgba(24,22,15,0.1)',
    line2: dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.18)',
    surf: dark ? 'rgba(244,240,235,0.05)' : 'rgba(24,22,15,0.045)',
    surf2: dark ? 'rgba(244,240,235,0.10)' : 'rgba(24,22,15,0.08)',
    bg2: dark ? '#0b0b0c' : '#efeae1',
    invBg: dark ? '#f4f0eb' : '#18160f',
    invText: dark ? '#000' : '#f7f3ec',
    errc: dark ? '#f0b8b8' : '#9a3b3b',
  };
};
