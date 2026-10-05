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
export function replayPilot(
  manifest: PilotManifest,
  options: {
    budget: { dialog(): void; turn(): void; endTurn(): void };
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
): Promise<{
  status: string;
  outcomes: Array<{ caseId: string; outcome: string }>;
  qualification: string;
}>;
