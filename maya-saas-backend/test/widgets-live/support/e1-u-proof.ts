import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { E1_U_CLAUSES } from './e1-claims';

type SourceProof = Readonly<{
  source: string;
  marker: string;
  entry?: string;
  disclosed_no_http_carrier?: boolean;
  battery?: string;
}>;

type UProof = Readonly<{
  clause: string;
  basis: string;
  absence: SourceProof;
  refusal: SourceProof;
  mechanism: SourceProof;
}>;

const repositoryRoot = resolve(process.cwd(), '..');
const proofMapFile = resolve(
  repositoryRoot,
  'docs/rebuild/evidence/maya-chat-first-ux/wave5/e1-u-proofs.json',
);
const auditFile = resolve(
  repositoryRoot,
  'docs/rebuild/evidence/maya-chat-first-ux/gate-conformance-audit.json',
);

const sourceContains = (proof: SourceProof): boolean =>
  readFileSync(resolve(process.cwd(), proof.source), 'utf8').includes(
    proof.marker,
  );

/**
 * OD-3's four duties, checked by the executable E1 U-class test. Mutation
 * status is deliberately checked again by A-W5 against the final battery
 * report; here we prove that every frozen U clause names an existing battery
 * and real executable source, rather than a prose-only assertion.
 */
export function assertE1UProofDuties(): void {
  const map = JSON.parse(readFileSync(proofMapFile, 'utf8')) as {
    contract: string;
    proofs: UProof[];
  };
  if (map.contract !== 'maya.widgets-u-proof-map/1')
    throw new Error(`E1 U proof map has contract ${String(map.contract)}`);

  const expected = [...E1_U_CLAUSES].sort();
  const actual = map.proofs.map((proof) => proof.clause).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`E1 U proof clauses differ: ${JSON.stringify(actual)}`);

  const audit = JSON.parse(readFileSync(auditFile, 'utf8')) as {
    gates: Array<{
      clauses: Record<
        string,
        { u_candidate?: boolean; u_basis?: string; u_candidate_scope?: string }
      >;
    }>;
  };
  const auditClauses = new Map(
    audit.gates.flatMap((gate) => Object.entries(gate.clauses)),
  );

  for (const proof of map.proofs) {
    const clause = auditClauses.get(proof.clause);
    if (clause?.u_candidate !== true)
      throw new Error(`${proof.clause} is not a frozen U candidate`);
    const recordedBasis = clause.u_basis ?? clause.u_candidate_scope;
    if (
      typeof recordedBasis !== 'string' ||
      recordedBasis.length === 0 ||
      !proof.basis.includes(recordedBasis)
    )
      throw new Error(`${proof.clause} does not quote its certified basis`);
    for (const duty of [proof.absence, proof.refusal, proof.mechanism]) {
      if (!sourceContains(duty))
        throw new Error(
          `${proof.clause} proof marker ${JSON.stringify(duty.marker)} is absent from ${duty.source}`,
        );
    }
    if (
      proof.refusal.entry === 'GW-RI' &&
      proof.refusal.disclosed_no_http_carrier !== true
    )
      throw new Error(
        `${proof.clause} uses GW-RI without disclosing no HTTP carrier`,
      );
    if (!proof.mechanism.battery)
      throw new Error(`${proof.clause} names no mutation battery`);
    readFileSync(
      resolve(
        process.cwd(),
        'test/widgets-live/mutations',
        proof.mechanism.battery,
      ),
      'utf8',
    );
  }
}
