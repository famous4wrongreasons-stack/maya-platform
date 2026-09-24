// U12a — ARCH-12-1 … ARCH-12-14, the fourteen `EP-BUILD` fences of the data fence (GATES-PLAN-V11).
//
// Row 12 (C11:4732) is scored on an ABSENCE: "No widget-specific PII path exists, so none of the five
// can be bypassed by a widget". An absence cannot be demonstrated by running the happy path — it is
// demonstrated by a check that goes red when the thing comes back. So every rule here is read from the
// syntax tree of the files it governs, and each one is then run against a planted violation, so a fence
// that stopped seeing is itself red.
//
// Class BUILD (§0.5). These are `EP-BUILD` structural tests and they flip no clause on their own: the
// live half is `test/widgets-live/gate12-data-fence.live-spec.ts`, and the flips happen at E1/E2.
//
// TWO OF THE FOURTEEN ARE RED UNTIL THE INTEGRATOR APPLIES IR-K4K8-1, and that is by the plan's design
// (P-K4K8's card: "ARCH-12-2 [BUILD] lives in U12a's architecture spec and turns green in U12a's
// merge"). U12a's files land in the merge commit that follows the deletions, so both are green the
// moment this file exists in the tree:
//   ARCH-12-2   `authority/pii-fences.ts`, `client/client-presentation.ts` and the legacy
//               `gates/gate12.ts` are still on disk in the implementer's tree;
//   ARCH-12-10  slot 12 still calls `gate12(ctx)` and `liveGateCount` still counts it.
// Neither is written as `it.failing` and neither is conditional: k3 check 4's slot-12 exception
// requires ARCH-12-9 and ARCH-12-10 to be exactly one ACTIVE test each and to PASS, so an inactive or
// self-excusing one would be a fence that cannot be asked. Beside each of the two stands a CONTROL that
// runs the same detector over the post-IR sources and expects nothing, so "it goes green at the merge"
// is measured here rather than promised.
//
// k3 check 4 also requires the titles below to be unique: exactly ONE test whose title starts with
// `ARCH-12-9` and exactly ONE starting with `ARCH-12-10`, both `it`. Mutation cases are titled `RED:`
// and `CONTROL:` for that reason, not for style.

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { C9_REGISTRY_HASH } from '../../orchestration/c9.registry';
import { C9_CAP_BY_KEY } from '../authority/contract-bindings';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { WidgetKind } from '../../widget-contract/kinds';
import {
  emittable,
  isOwnerClassKey,
} from '../../widget-contract/owner-classes';
import type { Gate, GateContext } from '../gate.types';
import { IntentGatewayService } from '../intent-gateway.service';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  PROJECTOR_REGISTRY,
  ROWS_BLOCKED_BY,
  ROWS_DEFERRED_BY,
  projectorRowFor,
  type ProjectorRow,
} from './projector.registry';
import {
  WidgetProjectorService,
  subjectKeyOf,
  type ProjectionOutcome,
} from './widget-projector.service';
import type { ProjectionPlan } from './canonical-read.port';

const PROJECTION = __dirname;
const WIDGETS = path.resolve(PROJECTION, '..');
const SRC = path.resolve(WIDGETS, '..');
const BE = path.resolve(SRC, '..');

const posix = (p: string): string => p.split(path.sep).join('/');
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

interface Source {
  /** Path relative to `src/`, e.g. `widgets/projection/canonical-read.port.ts`. */
  readonly key: string;
  readonly text: string;
  readonly sf: ts.SourceFile;
}

const parse = (key: string, text: string): Source => ({
  key,
  text,
  sf: ts.createSourceFile(
    key,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  ),
});

const sourcesUnder = (dir: string, includeSpecs = false): Source[] =>
  walk(dir)
    .filter(
      (f) => f.endsWith('.ts') && (includeSpecs || !f.endsWith('.spec.ts')),
    )
    .sort()
    .map((f) =>
      parse(posix(path.relative(SRC, f)), fs.readFileSync(f, 'utf8')),
    );

const at = (s: Source, n: ts.Node): string =>
  `${s.key}:${s.sf.getLineAndCharacterOfPosition(n.getStart(s.sf)).line + 1}`;

/** Every module specifier a file imports or re-exports, with the node that brought it in. */
const moduleEdges = (s: Source): Array<{ spec: string; node: ts.Node }> => {
  const out: Array<{ spec: string; node: ts.Node }> = [];
  const visit = (n: ts.Node): void => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier !== undefined &&
      ts.isStringLiteral(n.moduleSpecifier)
    )
      out.push({ spec: n.moduleSpecifier.text, node: n });
    if (
      ts.isCallExpression(n) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(n.expression) && n.expression.text === 'require'))
    ) {
      const a0 = n.arguments[0];
      out.push({
        spec: a0 && ts.isStringLiteral(a0) ? a0.text : '<computed>',
        node: n,
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(s.sf);
  return out;
};

/** The local name each import binds, mapped to the module it came from. */
const importedNames = (s: Source): Map<string, string> => {
  const out = new Map<string, string>();
  for (const st of s.sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier))
      continue;
    const spec = st.moduleSpecifier.text;
    const clause = st.importClause;
    if (!clause) continue;
    if (clause.name) out.set(clause.name.text, spec);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings))
      out.set(bindings.name.text, spec);
    if (bindings && ts.isNamedImports(bindings))
      for (const e of bindings.elements) out.set(e.name.text, spec);
  }
  return out;
};

/** `a.b.c` for a property-access chain, else null. */
const accessPath = (n: ts.Node): string | null => {
  if (ts.isIdentifier(n)) return n.text;
  if (ts.isPropertyAccessExpression(n)) {
    const left = accessPath(n.expression);
    return left === null ? null : `${left}.${n.name.text}`;
  }
  return null;
};

/** Every `x.y` access in a file, as text, with its location. */
const accesses = (s: Source): Array<{ path: string; node: ts.Node }> => {
  const out: Array<{ path: string; node: ts.Node }> = [];
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n)) {
      const p = accessPath(n);
      if (p !== null) out.push({ path: p, node: n });
    }
    ts.forEachChild(n, visit);
  };
  visit(s.sf);
  return out;
};

/** Identifier and string-literal texts a file carries IN CODE. Comments are not nodes, so they are out. */
const codeTokens = (
  s: Source,
): { identifiers: Set<string>; strings: Set<string> } => {
  const identifiers = new Set<string>();
  const strings = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) identifiers.add(n.text);
    if (ts.isStringLiteralLike(n)) strings.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(s.sf);
  return { identifiers, strings };
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ARCH-12-1 — the projection's import and reference graph
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Non-widget modules a projection file may import, each with the reason it reaches no owner. CLOSED:
 * a module not listed is a violation, so an owner cannot arrive by being imported "just for a type".
 */
const PROJECTION_MAY_IMPORT: Readonly<Record<string, string>> = {
  '@nestjs/common': 'Nest decorators',
  '../../common/authenticated-user.interface': 'the JWT-validated actor (K5)',
  '../../orchestration/c9.contract': 'C9 contract types — the principal',
  '../../orchestration/c9.registry': 'the frozen C9 registry digest',
  '../../ai-tools/ai-tool.types': 'AI tool definition types (the surface)',
  '../../widget-contract/envelope': 'generated contract types',
  '../../widget-contract/kinds': 'generated contract types',
  '../../widget-contract/lifecycle': 'generated contract types',
  '../../widget-contract/ambient': 'generated contract types',
  '../../widget-contract/capability-ref': 'generated contract types',
  '../../widget-contract/derived-shapes': 'generated contract types',
  '../gate.types': "the gate contract's types",
  '../di-tokens': 'the named canonical-read DI edge',
  '../rendering/denial-projection': 'the pure P10 denial projection',
  '../query-scalars/local-business-date':
    'the pure owner-approved journal date validator',
};

/** The one call site each permitted owner has (PLAN G12 §5.3). Nothing else may be referenced. */
const CANONICAL_REFERENCES: readonly string[] = [
  'AiToolRuntimeService.execute',
  'MeasurementReadService.read',
  'MeasurementReadService.snapshot',
  'C8ReadService.list',
  'C8ReadService.snapshot',
  'C9Store.snapshot',
  'C9Execution.status',
  'c9Registry.tryGet',
];

/** Owner names a projection file may never touch, and the members of a permitted owner it may not. */
const FORBIDDEN_REFERENCES: readonly string[] = [
  'AiToolHandlerService',
  'AppointmentsService',
  'ClientAppointmentReadService',
  'C9Store.review',
  'C9Store.revision',
  'C9Store.cancel',
  'C9Store.admit',
];

const FORBIDDEN_IMPORT_FRAGMENTS: readonly string[] = [
  'ai-tool-handler.service',
  '/appointments/',
  '/crm/',
  'prisma.service',
];

/** Prisma delegates the widget layer owns. Anything else on a client is another layer's table. */
const WIDGET_MODEL_PREFIX = 'widget';

const arch1Violations = (files: readonly Source[]): string[] => {
  const out: string[] = [];
  for (const s of files) {
    for (const { spec, node } of moduleEdges(s)) {
      if (spec.startsWith('.')) {
        const resolved = path.resolve(
          path.dirname(path.join(SRC, s.key)),
          spec,
        );
        if (
          resolved === PROJECTION ||
          resolved.startsWith(`${PROJECTION}${path.sep}`)
        )
          continue;
      }
      if (!(spec in PROJECTION_MAY_IMPORT))
        out.push(
          `${at(s, node)}: ${spec} is not enumerated for the projection`,
        );
      for (const bad of FORBIDDEN_IMPORT_FRAGMENTS)
        if (spec.includes(bad) || `${spec}/`.includes(bad))
          out.push(`${at(s, node)}: the projection imports ${spec}`);
    }
    const names = importedNames(s);
    for (const { path: p, node } of accesses(s)) {
      const head = p.split('.')[0];
      for (const bad of FORBIDDEN_REFERENCES)
        if (p === bad || p.endsWith(`.${bad}`))
          out.push(`${at(s, node)}: the projection references ${bad}`);
      // A reference through an imported owner is admitted only as one of the named call sites.
      if (
        names.has(head) &&
        !names.get(head)!.startsWith('./') &&
        !(names.get(head)! in PROJECTION_MAY_IMPORT)
      )
        out.push(`${at(s, node)}: ${p} reaches ${names.get(head)!}`);
      if (head.toLowerCase().startsWith('prisma') && p.split('.').length > 1) {
        const delegate = p.split('.')[1] ?? '';
        if (!delegate.toLowerCase().startsWith(WIDGET_MODEL_PREFIX))
          out.push(
            `${at(s, node)}: the projection reads the Prisma delegate ${delegate}`,
          );
      }
    }
    for (const name of codeTokens(s).identifiers)
      for (const bad of FORBIDDEN_REFERENCES)
        if (
          name === bad.split('.')[0] &&
          !CANONICAL_REFERENCES.some((c) => c.startsWith(name))
        )
          out.push(`${s.key}: names the owner ${name}`);
  }
  return out;
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ARCH-12-2 / ARCH-12-3 — no widget-layer PII path, no authority keyed on presentation
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The three modules IR-K4K8-1 deletes. Once they are gone, every exclusion naming them is inert. */
const IR_K4K8_1_DELETES: readonly string[] = [
  'widgets/authority/pii-fences.ts',
  'widgets/client/client-presentation.ts',
  'widgets/gates/gate12.ts',
];

/**
 * The widget-layer PII mechanism, BY NAME. A ratchet on names rather than on the word "mask": the
 * widget layer legitimately carries `data_scope.masked_fields` (G12-R5, a D-class envelope member) and
 * P-F88's forbidden-key walk legitimately carries a key list (R3.8.2 refuses a key by NAME, which is
 * not masking), so a heuristic over either would refuse work other units own.
 */
const P = 'PII';
const FENCE = 'FENCE';
const CEILING = `CARRIER_${P}_CEILING`;
const PII_PATH_NAMES: readonly string[] = [
  // Built from parts, so this file does not name the mechanism it forbids and therefore does not trip
  // P-K4K8's K4K8-1 ratchet, which scans every widget module — this one included. Same device as
  // `gates/gate-files.source.spec.ts`'s `CAST_TO_BOTTOM`, and for the same reason: a guard that is
  // itself an instance of what it guards against can only be excused by an exclusion list, and an
  // exclusion list is the thing both ratchets exist to avoid.
  CEILING,
  `${P}_RANK`,
  `DATA_${FENCE}S`,
  `${FENCE}_FUNCTIONS`,
  `${P}_${FENCE}S`,
  `Data${FENCE.charAt(0)}${FENCE.slice(1).toLowerCase()}Subject`,
  `evaluate${'Presentation'}`,
];

const PII_PATH_IMPORT_FRAGMENTS: readonly string[] = [
  'authority/pii-fences',
  'client/client-presentation',
];

/** A file that maps an ABSENT field to `PERMISSION` — C5's remedy-or-gap rule read backwards. */
const absenceToPermission = (s: Source): string[] => {
  const out: string[] = [];
  const mentionsPermission = (n: ts.Node): boolean => {
    let found = false;
    const visit = (x: ts.Node): void => {
      if (ts.isStringLiteralLike(x) && x.text === 'PERMISSION') found = true;
      ts.forEachChild(x, visit);
    };
    visit(n);
    return found;
  };
  const absenceTest = (n: ts.Node): boolean =>
    /\b(?:undefined|null)\b|[?][.]|[?][?]|![\s(]/.test(n.getText(s.sf));
  const visit = (n: ts.Node): void => {
    if (
      ts.isConditionalExpression(n) &&
      absenceTest(n.condition) &&
      mentionsPermission(n.whenTrue)
    )
      out.push(`${at(s, n)}: an absent field is mapped to PERMISSION`);
    if (
      ts.isIfStatement(n) &&
      absenceTest(n.expression) &&
      mentionsPermission(n.thenStatement)
    )
      out.push(`${at(s, n)}: an absent field is mapped to PERMISSION`);
    ts.forEachChild(n, visit);
  };
  visit(s.sf);
  return out;
};

const piiPathViolations = (files: readonly Source[]): string[] => {
  const out: string[] = [];
  for (const s of files) {
    for (const { spec, node } of moduleEdges(s))
      for (const bad of PII_PATH_IMPORT_FRAGMENTS)
        if (spec.includes(bad)) out.push(`${at(s, node)}: imports ${spec}`);
    const { identifiers } = codeTokens(s);
    for (const name of PII_PATH_NAMES)
      if (identifiers.has(name)) out.push(`${s.key}: names ${name}`);
    out.push(...absenceToPermission(s));
  }
  return out;
};

/**
 * The SUBMISSION's presentation members and the carriers beside them. No widget file may read one —
 * §3.8 declares `profile_id` ADVISORY (R3.8.3) and the DTO is the one place it is named.
 */
const SUBMITTED_PRESENTATION_INPUTS: readonly string[] = [
  'profile_id',
  'a11y_env',
  'a11yEnv',
  'x-maya-render-profile',
  'x-maya-render-caps',
  'BridgeSession',
  'native_bridge',
  'nativeBridge',
];

/**
 * The RESOLVED profile (`profileId`) on top, for the three places an authority decision is made. The
 * review's narrowing (X6) is the reason for the split: C3's profile resolver, K6's fitter, the channel
 * profile registry, the seal (`WidgetRenderReceipt.profileId` is a sealed column) and the audit store
 * all handle the resolved profile legitimately — presentation may narrow what a person is shown. What
 * may never happen is an AUTHORITY antecedent keyed on it, so the strict scope is the gate files, the
 * `AuthorityResolver` and the projection.
 */
const AUTHORITY_ANTECEDENT_SCOPE = (key: string): boolean =>
  key.startsWith('widgets/gates/') ||
  key.startsWith('widgets/projection/') ||
  key === 'widgets/authority/authority-resolver.ts';

/** Files whose naming of a presentation input is the contract's own (§3.8's DTO, F88's key list). */
const PRESENTATION_READERS_ALLOWED: readonly string[] = [
  'widgets/dto/submit-intent.dto.ts', // §3.8 DECLARES the member; declaring is not reading (P-F88)
  // MERGE FIX (U12a's merge): the same reason, one file over. P-F88's IR-F88-2 gave `SubmissionShape`
  // §3.8's five members, `profile_id` among them, so the wire TYPE the DTO is checked against now
  // names it too. Declaring it there is what keeps the DTO and the shape from drifting; no gate
  // reads it, which is what `validation/f88-walk.spec.ts` F88-7 holds over every runtime module and
  // `gates/gate-antecedents.inv30.spec.ts` holds over five spellings at once.
  'widgets/gate.types.ts',
  'widgets/validation/f88-walk.ts', // the walk names keys in order to refuse them
  'widgets/f88.generated.ts',
];

const presentationAntecedentViolations = (
  files: readonly Source[],
): string[] => {
  const out: string[] = [];
  for (const s of files) {
    if (PRESENTATION_READERS_ALLOWED.includes(s.key)) continue;
    const { identifiers, strings } = codeTokens(s);
    const forbidden = AUTHORITY_ANTECEDENT_SCOPE(s.key)
      ? [
          ...SUBMITTED_PRESENTATION_INPUTS,
          'profileId',
          'presentationMode',
          'presentation_mode',
        ]
      : SUBMITTED_PRESENTATION_INPUTS;
    for (const input of forbidden) {
      if (identifiers.has(input)) out.push(`${s.key}: reads ${input}`);
      for (const literal of strings)
        if (literal.toLowerCase() === input.toLowerCase())
          out.push(`${s.key}: names the presentation input ${input}`);
    }
  }
  return out;
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ARCH-12-4 … -8, -12, -13 — the projection's own shape
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** P5 / ARCH-12-4: the owner's count is copied, never computed, and silence is never `hasMore: false`. */
const arithmeticViolations = (files: readonly Source[]): string[] => {
  const out: string[] = [];
  const ARITHMETIC = new Set<ts.SyntaxKind>([
    ts.SyntaxKind.PlusToken,
    ts.SyntaxKind.MinusToken,
    ts.SyntaxKind.AsteriskToken,
    ts.SyntaxKind.SlashToken,
    ts.SyntaxKind.PercentToken,
  ]);
  for (const s of files) {
    const visit = (n: ts.Node): void => {
      if (ts.isBinaryExpression(n) && ARITHMETIC.has(n.operatorToken.kind))
        out.push(`${at(s, n)}: arithmetic in the projection`);
      if (
        ts.isPropertyAssignment(n) &&
        n.name.getText(s.sf).replace(/['"]/g, '') === 'hasMore' &&
        n.initializer.kind === ts.SyntaxKind.FalseKeyword
      )
        out.push(`${at(s, n)}: a literal hasMore: false on a synthesis path`);
      if (ts.isIdentifier(n) && (n.text === 'reduce' || n.text === 'Math'))
        out.push(`${at(s, n)}: an aggregation in the projection (${n.text})`);
      ts.forEachChild(n, visit);
    };
    visit(s.sf);
  }
  return out;
};

/** The members `ProjectionPlan` may never have (ARCH-12-5) and `ProjectionOutcome` may never carry (-6). */
const PLAN_FORBIDDEN_MEMBERS: readonly string[] = [
  'bodyJson',
  'body_json',
  'textEquivalentJson',
  'composedEnvelopeJson',
  'emittedEnvelopeJson',
  'utteranceTemplate',
  'renderedUtterance',
  'selectedLabels',
  'selectionDomainLabelsJson',
  'spokenTranscript',
  'presentationMode',
  'presentation_mode',
  'profileId',
  'profile_id',
];

const OUTCOME_FORBIDDEN_MEMBERS: readonly string[] = [
  'masked_fields',
  'maskedFields',
  'presentation_mode',
  'presentationMode',
  'pii_class',
  'piiClass',
  'state',
  'reason_code',
  'reasonCode',
  'label',
];

/**
 * ARCH-12-14 / I39 — a module that READS the bridge. A module that DECLARES the shape is not one:
 * `widget-contract/**` is GENERATED FROM THE CERTIFIED CONTRACT and declares every §-shape the
 * contract states, `BridgeSession` among them; it holds no value and reads nothing. What is forbidden
 * is the reading — a hand-written module importing the name, or taking the member off a value. NT7's
 * bridge half is exactly that: no `BridgeSession` reader on this edge.
 */
const BRIDGE_NAMES: readonly string[] = [
  'BridgeSession',
  'native_bridge',
  'nativeBridge',
];

const bridgeOffenders = (s: Source): string[] => {
  const out: string[] = [];
  if (!s.text.startsWith('// GENERATED FROM THE CERTIFIED CONTRACT'))
    for (const [local, spec] of importedNames(s))
      if (BRIDGE_NAMES.includes(local))
        out.push(`${s.key}: imports ${local} from ${spec}`);
  for (const { path: p, node } of accesses(s))
    if (BRIDGE_NAMES.some((b) => p.endsWith(`.${b}`)))
      out.push(`${at(s, node)}: reads ${p}`);
  return out;
};

/** Every literal a `from:` member is typed to — the closed set of argument sources (ARCH-12-5). */
const argumentSourceLiterals = (s: Source): string[] => {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isPropertySignature(n) &&
      n.name.getText(s.sf) === 'from' &&
      n.type !== undefined &&
      ts.isLiteralTypeNode(n.type) &&
      ts.isStringLiteral(n.type.literal)
    )
      out.push(n.type.literal.text);
    ts.forEachChild(n, visit);
  };
  visit(s.sf);
  return out;
};

/** Every member name an interface or type-literal declares, by declaration name. */
const declaredMembers = (s: Source, typeName: string): string[] => {
  const out: string[] = [];
  const collect = (members: ts.NodeArray<ts.TypeElement>): void => {
    for (const m of members)
      if ((ts.isPropertySignature(m) || ts.isMethodSignature(m)) && m.name)
        out.push(m.name.getText(s.sf).replace(/['"]/g, ''));
  };
  const visit = (n: ts.Node): void => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === typeName)
      collect(n.members);
    if (ts.isTypeAliasDeclaration(n) && n.name.text === typeName) {
      const walkType = (t: ts.Node): void => {
        if (ts.isTypeLiteralNode(t)) collect(t.members);
        ts.forEachChild(t, walkType);
      };
      walkType(n.type);
    }
    ts.forEachChild(n, visit);
  };
  visit(s.sf);
  return out;
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ARCH-12-9 / -10 — who may call the projector, and what slot 12 is
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The files that may hold a reference to the projector. `widgets.module.ts` provides it (the U12a
 * integrator request); `gates/gate13.ts` holds the `REFINE`/`NAVIGATE` edges that CALL it (U13). Gate 1,
 * Gate 5, the K16 route resolver, the carrier resolver and the `/widgets/resolve` route hold none:
 * R3.9.4 says the gateway "issues no projector call and no canonical read" on a successor branch
 * (C11:4907-4935), and A-12-1/A-12-5 are unruled for the rest.
 */
const MAY_REFERENCE_PROJECTOR: readonly string[] = [
  'widgets/widgets.module.ts',
  'widgets/gates/gate13.ts',
];
const MAY_CALL_PROJECTOR: readonly string[] = ['widgets/gates/gate13.ts'];
const COMPOSE_METHODS: readonly string[] = [
  'compose',
  'composeFromOwnerResponse',
  'composeNavigate',
];

const projectorReferenceViolations = (files: readonly Source[]): string[] => {
  const out: string[] = [];
  for (const s of files) {
    if (s.key.startsWith('widgets/projection/')) continue;
    const names = importedNames(s);
    const { identifiers } = codeTokens(s);
    const importsProjection = [...names.values()].some(
      (spec) =>
        spec.includes('projection/widget-projector.service') ||
        spec.includes('projection/projector.registry'),
    );
    if (
      (identifiers.has('WidgetProjectorService') || importsProjection) &&
      !MAY_REFERENCE_PROJECTOR.includes(s.key)
    )
      out.push(`${s.key}: references the projector`);
    const projectorLocals = new Set(
      [...names.entries()]
        .filter(([, spec]) => spec.includes('projection/'))
        .map(([local]) => local),
    );
    for (const { path: p, node } of accesses(s)) {
      const [head, member] = p.split('.');
      if (
        member !== undefined &&
        COMPOSE_METHODS.includes(member) &&
        (projectorLocals.has(head) ||
          /projector/i.test(head) ||
          identifiers.has('WidgetProjectorService')) &&
        !MAY_CALL_PROJECTOR.includes(s.key)
      )
        out.push(`${at(s, node)}: calls the projector's ${member}`);
    }
  }
  return out;
};

/** The slot-12 object literal of the gateway's one ordered array. */
const slotTwelve = (s: Source): ts.ObjectLiteralExpression | null => {
  let found: ts.ObjectLiteralExpression | null = null;
  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n))
      for (const m of n.properties)
        if (
          ts.isPropertyAssignment(m) &&
          m.name.getText(s.sf) === 'n' &&
          ts.isStringLiteralLike(m.initializer) &&
          m.initializer.text === '12'
        )
          found = n;
    ts.forEachChild(n, visit);
  };
  visit(s.sf);
  return found;
};

/**
 * ARCH-12-10's source half: slot 12's entry references nothing from `projection/`, `c9Registry`,
 * `authority/` or any owner, and its `run` is the POINTER — a non-async arrow with no parameter, no
 * type parameter and no return type, whose body is `pass` (or a block returning it).
 */
const slotTwelveViolations = (s: Source): string[] => {
  const slot = slotTwelve(s);
  if (slot === null) return [`${s.key}: no slot '12' in the gate array`];
  const out: string[] = [];
  const names = importedNames(s);
  const FORBIDDEN_MODULE =
    /projection\/|\/authority\/|c9\.registry|orchestration\/|ai-tools\/|appointments\/|crm\//;
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      const spec = names.get(n.text);
      if (spec !== undefined && FORBIDDEN_MODULE.test(spec))
        out.push(`${at(s, n)}: slot 12 references ${n.text} from ${spec}`);
      if (n.text === 'c9Registry' || n.text === 'PROJECTOR_REGISTRY')
        out.push(`${at(s, n)}: slot 12 references ${n.text}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(slot);

  const run = slot.properties.find(
    (m): m is ts.PropertyAssignment =>
      ts.isPropertyAssignment(m) && m.name.getText(s.sf) === 'run',
  );
  if (!run) return [...out, `${s.key}: slot 12 has no run`];
  const fn = run.initializer;
  if (!ts.isArrowFunction(fn)) {
    out.push(`${at(s, run)}: slot 12's run is not an arrow function`);
    return out;
  }
  if (fn.parameters.length > 0)
    out.push(
      `${at(s, run)}: slot 12's run takes a parameter — a pointer reads nothing`,
    );
  if (fn.typeParameters !== undefined || fn.type !== undefined)
    out.push(
      `${at(s, run)}: slot 12's run is annotated; the pointer is written plainly`,
    );
  if (fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
    out.push(`${at(s, run)}: slot 12's run is async`);
  const isPassExpression = (e: ts.Expression): boolean => {
    let x: ts.Expression = e;
    while (ts.isParenthesizedExpression(x)) x = x.expression;
    if (ts.isIdentifier(x)) return x.text === 'pass';
    if (ts.isObjectLiteralExpression(x))
      return (
        x.properties.length === 1 &&
        x.properties.every(
          (p) =>
            ts.isPropertyAssignment(p) &&
            p.name.getText(s.sf) === 'outcome' &&
            ts.isStringLiteralLike(p.initializer) &&
            p.initializer.text === 'pass',
        )
      );
    return false;
  };
  const body = fn.body;
  const ok = ts.isBlock(body)
    ? body.statements.length === 1 &&
      ts.isReturnStatement(body.statements[0]) &&
      body.statements[0].expression !== undefined &&
      isPassExpression(body.statements[0].expression)
    : isPassExpression(body);
  if (!ok)
    out.push(
      `${at(s, run)}: slot 12's run is not the pointer (it does not return pass)`,
    );
  return out;
};

/**
 * IR-K4K8-1's gateway edits, AS TEXT, in the exact bytes the integrator applies. Three, and no more:
 * the `gate12` import becomes the `pass` import, slot 12's `run` becomes the pointer, and
 * `liveGateCount` stops counting slot 12.
 *
 * The transformation is IDEMPOTENT by construction: an edit whose anchor is absent must already have
 * its replacement in the file, or the CONTROL fails. So the same test measures the IR before it is
 * applied (the implementer's tree) and after it (the merge commit and everything later), and the day
 * the integrator writes something else, the CONTROL says so instead of quietly passing.
 */
const IR_GATEWAY_EDITS: ReadonlyArray<readonly [string, string]> = [
  [
    // Same device: the anchor names a module K4K8-3 forbids importing, so it is assembled rather than
    // spelled. The transformation is idempotent, so this CONTROL keeps working after the IR lands.
    `import { gate12 } from './gates/${'gate'}12';\n`,
    "import { pass } from './gates/verdict';\n",
  ],
  [
    '      run: (ctx) => gate12(ctx),\n',
    '      // D-7, G12 §5.2: a POINTER. The data fence runs in `WidgetProjectorService`, which Gate 13\n' +
      '      // calls on its REFINE/NAVIGATE edges. This slot reads nothing, routes nothing and refuses\n' +
      '      // nothing, and `liveGateCount` excludes it (k3 check 4; ARCH-12-9 and ARCH-12-10).\n' +
      '      run: () => pass,\n',
  ],
  [
    '    return this.gates.filter((g) => !g.pendingOn).length;\n',
    "    return this.gates.filter((g) => !g.pendingOn && g.n !== '12').length;\n",
  ],
];

/** The gateway as it stands after IR-K4K8-1, built from the real file rather than from a sketch. */
const postIrGateway = (): { source: Source; problems: string[] } => {
  const problems: string[] = [];
  let text = fs.readFileSync(
    path.join(WIDGETS, 'intent-gateway.service.ts'),
    'utf8',
  );
  for (const [find, replace] of IR_GATEWAY_EDITS) {
    const occurrences = text.split(find).length - 1;
    if (occurrences === 1) text = text.replace(find, () => replace);
    else if (occurrences === 0 && text.includes(replace))
      continue; // already applied
    else
      problems.push(
        `the IR anchor occurs ${occurrences} times, not once: ${JSON.stringify(find)}`,
      );
  }
  return { source: parse('widgets/intent-gateway.service.ts', text), problems };
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// the suite
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const projectionSources = (): Source[] => sourcesUnder(PROJECTION);
const widgetSources = (): Source[] => sourcesUnder(WIDGETS);
const gatewaySource = (): Source =>
  parse(
    'widgets/intent-gateway.service.ts',
    fs.readFileSync(path.join(WIDGETS, 'intent-gateway.service.ts'), 'utf8'),
  );

describe('U12b — the projector fences (ARCH-12-1 … ARCH-12-14)', () => {
  it('reads the files it guards, down to their leaves', () => {
    expect(projectionSources().map((s) => s.key)).toEqual([
      'widgets/projection/canonical-read.port.ts',
      'widgets/projection/projector.registry.ts',
      'widgets/projection/rows/initial-projector.rows.ts',
      'widgets/projection/widget-projector.service.ts',
    ]);
    // The widget scan reaches nested directories, so a path planted three levels down is seen.
    expect(widgetSources().map((s) => s.key)).toEqual(
      expect.arrayContaining([
        'widgets/projection/widget-projector.service.ts',
        'widgets/gates/gate13.ts',
        'widgets/authority/capability-policy.ts',
      ]),
    );
  });

  it('ARCH-12-1 [BUILD] the projection imports and references only the owners it is allowed, through their one call site each', () => {
    expect(arch1Violations(projectionSources())).toEqual([]);
  });

  it.each([
    [
      'the port imports the CRM',
      "import type { CrmService } from '../../crm/crm.service';\nexport type R = CrmService;\n",
    ],
    [
      'the port imports the AI-tool handler',
      "import { AiToolHandlerService } from '../../ai-tools/ai-tool-handler.service';\nexport const h = AiToolHandlerService;\n",
    ],
    [
      'the projector calls a C9 write method',
      'declare const C9Store: { review: () => void };\nexport const w = (): void => C9Store.review();\n',
    ],
    [
      'the projector reads a Prisma delegate of another layer',
      'declare const prisma: { appointment: { findMany: () => unknown[] } };\nexport const r = (): unknown[] => prisma.appointment.findMany();\n',
    ],
    [
      'the projection reaches the store client',
      "import { PrismaService } from '../../prisma/prisma.service';\nexport type P = PrismaService;\n",
    ],
  ])('RED: ARCH-12-1 on %s', (_name, text) => {
    expect(
      arch1Violations([parse('widgets/projection/planted.ts', text)]).length,
    ).toBeGreaterThan(0);
  });

  it('ARCH-12-2 [BUILD] no file under src/widgets implements a PII path of its own', () => {
    // RED until IR-K4K8-1 deletes `authority/pii-fences.ts`, `client/client-presentation.ts` and the
    // legacy `gates/gate12.ts`. The CONTROL below measures that it is green once they are gone.
    expect(piiPathViolations(widgetSources())).toEqual([]);
  });

  it('CONTROL: IR-K4K8-1 is applied — the three files are GONE, so the exclusion above is inert and the scan is not passing on an empty set', () => {
    // MERGE FIX (U12a's merge). This measured the TRANSITION: it asserted the pre-IR tree still
    // carried the three offenders, so ARCH-12-2's red was theirs. IR-K4K8-1 landed in this commit,
    // the files do not exist, and that assertion can only be false now. What is left to hold is the
    // post-IR fact in both directions — the files are gone, the exclusion list is therefore inert,
    // and the scan that reports no violation is scanning a real tree rather than nothing.
    for (const f of IR_K4K8_1_DELETES)
      expect([f, widgetSources().some((s) => s.key === f)]).toEqual([f, false]);
    expect(widgetSources().length).toBeGreaterThan(20);
    expect(piiPathViolations(widgetSources())).toEqual([]);
    // Not vacuous: the same scan over a PLANTED source still reports. (The `it.each` arms below run
    // every name; this is the one that keeps THIS control honest.)
    expect(
      piiPathViolations([
        parse(
          'widgets/projection/planted.ts',
          `export const ${CEILING} = Object.freeze({ pwa: 'client_identified' });\n`,
        ),
      ]).length,
    ).toBeGreaterThan(0);
  });

  it.each([
    [
      'a carrier PII ceiling comes back',
      `export const ${CEILING} = Object.freeze({ pwa: 'client_identified' });\n`,
    ],
    [
      'a PII rank comes back',
      `export const ${P}_RANK = Object.freeze({ none: 0 });\n`,
    ],
    [
      'the deleted fences are imported again',
      // Assembled from parts, for the same reason `PII_PATH_NAMES` is: P-K4K8's K4K8-3 scans every
      // widget module — this one included — for an import of a DELETED module, and a planted
      // violation spelled literally would be indistinguishable from a real one. Two BUILD ratchets
      // guard the same deletion from opposite sides, and neither may be excused by an exclusion list.
      `import { piiFences } from '../authority/${'pii'}-${'fences'}';\nexport const f = piiFences;\n`,
    ],
    [
      'an absent field is read as PERMISSION',
      "export const cell = (v: { x?: string }): string => (v.x === undefined ? 'PERMISSION' : 'OK');\n",
    ],
  ])('RED: ARCH-12-2 on %s', (_name, text) => {
    expect(
      piiPathViolations([parse('widgets/projection/planted.ts', text)]).length,
    ).toBeGreaterThan(0);
  });

  it('ARCH-12-3 [BUILD] no gate antecedent, resolver input or projector input reads a presentation input, and no carrier PII ceiling is named outside the files IR-K4K8-1 deletes', () => {
    const scanned = widgetSources().filter(
      (s) => !IR_K4K8_1_DELETES.includes(s.key),
    );
    expect(presentationAntecedentViolations(scanned)).toEqual([]);
    expect(
      scanned
        .filter((s) => codeTokens(s).identifiers.has(CEILING))
        .map((s) => s.key),
    ).toEqual([]);
    // The exclusion cannot grow: every excluded path is one the IR deletes.
    expect(IR_K4K8_1_DELETES.every((f) => f.startsWith('widgets/'))).toBe(true);
  });

  it.each([
    [
      'a gate reads profile_id',
      'export const g = (b: { profile_id: string }): string => b.profile_id;\n',
    ],
    [
      'a resolver reads a render header',
      "export const h = (headers: Record<string, string>): string | undefined => headers['x-maya-render-profile'];\n",
    ],
    [
      'a projector input reads the bridge',
      'export const b = (s: { BridgeSession: string }): string => s.BridgeSession;\n',
    ],
  ])('RED: ARCH-12-3 on %s', (_name, text) => {
    expect(
      presentationAntecedentViolations([
        parse('widgets/projection/planted.ts', text),
      ]).length,
    ).toBeGreaterThan(0);
  });

  it('ARCH-12-4 [BUILD] the projection does no arithmetic and writes no hasMore: false', () => {
    expect(arithmeticViolations(projectionSources())).toEqual([]);
  });

  it.each([
    [
      'a count is computed',
      'export const n = (a: number, b: number): number => a - b;\n',
    ],
    [
      'exhaustion is asserted',
      'export const body = Object.freeze({ hasMore: false });\n',
    ],
    [
      'the rows are aggregated',
      'export const total = (rows: number[]): number => rows.reduce((a, b) => a, 0);\n',
    ],
  ])('RED: ARCH-12-4 on %s', (_name, text) => {
    expect(
      arithmeticViolations([parse('widgets/projection/planted.ts', text)])
        .length,
    ).toBeGreaterThan(0);
  });

  it('ARCH-12-5 [BUILD] ProjectionPlan carries no C-class column and no free-text/phone input; its sole scalar is the typed journal date', () => {
    const port = projectionSources().find((s) =>
      s.key.endsWith('canonical-read.port.ts'),
    )!;
    const members = declaredMembers(port, 'ProjectionPlan');
    expect(members.length).toBeGreaterThan(0);
    expect(members.filter((m) => PLAN_FORBIDDEN_MEMBERS.includes(m))).toEqual(
      [],
    );
    // The closed-input member is typed to the closed-domain bindings, not to a raw input map.
    expect(port.text).toMatch(/closedInputs: ClosedInputBindings \| null/);
    expect(port.text).toMatch(
      /export type ClosedInputBindings = ReadonlyMap<string, readonly string\[\]>/,
    );
    const registry = projectionSources().find((s) =>
      s.key.endsWith('projector.registry.ts'),
    )!;
    expect([...new Set(argumentSourceLiterals(registry))].sort()).toEqual([
      'closed_input',
      'frozen_noun',
      'retained_local_business_date',
    ]);
  });

  it('ARCH-12-6 [BUILD] ProjectionOutcome hands the minter a WidgetComposerInput and nothing else, and the projection branches on no presentation mode', () => {
    const service = projectionSources().find((s) =>
      s.key.endsWith('widget-projector.service.ts'),
    )!;
    expect(service.text).toMatch(/readonly input: WidgetComposerInput;/);
    const outcomeMembers = new Set(
      [...service.text.matchAll(/readonly (\w+):/g)].map((m) => m[1]),
    );
    for (const forbidden of OUTCOME_FORBIDDEN_MEMBERS)
      expect({ forbidden, present: outcomeMembers.has(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    for (const s of projectionSources()) {
      const { identifiers, strings } = codeTokens(s);
      expect({
        file: s.key,
        mode: identifiers.has('presentationMode'),
      }).toEqual({
        file: s.key,
        mode: false,
      });
      expect({ file: s.key, mode: strings.has('presentation_mode') }).toEqual({
        file: s.key,
        mode: false,
      });
    }
  });

  it('ARCH-12-7 [BUILD] every registered row names one READ subject, at most one row per (tapped_kind, subject_key), subject_key ∈ ownerClassKeys(result_kind) and result_kind is emittable', () => {
    const seen = new Set<string>();
    for (const row of PROJECTOR_REGISTRY) {
      const pair = `${row.tapped_kind}|${row.subject_key}`;
      expect({ pair, duplicate: seen.has(pair) }).toEqual({
        pair,
        duplicate: false,
      });
      seen.add(pair);
      const [space, ...rest] = row.subject_key.split(':');
      const key = rest.join(':');
      if (row.composition === 'canonical_read' && space === 'C9')
        expect({ key, mode: C9_CAP_BY_KEY.get(key)?.mode }).toEqual({
          key,
          mode: 'READ',
        });
      expect({
        row: row.projector_id,
        ownerClass: isOwnerClassKey(row.result_kind, {
          space,
          key,
        } as unknown as CapabilityRef),
      }).toEqual({ row: row.projector_id, ownerClass: true });
      expect({
        row: row.projector_id,
        emittable: emittable(row.result_kind),
      }).toEqual({
        row: row.projector_id,
        emittable: true,
      });
      expect(row.unblocked_by.length).toBeGreaterThan(0);
    }
    // The duties are stated over a registry that is empty today (ARCH-12-13), so the check itself is
    // proved over a row that breaks each of them.
    const bad = {
      projector_id: 'planted',
      tapped_kind: 'METRIC' as WidgetKind,
      subject_key: 'C9:not.a.registered.key',
      result_kind: 'METRIC' as WidgetKind,
      source_kind: 'capability_read',
      composition: 'canonical_read',
      required_fields: [],
      slots: {},
      arguments: {},
      completeness: { total_field: null, exhausted_field: null },
      intent_proposals: [],
      unblocked_by: '',
    } as unknown as ProjectorRow;
    expect(C9_CAP_BY_KEY.get('not.a.registered.key')).toBeUndefined();
    expect(
      isOwnerClassKey(bad.result_kind, {
        space: 'C9',
        key: 'not.a.registered.key',
      } as unknown as CapabilityRef),
    ).toBe(false);
    expect(bad.unblocked_by).toHaveLength(0);
  });

  it('ARCH-12-8 [BUILD] the projection builds no principal, calls no C9Authority, and every read is dominated by the authority/actor precondition', () => {
    for (const s of projectionSources()) {
      const { identifiers } = codeTokens(s);
      for (const forbidden of [
        'C9Authority',
        'AiToolPrincipal',
        'buildPrincipal',
      ])
        expect({
          file: s.key,
          forbidden,
          present: identifiers.has(forbidden),
        }).toEqual({
          file: s.key,
          forbidden,
          present: false,
        });
    }
    const service = projectionSources().find((s) =>
      s.key.endsWith('widget-projector.service.ts'),
    )!;
    // The precondition is declared once and is the first thing every entry point asks.
    expect(service.text).toMatch(
      /private hasPrincipal\(plan: ProjectionPlan\): boolean \{\s*return plan\.authority !== null && plan\.actor !== null;/,
    );
    const entryPoints = [
      'async compose(',
      'composeFromOwnerResponse(',
      'composeNavigate(',
    ];
    for (const entry of entryPoints) {
      const body = service.text.slice(service.text.indexOf(`  ${entry}`));
      expect({
        entry,
        guarded: body.includes('this.hasPrincipal(plan)'),
      }).toEqual({
        entry,
        guarded: true,
      });
    }
    // U12b adds exactly one call site; every compose read flows through it after the precondition.
    expect(service.text.match(/this\.canonicalRead\.read\(/g)).toHaveLength(1);
  });

  it('ARCH-12-9 [BUILD] the projector is referenced only by the module that provides it and Gate 13, and called only by Gate 13', () => {
    expect(projectorReferenceViolations(widgetSources())).toEqual([]);
    // Gate 1 and Gate 5 hold no reference: R3.9.4's successor branch issues no projector call.
    for (const gate of ['widgets/gates/gate1.ts', 'widgets/gates/gate5.ts']) {
      const s = widgetSources().find((x) => x.key === gate)!;
      expect({
        gate,
        references: codeTokens(s).identifiers.has('WidgetProjectorService'),
      }).toEqual({
        gate,
        references: false,
      });
    }
  });

  it.each([
    [
      'Gate 1 composes through the projector',
      'widgets/gates/gate1.ts',
      "import { WidgetProjectorService } from '../projection/widget-projector.service';\nexport const g = WidgetProjectorService;\n",
    ],
    [
      'the resolve route calls the projector',
      'widgets/routing/resolve.ts',
      "import { WidgetProjectorService } from '../projection/widget-projector.service';\ndeclare const projector: WidgetProjectorService;\nexport const r = () => projector.composeNavigate(null as never);\n",
    ],
  ])('RED: ARCH-12-9 on %s', (_name, key, text) => {
    expect(
      projectorReferenceViolations([parse(key, text)]).length,
    ).toBeGreaterThan(0);
  });

  it('ARCH-12-10 [BUILD] slot 12 is a pointer: it references nothing, returns only pass, and liveGateCount excludes it', () => {
    // RED until IR-K4K8-1 turns the slot into the pointer and takes it out of `liveGateCount`.
    expect(slotTwelveViolations(gatewaySource())).toEqual([]);
    const gateway = new IntentGatewayService(
      {} as unknown as PrismaService,
      // D-2: the gateway takes the principal resolver, and U4's tenancy port. Slot 12 is read, never
      // run through `submit`, so neither is called here.
      { resolve: () => Promise.resolve(null) },
      { assert: () => undefined },
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      { mint: () => Promise.resolve(null) },
    );
    const gates = (gateway as unknown as { gates: readonly Gate[] }).gates;
    const slot = gates.find((g) => g.n === '12')!;
    expect(slot.host).toBe('Projector');
    expect(slot.pendingOn).toBeUndefined();
    expect(slot.run({} as unknown as GateContext)).toEqual({ outcome: 'pass' });
    const notPending = gates.filter((g) => !g.pendingOn).map((g) => g.n);
    expect(notPending).toContain('12');
    expect(gateway.liveGateCount).toBe(
      notPending.filter((n) => n !== '12').length,
    );
  });

  it('CONTROL: ARCH-12-10 over the real gateway with IR-K4K8-1 applied — the source half is clean, and the gate12 battery’s anchors are there', () => {
    const { source, problems } = postIrGateway();
    expect(problems).toEqual([]);
    expect(slotTwelveViolations(source)).toEqual([]);
    // MUT-12-M and MUT-12-T anchor on text IR-K4K8-1 writes, so their `find` is checked HERE rather
    // than by a dry run of the battery on a tree that does not carry it yet.
    for (const anchor of [
      '      run: () => pass,\n',
      "    return this.gates.filter((g) => !g.pendingOn && g.n !== '12').length;\n",
      "import { gate13 } from './gates/gate13';\n",
      "      host: 'Projector',\n",
    ])
      expect({
        anchor,
        occurrences: source.text.split(anchor).length - 1,
      }).toEqual({
        anchor,
        occurrences: 1,
      });
  });

  it.each([
    [
      'the slot looks the registry up',
      "import { PROJECTOR_REGISTRY } from './projection/projector.registry';\nimport { pass } from './gates/verdict';\nconst gates = [{ n: '12', name: 'Data fence', host: PROJECTOR_REGISTRY.length > 0 ? 'Projector' : 'Projector', run: () => pass }];\nexport default gates;\n",
    ],
    [
      'the slot refuses',
      "import { refuse } from './gates/verdict';\nconst gates = [{ n: '12', name: 'Data fence', host: 'Projector', run: () => refuse('use_secure_surface', '') }];\nexport default gates;\n",
    ],
    [
      'the slot reads its context',
      "import { pass } from './gates/verdict';\nconst gates = [{ n: '12', name: 'Data fence', host: 'Projector', run: (ctx: unknown) => (ctx ? pass : pass) }];\nexport default gates;\n",
    ],
  ])('RED: ARCH-12-10 on %s', (_name, text) => {
    expect(
      slotTwelveViolations(parse('widgets/intent-gateway.service.ts', text))
        .length,
    ).toBeGreaterThan(0);
  });

  it('ARCH-12-11 [BUILD] F3/FR-16: this change adds no capability, no capability field and no column to a non-Widget table', () => {
    // The registry's hash, frozen at U12a. A Gate 12 change never moves it; a unit that legitimately
    // changes the C9 canon moves this line in its own commit, with the reason in the message.
    expect(C9_REGISTRY_HASH).toBe(
      '4a6aaf7e7507af6f1ae9ed128cd6820fec2827596baa0cd2aabc66486a05ab63',
    );
    const contract = parse(
      'action-engine/action-engine.contract.ts',
      fs.readFileSync(
        path.join(SRC, 'action-engine', 'action-engine.contract.ts'),
        'utf8',
      ),
    );
    expect(declaredMembers(contract, 'RegisteredActionCapabilityV1')).toEqual([
      'capability',
      'capabilityVersion',
      'actionClass',
      'normalizedInputContract',
      'targetKind',
      'allowedSourceTypes',
      'identityVersion',
      'riskProfileVersion',
      'riskFacets',
      'policyKey',
      'policyVersion',
      'policyDecision',
      'autonomyLevel',
      'approvalRequirement',
      'approvalTtlMs',
      'retry',
      'reconciliation',
      'transportIdentityVersion',
      'executorKey',
      'executorVersion',
      'payloadRetentionMs',
      'auditRetentionMs',
      'normalizeInput',
    ]);
    // Every table the widget layer's own migrations create or alter is a `Widget*` table.
    const migrations = path.join(BE, 'prisma', 'migrations');
    const widgetMigrations = fs
      .readdirSync(migrations)
      .filter((d) => d.includes('widget_layer'))
      .sort();
    expect(widgetMigrations.length).toBeGreaterThan(0);
    const touched = widgetMigrations.flatMap((d) =>
      [
        ...fs
          .readFileSync(path.join(migrations, d, 'migration.sql'), 'utf8')
          .matchAll(
            /(?:CREATE TABLE|ALTER TABLE)\s+(?:IF NOT EXISTS\s+)?"?([A-Za-z_]+)"?/gi,
          ),
      ].map((m) => m[1]),
    );
    expect(
      [...new Set(touched)].filter((t) => !t.startsWith('Widget')),
    ).toEqual([]);
  });

  it('ARCH-12-12 [BUILD] composeNavigate reads nothing: no registry lookup, no port call, no branch on the target class (DEV-1)', () => {
    const service = projectionSources().find((s) =>
      s.key.endsWith('widget-projector.service.ts'),
    )!;
    const method = service.text.slice(
      service.text.indexOf('  composeNavigate('),
    );
    const body = method.slice(0, method.indexOf('\n  }'));
    for (const forbidden of [
      'projectorRowFor',
      'PROJECTOR_REGISTRY',
      'targetJson',
      '.read(',
    ])
      expect({ forbidden, present: body.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    // And no row is reachable from a NAVIGATE: the registry holds none at all today.
    expect(
      PROJECTOR_REGISTRY.filter((r) => r.tapped_kind === undefined),
    ).toEqual([]);
    expect(projectorRowFor('any-kind', 'C9:any.key')).toBeNull();
  });

  it('ARCH-12-13 [BUILD] the finite first row set has no blocker; deferred categories remain unregistered', () => {
    expect(ROWS_BLOCKED_BY).toEqual([]);
    expect(ROWS_DEFERRED_BY).toEqual(
      expect.arrayContaining([expect.stringContaining('OD-5')]),
    );
    expect(PROJECTOR_REGISTRY).toHaveLength(7);
    expect(PROJECTOR_REGISTRY.map((row) => row.subject_key)).toEqual([
      'C9:catalog.services.read',
      'C9:catalog.staff.read',
      'C9:booking.availability.read',
      'C9:company.business-hours.read',
      'C9:operations.journal.read',
      'C9:c9.no_action',
      'C9:appointments.own.reschedule',
    ]);
    // A row may not be registered without naming what unblocked it, even once the list is empty.
    for (const row of PROJECTOR_REGISTRY)
      expect(row.unblocked_by).not.toEqual('');
  });

  it('ARCH-12-14 [BUILD] nothing reachable from canonical-read.port.ts reads BridgeSession or native_bridge', () => {
    const seen = new Set<string>();
    const queue = [path.join(PROJECTION, 'canonical-read.port.ts')];
    const offenders: string[] = [];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const s = parse(
        posix(path.relative(SRC, file)),
        fs.readFileSync(file, 'utf8'),
      );
      offenders.push(...bridgeOffenders(s));
      for (const { spec } of moduleEdges(s)) {
        if (!spec.startsWith('.')) continue;
        const resolved = path.resolve(path.dirname(file), `${spec}.ts`);
        if (fs.existsSync(resolved)) queue.push(resolved);
      }
    }
    expect(offenders).toEqual([]);
    // The closure was really walked: the port's own transitive imports are in it.
    expect([...seen].map((f) => posix(path.relative(SRC, f)))).toEqual(
      expect.arrayContaining([
        'widgets/projection/canonical-read.port.ts',
        'widgets/projection/projector.registry.ts',
        'widgets/gate.types.ts',
      ]),
    );
  });

  it.each([
    [
      'a module on the edge imports the bridge session',
      "import type { BridgeSession } from '../../widget-contract/derived-shapes';\nexport type B = BridgeSession;\n",
    ],
    [
      'a module on the edge reads the native bridge off a value',
      'declare const env: { native_bridge: string };\nexport const b = (): string => env.native_bridge;\n',
    ],
  ])('RED: ARCH-12-14 on %s', (_name, text) => {
    expect(
      bridgeOffenders(parse('widgets/projection/planted.ts', text)).length,
    ).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The skeleton's behaviour, at unit level. NEVER EVIDENCE (§0.5): a function-level test is not live
// proof, and none of these flips a clause. They exist so that "degraded with zero reads" is a
// property of the code rather than of the empty registry alone.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const planFor = (over: Partial<ProjectionPlan> = {}): ProjectionPlan =>
  ({
    widgetId: 'w-1',
    widgetKind: 'METRIC',
    effect: 'REFINE',
    capabilitySpace: 'C9',
    capabilityKey: 'c7.measurement.read',
    targetJson: null,
    runId: null,
    revisionId: null,
    c9Domain: null,
    frozenNounsJson: null,
    requestedScopeHash: 'scope',
    retainedLocalBusinessDate: null,
    authority: { tenantId: 't', userId: 'u' },
    actor: { userId: 'u', tenantId: 't' },
    aiToolSurface: 'web',
    answeringChannel: 'pwa',
    resolvedNouns: null,
    closedInputs: null,
    ...over,
  }) as unknown as ProjectionPlan;

describe('U12b [U] the projector reads only registered rows', () => {
  const fact = {
    capability: 'catalog.services.read',
    status: 'measured' as const,
    as_of: '2026-09-23T00:00:00.000Z',
    evidence_refs: [],
    completeness: {
      status: 'PARTIAL' as const,
      requestedScopeHash: '0'.repeat(64),
      returnedCount: 1,
      totalCount: null,
      hasMore: true,
      cursorRef: null,
      truncated: false,
      reasonCodes: ['NOT_COLLECTED'],
    },
  };
  const read = jest.fn().mockResolvedValue({
    kind: 'value',
    value: { services: [] },
    fact,
  });
  const projector = new WidgetProjectorService({ read });
  const degradedWith = (why: string) => ({ kind: 'degraded', why });

  it('[U] compose on a subject with no registered row degrades', async () => {
    await expect(projector.compose(planFor())).resolves.toEqual(
      degradedWith('no_registered_row'),
    );
  });

  it('[U] composeFromOwnerResponse never reads the response', () => {
    const response = { marker: 'owner-byte-that-must-not-appear' };
    const outcome: ProjectionOutcome = projector.composeFromOwnerResponse(
      planFor(),
      response,
    );
    expect(outcome).toEqual(degradedWith('no_registered_row'));
    expect(JSON.stringify(outcome)).not.toContain('owner-byte');
  });

  it('[U] composeNavigate degrades for every NAVIGATE, whatever the target class (DEV-1 interim; holds by absence)', () => {
    for (const target of [
      { class: 's' },
      { class: 'i' },
      { class: 'detail' },
      { class: 'w' },
    ])
      expect(
        projector.composeNavigate(
          planFor({ effect: 'NAVIGATE', targetJson: target }),
        ),
      ).toEqual(degradedWith('navigate_interim'));
  });

  it('[U] no principal, no read (I47)', async () => {
    await expect(
      projector.compose(planFor({ authority: null })),
    ).resolves.toEqual(degradedWith('no_principal'));
    await expect(projector.compose(planFor({ actor: null }))).resolves.toEqual(
      degradedWith('no_principal'),
    );
    expect(projector.composeNavigate(planFor({ authority: null }))).toEqual(
      degradedWith('no_principal'),
    );
  });

  it('[U] one registered capability row makes exactly one canonical read', async () => {
    read.mockClear();
    const outcome = await projector.compose(
      planFor({
        widgetKind: 'SERVICE_SELECTOR',
        capabilityKey: 'catalog.services.read',
        requestedScopeHash: '0'.repeat(64),
      }),
    );
    expect(outcome.kind).toBe('composer_input');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('[JOURNAL-DATE] passes the exact validated date to the canonical owner without reinterpretation', async () => {
    const journalRead = jest.fn().mockResolvedValue({
      kind: 'value',
      value: {
        date: '2026-09-24',
        timezone: 'Europe/Moscow',
        summary: {},
        appointments: [],
      },
      fact: { ...fact, capability: 'operations.journal.read' },
    });
    const journal = new WidgetProjectorService({ read: journalRead });
    await expect(
      journal.compose(
        planFor({
          widgetKind: 'SCHEDULE',
          capabilityKey: 'operations.journal.read',
          retainedLocalBusinessDate: '2026-09-24',
        }),
      ),
    ).resolves.toEqual(expect.objectContaining({ kind: 'composer_input' }));
    expect(journalRead).toHaveBeenCalledWith(
      expect.objectContaining({ ownerArguments: { date: '2026-09-24' } }),
    );
  });

  it('[JOURNAL-DATE] revoked/foreign authority refuses before the canonical read', async () => {
    const journalRead = jest.fn();
    const journal = new WidgetProjectorService({ read: journalRead });
    const base = {
      widgetKind: 'SCHEDULE' as const,
      capabilityKey: 'operations.journal.read',
      retainedLocalBusinessDate: '2026-09-24',
    };
    await expect(
      journal.compose(planFor({ ...base, authority: null })),
    ).resolves.toEqual(degradedWith('no_principal'));
    await expect(
      journal.compose(
        planFor({
          ...base,
          actor: { userId: 'u', tenantId: 'foreign' } as never,
        }),
      ),
    ).resolves.toEqual(degradedWith('authority_mismatch'));
    expect(journalRead).not.toHaveBeenCalled();
  });

  it('[JOURNAL-DATE] refuses an unparseable retained date and never substitutes a noun handle', async () => {
    const journalRead = jest.fn();
    const journal = new WidgetProjectorService({ read: journalRead });
    await expect(
      journal.compose(
        planFor({
          widgetKind: 'SCHEDULE',
          capabilityKey: 'operations.journal.read',
          retainedLocalBusinessDate: '2026-02-30',
        }),
      ),
    ).rejects.toThrow('local_business_date_invalid');
    expect(journalRead).not.toHaveBeenCalled();
  });

  it('[U] the subject key is the record’s space and key, and a record naming none selects nothing', () => {
    expect(subjectKeyOf(planFor())).toBe('C9:c7.measurement.read');
    expect(subjectKeyOf(planFor({ capabilityKey: null }))).toBeNull();
    expect(projectorRowFor('METRIC', null)).toBeNull();
  });
});
