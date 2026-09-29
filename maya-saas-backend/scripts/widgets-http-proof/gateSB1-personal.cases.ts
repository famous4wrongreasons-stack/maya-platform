import type { WidgetsHttpProofCase } from '../../test/widgets-live/support/http-proof-contract';
import { personalClientProof } from '../../test/widgets-live/support/personal-client-proof';
export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'SB1-PERSONAL-CREATE',
    gate: 'SB1',
    proofClass: 'BACKEND-CONTEXT',
    run: personalClientProof,
  },
];
