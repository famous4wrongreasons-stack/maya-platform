// A17 public metadata only. Never pass previews, warnings, raw errors or credentials to the UI.
import type { CrmSetupBody, CrmSetupInstall, CrmSetupSnapshot, CrmOperationLocator, CrmOperationStatus } from './types.ts';
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 512;
const company = (v: unknown): string | null => (typeof v === 'number' || typeof v === 'string') && /^[1-9]\d{0,15}$/.test(String(v)) && Number.isSafeInteger(Number(v)) ? String(v) : null;
const count = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
export const crmSetupKey = (key: string): boolean => typeof key === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(key);
export function crmSetupBody(input: CrmSetupInstall): CrmSetupBody | null {
  if (!input || !(input.expectedVersion === null || crmConfigVersion(input.expectedVersion)) || typeof input.apiToken !== 'string' || input.apiToken.trim().length === 0 || input.apiToken.length > 4096 || typeof input.companyId !== 'string' || company(input.companyId) === null || !text(input.branchId)) return null;
  const companyId = Number(input.companyId);
  return { provider: 'yclients', apiToken: input.apiToken.trim(), expectedVersion: input.expectedVersion, settingsJson: { companyId, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId, branchId: input.branchId } } };
}
export function projectCrmSetup(raw: unknown): CrmSetupSnapshot | null {
  const value = object(raw);
  if (!value) return null;
  if (value.configured === false && value.connection === null) return { connection: null, counts: null };
  const c = object(value.connection);
  if (!c || !crmConfigVersion(c.configVersion) || !text(c.id) || !text(c.tenant_id) || !text(c.updated_at) || !Number.isFinite(Date.parse(c.updated_at)) || typeof c.has_credentials !== 'boolean' || !text(c.provider) || !text(c.status)) return null;
  const settings = object(c.settings_json), binding = object(settings?.branchBinding);
  const companyId = company(settings?.companyId);
  const branchId = companyId !== null && binding?.contract === 'maya.crm-branch-binding/1' && company(binding.companyId) === companyId && text(binding.branchId) ? binding.branchId : null;
  const preview = object(value.preview);
  return {
    connection: { configVersion: c.configVersion, id: c.id, tenantId: c.tenant_id, updatedAt: c.updated_at, provider: c.provider === 'yclients' ? 'yclients' : 'other', status: c.status === 'active' || c.status === 'pending_activation' ? c.status : 'other', hasCredentials: c.has_credentials, companyId, branchId },
    counts: preview === null ? null : { services: count(object(preview.services)?.count), staff: count(object(preview.staff)?.count) },
  };
}

export const crmConfigVersion = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function projectCrmOperation(raw: unknown, locator: CrmOperationLocator): CrmOperationStatus | null {
  const v = object(raw), current = object(v?.current), receipt = object(v?.receipt);
  if (!v || v.contract !== 'maya.crm-operation-status/1' || v.operation !== locator.operation || v.requestId !== locator.requestId || !crmSetupKey(locator.requestId) || !['install', 'activate'].includes(locator.operation) || !['NOT_OBSERVED', 'READY', 'SUCCEEDED', 'UNAVAILABLE'].includes(String(v.status)) || !(v.phase === null || ['install', 'activate', 'confirm'].includes(String(v.phase))) || !current || !(current.configVersion === null || crmConfigVersion(current.configVersion)) || typeof current.matchesCurrentVersion !== 'boolean') return null;
  if (v.receipt !== null && (!receipt || receipt.contract !== 'maya.crm-operation-receipt/1' || receipt.operation !== locator.operation || receipt.requestId !== locator.requestId || !['installed', 'activated', 'import_confirmed'].includes(String(receipt.phase)) || !crmConfigVersion(receipt.configVersion) || typeof receipt.executionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(receipt.executionId) || typeof receipt.atomicProjection !== 'boolean')) return null;
  if (receipt && ((locator.operation === 'install') !== (receipt.phase === 'installed') || receipt.atomicProjection !== (receipt.phase === 'import_confirmed'))) return null;
  if (current.matchesCurrentVersion && (!receipt || current.configVersion !== receipt.configVersion)) return null;
  if (v.status === 'SUCCEEDED' && (!receipt || (locator.operation === 'install' ? receipt.phase !== 'installed' : receipt.phase !== 'import_confirmed' || receipt.atomicProjection !== true))) return null;
  return { ...locator, status: v.status as CrmOperationStatus['status'], phase: v.phase as CrmOperationStatus['phase'],
    receipt: receipt ? { ...locator, phase: receipt.phase as 'installed' | 'activated' | 'import_confirmed', configVersion: receipt.configVersion as string, executionId: receipt.executionId as string, atomicProjection: receipt.atomicProjection as boolean } : null,
    current: { configVersion: current.configVersion as string | null, matchesCurrentVersion: current.matchesCurrentVersion } };
}
