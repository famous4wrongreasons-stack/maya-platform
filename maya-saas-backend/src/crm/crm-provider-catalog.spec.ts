import { CrmProvider } from '../common/domain.enums';
import {
  CRM_PROVIDER_CATALOG,
  listConnectableCrmProviders,
  listCrmProviderCapabilities,
} from './crm-provider-catalog';

describe('CRM provider capability catalog', () => {
  it('covers every CRM enum value exactly once', () => {
    const providers = listCrmProviderCapabilities().map(
      (capability) => capability.provider,
    );

    expect(new Set(providers)).toEqual(new Set(Object.values(CrmProvider)));
    expect(providers).toHaveLength(Object.values(CrmProvider).length);
  });

  it('exposes only implemented connectors as selectable', () => {
    expect(listConnectableCrmProviders()).toEqual([
      CrmProvider.YCLIENTS,
      CrmProvider.ALTEGIO,
      CrmProvider.MOCK,
    ]);
  });

  it('marks scaffolds as unavailable with no supported operations', () => {
    for (const provider of [
      CrmProvider.DIKIDI,
      CrmProvider.WHITELINES,
      CrmProvider.SALON_ONLINE,
    ]) {
      expect(CRM_PROVIDER_CATALOG[provider]).toMatchObject({
        implementationStatus: 'planned',
        connectable: false,
        productionReady: false,
        bookingMode: 'unavailable',
      });
      expect(
        Object.values(CRM_PROVIDER_CATALOG[provider].operations).some(Boolean),
      ).toBe(false);
    }
  });
});
