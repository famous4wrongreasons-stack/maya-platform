import type { ServicePriceApprovalSnapshot } from '../../ai-tools/ai-approval-widget-trigger.port';
import type {
  NounActor,
  NounResolverInput,
} from '../noun-resolution/noun-resolution';
import type { NounReadResult } from '../noun-resolution/noun-resolution.ports';

export { SERVICE_PRICE_APPROVAL_OWNER } from '../di-tokens';
export const SERVICE_PRICE_APPROVAL_NOUN_OWNER = 'ai_service_price_approval';
export const servicePriceApprovalRef = (id: string, hash: string): string =>
  `v1:${id}:${hash}`;
export const parseServicePriceApprovalRef = (
  value: string,
): { id: string; hash: string } | null => {
  const match = /^v1:([A-Za-z0-9_-]{1,128}):([a-f0-9]{64})$/.exec(value);
  return match ? { id: match[1], hash: match[2] } : null;
};
export interface ServicePriceApprovalOwnerPort {
  sameServiceApproval(
    actor: NounActor,
    previousApprovalId: string,
    currentApprovalId: string,
  ): Promise<boolean>;
  read(
    actor: NounActor,
    ref: string,
    principalProofHash: string,
    revalidate: boolean,
  ): Promise<ServicePriceApprovalSnapshot>;
  readNoun(input: NounResolverInput, actor: NounActor): Promise<NounReadResult>;
}
