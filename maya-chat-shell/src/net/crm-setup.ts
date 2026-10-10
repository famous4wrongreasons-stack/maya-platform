// A17 public metadata only. Never pass previews, warnings, raw errors or credentials to the UI.
import type { CrmSetupBody, CrmSetupInput, CrmSetupSnapshot } from './types.ts';
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 512;
const company = (v: unknown): string | null => (typeof v === 'number' || typeof v === 'string') && /^[1-9]\d{0,15}$/.test(String(v)) && Number.isSafeInteger(Number(v)) ? String(v) : null;
const count = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
export const crmSetupKey = (key: string): boolean => typeof key === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(key);
export function crmSetupBody(input: CrmSetupInput): CrmSetupBody | null {
  if (!input || typeof input.apiToken !== 'string' || input.apiToken.trim().length === 0 || input.apiToken.length > 4096 || typeof input.companyId !== 'string' || company(input.companyId) === null || !text(input.branchId)) return null;
  const companyId = Number(input.companyId);
  return { provider: 'yclients', apiToken: input.apiToken.trim(), settingsJson: { companyId, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId, branchId: input.branchId } } };
}
export function projectCrmSetup(raw: unknown): CrmSetupSnapshot | null {
  const value = object(raw);
  if (!value) return null;
  if (value.configured === false && value.connection === null) return { connection: null, counts: null };
  const c = object(value.connection);
  if (!c || !text(c.id) || !text(c.tenant_id) || !text(c.updated_at) || !Number.isFinite(Date.parse(c.updated_at)) || typeof c.has_credentials !== 'boolean' || !text(c.provider) || !text(c.status)) return null;
  const settings = object(c.settings_json), binding = object(settings?.branchBinding);
  const companyId = company(settings?.companyId);
  const branchId = companyId !== null && binding?.contract === 'maya.crm-branch-binding/1' && company(binding.companyId) === companyId && text(binding.branchId) ? binding.branchId : null;
  const preview = object(value.preview);
  return {
    connection: { id: c.id, tenantId: c.tenant_id, updatedAt: c.updated_at, provider: c.provider === 'yclients' ? 'yclients' : 'other', status: c.status === 'active' || c.status === 'pending_activation' ? c.status : 'other', hasCredentials: c.has_credentials, companyId, branchId },
    counts: preview === null ? null : { services: count(object(preview.services)?.count), staff: count(object(preview.staff)?.count) },
  };
}
