import { readPinnedLocalLaunch } from './local-owner-telegram-launch.mjs';
import { assertOwnerHistoryPlan } from './local-owner-history-policy.mjs';
export function readOwnerHistoryLaunch(filename, hash, approvalRef, readSource, role = 'inspect') {
  return readPinnedLocalLaunch(filename, hash, approvalRef, readSource, role, assertOwnerHistoryPlan);
}
