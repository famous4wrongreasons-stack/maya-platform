import { BadRequestException } from '@nestjs/common';

import { CrmProvider } from '../common/domain.enums';

const MAX_SETTINGS_BYTES = 16 * 1024;
const MAX_ACTIVE_MASTER_IDS = 500;

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
    return result;
  }

  if (provider === 'mock' && typeof settings.industryPresetId === 'string') {
    return { industryPresetId: settings.industryPresetId };
  }

  return {};
}
