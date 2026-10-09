import type { SemanticAssessment } from './replay.mjs';
export const CORE_CASE_TURNS: Readonly<Record<string, number>>;
export const CORE_FOLLOWUP_CASE_IDS: readonly string[];
export interface CoreTurnFacts {
  caseId: string;
  turn: number;
  reply: string;
  previousReply: string | null;
  modelResponses: number;
  currentSelection: boolean;
  ownerEvidenceBounded: boolean;
  ownerContextRestored: boolean;
  groundingStatus: string | null;
  readCount: number;
  toolCount: number;
}
export function assessCoreTurn(facts: CoreTurnFacts): SemanticAssessment;
export function summarizeCoreUnionReport(
  report: unknown,
  binding: { manifestSha256: string; candidateCommit: string },
): {
  status: 'completed-with-semantic-failures' | 'completed-diagnostic';
  executionStatus: 'completed';
  semanticStatus: 'pass' | 'fail' | 'ungraded';
  coverage: import('./replay.mjs').ReplayResult['coverage'];
  exitCode: 0 | 2;
};
export function hasExactReviewedSlot(
  resolution: unknown,
  expected: { start: string; timezone: string; tenantId: string },
): boolean;
