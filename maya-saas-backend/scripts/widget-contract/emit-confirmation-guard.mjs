#!/usr/bin/env node
// Emit the EXECUTABLE copy of the certified confirmation guard (§0.13 F72).
//
// `src/widget-contract/confirmation-guard.ts` is generated from the contract and is correct. It
// cannot run: `refuseMint` (`ambient.ts`) and `AE_WIDGET_COMMIT_ALLOWLIST` (`registries.ts`) are
// `export declare` — compile-time names with no runtime value — and the whole directory is excluded
// from the production build. So `requiredConfirmationKind()` existed as text and never as behaviour,
// and Gate 7 substituted `isAllowlisted`/`rowFor`, which never compared with `widget_kind` at all.
//
// The lookup is NOT rewritten here. It is COPIED, byte for byte below the import block, with the
// imports rewired to the runtime bindings — the same discipline `emit-runtime-floor.mjs` applies to
// the floor derivation, and for the same reason: F72's value is that it has NO DEFAULT BRANCH
// (C11:1391-1411), and a hand-written second copy is exactly how a default branch comes back.
// `--check` proves the copy has not drifted.
//
//   node scripts/widget-contract/emit-confirmation-guard.mjs          emit
//   node scripts/widget-contract/emit-confirmation-guard.mjs --check  fail if the copy has drifted

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '../..');
const SRC = path.join(backend, 'src/widget-contract/confirmation-guard.ts');
const OUT = path.join(
  backend,
  'src/widgets/authority/confirmation-guard.runtime.ts',
);
const CHECK = process.argv.includes('--check');

const source = fs.readFileSync(SRC, 'utf8');

// The body is everything from the first generated section marker. Splitting there keeps the split
// deterministic: an import added upstream moves the boundary, it does not land inside the body.
const MARKER = /\/\/ --- section 0\.13 \(contract line \d+\) ---/;
const at = source.search(MARKER);
if (at === -1)
  throw new Error(
    'the section-0.13 marker is gone from confirmation-guard.ts — the generator changed shape, ' +
      'and copying past an unknown boundary is exactly what this script must not do',
  );
const body = source.slice(at);

// F72's lookup must survive the copy verbatim. If the upstream body ever loses one of its two
// fail-closed branches, the copy is refused rather than emitted: a guard with a default branch is
// not a guard (C11:1400-1411).
for (const required of [
  "if (ref.space !== 'AE') refuseMint('wrong_space')",
  "if (row === undefined) refuseMint('capability_not_allowlisted')",
  'return row.confirmation_kind;',
])
  if (!body.includes(required))
    throw new Error(
      `the certified §0.13 body no longer contains \`${required}\` — refusing to emit a guard that ` +
        'may have lost a fail-closed branch',
    );

const HEADER = `// GENERATED from src/widget-contract/confirmation-guard.ts — do not hand-edit.
// Regenerate: node scripts/widget-contract/emit-confirmation-guard.mjs
//
// §0.13 F72, byte for byte, with its imports rewired to runtime bindings. The lookup is not restated
// here; it is the same text. \`--check\` fails if the two diverge, so a change to the certified guard
// cannot reach Gate 7 without coming through the generator.
//
// The one behavioural consequence worth naming: \`refuseMint\` throws \`MintRefusal\`. At \`EP-MINT\` that
// aborts a mint; at \`EP-INGRESS\` Gate 7 catches it and turns it into a closed-vocabulary refusal.
// \`wrong_space\` and \`capability_not_allowlisted\` are mint codes and are never ingress codes.
//
// No blanket \`eslint-disable\`, unlike the floor copy: this body is three statements and lints clean,
// and a directive that suppresses nothing is a warning on every run of \`npm run lint\`.
import { refuseMint, AE_WIDGET_COMMIT_ALLOWLIST } from './contract-bindings';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { WidgetKind } from '../../widget-contract/kinds';

`;

// The copied body carries the two §0.13 member fragments and F80's `DraftClass`, which the runtime
// copy does not need; only the lookup is kept, up to the next section marker.
const NEXT_SECTION = /\n\/\/ --- section (?!0\.13 \(contract line 1393\))/;
const cut = body.search(NEXT_SECTION);
// One trailing newline, whatever the source had: the emitted file is prettier-checked like any other
// file under `src/`, and a stray blank line at the end would put the generator and the formatter in a
// loop where each undoes the other.
const lookup = `${(cut === -1 ? body : body.slice(0, cut)).replace(/\s+$/, '')}\n`;

const emitted = HEADER + lookup;

if (CHECK) {
  if (!fs.existsSync(OUT)) {
    console.error('runtime confirmation guard is missing — run without --check');
    process.exit(1);
  }
  const actual = fs.readFileSync(OUT, 'utf8');
  if (actual !== emitted) {
    console.error(
      'DRIFT: the runtime confirmation guard no longer matches the certified §0.13 lookup',
    );
    process.exit(1);
  }
  console.log('runtime confirmation guard matches the certified §0.13 lookup');
} else {
  fs.writeFileSync(OUT, emitted);
  console.log(
    `emitted ${path.relative(backend, OUT)} (${emitted.length} bytes)`,
  );
}
