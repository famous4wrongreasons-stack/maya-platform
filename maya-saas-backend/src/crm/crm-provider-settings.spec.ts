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