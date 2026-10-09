export type FullOfflineSemanticStatus =
  'pass' | 'semantic_fail' | 'unsupported' | 'insufficient_evidence';
export type FullOfflineCheck = {
  id: string;
  status: 'pass' | 'fail' | 'insufficient_evidence';
};
export type FullOfflineSemanticInput = {
  caseId: string;
  turn: number;
  userText?: string;
  httpStatus?: number | null;
  reply?: string | null;
  priorReplies?: string[];
  audit?: {
    qualification?: string;
    completeness?: { status?: string; [key: string]: unknown };
    actor?: {
      role?: string | null;
      sameTenant?: boolean | null;
      sameActor?: boolean | null;
      membershipActive?: boolean | null;
    };
    semanticPlans?: Array<{
      tasks?: Array<{
        intent?: string;
        entities?: Record<string, unknown>;
        requires_clarification?: boolean;
        [key: string]: unknown;
      }>;
      [key: string]: unknown;
    }>;
    toolResults?: Array<{ name: string; result: unknown }>;
    selection?: {
      matched?: boolean;
      tenantMatches?: boolean;
      shownCount?: number;
      slots?: Array<{ start?: string; end?: string }>;
      [key: string]: unknown;
    };
    sourceFacts?: Record<string, unknown>;
    coordination?: Record<string, unknown> | null;
    recommendation?: Record<string, unknown> | null;
    financialEvidenceCount?: number;
    persistedCoordination?: Array<Record<string, unknown>>;
    effects?: {
      businessHashUnchanged?: boolean;
      businessWrites?: unknown[];
      forbidden?: unknown[];
      outboundCalls?: number;
    };
    expectedRefusal?: unknown;
    historyUnchanged?: boolean | null;
    [key: string]: unknown;
  } | null;
  modelCalls?: number;
  serializerCalls?: number;
  brokerCalls?: number;
  modelOutputResponses?: number;
  sourceReads?: unknown[];
};
export type FullOfflineExpectation = Readonly<{
  caseId: string;
  turn: number;
  userText: string;
  role: string;
  kind: string;
  intents: readonly string[];
  slots: Readonly<Record<string, unknown>>;
}>;
export const CORE_FULL_OFFLINE_EXPECTATIONS: readonly FullOfflineExpectation[];
export const CORE_FULL_OFFLINE_EXPECTATIONS_SHA256: string;
export const CORE_FULL_OFFLINE_ASSESSMENT_QUALIFICATION: string;
export function assessFullOfflineTurn(input: FullOfflineSemanticInput): {
  caseId: string;
  turn: number;
  status: FullOfflineSemanticStatus;
  checks: FullOfflineCheck[];
  failedCheckIds: string[];
  missingEvidenceIds: string[];
  criticalSafety: {
    status: 'pass' | 'fail' | 'insufficient_evidence';
    failedCheckIds: string[];
    missingEvidenceIds: string[];
  };
  expectationSha256: string;
  qualification: string;
};
