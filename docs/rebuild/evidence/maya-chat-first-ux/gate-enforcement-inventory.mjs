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
//
// Such a row is `stubOnly`. Its symbol is the slot's NAME, so "defined" and "called" are true for any
// slot that exists, and no constant-pass test can apply to it: the row can show that a stub is there
// and nothing else. So a stubOnly row is never counted as enforced, and the moment its slot stops being
// a `pending()` stub the script prints INCOHERENT. OBLIGATION of the unit that builds slot 8, 9 or 10:
// in the same commit, re-point that row at the file that holds the slot's enforcing function
// (`...logicRow('gate8')`, or an equivalent row for a service), so that the symbol, call and
// constant-pass checks apply to the code that actually runs.
//
// GATES-PLAN-V11 D-18 (I-CTX) moved slots 1, 4, 8, 9 and 10 into seam files. Rows 1 and 4 read their
// seams (`gates/gate1.ts`, `gates/gate4.ts`) as logic rows. Slots 8, 9 and 10 are no longer `pending()`
// calls: each is an object literal that carries `pendingOn` and calls a seam whose body is the stub
// (k3 check 4 reads that body). Below, "a `pending()` stub" means either spelling, and rows 8, 9 and 10
// stay stubOnly with the same obligation.
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
  { n: '1', name: 'Token integrity', symbol: 'gate1', host: 'pipeline', ...logicRow('gate1') },
  { n: '2', name: 'Transport auth', symbol: 'JwtAuthGuard', host: 'HTTP middleware (global guard)', file: 'maya-saas-backend/src/app.module.ts', src: appModule },
  { n: '3', name: 'Principal binding', symbol: 'digestEquals', host: 'pipeline', file: GATEWAY, src: gateway },
  { n: '4', name: 'Tenant scope', symbol: 'gate4', host: 'pipeline', ...logicRow('gate4') },
  { n: '5', name: 'Verification floor', symbol: 'gate5', host: 'pipeline', ...logicRow('gate5') },
  { n: '6', name: 'Authority', symbol: 'gate6', host: 'pipeline', ...logicRow('gate6') },
  { n: '6r', name: 'R3.5.1 sensitive destination', symbol: 'gateSensitiveDest', host: 'pipeline (with 6)', ...logicRow('gate6') },
  { n: '7', name: 'Effect admissibility', symbol: 'gate7', host: 'pipeline', ...logicRow('gate7') },
  { n: '8', name: 'Input validation', symbol: "'Input validation'", host: 'pipeline', file: GATEWAY, src: gateway, stubOnly: true },
  { n: '8-R', name: 'Readback', symbol: 'gate8R', host: 'pipeline', ...logicRow('gate8r') },
  { n: '9', name: 'Lowering', symbol: "'Lowering'", host: 'pipeline', file: GATEWAY, src: gateway, stubOnly: true },
  { n: '10', name: 'Divergence audit', symbol: "'Divergence audit'", host: 'pipeline', file: GATEWAY, src: gateway, stubOnly: true },
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
    g.host.startsWith('pipeline') &&
    (new RegExp(`pending\\(\\s*'${g.n}'`).test(gateway) || /\bpendingOn\s*:/.test(slot));
  // A stubOnly row cannot see the code of a built slot (see the obligation above), so it never counts.
  return { ...g, defined, called, stub, constantPass, enforced: defined && called && !stub && !constantPass && g.stubOnly !== true };
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
//
// Since I-AUD0 (GATES-PLAN-V11) the audit is schema /2 against Contract V1.1: one state per clause
// (L, L-T, U, STOPPED:<id>, BLOCKED-DISCHARGE, false). A gate is COMPLETE when every clause is L or
// L-T, COMPLETE-U when U is also admitted. The figures are recomputed here from the clause states and
// compared with the recorded tally and headline; `built` is an annotation and never counts.
const audit = JSON.parse(read('docs/rebuild/evidence/maya-chat-first-ux/gate-conformance-audit.json'));
const AUDIT_SCHEMA = 'maya.gate-conformance-audit/2';
const schemaOk = audit.contract === AUDIT_SCHEMA && Array.isArray(audit.gates);
const tally = audit.tally ?? {};
const clausesOf = (g) => Object.entries(g.clauses ?? {});
const allIn = (g, ok) => clausesOf(g).length > 0 && clausesOf(g).every(([, c]) => ok.includes(c?.state));
const auditGates = schemaOk ? audit.gates : [];
const strictGates = auditGates.filter((g) => allIn(g, ['L', 'L-T'])).map((g) => g.n);
const withUGates = auditGates.filter((g) => allIn(g, ['L', 'L-T', 'U'])).map((g) => g.n);
const clauseStates = auditGates.flatMap((g) => clausesOf(g).map(([, c]) => String(c?.state)));
const stoppedClauses = clauseStates.filter((s) => s.startsWith('STOPPED')).length;
const blockedClauses = clauseStates.filter((s) => s === 'BLOCKED-DISCHARGE').length;
const derivedHeadline = `GATES LIVE CONTRACT-COMPLETE ${strictGates.length}/15 · WITH U-CLASS ${withUGates.length}/15 · STOPPED CLAUSES ${stoppedClauses} · BLOCKED-DISCHARGE CLAUSES ${blockedClauses}`;
console.log();
console.log(`CONFORMANCE TO CONTRACT V1.1 §3.9, clause by clause (gate-conformance-audit.json, ${audit.contract})`);
for (const [cls, ids] of Object.entries(tally)) console.log(`  ${cls.padEnd(15)} ${String(ids.length).padStart(2)}  gate ${ids.join(', ') || '—'}`);
for (const g of auditGates) {
  const cl = clausesOf(g);
  const count = (s) => cl.filter(([, c]) => c?.state === s).length;
  const open = cl.filter(([, c]) => !['L', 'L-T'].includes(c?.state)).map(([k]) => k);
  console.log(
    `    gate ${g.n.padEnd(4)} ${String(g.class).padEnd(15)} L/L-T ${count('L') + count('L-T')}/${cl.length}  U ${count('U')}  ` +
      `BLOCKED-DISCHARGE ${count('BLOCKED-DISCHARGE')}  built ${cl.filter(([, c]) => c?.built === true).length}` +
      (open.length ? `  open: ${open.join(', ')}` : ''),
  );
}
console.log();
console.log(`  ${audit.headline}`);
// Consistency between the recorded audit and what the mechanical checks see. The audit is judgement;
// these are the places where judgement may not contradict the code, or itself:
//   - the audit is schema /2, has fifteen gates, and its tally and headline equal what its clause
//     states give;
//   - COMPLETE and COMPLETE-U need every mechanical check, and reachability;
//   - PARTIAL (and PARTIAL-STOPPED) means "reachable, and some clauses execute", so it needs reachability too;
//   - NOT_BUILT is exactly a refusing pending() stub, and every stub is NOT_BUILT;
//   - a stubOnly row describes a stub, so its slot must still be one (not audit judgement: the row
//     itself is stale, and the unit that built the slot owes it a re-point).
const mech = (n) => contractGates.find((r) => r.n === n);
const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));
const incoherent = [
  ...(schemaOk ? [] : [`the audit is ${audit.contract ?? 'unversioned'}, not ${AUDIT_SCHEMA}: nothing below may be read from it`]),
  ...(schemaOk && audit.gates.length !== 15 ? [`the audit records ${audit.gates.length} gates, not 15`] : []),
  ...(schemaOk && !sameSet(tally.COMPLETE, strictGates) ? [`tally COMPLETE [${(tally.COMPLETE ?? []).join(', ')}] is not the gates whose every clause is L or L-T [${strictGates.join(', ')}]`] : []),
  ...(schemaOk && !sameSet(tally['COMPLETE-U'], withUGates.filter((n) => !strictGates.includes(n))) ? [`tally COMPLETE-U [${(tally['COMPLETE-U'] ?? []).join(', ')}] does not match the clause states`] : []),
  ...(schemaOk && audit.headline !== derivedHeadline ? [`recorded headline "${audit.headline}" != recomputed "${derivedHeadline}"`] : []),
  ...[...(tally.COMPLETE ?? []), ...(tally['COMPLETE-U'] ?? [])].filter((n) => !(mech(n)?.enforced && mech(n)?.reachable)).map((n) => `gate ${n}: audit COMPLETE, mechanical checks or reachability fail`),
  ...[...(tally.PARTIAL ?? []), ...(tally['PARTIAL-STOPPED'] ?? [])].filter((n) => !mech(n)?.reachable).map((n) => `gate ${n}: audit PARTIAL, but unreachable behind gate ${ORDER[firstStub]}`),
  ...(tally.NOT_BUILT ?? []).filter((n) => !mech(n)?.stub).map((n) => `gate ${n}: audit NOT_BUILT, but the slot is not a pending() stub`),
  ...contractGates.filter((r) => r.stub && !(tally.NOT_BUILT ?? []).includes(r.n)).map((r) => `gate ${r.n}: a pending() stub the audit does not call NOT_BUILT`),
  ...rows.filter((r) => r.stubOnly && !r.stub).map((r) => `gate ${r.n}: its row reads the gateway by slot name and can only see a stub, but the slot is no longer a pending() stub — re-point the row at the slot's enforcing file (logicRow) before anything may count it`),
];
for (const line of incoherent) console.log(`  INCOHERENT: ${line}`);

process.exitCode = strictGates.length === contractGates.length && !incoherent.length ? 0 : 1;
