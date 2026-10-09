/** Two fixed development batches only. Declarations bind source and budget;
 * they neither issue a permit nor admit credentials or start model transport. */
import {
  CORE_DIAGNOSTIC_PROFILE,
  CORE_DIAGNOSTIC_LIMITS,
  CORE_DIAGNOSTIC_LIMITS_SHA256,
  CORE_FOLLOWUP_PROFILE,
  CORE_FOLLOWUP_LIMITS,
  CORE_FOLLOWUP_LIMITS_SHA256,
} from './current-candidate-budget.mjs';

const diagnostic = Object.freeze({
  id: CORE_DIAGNOSTIC_PROFILE,
  datasetPath:
    'maya-saas-backend/datasets/conversation-intelligence/core-diagnostic-20261008.json',
  datasetSha256:
    'b793c5489dcd8838e4edc6bca6c00c53530b57892c29520876845608786e2dc6',
  casesSha256:
    'a1f6d6a3716b302190061b6c21bab70232ce494f2b4edfae77f0f0ba32ddff40',
  limits: CORE_DIAGNOSTIC_LIMITS,
  limitsSha256: CORE_DIAGNOSTIC_LIMITS_SHA256,
  dialogs: 3,
  userTurns: 5,
});
const followup = Object.freeze({
  id: CORE_FOLLOWUP_PROFILE,
  datasetPath:
    'maya-saas-backend/datasets/conversation-intelligence/core-followup-executable-20261009.json',
  datasetSha256:
    '0b22fbe04687028e59b0a5a3f4bf7395791fa52a88a9c3a342dd193aa6b8e2ca',
  casesSha256:
    '53e272080750736a157374723a0172de320a350ea4ff634496537b578603db71',
  limits: CORE_FOLLOWUP_LIMITS,
  limitsSha256: CORE_FOLLOWUP_LIMITS_SHA256,
  dialogs: 6,
  userTurns: 13,
});

export function coreConversationProfile(profile = CORE_DIAGNOSTIC_PROFILE) {
  if (profile === CORE_DIAGNOSTIC_PROFILE) return diagnostic;
  if (profile === CORE_FOLLOWUP_PROFILE) return followup;
  throw new Error('core_profile_refused');
}
