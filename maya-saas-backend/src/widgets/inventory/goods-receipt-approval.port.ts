import type { GoodsReceiptApprovalSnapshot } from '../../ai-tools/ai-approval-widget-trigger.port';
import type {
  NounActor,
  NounResolverInput,
} from '../noun-resolution/noun-resolution';
import type { NounReadResult } from '../noun-resolution/noun-resolution.ports';

export { GOODS_RECEIPT_APPROVAL_OWNER } from '../di-tokens';
export const GOODS_RECEIPT_APPROVAL_NOUN_OWNER = 'ai_goods_receipt_approval';
export const goodsReceiptApprovalRef = (id: string, hash: string): string =>
  `v1:${id}:${hash}`;
export const parseGoodsReceiptApprovalRef = (
  value: string,
): { id: string; hash: string } | null => {
  const match = /^v1:([A-Za-z0-9_-]{1,128}):([a-f0-9]{64})$/.exec(value);
  return match ? { id: match[1], hash: match[2] } : null;
};
export interface GoodsReceiptApprovalOwnerPort {
  sameLineApproval(
    actor: NounActor,
    previousApprovalId: string,
    currentApprovalId: string,
  ): Promise<boolean>;
  read(
    actor: NounActor,
    ref: string,
    principalProofHash: string,
    revalidate: boolean,
  ): Promise<GoodsReceiptApprovalSnapshot>;
  readNoun(input: NounResolverInput, actor: NounActor): Promise<NounReadResult>;
}
