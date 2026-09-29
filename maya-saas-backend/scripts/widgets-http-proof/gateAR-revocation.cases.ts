import type { WidgetsHttpProofCase } from '../../test/widgets-live/support/http-proof-contract';
import { releaseRevocationProof } from '../../test/widgets-live/support/release-revocation-proof';
export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'AR-G6-REVOCATION',
    gate: '6',
    proofClass: 'L',
    run: async (ctx) => {
      for (const proof of await releaseRevocationProof(ctx))
        ctx.evidence.record(proof);
    },
  },
];
