#!/usr/bin/env node
// Fresh V1.4 qualification baseline only. Never promotes a clause or issues a certificate.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { check, recomputeHeadline } from '../../evidence/maya-chat-first-ux/gate-audit-check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const document = 'docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
export const V14_HASH = '9bd33e79959c87d9e8f28ffbccc622ca9180aa7f179533499305ac892cc1d769';
export const HANDOFF_STOP = ['G6-6', 'G13-R8'];
// F74a makes a narrow approval path reachable. An old whole-clause absence proof
// cannot certify that path, even when its old source markers still exist.
export const WITHDRAWN_APPROVAL_U = Object.freeze([
  'G11-I4', 'G11-I5', 'G11-I6', 'G11-I10', 'G13-I1', 'G13-I2', 'G13-I9',
]);
export const CHANGED_CLAUSES = Object.freeze({
  'G7-5': 'kind ≠ draft → consumed producing record satisfying §3.10.2, except the exact F32a canonical-chat approval provenance of F74a; no caller-supplied origin or bare approval ID',
  'G7-FR6d': 'MONEY actuation refused except the exact OWNER-bound F32a single-service fixed-RUB APPROVAL; all other MONEY and PAYMENT_HANDOFF remain gap-blocked; F80',
  'G11-I4': 'Gate 11 resolves nouns from the retained decision record and original lineage: the existing consumed-record path or the exact F74a canonical-chat approval source; the noun is not exposed to the client',
  'G11-I5': 'changed approval noun rejects and re-mints on the existing consumed-record path; F74a refuses without dispatch and requires a new canonical proposal',
  'G11-I6': 'existing AE branch: policy binding and fresh noun read; exact F74a branch: approval ID, payloadHash and authenticated user-turn binding, with a source re-read before decision and dispatch',
  'G13-I1': 'approval_decision routes to the existing AE owner or the exact F32a typed AiApprovalRequest owner, never from WidgetIntent.role',
  'G13-I2': 'R3.11.3 requirements hold on both the existing AE approval path and the exact F32a/F74a path',
  'G13-I3': 'F74 or exact F74a provenance and F75 paired consumption apply; neither client-supplied origin nor a bare approval ID confers authority',
  'G13-I9': 'existing AE approver policy and P27 remain; F32a requires a live local OWNER, original requester, tenant, approval ID/payloadHash and active integration binding',
});

/** Historical validators use the historical contract bytes, never the new contract under old pins. */
export function loadV13Audit() {
  const manifest = JSON.parse(fs.readFileSync(path.join(here, 'history/manifest.json')));
  const read = name => {
    const entry = manifest.files.find(file => file.path === name + '.gz');
    assert(entry, `Missing historical artifact ${name}`);
    const bytes = fs.readFileSync(path.join(here, 'history', entry.path));
    assert.equal(sha(bytes), entry.archiveSha256);
    const raw = gunzipSync(bytes);
    assert.equal(raw.length, entry.uncompressedBytes);
    assert.equal(sha(raw), entry.uncompressedSha256);
    return raw;
  };
  return {
    audit: JSON.parse(read('v13-audit.json')),
    inventory: JSON.parse(read('v13-inventory.json')),
    contractBytes: read('v13-contract.md'),
  };
}

export function prepareAudit() {
  const prior = loadV13Audit();
  assert.deepEqual(check(prior), [], 'Historical evidence must remain verifiable against its own contract');
  const contractBytes = fs.readFileSync(path.join(root, document));
  assert.equal(sha(contractBytes), V14_HASH, 'Only the reviewed V1.4 contract may use this preparation');
  const approved = JSON.parse(fs.readFileSync(path.join(here, '../approved-release/current-audit.json')));
  const approvedClauses = new Map(approved.gates.flatMap(gate => Object.entries(gate.clauses)));
  const inventory = structuredClone(prior.inventory);
  inventory.against = {
    document, version: '1.4', sha256: V14_HASH,
    lines: contractBytes.toString().trimEnd().split('\n').length,
  };
  inventory.note = 'Fresh V1.4 clause inventory. Exactly 165 historical clause IDs remain. Nine clause summaries reflect the approved F74a/F32a rules; no new exclusion or authority. C11 locators remain historical, not current line numbers. Original inventory/audit/contract bytes are archived under widget-release-programme/development-v14/history.';
  for (const gate of inventory.gates) for (const clause of gate.clauses)
    if (Object.hasOwn(CHANGED_CLAUSES, clause.key)) clause.text = CHANGED_CLAUSES[clause.key];
  const ids = inventory.gates.flatMap(gate => gate.clauses.map(clause => clause.key));
  assert.equal(ids.length, 165);
  assert.equal(new Set(ids).size, 165);
  const audit = {
    contract: 'maya.gate-conformance-audit/2',
    against: inventory.against,
    unit: 'Fresh V1.4 development qualification baseline; consistency is not conformance or release authority',
    why: 'No historical green state, receipt or mutation result is inherited. Full fresh evidence and complete mutation admission are required before any promotion. Historical FINAL means temporary discharge categories are retired; it does not mean certification.',
    builder: {
      phase: 'FINAL', kind: 'fresh-v14-qualification-baseline', skeleton: true,
      source_head: null, inherited_evidence: false, certificate_status: 'NOT_ISSUED',
      historical_audit_sha256: sha(Buffer.from(gunzipSync(fs.readFileSync(path.join(here, 'history/v13-audit.json.gz'))))),
      approved_scope_path: 'docs/rebuild/widget-release-programme/approved-release/current-audit.json',
      approved_scope_sha256: sha(fs.readFileSync(path.join(here, '../approved-release/current-audit.json'))),
      approved_scope_use: 'Remaining U candidacy/basis/rulings only; seven obsolete whole-approval U grounds withdrawn; no historical evidence or states',
      withdrawn_approval_u: WITHDRAWN_APPROVAL_U,
    },
    activation: {
      certificate_for_current_release: 'NOT_ISSUED', fullContractCertified: false,
      production: 'NOT_AUTHORIZED', handoff: 'STOP', scheduleEditor: 'NOT_USER_REACHABLE',
      governance: 'single-operator', independentHumanReview: false, reviewerId: null,
    },
    gates: inventory.gates.map(gate => ({
      n: gate.n, name: gate.name,
      class: gate.clauses.some(clause => HANDOFF_STOP.includes(clause.key)) ? 'PARTIAL-STOPPED' : 'PARTIAL',
      clauses: Object.fromEntries(gate.clauses.map(clause => {
        const old = approvedClauses.get(clause.key);
        assert(old, `Missing approved scope row ${clause.key}`);
        const stopped = HANDOFF_STOP.includes(clause.key);
        return [clause.key, {
          text: clause.text, state: stopped ? 'STOPPED:D-H' : 'false', conforms: false,
          reason: stopped ? 'Existing D-H STOP; excluded only by the fixed no-HANDOFF profile' : WITHDRAWN_APPROVAL_U.includes(clause.key)
            ? 'F74a makes the scoped approval path reachable; historical whole-clause U ground withdrawn; fresh V1.4 evidence and full mutation qualification pending'
            : 'Fresh V1.4 evidence and full mutation qualification pending',
          evidence: [], mutants: [],
          ...(old.u_candidate === true && !WITHDRAWN_APPROVAL_U.includes(clause.key) ? {
            u_candidate: true,
            ...(old.u_basis ? { u_basis: old.u_basis } : {}),
            ...(old.u_candidate_scope ? { u_candidate_scope: old.u_candidate_scope } : {}),
          } : {}),
          ...(old.rulings ? { rulings: old.rulings } : {}),
        }];
      })),
    })),
  };
  audit.headline = recomputeHeadline(audit);
  assert.deepEqual(check({ audit, inventory, contractBytes }), []);
  return { audit, inventory, contractBytes };
}

export function prepareUProofs() {
  const prior = JSON.parse(fs.readFileSync(path.join(here, '../approved-release/u-proofs.json')));
  const proofs = prior.proofs.filter(proof => !WITHDRAWN_APPROVAL_U.includes(proof.clause));
  const map = {
    ...prior,
    qualification: 'V1.4 candidates only; all four duties and mutation admission require fresh evidence',
    against: V14_HASH,
    withdrawn_approval_u: WITHDRAWN_APPROVAL_U,
    proofs,
  };
  const otherClaims = new Set(['R-1a', 'G8-3', 'G8-4', 'G8-5t', 'G8-DENY']);
  return { map, e1: { ...map, proofs: proofs.filter(proof => !otherClaims.has(proof.clause)) } };
}

function main() {
  assert(process.argv.slice(2).every(arg => ['--check', '--write'].includes(arg)), 'Use --check or --write');
  const { audit, inventory } = prepareAudit();
  const { map, e1 } = prepareUProofs();
  const artifacts = [
    [path.join(root, 'docs/rebuild/evidence/maya-chat-first-ux/gate-clause-inventory.json'), inventory],
    [path.join(root, 'docs/rebuild/evidence/maya-chat-first-ux/gate-conformance-audit.json'), audit],
    [path.join(here, 'u-proofs.json'), map], [path.join(here, 'e1-u-proofs.json'), e1],
  ];
  for (const [file, value] of artifacts) {
    const text = JSON.stringify(value, null, 2) + '\n';
    if (process.argv.includes('--write')) fs.writeFileSync(file, text);
    else assert.equal(fs.readFileSync(file, 'utf8'), text, `${path.basename(file)} differs from fresh V1.4 baseline`);
  }
  console.log('V1.4 AUDIT BASELINE: PASS — 163 unqualified duties, 2 HANDOFF STOP; NOT_ISSUED');
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
