/** Fixed development profiles with a separate offline-only corpus. Declarations bind source and budget;
 * they neither issue a permit nor admit credentials or start model transport. */
import {
  CORE_DIAGNOSTIC_PROFILE,
  CORE_UI_PROFILE,
  CORE_DIAGNOSTIC_LIMITS,
  CORE_DIAGNOSTIC_LIMITS_SHA256,
  CORE_FOLLOWUP_PROFILE,
  CORE_FOLLOWUP_LIMITS,
  CORE_FOLLOWUP_LIMITS_SHA256,
  CORE_UNION_PROFILE,
  CORE_UNION_LIMITS,
  CORE_UNION_LIMITS_SHA256,
  CORE_OFFLINE_PROFILE,
  CORE_OFFLINE_LIMITS,
  CORE_OFFLINE_LIMITS_SHA256,
  CORE_OWNER_READ_PROFILE, CORE_OWNER_READ_LIMITS, CORE_OWNER_READ_LIMITS_SHA256,
  CORE_OWNER_HISTORY_PROFILE, CORE_OWNER_HISTORY_LIMITS, CORE_OWNER_HISTORY_LIMITS_SHA256,
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
const ui = Object.freeze({ ...diagnostic, id: CORE_UI_PROFILE });

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

const union = Object.freeze({
  id: CORE_UNION_PROFILE,
  datasetPath:
    'maya-saas-backend/datasets/conversation-intelligence/core-union-20261009.json',
  datasetSha256:
    '2832b5837a1b01a4d0fe6e58f8c8811f318a7402ab2e7052ebb8a8a6f7b9c4ca',
  casesSha256:
    '269fdb3331f2fa66b063a1e5c2be2922280f365101ca9cda1e0fa5056abce7e8',
  limits: CORE_UNION_LIMITS,
  limitsSha256: CORE_UNION_LIMITS_SHA256,
  dialogs: 9,
  userTurns: 18,
});

const offline = Object.freeze({
  id: CORE_OFFLINE_PROFILE,
  datasetPath:
    'maya-saas-backend/datasets/conversation-intelligence/core-offline-48-20261009.json',
  datasetSha256:
    '9c8db1420c489169a474b04dd43933110461fe3630e3ada2fb0e8dc40e7eb15b',
  casesSha256:
    '1720a8996b29299560d868c859f2ca36435f56daf2ffd22113144dae9bd8d488',
  limits: CORE_OFFLINE_LIMITS,
  limitsSha256: CORE_OFFLINE_LIMITS_SHA256,
  dialogs: 48,
  userTurns: 81,
});

export function coreConversationProfile(profile = CORE_DIAGNOSTIC_PROFILE) {
  if (profile === CORE_OWNER_HISTORY_PROFILE) return ownerHistory;
  if (profile === CORE_OWNER_READ_PROFILE) return ownerRead;
  if (profile === CORE_DIAGNOSTIC_PROFILE) return diagnostic;
  if (profile === CORE_UI_PROFILE) return ui;
  if (profile === CORE_FOLLOWUP_PROFILE) return followup;
  if (profile === CORE_UNION_PROFILE) return union;
  if (profile === CORE_OFFLINE_PROFILE) return offline;
  throw new Error('core_profile_refused');
}

const ownerRead = Object.freeze({
  id: CORE_OWNER_READ_PROFILE,
  datasetPath: 'maya-saas-backend/datasets/conversation-intelligence/core-owner-salon-read-20261011.json',
  datasetSha256: 'efa6ca03b3436fb24a636c45816bee3348061640dce13254bf653fa953f4fc29',
  casesSha256: 'd38e109b1811690f74da8b748df3f992bec09fd7d6c6003c8f3d24dda678f08c',
  limits: CORE_OWNER_READ_LIMITS, limitsSha256: CORE_OWNER_READ_LIMITS_SHA256,
  dialogs: 3, userTurns: 3,
});

const ownerHistory = Object.freeze({
  id: CORE_OWNER_HISTORY_PROFILE,
  datasetPath: 'maya-saas-backend/datasets/conversation-intelligence/core-owner-personal-history-20261012.json',
  datasetSha256: '66fb9281e82fe44b3a5744d6398ac2ca88ef74f21d5fba7d08cd63dc7d009087', casesSha256: '79028a1c0afe9a4763100c668fd012a8f9a5444375ce2ada8616176eec0a95a4',
  limits: CORE_OWNER_HISTORY_LIMITS, limitsSha256: CORE_OWNER_HISTORY_LIMITS_SHA256,
  dialogs: 2, userTurns: 2,
});
