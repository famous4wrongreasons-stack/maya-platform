import type { PilotManifest } from './replay.mjs';
export const CURRENT_CORPUS: string;
export type CurrentCandidateManifest = PilotManifest & {
  status: string;
  candidateCommit: string;
  families: number;
  paidAuthorized: false;
  sourceHashes: Record<string, string>;
  currentPricesVerified: false;
  cases: Array<
    PilotManifest['cases'][number] & {
      fixture: { clock: string; httpBinding: string };
      variant: string;
    }
  >;
};
export function freezeCurrentCandidate(
  backend: string,
  candidateCommit: string,
): CurrentCandidateManifest;
