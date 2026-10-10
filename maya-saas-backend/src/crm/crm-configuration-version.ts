import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';

export interface CrmConfigurationSource {
  id: string;
  tenantId: string;
  provider: string;
  encryptedApiToken: string;
  baseUrl: string | null;
  settingsJson: unknown;
}
const VERSION = /^[a-f0-9]{64}$/;
export const CRM_NO_CONFIGURATION = createHash('sha256')
  .update('maya.crm-configuration/1:none')
  .digest('hex');
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
/** Composite of encrypted credential and configuration, never a plaintext-key fingerprint.
 * Activation timestamps/status and the accepted import receipt are not configuration. */
export function crmConfigurationVersion(
  source: CrmConfigurationSource | null,
): string | null {
  if (!source) return null;
  const settings =
    source.settingsJson &&
    typeof source.settingsJson === 'object' &&
    !Array.isArray(source.settingsJson)
      ? (source.settingsJson as Record<string, unknown>)
      : {};
  return createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          contract: 'maya.crm-configuration/1',
          id: source.id,
          tenantId: source.tenantId,
          provider: source.provider,
          encryptedApiToken: source.encryptedApiToken,
          baseUrl: source.baseUrl,
          settings: Object.fromEntries(
            Object.entries(settings).filter(
              ([key]) => key !== 'acceptedImportSnapshotHash',
            ),
          ),
        }),
      ),
    )
    .digest('hex');
}
export function crmExpectedVersion(
  value: unknown,
  allowNull = false,
): string | null {
  if (allowNull && value === null) return null;
  if (typeof value !== 'string' || !VERSION.test(value))
    throw new BadRequestException({
      message: 'Exact configuration version required',
      error: { code: 'crm_config_version_required' },
    });
  return value;
}
export function assertCrmConfiguration(
  source: CrmConfigurationSource | null,
  expected: string | null,
) {
  if (crmConfigurationVersion(source) !== expected)
    throw new ConflictException({
      message: 'CRM configuration changed',
      error: { code: 'crm_config_version_changed' },
    });
}
export function crmOperationRequestId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new BadRequestException({
      message: 'Exact UUIDv4 operation key required',
      error: { code: 'crm_operation_request_invalid' },
    });
  return value.toLowerCase();
}
export interface CrmCommitReceipt {
  contract: 'maya.crm-config-commit/1';
  configVersion: string;
  phase: 'installed' | 'activated' | 'import_confirmed';
  atomicProjection: boolean;
}
