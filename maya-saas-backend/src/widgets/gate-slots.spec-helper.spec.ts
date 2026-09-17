// The pipeline's slots, read from the gateway's syntax tree.
//
// Source-level fences (T-ARCH-FACTS, and D-9's "Gate 6 reads no role") need to say "the code of slot
// N". A hand-kept list of files would drift from the array the moment a slot is rewired, so this
// helper derives it: each element of `IntentGatewayService.gates` is one unit for its slot, and each
// relative module whose imported names that element uses is another unit for the same slot. Every
// other non-spec file under `src/widgets` is a unit of no slot.
//
// Named `.spec.ts`, as the repository's other spec helpers are, so it stays out of the build. The
// suite at the bottom checks that the derivation still sees the pipeline it describes.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const WIDGETS = __dirname;
export const GATEWAY = 'intent-gateway.service.ts';

export const readWidget = (rel: string): string =>
  fs.readFileSync(path.join(WIDGETS, rel), 'utf8');

export const parseSource = (file: string, source: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

/** One piece of code and the slot it runs as (`null`: it runs as no slot). */
export interface SourceUnit {
  readonly slot: string | null;
  readonly file: string;
  readonly source: string;
}

const gatesArray = (sf: ts.SourceFile): ts.ArrayLiteralExpression => {
  let found: ts.ArrayLiteralExpression | null = null;
  const visit = (n: ts.Node): void => {
    if (
      ts.isPropertyDeclaration(n) &&
      n.name.getText(sf) === 'gates' &&
      n.initializer !== undefined &&
      ts.isArrayLiteralExpression(n.initializer)
    )
      found = n.initializer;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (found === null) throw new Error('no gates array in the gateway');
  return found;
};

const slotNumber = (text: string): string => {
  const m = /n:\s*'([^']+)'|pending\(\s*'([^']+)'/.exec(text);
  if (!m) throw new Error(`a gates element without a slot number: ${text}`);
  return m[1] ?? m[2];
};

export interface PipelineSources {
  /** §3.9's `n`, in array order. */
  readonly order: readonly string[];
  /** Slot code: each array element, and the relative modules it calls into. */
  readonly slotUnits: readonly SourceUnit[];
  /** The gateway with its array replaced by `[]`: the runner, `findRecord`, the helpers. */
  readonly gatewayRest: SourceUnit;
  /** Every other non-spec `.ts` file under `src/widgets`, as a unit of no slot. */
  readonly otherUnits: readonly SourceUnit[];
}

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

export const pipelineSources = (
  gatewaySource: string = readWidget(GATEWAY),
): PipelineSources => {
  const sf = parseSource(GATEWAY, gatewaySource);

  const importedFrom = new Map<string, string>();
  for (const st of sf.statements) {
    if (
      !ts.isImportDeclaration(st) ||
      !ts.isStringLiteral(st.moduleSpecifier) ||
      !st.moduleSpecifier.text.startsWith('./')
    )
      continue;
    const bindings = st.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements)
      importedFrom.set(
        el.name.text,
        path.posix.normalize(`${st.moduleSpecifier.text}.ts`),
      );
  }

  const array = gatesArray(sf);
  const order: string[] = [];
  const slotUnits: SourceUnit[] = [];
  const mapped = new Set<string>();
  for (const element of array.elements) {
    const text = element.getText(sf);
    const slot = slotNumber(text);
    order.push(slot);
    slotUnits.push({
      slot,
      file: `${GATEWAY}#slot-${slot}`,
      source: `(${text});\n`,
    });
    const files = new Set<string>();
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n)) {
        const f = importedFrom.get(n.text);
        if (f !== undefined) files.add(f);
      }
      ts.forEachChild(n, visit);
    };
    visit(element);
    for (const f of [...files].sort()) {
      mapped.add(f);
      slotUnits.push({ slot, file: f, source: readWidget(f) });
    }
  }

  const gatewayRest: SourceUnit = {
    slot: null,
    file: `${GATEWAY}#outside-the-array`,
    source:
      gatewaySource.slice(0, array.getStart(sf)) +
      '[]' +
      gatewaySource.slice(array.getEnd()),
  };

  const otherUnits = walk(WIDGETS)
    .map((f) => path.relative(WIDGETS, f).split(path.sep).join('/'))
    .filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.endsWith('.spec.ts') &&
        f !== GATEWAY &&
        !mapped.has(f),
    )
    .sort()
    .map((f) => ({ slot: null, file: f, source: readWidget(f) }));

  return { order, slotUnits, gatewayRest, otherUnits };
};

describe('pipeline slot sources', () => {
  it('derives every slot of §3.9, and the gate files the slots call', () => {
    const p = pipelineSources();
    expect(p.order).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '8-R',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
    ]);
    const filesOf = (slot: string) =>
      p.slotUnits.filter((u) => u.slot === slot).map((u) => u.file);
    expect(filesOf('5')).toContain('gates/gate5.ts');
    expect(filesOf('6')).toContain('gates/gate6.ts');
    expect(filesOf('13')).toContain('gates/gate13.ts');
    // A pending() slot calls no gate file: only its array element is its code.
    expect(filesOf('8')).toEqual([`${GATEWAY}#slot-8`]);
    expect(p.gatewayRest.source).not.toMatch(/n: '1'/);
    expect(p.otherUnits.map((u) => u.file)).toContain('gates/facts.ts');
    expect(p.otherUnits.map((u) => u.file)).not.toContain('gates/gate5.ts');
  });
});
