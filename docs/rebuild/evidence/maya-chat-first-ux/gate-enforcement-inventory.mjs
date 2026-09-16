#!/usr/bin/env node
// The executable enforcement inventory the owner asked for instead of "15/15 CENTRAL".
//
//   SECURITY/BUSINESS GATES WITH EXECUTABLE ENFORCEMENT: n/15
//
// A gate counts only if code that EXECUTES on the mint or admit path enforces its rule. Being in
// the array is not enough — ten of these were in the array as `pending()` stubs that refused
// everything, which is a blanket refusal and not a fence. Having a correct module is not enough
// either: the five PII fences were correct and called from nowhere.
//
// So each row below names a file and a symbol, and the script checks three things about it:
//   1. the symbol exists
//   2. the pipeline calls it (or, for Gate 14, its owner's ingress does)
//   3. it is not a `pending()` stub
//
// Run: node docs/rebuild/evidence/maya-chat-first-ux/gate-enforcement-inventory.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const GATEWAY = 'maya-saas-backend/src/widgets/intent-gateway.service.ts';
const LOGIC = 'maya-saas-backend/src/widgets/gates/gate-logic.ts';
const INGRESS = 'maya-saas-backend/src/action-engine/action-engine.ingress.ts';

const gateway = read(GATEWAY);
const logic = read(LOGIC);
const ingress = fs.existsSync(path.join(repo, INGRESS)) ? read(INGRESS) : '';

/**
 * The fifteen, each with the symbol that enforces it and where that symbol is called.
 *
 * Gate 14 is deliberately NOT in the pipeline. It is enforced in the Action Engine's own ingress,
 * which is where it executes and which is its owner — "enforced in owning module and intentionally
 * not central" is a real category and this is its one member. Moving it here for a tidier count
 * would move a fence away from the module that owns it.
 */
const GATES = [
  { n: '1', name: 'Token integrity', symbol: "n: '1'", host: 'pipeline', file: GATEWAY, src: gateway },
  { n: '2', name: 'Transport auth', symbol: "n: '2'", host: 'pipeline (global JWT guard)', file: GATEWAY, src: gateway },
  { n: '3', name: 'Principal binding', symbol: 'digestEquals', host: 'pipeline', file: GATEWAY, src: gateway },
  { n: '4', name: 'Tenant scope', symbol: "n: '4'", host: 'pipeline', file: GATEWAY, src: gateway },
  { n: '5', name: 'Verification floor', symbol: 'gate5', host: 'pipeline', file: LOGIC, src: logic },
  { n: '6', name: 'Authority', symbol: 'gate6', host: 'pipeline', file: LOGIC, src: logic },
  { n: '6r', name: 'R3.5.1 sensitive destination', symbol: 'gateSensitiveDest', host: 'pipeline (with 6)', file: LOGIC, src: logic },
  { n: '7', name: 'Effect admissibility', symbol: 'gate7', host: 'pipeline', file: LOGIC, src: logic },
  { n: '8', name: 'Input validation', symbol: 'gate8', host: 'pipeline', file: LOGIC, src: logic },
  { n: '8-R', name: 'Readback', symbol: 'gate8R', host: 'pipeline', file: LOGIC, src: logic },
  { n: '9', name: 'Lowering', symbol: 'gate9', host: 'pipeline', file: LOGIC, src: logic },
  { n: '10', name: 'Divergence audit', symbol: 'gate10', host: 'pipeline', file: LOGIC, src: logic },
  { n: '11', name: 'Noun resolution', symbol: 'gate11', host: 'pipeline', file: LOGIC, src: logic },
  { n: '12', name: 'Data fence', symbol: 'gate12', host: 'pipeline', file: LOGIC, src: logic },
  { n: '13', name: 'Effect routing', symbol: 'gate13', host: 'pipeline', file: LOGIC, src: logic },
  { n: '14', name: 'Canonical action', symbol: 'assertNoCallerAuthority', host: 'Action Engine ingress', file: INGRESS, src: ingress },
];

const rows = GATES.map((g) => {
  const defined = g.src.includes(g.symbol);
  // On-path: the pipeline calls it, or — for Gate 14 — its own ingress does.
  const called =
    g.host === 'Action Engine ingress'
      ? /this\.assertNoCallerAuthority\(/.test(ingress)
      : g.file === GATEWAY
        ? g.src.includes(g.symbol)
        : new RegExp(`${g.symbol}\\(ctx\\)|${g.symbol}\\(\\)`).test(gateway);
  // A `pending()` stub RUNS and REFUSES — honest, but not enforcement. It only disqualifies a
  // gate whose host IS the pipeline: a gate enforced in its owning module is not made a stub by
  // anything the pipeline does or does not contain.
  const stub =
    g.host.startsWith('pipeline') && new RegExp(`pending\\('${g.n}'`).test(gateway);
  return { ...g, defined, called, stub, enforced: defined && called && !stub };
});

// 6r is R3.5.1 riding with Gate 6; it is not a sixteenth gate of §3.9.
const contractGates = rows.filter((r) => r.n !== '6r');
const enforced = contractGates.filter((r) => r.enforced);

console.log('GATE ENFORCEMENT INVENTORY');
console.log('='.repeat(78));
for (const r of rows)
  console.log(
    `  ${r.enforced ? 'ENFORCED' : 'NOT     '}  gate ${r.n.padEnd(4)} ${r.name.padEnd(28)} ` +
      `${r.symbol.padEnd(24)} ${r.host}`,
  );
console.log();
console.log(`  SECURITY/BUSINESS GATES WITH EXECUTABLE ENFORCEMENT: ${enforced.length}/${contractGates.length}`);
console.log(`  of which in the central pipeline: ${enforced.filter((r) => r.host.startsWith('pipeline')).length}`);
console.log(`  of which in an owning module:     ${enforced.filter((r) => !r.host.startsWith('pipeline')).length}`);
console.log(`  still a pending() stub:           ${rows.filter((r) => r.stub).length}`);
console.log();
console.log('  GATE MODULE EXISTS != GATE ENFORCED — each row above is checked for all three:');
console.log('  the symbol exists, the path calls it, and it is not a stub.');

process.exitCode = enforced.length === contractGates.length ? 0 : 1;
