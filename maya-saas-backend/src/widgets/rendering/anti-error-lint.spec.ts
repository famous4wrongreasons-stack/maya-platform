// P-RENDER exit test REN-4 (GATES-PLAN-V11, Wave 1). Class BUILD: §1.3 C4's anti-error lint, run
// over the phrase catalogue and over the rendering modules' own bytes.
//
// C4 (C11:2302): "`label` MUST NOT match `/ошибк|error|fail|сбо[йя]|недоступн.*попроб/i`. No
// renderer may bind a non-`KNOWN` state to a `danger`/`destructive`/`alert` theme token, an error
// icon, `role=\"alert\"`, or an automatic retry." R3.9.3 extends the same rule to every refusal
// (C11:4897-4899), and §4.5.2 L8 to expiry (C11:5506).
//
// The lint reads BYTES, not intentions. A phrase that reassures a reviewer and shouts at a user is
// exactly the defect it is for: the words are the whole of the user-visible contract here.
//
// Not live proof.

import fs from 'node:fs';
import path from 'node:path';

import {
  LIMITATION_REASON_TABLE,
  REFUSAL_PHRASES,
  REFUSAL_PHRASE_CATALOGUE_VERSION,
} from '../../widget-contract/reason-table';
import { reasonSeverity, reasonText } from './reason-text';

describe('P-RENDER — C4/R3.9.3: a refusal renders as a statement, never as a failure', () => {
  /** C4's regex, byte for byte (C11:2302). */
  const C4 = /ошибк|error|fail|сбо[йя]|недоступн.*попроб/i;

  /** The renderer bans C4 also states. Checked over the modules this unit owns. */
  const ERROR_TOKENS = [
    'role="alert"',
    "role='alert'",
    'destructive',
    'aria-invalid',
  ];

  const OWNED = [
    'src/widget-contract/reason-table.ts',
    'src/widgets/rendering/denial-projection.ts',
    'src/widgets/rendering/reason-text.ts',
  ];
  const BE = path.resolve(__dirname, '..', '..', '..');

  it('REN-4 every rendered phrase in the catalogue passes C4', () => {
    const offenders = Object.entries(REFUSAL_PHRASES)
      .filter(([, rendered]) => C4.test(rendered))
      .map(([key, rendered]) => `${key}: ${rendered}`);
    expect(offenders).toEqual([]);
  });

  it('REN-4 every phrase key passes C4, and every key is a real catalogue entry', () => {
    for (const key of Object.keys(REFUSAL_PHRASES))
      expect(C4.test(key)).toBe(false);
    const dangling = Object.values(LIMITATION_REASON_TABLE)
      .map((row) => row.text_key)
      .filter(
        (text_key) =>
          !Object.prototype.hasOwnProperty.call(REFUSAL_PHRASES, text_key),
      );
    expect(dangling).toEqual([]);
  });

  it('REN-4 the catalogue carries no phrase no row names: a phrase nobody mints is not a phrase', () => {
    const named = new Set(
      Object.values(LIMITATION_REASON_TABLE).map((row) => row.text_key),
    );
    expect(
      Object.keys(REFUSAL_PHRASES).filter((key) => !named.has(key)),
    ).toEqual([]);
    expect(REFUSAL_PHRASE_CATALOGUE_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('REN-4 reasonText mints a Phrase for every table key, and none of them reads as a fault', () => {
    for (const code of Object.keys(LIMITATION_REASON_TABLE)) {
      const phrase = reasonText(code);
      expect(phrase.phrase_key).toBe(LIMITATION_REASON_TABLE[code].text_key);
      expect(phrase.rendered.length).toBeGreaterThan(0);
      // §1.2: "the only user-visible bytes; ≤ 400 chars".
      expect(phrase.rendered.length).toBeLessThanOrEqual(400);
      expect(C4.test(phrase.rendered)).toBe(false);
      expect(reasonSeverity(code)).not.toBe('error');
    }
  });

  it('REN-4 an unknown code still mints a neutral Phrase rather than free text or a throw', () => {
    const phrase = reasonText('a_code_this_table_has_never_heard_of');
    expect(phrase.phrase_key).toBe('widget.limitation.provider_silent');
    expect(phrase.rendered).toBe(
      REFUSAL_PHRASES['widget.limitation.provider_silent'],
    );
    expect(C4.test(phrase.rendered)).toBe(false);
    expect(reasonSeverity('a_code_this_table_has_never_heard_of')).toBe(
      'limitation',
    );
  });

  it('REN-4 reasonText has no parameter a caller could put free text into', () => {
    // R3.9.3's "renders as `reason_text`" is only a guarantee if the bytes are server-minted. The
    // signature is the mechanism: one key in, a Phrase out, and the source says so.
    const source = fs.readFileSync(
      path.join(BE, 'src/widgets/rendering/reason-text.ts'),
      'utf8',
    );
    expect(source).toMatch(
      /export function reasonText\(code: ReasonTextKey\): Phrase/,
    );
    expect(source).not.toMatch(/rendered:\s*(text|message|error|detail)\b/);
  });

  it('REN-4 no module this unit owns writes an error severity or an error surface token', () => {
    const offenders: string[] = [];
    for (const rel of OWNED) {
      const text = fs.readFileSync(path.join(BE, rel), 'utf8');
      // `severity: 'error'` would not even compile against `LimitationReason`, but a cast or a
      // widened record would, and a lint that only trusts the type system tests the type system.
      if (/severity['"]?\s*:\s*['"]error['"]/.test(text))
        offenders.push(`${rel}: an error severity`);
      for (const token of ERROR_TOKENS)
        if (text.includes(token)) offenders.push(`${rel}: ${token}`);
      // An auto-retry bound to a refusal is C4's fourth ban.
      if (/setTimeout\(|setInterval\(|retry\(/.test(text))
        offenders.push(`${rel}: an automatic retry`);
    }
    expect(offenders).toEqual([]);
  });

  it('REN-4 the lint discriminates: it fails each banned form when it is planted', () => {
    // A lint nobody has seen fail is a lint nobody has seen.
    for (const planted of [
      'Произошла ошибка, повторите позже',
      'Widget error: token rejected',
      'the read failed',
      'Произошёл сбой при чтении',
      'Функция недоступна, попробуйте позже',
    ])
      expect(C4.test(planted)).toBe(true);
    for (const allowed of Object.values(REFUSAL_PHRASES))
      expect(C4.test(allowed)).toBe(false);
  });
});
