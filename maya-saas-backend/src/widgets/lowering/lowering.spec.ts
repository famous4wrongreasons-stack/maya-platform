// [U] The lowering function's matrix. Class U (§0.5): a regression aid, never live proof — a gate is
// enforced when a request reaches it, and nothing here is a request.
//
// What it is for: `renderUtterance` is the one place a canonical label becomes transcript bytes, and
// the two ways to get that wrong are silent. `String.prototype.replace` rewrites `$&`, `$1` and `$$`
// inside the replacement, so a label carrying them would land in the transcript as different bytes
// than the server resolved; and a template the function cannot render would, if it threw, become a
// 500 instead of DS-03 A's `superseded`/`handle_stale`. Both are asserted below, and both are the
// mutants `mutations/gate9a.json` declares.

import {
  isAbsentTemplate,
  isRenderImpossibility,
  LoweringConstructionDefect,
  renderUtterance,
  SELECTION_SLOT,
  type RenderImpossibilityRule,
  type RenderOutcome,
} from './lowering';

/** The rendered bytes, or the impossibility's rule name — one shape for the whole matrix. */
const render = (template: string | null, labels: readonly string[]): string => {
  const outcome: RenderOutcome = renderUtterance(template, labels);
  return outcome.ok ? outcome.utterance : outcome.rule;
};

describe('U9a-1 renderUtterance — the slot is filled with the label, byte for byte', () => {
  it('fills the one slot with the one label', () => {
    expect(render('Записать на {{selection}}?', ['Стрижка'])).toBe(
      'Записать на Стрижка?',
    );
  });

  it('U9a-1a $& survives: `replace` would expand it to the whole match', () => {
    expect(render(`Выбрано: ${SELECTION_SLOT}`, ['$& скидка'])).toBe(
      'Выбрано: $& скидка',
    );
  });

  it('U9a-1b $1 survives: `replace` would expand it to a capture group (empty here)', () => {
    expect(render(`Выбрано: ${SELECTION_SLOT}`, ['$1 $2 $<name>'])).toBe(
      'Выбрано: $1 $2 $<name>',
    );
  });

  it('U9a-1c $$ survives: `replace` would collapse it to a single $', () => {
    expect(render(`Цена: ${SELECTION_SLOT}`, ['$$1000'])).toBe('Цена: $$1000');
    expect(render(`Цена: ${SELECTION_SLOT}`, ["$`x$'"])).toBe("Цена: $`x$'");
  });

  it('U9a-1d a label containing the slot text is inserted, not re-scanned', () => {
    expect(render(`A ${SELECTION_SLOT} B`, [SELECTION_SLOT])).toBe(
      `A ${SELECTION_SLOT} B`,
    );
  });

  it('U9a-1e every occurrence of the one slot is filled (join, not a first-match replace)', () => {
    expect(render(`${SELECTION_SLOT} и ${SELECTION_SLOT}`, ['Борода'])).toBe(
      'Борода и Борода',
    );
  });
});

describe('U9a-2 renderUtterance — braces it cannot resolve', () => {
  it('U9a-2a braces INSIDE a label are not a slot: the template is scanned, never the result', () => {
    expect(render(`Мастер: ${SELECTION_SLOT}`, ['{{name}}'])).toBe(
      'Мастер: {{name}}',
    );
    expect(render(`Мастер: ${SELECTION_SLOT}`, ['{{'])).toBe('Мастер: {{');
  });

  it('U9a-2b an unknown slot in the TEMPLATE is a render impossibility, not a throw', () => {
    expect(render('Здравствуйте, {{name}}!', [])).toBe('unknown_slot');
    expect(render(`{{staff}} и ${SELECTION_SLOT}`, ['Стрижка'])).toBe(
      'unknown_slot',
    );
  });

  it('U9a-2c a lone brace pair left over is an unknown slot too', () => {
    expect(render('Осталось }} тут', [])).toBe('unknown_slot');
    expect(render('Осталось {{ тут', [])).toBe('unknown_slot');
  });

  it('U9a-2d the known slot alone leaves no braces behind', () => {
    expect(render(SELECTION_SLOT, ['Стрижка'])).toBe('Стрижка');
  });
});

describe('U9a-3 renderUtterance — slot cardinality (D-11: ≠1 label is an impossibility)', () => {
  it('U9a-3a a slotted template with 0 labels does not render', () => {
    expect(render(`Записать на ${SELECTION_SLOT}?`, [])).toBe(
      'slot_cardinality',
    );
  });

  it('U9a-3b a slotted template with 2 labels does not render', () => {
    expect(
      render(`Записать на ${SELECTION_SLOT}?`, ['Стрижка', 'Борода']),
    ).toBe('slot_cardinality');
  });

  it('U9a-3c it returns, and never throws: DS-03 A has no fault carve-out', () => {
    expect(() =>
      renderUtterance(`${SELECTION_SLOT}`, ['a', 'b']),
    ).not.toThrow();
    expect(() => renderUtterance('{{unknown}}', ['a'])).not.toThrow();
    expect(() => renderUtterance(null, [])).not.toThrow();
  });
});

describe('U9a-4 renderUtterance — a slot-less template', () => {
  it('U9a-4a returns the template verbatim whatever the label count', () => {
    for (const labels of [[], ['Стрижка'], ['Стрижка', 'Борода']])
      expect(render('Отменить запись?', labels)).toBe('Отменить запись?');
  });

  it('U9a-4b leaves the bytes exactly as minted, including $ and whitespace', () => {
    expect(render('  $& $1 $$  ', ['Стрижка'])).toBe('  $& $1 $$  ');
  });
});

describe('U9a-5 renderUtterance — an absent or blank template (D-11)', () => {
  it('U9a-5a null, empty and whitespace-only templates are `template_absent`', () => {
    for (const template of [null, '', ' ', '\t\n  '])
      expect(render(template, ['Стрижка'])).toBe('template_absent');
  });

  it('U9a-5b isAbsentTemplate agrees with the rule, and a blank is not `""`', () => {
    expect(isAbsentTemplate(null)).toBe(true);
    expect(isAbsentTemplate('')).toBe(true);
    expect(isAbsentTemplate('   ')).toBe(true);
    expect(isAbsentTemplate('.')).toBe(false);
    expect(isAbsentTemplate(SELECTION_SLOT)).toBe(false);
  });
});

describe('U9a-6 the impossibility carries a rule and no content', () => {
  it('U9a-6a every impossibility is `{ ok: false, rule }` and names no template or label byte', () => {
    const cases: readonly [string | null, readonly string[]][] = [
      [null, []],
      ['   ', ['Стрижка']],
      ['Здравствуйте, {{name}}!', []],
      [`${SELECTION_SLOT}`, ['Стрижка', 'Борода']],
    ];
    const rules: RenderImpossibilityRule[] = [];
    for (const [template, labels] of cases) {
      const outcome = renderUtterance(template, labels);
      expect(isRenderImpossibility(outcome)).toBe(true);
      if (outcome.ok) throw new Error('expected an impossibility');
      expect(Object.keys(outcome).sort()).toEqual(['ok', 'rule']);
      expect(JSON.stringify(outcome)).not.toMatch(/Стрижка|Борода|name/);
      rules.push(outcome.rule);
    }
    expect(rules).toEqual([
      'template_absent',
      'template_absent',
      'unknown_slot',
      'slot_cardinality',
    ]);
  });

  it('U9a-6b a rendered outcome is `{ ok: true, utterance }`', () => {
    const outcome = renderUtterance('Отменить?', []);
    expect(isRenderImpossibility(outcome)).toBe(false);
    expect(Object.keys(outcome).sort()).toEqual(['ok', 'utterance']);
  });
});

describe('U9a-7 LoweringConstructionDefect — the one thing that throws', () => {
  it('U9a-7a it is an Error naming the missing Gate 8 fact, and no content', () => {
    for (const missing of ['loweringSource', 'selectedLabels'] as const) {
      const defect = new LoweringConstructionDefect(missing);
      expect(defect).toBeInstanceOf(Error);
      expect(defect.name).toBe('LoweringConstructionDefect');
      expect(defect.missing).toBe(missing);
      expect(defect.message).toBe(
        `lowering construction defect: gate 8 passed without ${missing} (J-1)`,
      );
    }
  });

  it('U9a-7b throwing it is a throw, so `submit()` returns no verdict', () => {
    expect(() => {
      throw new LoweringConstructionDefect('selectedLabels');
    }).toThrow(LoweringConstructionDefect);
  });
});
