// A U ledger, not an L claim: the current HTTP producer uses the typed path.
// WF HTTP/BIN prove that reachable half. SPOKEN has no COMMIT ingress this
// cycle (PKT:471 / OD-3 A), so its recompute/empty-vocabulary proof is RI,
// explicitly disclosed like the existing E1-U ledger. No provider is replaced.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GateContext } from '../../src/widgets/gate.types';
import { gate8R, recomputeRequiresReadback } from '../../src/widgets/gates/gate8r';
import { GATE_8R_OWNERS_UNRULED } from '../../src/widgets/gates/gate-8r.owners';
import { recordJestEvidence } from './support/evidence';

describe('Final U scope ledger; typed HTTP proof is WF-READBACK', () => {
  it('WF-U-R1A [HTTP ledger; SPOKEN RI] quotes the approved partial scope and proves the excluded branch fails closed', () => {
    const map = JSON.parse(readFileSync(resolve(process.cwd(), '../docs/rebuild/widget-release-programme/final-evidence/u-proofs.json'), 'utf8')) as {
      proofs: Array<{ clause: string; basis: string; candidate_scope: string;
        absence: { source: string; marker: string }; refusal: { source: string; marker: string; disclosed_no_http_carrier: boolean };
        mechanism: { source: string; marker: string; battery: string } }>;
    };
    const proof = map.proofs.find(p => p.clause === 'R-1a');
    expect(proof).toBeDefined();
    expect(proof!.candidate_scope).toBe('SPOKEN recompute-true only; typed half L plus labelled E-TAMPER');
    expect(proof!.basis).toContain('OD-3 A');
    expect(proof!.refusal.disclosed_no_http_carrier).toBe(true);
    for (const duty of [proof!.absence, proof!.refusal, proof!.mechanism])
      expect(readFileSync(resolve(process.cwd(), duty.source), 'utf8')).toContain(duty.marker);
    expect(GATE_8R_OWNERS_UNRULED.isReadbackAffirmation).toBeNull();
    const context = (stored: boolean, ack?: unknown) => ({
      record: { effect: 'COMMIT', deliveryChannel: 'realtime-voice', bodyHash: 'hash',
        confirmation: { requires_readback: stored, readback_ref: 'reference' } },
      submission: ack === undefined ? {} : { readback_ack: ack },
      carrier: 'pwa',
    }) as unknown as GateContext;
    expect(recomputeRequiresReadback(context(false).record!)).toBe(true);
    expect(gate8R(context(false))).toMatchObject({ outcome: 'refuse', code: 'readback_mismatch' });
    expect(gate8R(context(true))).toMatchObject({ outcome: 'refuse', code: 'readback_missing' });
    expect(gate8R(context(true, { readback_ref: 'reference', body_hash: 'hash', affirmation: 'yes' }))).toMatchObject({ outcome: 'refuse', code: 'readback_mismatch' });
    recordJestEvidence({testId:'WF-U-R1A',recordHash:null,triggerTraceId:null,
      stoppedAtGate:'8-R',gatesRun:null,labels:['[U-proof]'],clauses:['R-1a'],claim:'U'});
  });
});
