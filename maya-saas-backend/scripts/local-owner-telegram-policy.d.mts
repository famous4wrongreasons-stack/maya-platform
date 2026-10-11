export interface OwnerTelegramScope {
  stateDirectory: string;
  initialManifestSha256: string;
  privateStateSha256: string;
  restartReceiptPath: string;
  restartReceiptSha256: string;
  tenantId: string;
  userId: string;
  branchId: string;
  tenantSlug: string;
  companyId: string;
}
export function ownerTelegramIngress(
  method: string,
  route: string,
  headers: Record<string, unknown>,
  body: unknown,
  origin: string,
  scope: OwnerTelegramScope,
  contract?: string,
): string | null;
export const OWNER_TELEGRAM_PROFILE: string;
export const OWNER_TELEGRAM_BATCH_PROFILE: string;
