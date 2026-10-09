export const CORE_FULL_OFFLINE_QUALIFICATION: 'SCRIPTED_SYNTHETIC_NOT_MODEL_QUALITY';
export type CoreFullOfflineObservation = Readonly<{
  qualification: typeof CORE_FULL_OFFLINE_QUALIFICATION;
  caseId: string;
  turn: number;
  phase: 'tool_planning' | 'final_response';
  requestedTool: string | null;
  emittedTool: string | null;
  limitation: string | null;
  coverage: string;
  observedToolNames: readonly string[];
  intendedTaskIntents: readonly string[];
  inputSha256: string;
  contentSha256: string;
  actualProviderCalls: 0;
  actualBilling: false;
  corpusGoldUsed: false;
  modelHistoryPolicy: 'CANONICAL_USER_ONLY_WITH_SERVER_SEMANTIC_CONTINUATION';
}>;
/** Strict frozen 48-case selector. No files, credentials, HTTP or model calls. */
export function createCoreFullOfflineModel(options: {
  cases: readonly unknown[];
}): Readonly<{
  observations: readonly CoreFullOfflineObservation[];
  respond(
    body: string,
    context: { caseId: string; turn: number },
  ): {
    model: 'deepseek-v4-pro';
    choices: [{ finish_reason: 'stop'; message: { content: string } }];
    usage: { prompt_tokens: 0; completion_tokens: 0; total_tokens: 0 };
    maya_full_offline: CoreFullOfflineObservation;
  };
}>;
