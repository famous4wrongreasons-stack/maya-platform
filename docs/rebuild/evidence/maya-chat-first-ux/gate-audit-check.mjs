#!/usr/bin/env node
// gate-audit-check — the gate conformance audit is schema /2, pinned to the contract it audits, and keyed exactly
// by the clause inventory (GATES-PLAN-V11 I-HAR; D-14; §3.3 step 7). Run by `run-all-checks.sh`.
//
//   node gate-audit-check.mjs              check gate-conformance-audit.json against gate-clause-inventory.json
//   node gate-audit-check.mjs --self-test  prove every check can go red (HAR-5)
//
// Checks (each problem names its rule):
//   SCHEMA     the audit is `maya.gate-conformance-audit/2` and the inventory `maya.gate-clause-inventory/1`
//   SHA        sha256 of the contract document == the inventory's pin == the audit's `against.sha256`
//   GATES      the same 15 gates, in the same order
//   KEYS       per gate, the audit's clause keys equal the inventory's, in order (none missing, none extra)
//   TEXT       per clause, the audit's text equals the inventory's
//   STATE      every state is L, L-T, U, BLOCKED-DISCHARGE, false or STOPPED:<id>; a clause that is false,
//              BLOCKED-DISCHARGE or STOPPED does not conform; no key is STOPPED:S6-4 (§0.4)
//   DEV1       G12-R1b, G12-I11 and G13-R2 carry `reason: "not built (DEV-1; OD-1)"` while they are false
//   HEADLINE   the recorded headline equals the one recomputed from the clause states (§0.5): a gate counts toward the
//              strict figure only when every clause is L or L-T, and toward WITH U-CLASS when every clause is L, L-T or U
// A-W5 checks additionally: evidence behind every L/L-T/U state; L's HTTP/BIN pair; L-T's positive pair,
// HTTP tamper/independence proof and mutation receipt; U's OD-3 proof map, candidate basis and mutation receipt;
// G14 BLOCKED-DISCHARGE before E2; and `mechanism_absent` absent from `RefusalCode`.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A file path, never `URL.pathname`: that keeps percent-escapes, and the repository may sit under a path with spaces.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const AUDIT = path.join(HERE, 'gate-conformance-audit.json');
const INVENTORY = path.join(HERE, 'gate-clause-inventory.json');

const AUDIT_SCHEMA = 'maya.gate-conformance-audit/2';
const INVENTORY_SCHEMA = 'maya.gate-clause-inventory/1';
const DEV1_KEYS = ['G12-R1b', 'G12-I11', 'G13-R2'];
const DEV1_REASON = 'not built (DEV-1; OD-1)';
const STATES = new Set(['L', 'L-T', 'U', 'BLOCKED-DISCHARGE', 'false']);
const REFUSAL_SOURCE = path.join(REPO, 'maya-saas-backend/src/widgets/gate.types.ts');
const DEFAULT_REFUSAL_TEXT = fs.readFileSync(REFUSAL_SOURCE, 'utf8');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The headline §0.5 prints, recomputed from the clause states. */
export function recomputeHeadline(audit) {
  const states = audit.gates.map((g) => Object.values(g.clauses).map((c) => c.state));
  const strict = states.filter((s) => s.length > 0 && s.every((x) => x === 'L' || x === 'L-T')).length;
  const withU = states.filter((s) => s.length > 0 && s.every((x) => x === 'L' || x === 'L-T' || x === 'U')).length;
  const all = states.flat();
  const stopped = all.filter((x) => typeof x === 'string' && x.startsWith('STOPPED:')).length;
  const blocked = all.filter((x) => x === 'BLOCKED-DISCHARGE').length;
  return `GATES LIVE CONTRACT-COMPLETE ${strict}/15 · WITH U-CLASS ${withU}/15 · STOPPED CLAUSES ${stopped} · BLOCKED-DISCHARGE CLAUSES ${blocked}`;
}

/** Every problem of one (audit, inventory, contract bytes) triple; an empty list passes. */
export function check({ audit, inventory, contractBytes, refusalText = DEFAULT_REFUSAL_TEXT }) {
  const problems = [];
  const problem = (rule, detail) => problems.push({ rule, detail });

  if (audit?.contract !== AUDIT_SCHEMA) problem('SCHEMA', `audit is ${JSON.stringify(audit?.contract)}, not ${AUDIT_SCHEMA}`);
  if (inventory?.contract !== INVENTORY_SCHEMA)
    problem('SCHEMA', `inventory is ${JSON.stringify(inventory?.contract)}, not ${INVENTORY_SCHEMA}`);
  if (problems.length > 0) return problems;

  const documentSha = sha256(contractBytes);
  const pinned = inventory.against?.sha256;
  const audited = audit.against?.sha256;
  if (documentSha !== pinned || pinned !== audited)
    problem('SHA', `contract document ${documentSha}, inventory pin ${pinned}, audit against ${audited}`);

  const auditGates = Array.isArray(audit.gates) ? audit.gates : [];
  const inventoryGates = Array.isArray(inventory.gates) ? inventory.gates : [];
  const auditNs = auditGates.map((g) => g.n);
  const inventoryNs = inventoryGates.map((g) => g.n);
  if (inventoryGates.length !== 15 || JSON.stringify(auditNs) !== JSON.stringify(inventoryNs))
    problem('GATES', `audit gates [${auditNs}] vs inventory gates [${inventoryNs}]`);

  for (const ig of inventoryGates) {
    const ag = auditGates.find((g) => g.n === ig.n);
    if (!ag || !ag.clauses || typeof ag.clauses !== 'object') continue;
    const auditKeys = Object.keys(ag.clauses);
    const inventoryKeys = ig.clauses.map((c) => c.key);
    const missing = inventoryKeys.filter((k) => !auditKeys.includes(k));
    const extra = auditKeys.filter((k) => !inventoryKeys.includes(k));
    if (missing.length > 0 || extra.length > 0 || JSON.stringify(auditKeys) !== JSON.stringify(inventoryKeys))
      problem('KEYS', `gate ${ig.n}: missing [${missing}], extra [${extra}]${missing.length + extra.length === 0 ? ', order differs' : ''}`);
    for (const ic of ig.clauses) {
      const ac = ag.clauses[ic.key];
      if (!ac) continue;
      if (ac.text !== ic.text) problem('TEXT', `${ic.key}: audit ${JSON.stringify(ac.text)} vs inventory ${JSON.stringify(ic.text)}`);
      const state = ac.state;
      const stopped = typeof state === 'string' && /^STOPPED:\S+$/.test(state);
      if (!STATES.has(state) && !stopped) problem('STATE', `${ic.key}: state ${JSON.stringify(state)}`);
      if (state === 'STOPPED:S6-4') problem('STATE', `${ic.key}: STOPPED:S6-4 governs no clause (§0.4)`);
      if ((state === 'false' || state === 'BLOCKED-DISCHARGE' || stopped) && ac.conforms !== false)
        problem('STATE', `${ic.key}: state ${state} but conforms ${JSON.stringify(ac.conforms)}`);
      if ((state === 'L' || state === 'L-T' || state === 'U') && ac.conforms !== true)
        problem('STATE', `${ic.key}: state ${state} but conforms ${JSON.stringify(ac.conforms)}`);
      if (DEV1_KEYS.includes(ic.key) && state === 'false' && ac.reason !== DEV1_REASON)
        problem('DEV1', `${ic.key}: reason ${JSON.stringify(ac.reason)}, not ${JSON.stringify(DEV1_REASON)}`);

      if (state === 'L' || state === 'L-T') {
        const evidence = Array.isArray(ac.evidence) ? ac.evidence : [];
        const live = evidence.filter((line) => line.claim === 'L');
        const paired = live.some(
          (left) =>
            (left.entry === 'HTTP' || left.entry === 'BIN') &&
            live.some(
              (right) =>
                right.test_id === left.test_id &&
                right.entry === (left.entry === 'HTTP' ? 'BIN' : 'HTTP'),
            ),
        );
        if (!paired) problem('EVIDENCE', `${ic.key}: ${state} has no HTTP/BIN L pair`);
        if (
          state === 'L-T' &&
          !evidence.some(
            (line) =>
              line.claim === 'L-T' &&
              line.entry === 'HTTP' &&
              line.labels?.some((label) => /^\[(?:E-TAMPER:|E-INDEP)/.test(label)),
          )
        )
          problem('EVIDENCE', `${ic.key}: L-T has no HTTP tamper/independence proof`);
      }
      if (state === 'U') {
        const evidence = Array.isArray(ac.evidence) ? ac.evidence : [];
        if (
          ac.u_candidate !== true ||
          typeof ac.u_basis !== 'string' ||
          ac.u_basis.length === 0 ||
          ac.u_proof?.clause !== ic.key ||
          !evidence.some(
            (line) =>
              line.claim === 'U' &&
              line.entry === 'HTTP' &&
              line.labels?.includes('[U-proof]'),
          )
        )
          problem('U-PROOF', `${ic.key}: U lacks its candidate, quoted basis, proof map or U evidence`);
      }
      if (state === 'L-T' || state === 'U') {
        const mutants = Array.isArray(ac.mutants) ? ac.mutants : [];
        if (
          mutants.length === 0 ||
          mutants.some((mutant) => ['SURVIVED', 'UNEXPECTED'].includes(mutant.status))
        )
          problem('MUTANTS', `${ic.key}: ${state} has no clean mutation receipt`);
      }
    }
  }

  if (/['"]mechanism_absent['"]/.test(refusalText))
    problem('REFUSAL', 'mechanism_absent appears in the runtime refusal vocabulary');

  if (audit.builder?.phase === 'A-W5') {
    if (audit.builder.skeleton !== false) problem('BUILDER', 'A-W5 is marked as a skeleton');
    const gate14 = auditGates.find((gate) => gate.n === '14');
    for (const [key, clause] of Object.entries(gate14?.clauses ?? {}))
      if (clause.state !== 'BLOCKED-DISCHARGE' || clause.conforms !== false)
        problem('DISCHARGE', `${key}: Gate 14 moved before E2`);
    const expected =
      'GATES LIVE CONTRACT-COMPLETE 3/15 · WITH U-CLASS 6/15 · STOPPED CLAUSES 0 · BLOCKED-DISCHARGE CLAUSES 25';
    if (audit.headline !== expected)
      problem('A-W5', `headline ${JSON.stringify(audit.headline)}, expected ${JSON.stringify(expected)}`);
  }

  if (auditGates.length > 0) {
    const headline = recomputeHeadline(audit);
    if (audit.headline !== headline) problem('HEADLINE', `recorded ${JSON.stringify(audit.headline)}, recomputed ${JSON.stringify(headline)}`);
  }
  return problems;
}

export const load = () => {
  const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
  const document = path.resolve(REPO, inventory.against?.document ?? 'docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md');
  if (!document.startsWith(REPO + path.sep)) throw new Error('the inventory names a document outside the repository');
  return { audit, inventory, contractBytes: fs.readFileSync(document) };
};

function selfTest() {
  const base = load();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const firstKey = (audit, n) => Object.keys(audit.gates.find((g) => g.n === n).clauses)[0];
  /**
   * Restates gate 4's clause states and writes the headline those states imply: the recorded headline's figures, minus
   * whatever gate 4 contributed before, plus `delta` (0 or 1 for each of strict and WITH U-CLASS). Throws when the
   * committed audit no longer has the shape this derivation assumes, so the self-test fails rather than passing blind.
   */
  const restateGate4 = (x, states, delta) => {
    const gate = x.audit.gates.find((g) => g.n === '4');
    const keys = Object.keys(gate.clauses);
    if (keys.length !== states.length) throw new Error(`gate 4 has ${keys.length} clauses, the self-test restates ${states.length}`);
    const before = keys.map((k) => gate.clauses[k].state);
    const m = /^GATES LIVE CONTRACT-COMPLETE (\d+)\/15 · WITH U-CLASS (\d+)\/15 · STOPPED CLAUSES (\d+) · BLOCKED-DISCHARGE CLAUSES (\d+)$/.exec(
      x.audit.headline,
    );
    if (!m) throw new Error(`the recorded headline ${JSON.stringify(x.audit.headline)} has no §0.5 shape`);
    let wasStrict = true;
    let wasU = true;
    let stopped = 0;
    let blocked = 0;
    for (const state of before) {
      if (state !== 'L' && state !== 'L-T') wasStrict = false;
      if (state !== 'L' && state !== 'L-T' && state !== 'U') wasU = false;
      if (typeof state === 'string' && state.startsWith('STOPPED:')) stopped += 1;
      if (state === 'BLOCKED-DISCHARGE') blocked += 1;
    }
    keys.forEach((k, i) => (gate.clauses[k].state = states[i]));
    const strict = Number(m[1]) - (wasStrict ? 1 : 0) + delta.strict;
    const withU = Number(m[2]) - (wasU ? 1 : 0) + delta.withU;
    x.audit.headline = `GATES LIVE CONTRACT-COMPLETE ${strict}/15 · WITH U-CLASS ${withU}/15 · STOPPED CLAUSES ${
      Number(m[3]) - stopped
    } · BLOCKED-DISCHARGE CLAUSES ${Number(m[4]) - blocked}`;
  };
  const cases = [
    { id: 'P0 the committed audit and inventory', mutate: () => {}, expect: [] },
    {
      id: 'N1 a key removed from the audit',
      mutate: (x) => delete x.audit.gates.find((g) => g.n === '3').clauses[firstKey(x.audit, '3')],
      expect: ['KEYS'],
    },
    {
      id: 'N2 a key added to the audit',
      mutate: (x) => (x.audit.gates.find((g) => g.n === '4').clauses['G4-z'] = { text: 'invented', state: 'false', conforms: false }),
      expect: ['KEYS'],
    },
    {
      id: 'N3 a clause text changed',
      mutate: (x) => (x.audit.gates.find((g) => g.n === '1').clauses['G1-c'].text = 'not expired, probably'),
      expect: ['TEXT'],
    },
    { id: 'N4 the audit pinned to another contract SHA', mutate: (x) => (x.audit.against.sha256 = '0'.repeat(64)), expect: ['SHA'] },
    {
      id: 'N5 the contract document changed under both pins',
      mutate: (x) => (x.contractBytes = Buffer.concat([x.contractBytes, Buffer.from('\n')])),
      expect: ['SHA'],
    },
    { id: 'N6 the inventory pinned to another contract SHA', mutate: (x) => (x.inventory.against.sha256 = 'f'.repeat(64)), expect: ['SHA'] },
    { id: 'N7 an audit of schema /1', mutate: (x) => (x.audit.contract = 'maya.gate-conformance-audit/1'), expect: ['SCHEMA'] },
    {
      id: 'N8 a headline that does not follow from the states',
      mutate: (x) => (x.audit.headline = x.audit.headline.replace('CONTRACT-COMPLETE 0/15', 'CONTRACT-COMPLETE 6/15')),
      expect: ['HEADLINE'],
    },
    { id: 'N9 a DEV-1 clause without its reason', mutate: (x) => delete x.audit.gates.find((g) => g.n === '13').clauses['G13-R2'].reason, expect: ['DEV1'] },
    {
      id: 'N10 a clause STOPPED on S6-4',
      mutate: (x) => (x.audit.gates.find((g) => g.n === '12').clauses['G12-R1b'].state = 'STOPPED:S6-4'),
      expect: ['STATE'],
    },
    {
      id: 'N11 a false clause that claims to conform',
      mutate: (x) => (x.audit.gates.find((g) => g.n === '2').clauses['G2-a'].conforms = true),
      expect: ['STATE'],
    },
    {
      id: 'N12 a headline that counts an all-U gate as strict',
      mutate: (x) => restateGate4(x, ['U', 'U'], { strict: 1, withU: 1 }),
      expect: ['HEADLINE'],
    },
    {
      id: 'N13 a headline that leaves an all-U gate out of WITH U-CLASS',
      mutate: (x) => restateGate4(x, ['U', 'U'], { strict: 0, withU: 0 }),
      expect: ['HEADLINE'],
    },
    {
      id: 'N14 a headline that counts an L-T and U gate as strict',
      mutate: (x) => restateGate4(x, ['L-T', 'U'], { strict: 1, withU: 1 }),
      expect: ['HEADLINE'],
    },
    {
      id: 'N15 an L state without an HTTP/BIN pair',
      mutate: (x) => {
        const clause = x.audit.gates.find((g) => g.n === '1').clauses['G1-b'];
        clause.state = 'L';
        clause.conforms = true;
        x.audit.headline = recomputeHeadline(x.audit);
      },
      expect: ['EVIDENCE'],
    },
    {
      id: 'N16 mechanism_absent enters the refusal vocabulary',
      mutate: (x) => (x.refusalText += "\ntype RefusalCode = 'mechanism_absent';\n"),
      expect: ['REFUSAL'],
    },
  ];
  let failures = 0;
  for (const c of cases) {
    const input = {
      audit: clone(base.audit),
      inventory: clone(base.inventory),
      contractBytes: Buffer.from(base.contractBytes),
      refusalText: DEFAULT_REFUSAL_TEXT,
    };
    c.mutate(input);
    const rules = [...new Set(check(input).map((p) => p.rule))].sort();
    const ok =
      c.expect.length === 0 ? rules.length === 0 : c.expect.every((rule) => rules.includes(rule));
    if (!ok) failures += 1;
    console.log(`${ok ? 'ok  ' : 'BAD '} ${c.id}: expected [${c.expect}] got [${rules}]`);
  }
  const headlineCases = [
    [['U', 'U'], 'GATES LIVE CONTRACT-COMPLETE 0/15 · WITH U-CLASS 1/15'],
    [['L-T', 'U'], 'GATES LIVE CONTRACT-COMPLETE 0/15 · WITH U-CLASS 1/15'],
    [['L', 'L-T'], 'GATES LIVE CONTRACT-COMPLETE 1/15 · WITH U-CLASS 1/15'],
  ];
  for (const [states, prefix] of headlineCases) {
    const x = clone(base.audit);
    const gate = x.gates.find((candidate) => candidate.n === '4');
    Object.keys(gate.clauses).forEach((key, index) => (gate.clauses[key].state = states[index]));
    if (!recomputeHeadline(x).startsWith(prefix)) failures += 1;
  }
  const positives = cases.filter((c) => c.expect.length === 0).length + headlineCases.length;
  const negatives = cases.length - positives;
  console.log(
    failures === 0
      ? `GATE AUDIT CHECK SELF-TEST: PASS (${positives} positives, ${negatives} negatives, each red for its own rule)`
      : `GATE AUDIT CHECK SELF-TEST: FAIL (${failures} of ${cases.length} cases did not behave)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const input = load();
  const problems = check(input);
  for (const p of problems) console.log(`${p.rule}: ${p.detail}`);
  const clauses = input.inventory.gates?.reduce((sum, g) => sum + g.clauses.length, 0) ?? 0;
  console.log(
    problems.length === 0
      ? `GATE AUDIT CHECK: PASS (schema /2, ${input.inventory.gates.length} gates, ${clauses} clause keys equal to the inventory, contract ${input.inventory.against.sha256.slice(0, 12)}, headline recomputed)`
      : `GATE AUDIT CHECK: FAIL (${problems.length} problem(s))`,
  );
  process.exit(problems.length === 0 ? 0 : 1);
}

// Imported by gate-audit-build.mjs for `check`/`recomputeHeadline`/`load`; runs only when executed.
// Node resolves the main module to its REAL path (symlinks followed), so `import.meta.url` names the real file while
// `argv[1]` may name it through a symlink (the mutation runner's mirror links `docs/`; macOS `/tmp` is a link). Both
// sides are compared as real paths; a comparison of the raw spellings printed nothing and exited 0 on a corrupted
// audit whenever the checker was reached through a link (CKPT-W0 review finding 4).
const invokedDirectly = () => {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (invokedDirectly()) main();
