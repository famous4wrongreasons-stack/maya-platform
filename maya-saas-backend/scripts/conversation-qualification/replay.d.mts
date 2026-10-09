export function sha256(value: string): string;
export interface PilotManifest {
  version: number;
  purpose: string;
  sourceSha256: string;
  split: string;
  roles: string[];
  dialogs: number;
  independentFamilies: number;
  userTurns: number;
  manifestSha256: string;
  cases: Array<{
    id: string;
    familyId: string;
    role: string;
    group: string;
    sourceCaseSha256: string;
    userTurns: string[];
    reviewChecks: string[];
    expectedIntents: string[];
  }>;
}
export function freezePilot(
  source: string,
  limit?: number,
  roles?: string[],
): PilotManifest;
export type SemanticAssessment = {
  status: 'pass' | 'fail' | 'ungraded';
  failedCheckIds: string[];
};
export interface ReplayResult {
  status: 'stopped' | 'completed_with_semantic_failures' | 'replayed_ungraded';
  executionStatus: 'stopped' | 'completed';
  semanticStatus: 'pass' | 'fail' | 'ungraded';
  outcomes: Array<{
    caseId: string;
    outcome: string;
    failedCheckIds?: string[];
  }>;
  qualification: string;
  coverage: {
    plannedTurns: number;
    attemptedTurns: number;
    validResponses: number;
    unresolvedTurns: number;
    skippedDependentTurns: number;
    unexecutedTurns: number;
    semanticPasses: number;
    semanticFailures: number;
    semanticUngraded: number;
  };
  turnOutcomes: Array<{ caseId: string; turn: number; outcome: string }>;
}
export function replayPilot(
  manifest: PilotManifest,
  options: {
    budget: { dialog(): void; turn(): void; endTurn(): void };
    semanticFailure?: 'next_independent_dialog';
    assessTurn?: (turn: {
      caseId: string;
      turn: number;
      result: {
        reply: string;
        userTurn?: { conversationId: string };
        evidence?: unknown;
      };
    }) => SemanticAssessment | Promise<SemanticAssessment>;
    record(row: Record<string, unknown>): unknown;
    openDialog(actor: { caseId: string; role: string }): Promise<{
      chat(body: {
        surface: 'web';
        requestId: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        conversationId?: string;
      }): Promise<{
        reply: string;
        userTurn?: { conversationId: string };
        evidence?: unknown;
      }>;
      close(): Promise<void>;
    }>;
  },
): Promise<ReplayResult>;
