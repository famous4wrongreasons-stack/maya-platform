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
//
// CORRECTION: this inventory printed 15/15 at 6dc37bc8, and it was wrong. The mechanical checks below
// are necessary but not sufficient. The headline is now the clause-level audit at the end.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const GATEWAY = 'maya-saas-backend/src/widgets/intent-gateway.service.ts';
const INGRESS = 'maya-saas-backend/src/action-engine/action-engine.ingress.ts';
// Gates 5–13 were one file (`gate-logic.ts`) and are now one file per gate. A row for a gate
// function reads that gate's own file; the checks applied to it are the same as before the split.
// A slot that is a `pending()` stub has no gate file: its row reads the gateway, as Gate 9's always
// has. Since U0, slots 8 and 10 are such stubs, and their former files are deleted.
const gateFile = (name) => `maya-saas-backend/src/widgets/gates/${name}.ts`;
const logicRow = (name) => ({ file: gateFile(name), src: read(gateFile(name)), logic: true });

const gateway = read(GATEWAY);
const ingress = fs.existsSync(path.join(repo, INGRESS)) ? read(INGRESS) : '';
const appModule = read('maya-saas-backend/src/app.module.ts');
const widgetsController = read('maya-saas-backend/src/widgets/widgets.controller.ts');

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
  { n: '2', name: 'Transport auth', symbol: 'JwtAuthGuard', host: 'HTTP middleware (global guard)', file: 'maya-saas-backend/src/app.module.ts', src: appModule },
  { n: '3', name: 'Principal binding', symbol: 'digestEquals', host: 'pipeline', file: GATEWAY, src: gateway },
  { n: '4', name: 'Tenant scope', symbol: "n: '4'", host: 'pipeline', file: GATEWAY, src: gateway },
  { n: '5', name: 'Verification floor', symbol: 'gate5', host: 'pipeline', ...logicRow('gate5') },
  { n: '6', name: 'Authority', symbol: 'gate6', host: 'pipeline', ...logicRow('gate6') },
  { n: '6r', name: 'R3.5.1 sensitive destination', symbol: 'gateSensitiveDest', host: 'pipeline (with 6)', ...logicRow('gate6') },
  { n: '7', name: 'Effect admissibility', symbol: 'gate7', host: 'pipeline', ...logicRow('gate7') },
  { n: '8', name: 'Input validation', symbol: "'Input validation'", host: 'pipeline', file: GATEWAY, src: gateway },
  { n: '8-R', name: 'Readback', symbol: 'gate8R', host: 'pipeline', ...logicRow('gate8r') },
  { n: '9', name: 'Lowering', symbol: "'Lowering'", host: 'pipeline', file: GATEWAY, src: gateway },
  { n: '10', name: 'Divergence audit', symbol: "'Divergence audit'", host: 'pipeline', file: GATEWAY, src: gateway },
  { n: '11', name: 'Noun resolution', symbol: 'gate11', host: 'pipeline', ...logicRow('gate11') },
  { n: '12', name: 'Data fence', symbol: 'gate12', host: 'pipeline', ...logicRow('gate12') },
  { n: '13', name: 'Effect routing', symbol: 'gate13', host: 'pipeline', ...logicRow('gate13') },
  { n: '14', name: 'Canonical action', symbol: 'assertNoCallerAuthority', host: 'Action Engine ingress', file: INGRESS, src: ingress },
];

const rows = GATES.map((g) => {
  const defined = g.src.includes(g.symbol);
  // On-path: the pipeline calls it, or — for Gate 14 — its own ingress does.
  // Gate 2 has no slot logic to call: it is enforced before the request reaches the gateway, so its
  // proof is that the guard is GLOBAL and that the widgets controller does not opt out of it.
  const called =
    g.host === 'Action Engine ingress'
      ? /this\.assertNoCallerAuthority\(/.test(ingress)
      : g.n === '2'
        ? /provide:\s*APP_GUARD,\s*useClass:\s*JwtAuthGuard/.test(appModule) && !/@Public\(/.test(widgetsController)
        : g.file === GATEWAY
          ? g.src.includes(g.symbol)
          : new RegExp(`${g.symbol}\\(ctx\\)|${g.symbol}\\(\\)`).test(gateway);
  // A gate function that can only return `pass` is not enforcement, however it is wired. This is the
  // check that would have caught `gate9 = () => pass`, counted as wired in the 15/15 that was wrong.
  // The same, for a slot whose run is written inline in the pipeline array.
  const slotAt = gateway.search(new RegExp(`n: '${g.n}'`));
  const slot = slotAt < 0 ? '' : gateway.slice(slotAt, slotAt + 400).split(/\n\s{4}(?:\{|pending\()/)[0];
  const inlineConstantPass =
    g.host.startsWith('pipeline') && /run:\s*\(\s*\)\s*=>\s*(\(\s*)?(\{\s*outcome:\s*'pass'|pass\b)/.test(slot);
  const constantPass = inlineConstantPass ||
    (g.logic === true && new RegExp(`export const ${g.symbol} = \\([^)]*\\)(: GateVerdict)? =>\\s*pass;`).test(g.src));
  // A `pending()` stub RUNS and REFUSES — honest, but not enforcement. It only disqualifies a
  // gate whose host IS the pipeline: a gate enforced in its owning module is not made a stub by
  // anything the pipeline does or does not contain.
  const stub =
    g.host.startsWith('pipeline') && new RegExp(`pending\\(\\s*'${g.n}'`).test(gateway);
  return { ...g, defined, called, stub, constantPass, enforced: defined && called && !stub && !constantPass };
});

// REACHABILITY. The runner stops at the first non-pass verdict, so a correct gate placed after a
// refusing stub is never reached by any live request. It is wired, and it is tested as a function,
// but on the admission path it enforces nothing. Only pipeline gates are ordered this way; Gates 2
// and 14 run in their own hosts regardless of the pipeline.
//
// The boundary is the FIRST stub in §3.9 order, whichever slot that is — Gate 9 until U0, Gate 8
// since. The stub itself runs (it refuses); nothing after it runs.
const ORDER = ['1', '2', '3', '4', '5', '6', '6r', '7', '8', '8-R', '9', '10', '11', '12', '13'];
const firstStub = ORDER.findIndex((n) => rows.find((r) => r.n === n)?.stub);
for (const r of rows) {
  const at = ORDER.indexOf(r.n);
  r.reachable = !r.host.startsWith('pipeline') || firstStub < 0 || at <= firstStub;
}

// 6r is R3.5.1 riding with Gate 6; it is not a sixteenth gate of §3.9.
const contractGates = rows.filter((r) => r.n !== '6r');
const enforced = contractGates.filter((r) => r.enforced && r.reachable);
const wiredUnreachable = contractGates.filter((r) => r.enforced && !r.reachable);

console.log('GATE ENFORCEMENT INVENTORY');
console.log('='.repeat(78));
for (const r of rows)
  console.log(
    `  ${r.enforced ? (r.reachable ? 'ENFORCED' : 'WIRED*  ') : 'NOT     '}  gate ${r.n.padEnd(4)} ${r.name.padEnd(28)} ` +
      `${r.symbol.padEnd(24)} ${r.host}`,
  );
console.log();
console.log(`  SECURITY/BUSINESS GATES WITH EXECUTABLE ENFORCEMENT: ${enforced.length}/${contractGates.length}   (executes on the live path)`);
console.log(`  wired but unreachable behind a stub (WIRED*):        ${wiredUnreachable.length}${wiredUnreachable.length ? `  (gate ${wiredUnreachable.map((r) => r.n).join(', ')})` : ''}`);
console.log(`  of which in the central pipeline: ${enforced.filter((r) => r.host.startsWith('pipeline')).length}`);
console.log(`  of which in an owning module:     ${enforced.filter((r) => !r.host.startsWith('pipeline')).length}   (Gate 2: global guard; Gate 14: Action Engine)`);
console.log(`  still a pending() stub:           ${rows.filter((r) => r.stub).length}${rows.some((r) => r.stub) ? `  (gate ${rows.filter((r) => r.stub).map((r) => r.n).join(', ')})` : ''}`);
console.log(`  a function that can only pass:    ${rows.filter((r) => r.constantPass).length}`);
console.log(`  reachability ends at:             ${firstStub < 0 ? 'no stub (every pipeline slot is reachable)' : `gate ${ORDER[firstStub]}, the first pending() stub — no pipeline gate after it runs`}`);
console.log();
console.log('  GATE MODULE EXISTS != GATE ENFORCED — each row above is checked for all three:');
console.log('  the symbol exists, the path calls it, and it is not a stub.');

// ── what the mechanical checks cannot see ────────────────────────────────────────────────────────
// Symbol, call, stub, constant pass and reachability are all mechanical, and all of them passed for
// gates that implement only part of their certified row, or run with no input. The 15/15 reported at
// 6dc37bc8 was that blind spot. The clause-by-clause reading is a recorded audit — judgement, kept in
// a file so it can be argued with — and the headline figure is taken from it, never from the count
// above.
const audit = JSON.parse(read('docs/rebuild/evidence/maya-chat-first-ux/gate-conformance-audit.json'));
console.log();
console.log('CONFORMANCE TO §3.9, clause by clause (gate-conformance-audit.json)');
for (const [cls, ids] of Object.entries(audit.tally)) console.log(`  ${cls.padEnd(10)} ${String(ids.length).padStart(2)}  gate ${ids.join(', ')}`);
for (const g of audit.gates) {
  const open = Object.entries(g.clauses).filter(([, ok]) => !ok).map(([c]) => c);
  if (open.length) console.log(`    gate ${g.n.padEnd(4)} open: ${open.join('; ')}`);
}
console.log();
console.log(`  ${audit.headline}`);
// Consistency between the recorded audit and what the mechanical checks see. The audit is judgement;
// these are the places where judgement may not contradict the code:
//   - COMPLETE needs every mechanical check, and reachability;
//   - PARTIAL means "reachable, and some clauses execute", so it needs reachability too;
//   - NOT_BUILT is exactly a refusing pending() stub, and every stub is NOT_BUILT.
const mech = (n) => contractGates.find((r) => r.n === n);
const incoherent = [
  ...audit.tally.COMPLETE.filter((n) => !(mech(n)?.enforced && mech(n)?.reachable)).map((n) => `gate ${n}: audit COMPLETE, mechanical checks or reachability fail`),
  ...(audit.tally.PARTIAL ?? []).filter((n) => !mech(n)?.reachable).map((n) => `gate ${n}: audit PARTIAL, but unreachable behind gate ${ORDER[firstStub]}`),
  ...(audit.tally.NOT_BUILT ?? []).filter((n) => !mech(n)?.stub).map((n) => `gate ${n}: audit NOT_BUILT, but the slot is not a pending() stub`),
  ...contractGates.filter((r) => r.stub && !(audit.tally.NOT_BUILT ?? []).includes(r.n)).map((r) => `gate ${r.n}: a pending() stub the audit does not call NOT_BUILT`),
];
for (const line of incoherent) console.log(`  INCOHERENT: ${line}`);

process.exitCode = audit.tally.COMPLETE.length === contractGates.length && !incoherent.length ? 0 : 1;
