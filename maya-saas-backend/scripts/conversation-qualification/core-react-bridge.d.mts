export function startCoreReactBridge(input: {
  backendOrigin: string;
  output: string;
  candidateCommit: string;
  manifestSha256: string;
  modelQualification: string;
  cases: Array<{ id: string; email: string; userTurns: string[] }>;
}): Promise<{
  open(caseId: string): Promise<void>;
  chat(prompt: string): Promise<{
    status: number;
    body: unknown;
    request: {
      surface: 'web';
      requestId: string;
      conversationId?: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
  }>;
  closeDialog(): Promise<unknown>;
  close(): Promise<void>;
}>;
