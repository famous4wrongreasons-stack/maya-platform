import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// F76 is a whole Action Engine ownership boundary, including request and policy
// types. No widget fields may become part of its authority or mutation input.
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
        ? [join(dir, entry.name)]
        : [],
  );
}
describe('G13 F33/F76 canonical action boundary', () => {
  it('WR-F76 keeps widget kind and confirmation subject outside every Action Engine source', () => {
    const files = sources(join(__dirname, '../../action-engine'));
    expect(files.length).toBeGreaterThan(50);
    const leaks = files.filter((file) =>
      /widget_kind|widgetKind|confirmation_subject|confirmationSubject/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(leaks).toEqual([]);
  });
});
