import { BadRequestException } from '@nestjs/common';

import { CrmProvider } from '../common/domain.enums';
import {
  normalizeCrmProviderSettings,
  serializePublicCrmSettings,
} from './crm-provider-settings';

describe('CRM provider settings', () => {
  it('normalizes the allowed YClients settings only', () => {
    expect(
      normalizeCrmProviderSettings(CrmProvider.YCLIENTS, {
        companyId: '42',
        tipsCompanyId: '99',
        activeMasterIds: ['7', 7, 9],
        currency: 'rub',
        apiToken: 'must-be-dropped',
        secret: 'must-be-dropped',
      }),
    ).toEqual({
      companyId: 42,
      tipsCompanyId: 99,
      activeMasterIds: [7, 9],
      currency: 'RUB',
    });
  });

  it('rejects an invalid company ID before making a provider request', () => {
    expect(() =>
      normalizeCrmProviderSettings(CrmProvider.YCLIENTS, {
        companyId: 'not-an-id',
      }),
    ).toThrow(BadRequestException);
  });

  it('never serializes token-shaped or unknown settings', () => {
    expect(
      serializePublicCrmSettings(CrmProvider.YCLIENTS, {
        companyId: 42,
        tipsCompanyId: 99,
        activeMasterIds: [7],
        apiToken: 'private',
        password: 'private',
        arbitrary: 'private',
      }),
    ).toEqual({
      companyId: 42,
      tipsCompanyId: 99,
      activeMasterIds: [7],
    });
  });
});

describe('explicit CRM branch binding settings', () => {
  const binding = {
    contract: 'maya.crm-branch-binding/1',
    branchId: 'branch-a',
    companyId: 42,
  };
  it.each([CrmProvider.YCLIENTS, CrmProvider.ALTEGIO])(
    'normalizes, publishes and explicitly removes %s binding',
    (provider) => {
      const settings = normalizeCrmProviderSettings(provider, {
        companyId: '42',
        branchBinding: binding,
      });
      expect(settings).toEqual({ companyId: 42, branchBinding: binding });
      expect(serializePublicCrmSettings(provider, settings)).toEqual(settings);
      expect(
        normalizeCrmProviderSettings(provider, {
          companyId: 42,
          branchBinding: null,
        }),
      ).toEqual({ companyId: 42, branchBinding: null });
    },
  );
  it.each([
    {},
    { ...binding, companyId: 43 },
    { ...binding, companyId: true },
    { ...binding, branchId: '' },
    { ...binding, branchId: '../foreign' },
    { ...binding, tenantId: 'foreign' },
    { ...binding, contract: 'untrusted' },
  ])('refuses malformed or mismatched binding %#', (branchBinding) => {
    expect(() =>
      normalizeCrmProviderSettings(CrmProvider.YCLIENTS, {
        companyId: 42,
        branchBinding,
      }),
    ).toThrow(BadRequestException);
    expect(
      serializePublicCrmSettings('yclients', { companyId: 42, branchBinding }),
    ).toEqual({ companyId: 42, branchBinding: null });
  });
});
