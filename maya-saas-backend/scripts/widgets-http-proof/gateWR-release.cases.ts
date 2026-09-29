import type { WidgetsHttpProofCase } from '../../test/widgets-live/support/http-proof-contract';
import { releaseBookingProof } from '../../test/widgets-live/support/release-booking-proof';
export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'WR-BOOKING-CREATE',
    gate: 'WR',
    proofClass: 'L',
    async run(ctx) {
      for (const proof of await releaseBookingProof(ctx))
        ctx.evidence.record(proof);
    },
  },
];
