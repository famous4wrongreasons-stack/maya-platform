import { BadRequestException } from '@nestjs/common';

import { CrmProvider } from '../common/domain.enums';

const MAX_SETTINGS_BYTES = 16 * 1024;
const MAX_ACTIVE_MASTER_IDS = 500;

export const CRM_BRANCH_BINDING_CONTRACT = 'maya.crm-branch-binding/1';
export type CrmBranchBinding = {
  contract: typeof CRM_BRANCH_BINDING_CONTRACT;
  branchId: string;
  companyId: number;
};

/** An explicit pair for the integration's single company; never an ID guess. */
export function normalizeCrmBranchBinding(
  input: unknown,
  companyId: unknown,
): CrmBranchBinding | null | undefined {
  if (input === undefined || input === null) return input;
  const value = asRecord(input);
  if (
    Object.keys(value).sort().join(',') !== 'branchId,companyId,contract' ||
    value.contract !== CRM_BRANCH_BINDING_CONTRACT ||
    typeof value.branchId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.branchId) ||
    !['number', 'string'].includes(typeof value.companyId) ||
    !/^[1-9][0-9]*$/.test(String(value.companyId)) ||
    !Number.isSafeInteger(Number(value.companyId)) ||
    Number(value.companyId) !== Number(companyId)
  )
    throw new BadRequestException('Exact CRM company/branch binding required');
  return {
    contract: CRM_BRANCH_BINDING_CONTRACT,
    branchId: value.branchId,
    companyId: Number(value.companyId),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }

  return parsed;
}

export function normalizeCrmProviderSettings(
  provider: CrmProvider,
  input: unknown,
): Record<string, unknown> {
  const settings = asRecord(input);
  if (
    Buffer.byteLength(JSON.stringify(settings), 'utf8') > MAX_SETTINGS_BYTES
  ) {
    throw new BadRequestException('CRM settings are too large');
  }

  if (provider === CrmProvider.YCLIENTS || provider === CrmProvider.ALTEGIO) {
    const normalized: Record<string, unknown> = {
      companyId: positiveInteger(settings.companyId, 'settingsJson.companyId'),
    };
    if (settings.branchBinding !== undefined)
      normalized.branchBinding = normalizeCrmBranchBinding(
        settings.branchBinding,
        normalized.companyId,
      );

    if (settings.activeMasterIds !== undefined) {
      if (
        !Array.isArray(settings.activeMasterIds) ||
        settings.activeMasterIds.length > MAX_ACTIVE_MASTER_IDS
      ) {
        throw new BadRequestException(
          `settingsJson.activeMasterIds must contain at most ${MAX_ACTIVE_MASTER_IDS} IDs`,
        );
      }
      normalized.activeMasterIds = [
        ...new Set(
          settings.activeMasterIds.map((id) =>
            positiveInteger(id, 'settingsJson.activeMasterIds[]'),
          ),
        ),
      ];
    }

    if (settings.currency !== undefined) {
      if (typeof settings.currency !== 'string') {
        throw new BadRequestException(
          'settingsJson.currency must be a three-letter ISO code',
        );
      }
      const currency = settings.currency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        throw new BadRequestException(
          'settingsJson.currency must be a three-letter ISO code',
        );
      }
      normalized.currency = currency;
    }

    // Tips pay pages are YClients/ЮMoney URLs keyed by company + staff id.
    // Optional override when tips are enabled on a different branch/company.
    const tipsCompanyRaw =
      settings.tipsCompanyId ?? settings.tips_company_id ?? undefined;
    if (
      tipsCompanyRaw !== undefined &&
      tipsCompanyRaw !== null &&
      tipsCompanyRaw !== ''
    ) {
      normalized.tipsCompanyId = positiveInteger(
        tipsCompanyRaw,
        'settingsJson.tipsCompanyId',
      );
    }

    return normalized;
  }

  if (provider === CrmProvider.MOCK) {
    const industryPresetId =
      typeof settings.industryPresetId === 'string'
        ? settings.industryPresetId.trim()
        : '';
    return industryPresetId ? { industryPresetId } : {};
  }

  return {};
}

export function serializePublicCrmSettings(
  provider: string,
  input: unknown,
): Record<string, unknown> {
  const settings = asRecord(input);

  if (provider === 'yclients' || provider === 'altegio') {
    const result: Record<string, unknown> = {};
    if (settings.companyId !== undefined) {
      result.companyId = settings.companyId;
    }
    if (settings.tipsCompanyId !== undefined) {
      result.tipsCompanyId = settings.tipsCompanyId;
    }
    if (Array.isArray(settings.activeMasterIds)) {
      result.activeMasterIds = settings.activeMasterIds;
    }
    if (typeof settings.currency === 'string') {
      result.currency = settings.currency;
    }
    // Persisted invalid/legacy material must not be presented as a binding.
    try {
      const binding = normalizeCrmBranchBinding(
        settings.branchBinding,
        settings.companyId,
      );
      if (binding !== undefined) result.branchBinding = binding;
    } catch {
      result.branchBinding = null;
    }
    return result;
  }

  if (provider === 'mock' && typeof settings.industryPresetId === 'string') {
    return { industryPresetId: settings.industryPresetId };
  }

  return {};
}
