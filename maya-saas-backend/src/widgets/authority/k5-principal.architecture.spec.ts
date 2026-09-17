// PR-11 and PR-13 — K5 and FR-14, held at the source (class BUILD).
//
// K5 (C11:2548): "No widget-layer code path may construct a principal from a `ClientChannelLink` with
// `revokedAt != null`, or from an inactive `Membership`. *Mechanism:* an architecture test asserting
// that widget-layer principal resolution calls `C9Authority.current` (or
// `ClientChannelRuntimeService.resolve`) and constructs no principal of its own."
//
// A test that only searched for the words would pass on a layer that built a principal out of a raw
// `Membership` row; a test that only asserted the adapter calls the resolver would pass on a layer that
// ALSO built one elsewhere. So both halves are read from the syntax tree of every non-spec file under
// `src/widgets`, and each is closed rather than enumerated:
//   - POSITIVE: `owner-ports/principal.adapter.ts` injects `C9Authority` and calls `.current`;
//   - NEGATIVE: no widget file anywhere assembles a principal-shaped object, names the resolver or the
//     owner's digest outside that one adapter, or reaches the `Membership` / `ClientChannelLink`
//     delegates through which a principal could be rebuilt from rows.
//
// Comments do not count: every rule reads identifiers and expressions from the AST, so the prose above
// (and the adapter's own comments, which name all of these) is invisible to it.
//
// PR-13 (FR-14, C11:1798): the only role input to slot 6 is `ctx.principal.role`. It is vacuous while
// Gate 6 reads no role at all, and it is the fence U6-L3 lands against.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { parseSource, pipelineSources } from '../gate-slots.spec-helper.spec';

const WIDGETS = path.join(__dirname, '..');
const ADAPTER = 'owner-ports/principal.adapter.ts';

interface WidgetSource {
  readonly key: string;
  readonly sf: ts.SourceFile;
}

const widgetSources = (): WidgetSource[] => {
  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((e) =>
        e.isDirectory()
          ? walk(path.join(dir, e.name))
          : [path.join(dir, e.name)],
      );
  return walk(WIDGETS)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .sort()
    .map((f) => {
      const key = path.relative(WIDGETS, f).split(path.sep).join('/');
      return { key, sf: parseSource(key, fs.readFileSync(f, 'utf8')) };
    });
};

const nodes = (sf: ts.SourceFile): ts.Node[] => {
  const all: ts.Node[] = [];
  const visit = (n: ts.Node): void => {
    all.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return all;
};

/** Every file in which `name` occurs as an identifier (a comment is not an identifier). */
const filesNaming = (
  sources: readonly WidgetSource[],
  name: string,
): string[] =>
  sources
    .filter((s) =>
      nodes(s.sf).some((n) => ts.isIdentifier(n) && n.text === name),
    )
    .map((s) => s.key);

/** Every file with a call whose callee is the identifier `name` (`f(…)`, not `x.f(…)`). */
const filesCalling = (
  sources: readonly WidgetSource[],
  name: string,
): string[] =>
  sources
    .filter((s) =>
      nodes(s.sf).some(
        (n) =>
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === name,
      ),
    )
    .map((s) => s.key);

/** Every property access whose member name is `member`, as `<expression text>.<member>`. */
const memberAccesses = (sf: ts.SourceFile, member: string): string[] =>
  nodes(sf)
    .filter(
      (n): n is ts.PropertyAccessExpression =>
        ts.isPropertyAccessExpression(n) && n.name.text === member,
    )
    .map((n) => n.getText(sf));

describe('PR-11 [BUILD] — K5: the widget layer resolves a principal, and constructs none', () => {
  const sources = widgetSources();

  it('PR-11a [BUILD]: the adapter injects C9Authority and calls `.current`', () => {
    const adapter = sources.find((s) => s.key === ADAPTER);
    expect(adapter).toBeDefined();
    const sf = (adapter as WidgetSource).sf;

    // `private readonly authority: C9Authority` — the resolver arrives by injection, so the class cannot
    // substitute a look-alike of its own.
    const injected = nodes(sf)
      .filter((n): n is ts.ParameterDeclaration => ts.isParameter(n))
      .filter((p) => p.type?.getText(sf) === 'C9Authority')
      .map((p) => p.name.getText(sf));
    expect(injected).toEqual(['authority']);

    // …and it is called, on `this.authority`, exactly once.
    expect(
      nodes(sf)
        .filter((n): n is ts.CallExpression => ts.isCallExpression(n))
        .map((n) => n.expression.getText(sf))
        .filter((text) => text.endsWith('.current')),
    ).toEqual(['this.authority.current']);
  });

  it('PR-11b [BUILD]: no widget file assembles a principal-shaped object', () => {
    const built: string[] = [];
    for (const { key, sf } of sources)
      for (const n of nodes(sf)) {
        if (!ts.isObjectLiteralExpression(n)) continue;
        const members = n.properties
          .map((p) => (p.name ? p.name.getText(sf) : ''))
          .filter((name) => name !== '');
        // `C9Principal` is the one shape with both: a `kind` discriminant and its own `proofHash`.
        if (members.includes('kind') && members.includes('proofHash'))
          built.push(`${key}: { ${members.join(', ')} }`);
        // …and an object literal asserted or annotated as one is the same construction, named.
        const asserted =
          (ts.isAsExpression(n.parent) || ts.isSatisfiesExpression(n.parent)) &&
          n.parent.type.getText(sf).includes('C9Principal');
        if (asserted) built.push(`${key}: an object literal as C9Principal`);
      }
    expect(built).toEqual([]);
  });

  it('PR-11c [BUILD]: the resolver and the owner digest are named in one file only', () => {
    expect(filesNaming(sources, 'C9Authority')).toEqual([ADAPTER]);
    expect(filesNaming(sources, 'c9PrincipalHash')).toEqual([ADAPTER]);
    expect(filesCalling(sources, 'c9PrincipalHash')).toEqual([ADAPTER]);
    expect(filesNaming(sources, 'ClientChannelRuntimeService')).toEqual([]);
    expect(filesNaming(sources, 'ClientChannelLinkService')).toEqual([]);
  });

  it('PR-11d [BUILD]: no widget file reaches the Membership or ClientChannelLink delegates', () => {
    const reached: string[] = [];
    for (const { key, sf } of sources)
      for (const member of ['membership', 'clientChannelLink', 'authSession'])
        for (const access of memberAccesses(sf, member))
          reached.push(`${key}: ${access}`);
    expect(reached).toEqual([]);
  });

  it('PR-11e [BUILD]: the legacy JWT-field hash has no caller in a principal-resolution file (IR-P-DEL removes the rest)', () => {
    // `principal.util.ts` declares it and `intent-submit-args.ts` still calls it. The integrator deletes
    // both call sites and the file in P-PRINCIPAL's merge commit (D-18); until then the set may only
    // SHRINK, and no file of this unit may join it.
    const callers = new Set(filesCalling(sources, 'principalProofHash'));
    for (const caller of callers)
      expect(['intent-submit-args.ts', 'principal.util.ts']).toContain(caller);
    expect(callers.has(ADAPTER)).toBe(false);
    expect(callers.has('authority/principal-view.ts')).toBe(false);
  });
});

describe('PR-13 [BUILD] — FR-14: the only role input to slot 6 is ctx.principal.role', () => {
  it('PR-13a [BUILD]: slot 6 reads `role` on nothing but a principal, and names no actor', () => {
    const units = pipelineSources().slotUnits.filter((u) => u.slot === '6');
    expect(units.length).toBeGreaterThan(0);

    const offences: string[] = [];
    for (const unit of units) {
      const sf = parseSource(unit.file, unit.source);
      for (const access of memberAccesses(sf, 'role'))
        // `ctx.principal.role`, `principal.role` — the expression a `role` is read from must END in
        // `principal`. `ctx.actor.role`, `membership.role` and `row.role` all fail this.
        if (!/(^|\.)principal$/.test(access.slice(0, -'.role'.length)))
          offences.push(`${unit.file}: ${access}`);
      for (const n of nodes(sf))
        if (ts.isIdentifier(n) && n.text === 'actor')
          offences.push(`${unit.file}: names the actor`);
    }
    expect(offences).toEqual([]);
  });

  it('PR-13b [BUILD]: the principal carries a role, so slot 6 has that one input to read (D-2)', () => {
    const types = fs.readFileSync(path.join(WIDGETS, 'gate.types.ts'), 'utf8');
    const sf = parseSource('gate.types.ts', types);
    const view = sf.statements.find(
      (s): s is ts.InterfaceDeclaration =>
        ts.isInterfaceDeclaration(s) && s.name.text === 'PrincipalView',
    );
    expect(view).toBeDefined();
    const members = (view as ts.InterfaceDeclaration).members.map((m) =>
      m.name ? m.name.getText(sf) : '?',
    );
    expect(members).toContain('role');
    expect(members).toContain('presentationMode');
  });
});
