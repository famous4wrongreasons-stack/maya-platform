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

  /**
   * A slot may reach its code through DI instead of through a value import: slot 8 is
   * `this.inputValidation.run(ctx)`, where `inputValidation` is a constructor member declared as
   * `InputValidationGate` and that type is imported (type-only) from the gate's own file.
   *
   * Without this the seam would vanish from the slot's file set the day it became a provider, and
   * every fence that reads "slot N and every file the slot calls" would quietly stop reading the
   * gate. So the constructor's members are mapped to the files their DECLARED TYPES come from, and a
   * `this.<member>` in a slot pulls that file in exactly as a call to an imported function does.
   *
   * `owner-ports/**` is EXCLUDED, and the exclusion is the point of the D-6 boundary rather than a
   * convenience: a port adapter is the one place the widget layer may name an owner's service, and
   * the fences that read a slot's own code say "slot 4 names no tenancy service" precisely because
   * the adapter does. Folding the adapter into the slot would make that sentence unsayable. What
   * fences the adapters instead is `widget-import-graph.architecture.spec.ts` and k3 check 9.
   */
  const memberFile = new Map<string, string>();
  const classDecl = sf.statements.find((st): st is ts.ClassDeclaration =>
    ts.isClassDeclaration(st),
  );
  for (const m of classDecl?.members ?? [])
    if (ts.isConstructorDeclaration(m))
      for (const param of m.parameters) {
        if (!ts.isIdentifier(param.name) || param.type === undefined) continue;
        const named = ts.isTypeReferenceNode(param.type)
          ? param.type.typeName.getText(sf)
          : null;
        const file = named === null ? undefined : importedFrom.get(named);
        if (file !== undefined && !file.startsWith('owner-ports/'))
          memberFile.set(param.name.text, file);
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
      // `this.<member>`: the file the member's declared type is imported from (see `memberFile`).
      if (
        ts.isPropertyAccessExpression(n) &&
        n.expression.kind === ts.SyntaxKind.ThisKeyword
      ) {
        const f = memberFile.get(n.name.text);
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

// ── uses of one context member ───────────────────────────────────────────────────────────────────
//
// Both source fences ask the same question about one member of the context (`facts`, `actor`): where
// does the object it holds go? Answering it in one place keeps the two fences from disagreeing about
// which spellings reach the object (`ctx.m`, `ctx['m']`, `{ m }`, `{ m: alias }`, `const a = …`,
// through parentheses, `!` and casts) and about which uses are a named read.

/** One use of the object a context member holds. */
export type MemberUse =
  /** `o.name`, `o['name']` */
  | { readonly kind: 'member'; readonly name: string; readonly node: ts.Node }
  /** `o[k]`, with a key that is not a literal */
  | { readonly kind: 'computed'; readonly node: ts.Node }
  /** `const { … } = o`, or `{ m: { … } }` in a binding of the context */
  | {
      readonly kind: 'destructure';
      readonly pattern: ts.ObjectBindingPattern;
      readonly node: ts.Node;
    }
  /** anything else: a call argument, a spread, a return, an operand of `in`, an assignment, … */
  | { readonly kind: 'escape'; readonly how: string; readonly node: ts.Node };

type Found = MemberUse | { readonly kind: 'alias'; readonly name: string };

/** One element of a destructure: its literal member name (`null`: computed), or a rest element. */
export interface PatternMember {
  readonly name: string | null;
  readonly rest: boolean;
  readonly node: ts.BindingElement;
}

export const patternMembers = (
  pattern: ts.ObjectBindingPattern,
): PatternMember[] =>
  pattern.elements.map((el) => {
    const key = el.propertyName ?? el.name;
    const name =
      ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : null;
    return { name, rest: el.dotDotDotToken !== undefined, node: el };
  });

/** A wrapper that does not change which object its operand denotes. */
const isTransparent = (n: ts.Node): boolean =>
  ts.isParenthesizedExpression(n) ||
  ts.isNonNullExpression(n) ||
  ts.isAsExpression(n) ||
  ts.isTypeAssertionExpression(n) ||
  ts.isSatisfiesExpression(n);

/** An identifier that denotes a value, rather than naming a declaration, a property or a type. */
const isValueReference = (id: ts.Identifier): boolean => {
  const p = id.parent;
  if (ts.isShorthandPropertyAssignment(p)) return true;
  if (ts.isPropertyAccessExpression(p)) return p.expression === id;
  if (ts.isQualifiedName(p) || ts.isTypeNode(p)) return false;
  const named = p as {
    name?: ts.Node;
    propertyName?: ts.Node;
    label?: ts.Node;
  };
  return named.name !== id && named.propertyName !== id && named.label !== id;
};

/**
 * Every use, in `sf`, of the object held by the context member `member`. The object is reached as
 * `x.member`, `x['member']`, an identifier named `member`, or an alias bound from one of those — by
 * `const a = …`, or by a binding element `{ member: a }` in a declaration or a parameter. A
 * destructuring ASSIGNMENT of the member (`({ member: a } = x)`) is reported as an escape. Aliases are
 * followed by name, not by scope, so the answer over-approximates: a fence built on it can be too
 * red, never too green, about the spellings above.
 *
 * Not seen: the member reached through a computed key on the context itself (`ctx[k]`), or the
 * whole context handed to code outside `sf`.
 */
export const memberUses = (sf: ts.SourceFile, member: string): MemberUse[] => {
  const names = new Set<string>([member]);

  const isRoot = (n: ts.Node): boolean =>
    (ts.isPropertyAccessExpression(n) && n.name.text === member) ||
    (ts.isElementAccessExpression(n) &&
      ts.isStringLiteralLike(n.argumentExpression) &&
      n.argumentExpression.text === member) ||
    (ts.isIdentifier(n) && names.has(n.text) && isValueReference(n));

  const isMemberBinding = (n: ts.Node): n is ts.BindingElement => {
    if (!ts.isBindingElement(n) || n.dotDotDotToken !== undefined) return false;
    const key = n.propertyName ?? n.name;
    return (
      (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) &&
      key.text === member
    );
  };

  const useOf = (root: ts.Node): Found => {
    let x = root;
    while (isTransparent(x.parent)) x = x.parent;
    const p = x.parent;
    if (ts.isPropertyAccessExpression(p) && p.expression === x)
      return { kind: 'member', name: p.name.text, node: p };
    if (ts.isElementAccessExpression(p) && p.expression === x)
      return ts.isStringLiteralLike(p.argumentExpression)
        ? { kind: 'member', name: p.argumentExpression.text, node: p }
        : { kind: 'computed', node: p };
    if (ts.isVariableDeclaration(p) && p.initializer === x) {
      if (ts.isIdentifier(p.name)) return { kind: 'alias', name: p.name.text };
      if (ts.isObjectBindingPattern(p.name))
        return { kind: 'destructure', pattern: p.name, node: p };
    }
    return { kind: 'escape', how: ts.SyntaxKind[p.kind], node: p };
  };

  // `({ member: a } = ctx)`: an object literal that is the target of an assignment destructures
  // rather than builds. The alias it binds is not followed; the destructure itself is an escape.
  const isAssignedFrom = (n: ts.Node): n is ts.PropertyAssignment => {
    if (
      !ts.isPropertyAssignment(n) ||
      !(ts.isIdentifier(n.name) || ts.isStringLiteralLike(n.name)) ||
      n.name.text !== member
    )
      return false;
    let x: ts.Node = n.parent;
    for (;;) {
      const p = x.parent;
      if (ts.isPropertyAssignment(p) && p.initializer === x) x = p.parent;
      else if (
        ts.isArrayLiteralExpression(p) ||
        ts.isSpreadElement(p) ||
        ts.isSpreadAssignment(p)
      )
        x = p;
      else break;
    }
    const p = x.parent;
    return (
      (ts.isBinaryExpression(p) &&
        p.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        p.left === x) ||
      ((ts.isForOfStatement(p) || ts.isForInStatement(p)) &&
        p.initializer === x)
    );
  };

  const bindingUse = (b: ts.BindingElement): Found =>
    ts.isIdentifier(b.name)
      ? { kind: 'alias', name: b.name.text }
      : ts.isObjectBindingPattern(b.name)
        ? { kind: 'destructure', pattern: b.name, node: b }
        : { kind: 'escape', how: ts.SyntaxKind[b.name.kind], node: b };

  const collect = (): Found[] => {
    const found: Found[] = [];
    const visit = (n: ts.Node): void => {
      if (isRoot(n)) found.push(useOf(n));
      if (isMemberBinding(n)) found.push(bindingUse(n));
      if (isAssignedFrom(n))
        found.push({
          kind: 'escape',
          how: 'destructuring assignment',
          node: n,
        });
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return found;
  };

  // Aliases of aliases: grow the name set until it stops growing.
  for (;;) {
    const before = names.size;
    for (const u of collect()) if (u.kind === 'alias') names.add(u.name);
    if (names.size === before) break;
  }
  return collect().filter((u): u is MemberUse => u.kind !== 'alias');
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
    // D-18 (I-CTX): each seamed slot calls its one seam file, and that file is the slot's code too,
    // whether the slot is built (1, 4, 8) or a refusing stub (9, 10). Slot 8 reaches its seam through
    // a DI member rather than a value import (U8a, IR-8a-1) and the derivation follows it, so a fence
    // that reads "the slot and every file it calls" keeps reading the gate. Slots 4 and 6 also carry
    // DI members, but theirs are OWNER PORTS, which the derivation excludes — see `memberFile`.
    expect(filesOf('1')).toEqual([
      `${GATEWAY}#slot-1`,
      'emission/seal-verifier.service.ts',
      'gates/gate1.ts',
    ]);
    expect(filesOf('4')).toEqual([`${GATEWAY}#slot-4`, 'gates/gate4.ts']);
    expect(filesOf('6')).toEqual([`${GATEWAY}#slot-6`, 'gates/gate6.ts']);
    expect(filesOf('8')).toEqual([
      `${GATEWAY}#slot-8`,
      'input-validation/input-validation.gate.ts',
    ]);
    expect(filesOf('9')).toEqual([
      `${GATEWAY}#slot-9`,
      'lowering/lowering.gate.ts',
    ]);
    // U10b reaches its request-T candidate read and audit through the narrow GATE10_STORE token.
    // The gateway import graph must stop at that port: following the full stores facade would expose
    // unrelated sub-stores to the gate and defeat the INV30 architecture barrier.
    expect(filesOf('10')).toEqual([`${GATEWAY}#slot-10`, 'gates/gate10.ts']);
    expect(p.gatewayRest.source).not.toMatch(/n: '1'/);
    expect(p.otherUnits.map((u) => u.file)).toContain('gates/facts.ts');
    expect(p.otherUnits.map((u) => u.file)).not.toContain('gates/gate5.ts');
  });

  it('follows a context member through each spelling that reaches it, and classifies each use', () => {
    const uses = (body: string): string[] =>
      memberUses(
        parseSource('probe.ts', `declare const ctx: any;\n${body}\n`),
        'm',
      ).map((u) => {
        switch (u.kind) {
          case 'member':
            return `member:${u.name}`;
          case 'computed':
            return 'computed';
          case 'destructure':
            return `destructure:${patternMembers(u.pattern)
              .map((e) => (e.rest ? '...' : (e.name ?? '[]')))
              .join(',')}`;
          case 'escape':
            return `escape:${u.how}`;
        }
      });
    expect(uses("ctx.m.a; ctx['m'].b; (ctx.m as any)!.c; ctx.m[k];")).toEqual([
      'member:a',
      'member:b',
      'member:c',
      'computed',
    ]);
    expect(
      uses(
        'const a = ctx.m; const b = a; b.x; const { m: c } = ctx; c.y; (({ m }: any) => m.z)(ctx);',
      ),
    ).toEqual(['member:x', 'member:y', 'member:z']);
    expect(
      uses(
        "const { p, ...r } = ctx.m; const { m: { q, [k]: s } } = ctx; f(ctx.m); ({ ...ctx.m }); 'p' in ctx.m; ({ m: t } = ctx); [{ m: u }] = [ctx]; return ctx.m;",
      ),
    ).toEqual([
      'destructure:p,...',
      'destructure:q,[]',
      'escape:CallExpression',
      'escape:SpreadAssignment',
      'escape:BinaryExpression',
      'escape:destructuring assignment',
      'escape:destructuring assignment',
      'escape:ReturnStatement',
    ]);
    // Names that only spell the member are not uses of it.
    expect(
      uses('const o = { m: 1 }; type T = { m: string }; o.q; ctx.n.m2;'),
    ).toEqual([]);
  });
});
