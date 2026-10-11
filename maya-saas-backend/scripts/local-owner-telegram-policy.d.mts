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
): string | null;
