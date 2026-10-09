import type {
  CoreConversationProfileId,
  CORE_DIAGNOSTIC_LIMITS,
} from './current-candidate-budget.mjs';

export type CoreConversationProfile = Readonly<{
  id: CoreConversationProfileId;
  datasetPath: string;
  datasetSha256: string;
  casesSha256: string;
  limits: typeof CORE_DIAGNOSTIC_LIMITS;
  limitsSha256: string;
  dialogs: 3 | 6 | 9;
  userTurns: 5 | 13 | 18;
}>;
/** Closed A/B/union profile lookup only; no filesystem, authority or execution. */
export function coreConversationProfile(
  profile?: CoreConversationProfileId,
): CoreConversationProfile;
