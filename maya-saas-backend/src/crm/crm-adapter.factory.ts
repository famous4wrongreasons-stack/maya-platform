import { Injectable } from '@nestjs/common';

import { CrmProvider } from '../common/domain.enums';
import { DikidiCRMAdapter } from './adapters/dikidi-crm.adapter';
import { MockCRMAdapter } from './adapters/mock-crm.adapter';
import { SalonOnlineCRMAdapter } from './adapters/salon-online-crm.adapter';
import { WhitelinesCRMAdapter } from './adapters/whitelines-crm.adapter';
import { YclientsCRMAdapter } from './adapters/yclients-crm.adapter';
import { CRMAdapter, CrmAdapterConfig } from './crm-adapter.interface';

@Injectable()
export class CrmAdapterFactory {
  create(provider: CrmProvider, config: CrmAdapterConfig): CRMAdapter {
    switch (provider) {
      case CrmProvider.YCLIENTS:
      case CrmProvider.ALTEGIO:
        return new YclientsCRMAdapter(config);
      case CrmProvider.MOCK:
        return new MockCRMAdapter(config);
      case CrmProvider.DIKIDI:
        return new DikidiCRMAdapter(config);
      case CrmProvider.WHITELINES:
        return new WhitelinesCRMAdapter(config);
      case CrmProvider.SALON_ONLINE:
        return new SalonOnlineCRMAdapter(config);
      default:
        throw new Error('Unsupported CRM provider');
    }
  }
}
