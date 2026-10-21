import type { StaffCreateApprovalSnapshot } from '../../ai-tools/ai-staff-create-widget-trigger.port';
import type {
  NounActor,
  NounResolverInput,
} from '../noun-resolution/noun-resolution';
import type { NounReadResult } from '../noun-resolution/noun-resolution.ports';

export { STAFF_CREATE_APPROVAL_OWNER } from '../di-tokens';
export const STAFF_CREATE_APPROVAL_NOUN_OWNER = 'ai_staff_create_approval';
export const staffCreateApprovalRef = (id: string, hash: string): string =>
  `v1:${id}:${hash}`;
export const parseStaffCreateApprovalRef = (
  value: string,
): { id: string; hash: string } | null => {
  const match = /^v1:([A-Za-z0-9_-]{1,128}):([a-f0-9]{64})$/.exec(value);
  return match ? { id: match[1], hash: match[2] } : null;
};
export interface StaffCreateApprovalOwnerPort {
  read(
    actor: NounActor,
    ref: string,
    principalProofHash: string,
    revalidate: boolean,
  ): Promise<StaffCreateApprovalSnapshot>;
  readNoun(input: NounResolverInput, actor: NounActor): Promise<NounReadResult>;
}
