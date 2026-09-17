// T4-SRC — slot 4 makes the call and holds no compare (GATES-PLAN-V11 U4, D-9). Class [BUILD].
//
// The behaviour tests cannot see the difference this unit is about. A compare and a delegated
// assertion agree on every input a conformant build can produce, because `findRecord` is
// tenant-scoped and Gate 3's proof hash already covers `tenantId` — which is exactly why the
// refusal is defence in depth and why the compare survived a whole package unnoticed. So the
// property is held where it is visible: in the source of slot 4.
//
// "Slot 4" is not a hand-kept list. It is what `gate-slots.spec-helper.spec.ts` derives from the
// gateway's own array: the slot-4 element, plus every relative module whose imported names that
// element uses (today `gates/gate4.ts`). A rewiring that moved the compare into a new file would
// bring that file into the same scope.
//
// The rules:
//   T4-SRC-a  no equality (`===`, `!==`, `==`, `!=`) between tenant ids anywhere in slot 4;
//   T4-SRC-b  `gate4.ts` asks the port exactly once, and asks it the RECORD's tenant;
//   T4-SRC-c  slot 4 names no tenancy service: the owner is reached through the port type only;
//   T4-WIRED  the gateway PASSES the port to `gate4` (red until IR4-1; see below).
// Each rule is also run over a planted violation, in memory, so a fence that stopped seeing is red.
//
// The interim default (`ambientTenantScope`, U4) does compare, in `owner-ports/`, and this file does
// not reach it: it is the seam's own behaviour kept callable until IR4-1, it reaches no owner, and
// IR4-3 deletes it. That is a disclosed deviation of U4's report, not a hole this test hides.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  GATEWAY,
  parseSource,
  pipelineSources,
  readWidget,
  type SourceUnit,
} from '../gate-slots.spec-helper.spec';

const SLOT = '4';
const GATE4 = 'gates/gate4.ts';

/** Every name that denotes a tenant id, in the spellings this repository uses. */
const TENANT_ID = /^(?:tenant_?id|tenantId)$/i;
const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

/** The trailing name of an expression: `r.tenantId` → `tenantId`; `tenantId` → `tenantId`. */
const trailingName = (node: ts.Node, sf: ts.SourceFile): string | null => {
  let e: ts.Node = node;
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e))
      e = e.expression;
    else if (ts.isAsExpression(e) || ts.isSatisfiesExpression(e))
      e = e.expression;
    else break;
  }
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (
    ts.isElementAccessExpression(e) &&
    ts.isStringLiteralLike(e.argumentExpression)
  )
    return e.argumentExpression.text;
  return e.getText(sf);
};

/** Every tenant-id equality in one source unit, as `<file>: <text>`. */
const tenantEqualities = (unit: SourceUnit): string[] => {
  const sf = parseSource(unit.file, unit.source);
  const found: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isBinaryExpression(n) && EQUALITY.has(n.operatorToken.kind)) {
      const names = [trailingName(n.left, sf), trailingName(n.right, sf)];
      if (names.some((name) => name !== null && TENANT_ID.test(name)))
        found.push(`${unit.file}: ${n.getText(sf).replace(/\s+/g, ' ')}`);
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
};

/** The tenancy owner's services, which slot 4 may name in a comment and nowhere else. */
const OWNER_SERVICES: ReadonlySet<string> = new Set([
  'TenantContextService',
  'TenantResolverService',
]);

/** Every identifier one source unit REFERENCES (a comment is not a reference). */
const identifiers = (unit: SourceUnit): string[] => {
  const sf = parseSource(unit.file, unit.source);
  const found: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) found.push(n.text);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
};

/** Every `<something>.assert(<argument>)` call in one source unit, as the argument's text. */
const assertCalls = (unit: SourceUnit): string[] => {
  const sf = parseSource(unit.file, unit.source);
  const found: string[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'assert'
    )
      found.push(n.arguments.map((a) => a.getText(sf)).join(', '));
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
};

const slotUnits = (gatewaySource?: string): SourceUnit[] => {
  const { slotUnits: units } = pipelineSources(gatewaySource);
  return units.filter((u) => u.slot === SLOT);
};

/** One named unit of slot 4; throws rather than returning a unit the derivation did not produce. */
const slotUnit = (file: string, gatewaySource?: string): SourceUnit => {
  const found = slotUnits(gatewaySource).find((u) => u.file === file);
  if (!found) throw new Error(`slot ${SLOT} has no unit ${file}`);
  return found;
};

/** The slot-4 element of the gateway, with `gate4(ctx)` put back as it stood before IR4-1. */
const withoutTheArgument = (source: string): string =>
  source.replace('gate4(ctx, this.tenantScope)', 'gate4(ctx)');

describe('T4-SRC — slot 4 delegates: the call §3.9 row 4 names, and no compare of its own', () => {
  it('T4-SRC-0: slot 4 is the gateway element and `gates/gate4.ts`, derived from the gateway array (so this fence follows a rewiring)', () => {
    expect(slotUnits().map((u) => u.file)).toEqual([
      `${GATEWAY}#slot-${SLOT}`,
      GATE4,
    ]);
  });

  it('T4-SRC-a: no tenant id is compared for equality anywhere in slot 4', () => {
    expect(slotUnits().flatMap(tenantEqualities)).toEqual([]);
  });

  it('T4-SRC-a (red on a planted violation): the restored inline compare is seen', () => {
    const planted: SourceUnit = {
      slot: SLOT,
      file: GATE4,
      source:
        "const gate4 = (ctx: C): V => (ctx.record!.tenantId === ctx.tenantId ? pass : refuse('tenant_mismatch', ''));",
    };
    expect(tenantEqualities(planted)).toHaveLength(1);
  });

  it('T4-SRC-b: `gate4.ts` asks the port exactly once, and asks it the RECORD tenant', () => {
    expect(assertCalls(slotUnit(GATE4))).toEqual(['r.tenantId']);
  });

  it('T4-SRC-b (red on a planted violation): asserting the request’s own tenant is a call that cannot fail', () => {
    const planted: SourceUnit = {
      slot: SLOT,
      file: GATE4,
      source: 'tenantScope.assert(ctx.tenantId);',
    };
    expect(assertCalls(planted)).not.toEqual(['r.tenantId']);
  });

  it('T4-SRC-c: slot 4 names no tenancy service — the owner is reached through the port type, and the port through the boundary', () => {
    // Identifiers, not text: `gate4.ts` names `TenantContextService` in the comment that says which
    // call row 4 asks for, and a comment is not a reference.
    const named = slotUnits().flatMap(identifiers);
    expect(named.filter((n) => OWNER_SERVICES.has(n))).toEqual([]);
    expect(named).toContain('TenantScopePort');
    const imports = parseSource(GATE4, readWidget(GATE4)).statements.filter(
      ts.isImportDeclaration,
    );
    const specifiers = imports
      .map((s) =>
        ts.isStringLiteral(s.moduleSpecifier) ? s.moduleSpecifier.text : '?',
      )
      .sort();
    expect(specifiers).toEqual([
      '../gate.types',
      '../owner-ports/tenant-scope.provider',
      './verdict',
    ]);
  });

  it("T4-SRC-d: the port's only implementation that reaches the owner is the boundary adapter, and it calls `assertTenantId`", () => {
    const provider = readWidget('owner-ports/tenant-scope.provider.ts');
    expect(provider).toContain(
      'this.tenantContext.assertTenantId(expectedTenantId);',
    );
    const service = fs.readFileSync(
      path.join(__dirname, '..', '..', 'tenancy', 'tenant-context.service.ts'),
      'utf8',
    );
    expect(service).toContain('assertTenantId(expectedTenantId: string)');
  });

  // Merge-step exit (D-18), flipped by the integrator in U4's merge commit (IR4-4). IR4-1 and IR4-3
  // landed together, so there is no interim default left to fall back to — but the rule stays,
  // because a gateway that dropped the argument would otherwise be a compile error today and a
  // silently re-added default tomorrow.
  it('T4-WIRED: the gateway passes the bound port to `gate4`, so slot 4 runs on `TENANT_SCOPE`', () => {
    expect(slotUnit(`${GATEWAY}#slot-${SLOT}`).source).toContain(
      'gate4(ctx, this.tenantScope)',
    );
    expect(readWidget(GATEWAY)).toContain('@Inject(TENANT_SCOPE)');
  });

  it('T4-WIRED (control): the rule is red exactly while the argument is missing, so flipping `.failing` is a decision about the gateway and not about this test', () => {
    const wired = readWidget(GATEWAY).replace(
      'gate4(ctx)',
      'gate4(ctx, this.tenantScope)',
    );
    const element = (source: string): string =>
      slotUnit(`${GATEWAY}#slot-${SLOT}`, source).source;
    expect(element(wired)).toContain('gate4(ctx, this.tenantScope)');
    expect(element(withoutTheArgument(wired))).not.toContain(
      'gate4(ctx, this.tenantScope)',
    );
  });
});
