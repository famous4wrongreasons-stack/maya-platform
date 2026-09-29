// The theme tokens the chat's visual leaves read.
//
// Ported from `tokens(dir, dark)` in the canonical app.html (:2075-2237), aurora direction only.
// `noir` and `atelier` are deliberately absent: the owner's ruling excludes them.
//
// The palette is the owner's instructed one — light #f4f0eb / dark #000000, ink #18160f / #f4f0eb,
// accent #0A84FF. Recorded honestly: the canonical source short-circuits `tokens()` to a `maya-os`
// monochrome set (#ffffff / #000000) whenever a SaaS tenant context is present, so the app on the
// phone renders white rather than bone. The owner named the aurora palette explicitly, so aurora is
// what ships, and the discrepancy is disclosed rather than resolved unilaterally.

export interface Tokens {
  readonly name: 'aurora';
  readonly dark: boolean;
  /** The page ground. */
  readonly bg: string;
  /** The reading ink. */
  readonly ink: string;
  /** The one saturated colour: the Telegram row, the microphone, send. Never content. */
  readonly accent: string;
  readonly accentOn: string;
}

export const MAYA_ACCENT = '#0A84FF';
export const MAYA_ACCENT_ON = '#FFFFFF';

export const tokens = (dark: boolean): Tokens => ({
  name: 'aurora',
  dark,
  bg: dark ? '#000000' : '#f4f0eb',
  ink: dark ? '#F4F0EB' : '#0B0B0C',
  accent: MAYA_ACCENT,
  accentOn: MAYA_ACCENT_ON,
});
