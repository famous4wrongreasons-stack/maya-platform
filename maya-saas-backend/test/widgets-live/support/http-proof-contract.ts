import type { EvidenceLineInput } from './evidence';
import type { BinFixtures } from './fixtures';
import type { MintProvenanceLine } from './mint-provenance';

/** What a BIN case may record: the runner fixes both entry and source. */
export interface BinEvidence {
  readonly enabled: boolean;
  record(line: Omit<EvidenceLineInput, 'entry' | 'source'>): boolean;
}

/** The writerless capability surface supplied to production-binary proof cases. */
export interface HttpProofContext {
  readonly apiBase: string;
  request(
    route: string,
    init?: RequestInit,
  ): Promise<{ status: number; body: unknown }>;
  readonly fixtures: BinFixtures;
  readonly evidence: BinEvidence;
  mintProvenance(): readonly MintProvenanceLine[];
}

export interface WidgetsHttpProofCase {
  readonly id: string;
  readonly gate: string;
  readonly proofClass: string;
  run(ctx: HttpProofContext): Promise<void>;
}
