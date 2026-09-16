#!/usr/bin/env node
// Emit the EXECUTABLE copy of the certified floor derivation.
//
// `src/widget-contract/verification-floor.ts` is generated from the contract and is correct. It
// cannot run: its dependencies are `export declare` ambients with no runtime value, and the whole
// directory is excluded from the production build. The owner's ruling on this is exact —
// «Не подменять derivation таблицей, вручную переписанной из contract. Source должен оставаться
// generated/certified contract definitions.»
//
// So the derivation is not rewritten. It is COPIED, byte for byte below the import block, with the
// imports rewired to the runtime bindings. The algorithm has one source; this file only changes
// where its dependencies come from. `--check` proves the copy has not drifted, and the gate runs it.
//
//   node scripts/widget-contract/emit-runtime-floor.mjs          emit
//   node scripts/widget-contract/emit-runtime-floor.mjs --check  fail if the copy has drifted

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '../..');
const SRC = path.join(backend, 'src/widget-contract/verification-floor.ts');
const OUT = path.join(backend, 'src/widgets/authority/verification-floor.runtime.ts');
const CHECK = process.argv.includes('--check');

const source = fs.readFileSync(SRC, 'utf8');

// The body is everything after the generated import block. Splitting on the first declaration
// keeps the split deterministic: an import added upstream moves the boundary, it does not silently
// land inside the body.
const MARKER = '// --- section 0.8 (contract line 662) ---';
const at = source.indexOf(MARKER);
if (at === -1)
  throw new Error(
    'the section-0.8 marker is gone from verification-floor.ts — the generator changed shape, ' +
      'and copying past an unknown boundary is exactly what this script must not do',
  );
const body = source.slice(at);

const HEADER = `// GENERATED from src/widget-contract/verification-floor.ts — do not hand-edit.
// Regenerate: node scripts/widget-contract/emit-runtime-floor.mjs
//
// The certified derivation, byte for byte, with its imports rewired to runtime bindings. The
// algorithm is not restated here; it is the same text. \`--check\` fails if the two diverge, so a
// change to the contract's derivation cannot reach production without coming through the generator.
/* eslint-disable */
import {
  C9_CAPABILITIES,
  actionCapabilityRegistry,
  c9Registry,
  maxLevel,
  targetFloor,
  capKey,
  AE_CAP_BY_KEY,
  MAYA_AI_TOOL_CATALOG_BY_NAME,
  WIDGET_CAPABILITY_POLICY,
  AE_WIDGET_COMMIT_ALLOWLIST,
  CONSENT,
  IDENTITY,
  subjectCapability,
} from './contract-bindings';
import {
  CONSENT_CLASS_FLOOR,
  CONTROL_FLOOR,
  EFFECT_FLOOR,
  KIND_FLOOR,
  RISK_FLOOR,
} from '../../widget-contract/tables';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { Correlation, VerificationLevel } from '../../widget-contract/envelope';
import type {
  EffectClass,
  IntentRecord,
  IntentTarget,
  WidgetIntent,
} from '../../widget-contract/intent';
import type { WidgetKind } from '../../widget-contract/kinds';
import type { AeCommitRow } from '../../widget-contract/registries';
import type { C9Domain } from '../../widget-contract/ambient';

export { subjectCapability };

`;

// The copied body declares subjectCapability as a signature; the runtime copy imports it instead.
const rewritten = body.replace(
  /export declare function subjectCapability\([\s\S]*?\): CapabilityRef \| null;/,
  '// `subjectCapability` is imported above — §3.5 owns its single body.',
);

const emitted = HEADER + rewritten;

if (CHECK) {
  if (!fs.existsSync(OUT)) {
    console.error('runtime floor copy is missing — run without --check');
    process.exit(1);
  }
  const actual = fs.readFileSync(OUT, 'utf8');
  if (actual !== emitted) {
    console.error('DRIFT: the runtime floor copy no longer matches the certified derivation');
    process.exit(1);
  }
  console.log('runtime floor copy matches the certified derivation');
} else {
  fs.writeFileSync(OUT, emitted);
  console.log(`emitted ${path.relative(backend, OUT)} (${emitted.length} bytes)`);
}
