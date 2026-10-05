/** Shared existing name morphology. These forms are candidates, never identity or intent authority. */
export const GIVEN_NAME_ALIASES = new Map<string, string[]>([
  ['стас', ['станислав']],
  ['саша', ['александр', 'александра']],
  ['макс', ['максим']],
  ['антоха', ['антон']],
  ['леша', ['алексей']],
  ['лёша', ['алексей']],
  ['дима', ['дмитрий']],
  ['миша', ['михаил']],
  ['вова', ['владимир']],
]);

export function buildCommonPersonNameForms(names: string[]): Set<string> {
  const forms = new Set<string>();
  for (const name of names) {
    forms.add(name);
    const final = name.at(-1);
    const stem = name.slice(0, -1);
    if (final === 'а') {
      ['а', 'ы', 'и', 'е', 'у', 'ой', 'ою'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else if (final === 'я') {
      ['я', 'и', 'е', 'ю', 'ей', 'ею'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else if (final === 'й') {
      ['й', 'я', 'ю', 'ем', 'е'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else if (final === 'ь') {
      ['ь', 'я', 'и', 'ю', 'ем', 'ью', 'е'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else {
      ['', 'а', 'у', 'ом', 'е'].forEach((ending) =>
        forms.add(`${name}${ending}`),
      );
    }
  }
  return forms;
}
