import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { CrmProvider } from '../common/domain.enums';
import { DikidiCRMAdapter } from './adapters/dikidi-crm.adapter';
import { MockCRMAdapter } from './adapters/mock-crm.adapter';
import { SalonOnlineCRMAdapter } from './adapters/salon-online-crm.adapter';
import { WhitelinesCRMAdapter } from './adapters/whitelines-crm.adapter';
import { YclientsCRMAdapter } from './adapters/yclients-crm.adapter';
import { CRMAdapter, CrmAdapterConfig } from './crm-adapter.interface';

@Injectable()
export class CrmAdapterFactory implements OnModuleInit {
  private readonly logger = new Logger(CrmAdapterFactory.name);
  private partnerTokenReader?: () => string;

  // Local server bootstrap only; there is no DTO, route, or persisted setting.
  // Installing a reader disables environment fallback, including after revocation.
  installPartnerTokenReader(reader: () => string): void {
    if (this.partnerTokenReader || typeof reader !== 'function') {
      throw new Error('CRM credential reader installation refused');
    }
    this.partnerTokenReader = reader;
  }

  private partnerToken(): string | undefined {
    if (!this.partnerTokenReader) return undefined;
    const token = this.partnerTokenReader();
    if (
      typeof token !== 'string' ||
      !/^[\x21-\x2b\x2d-\x7e]{16,4096}$/.test(token)
    ) {
      throw new Error('CRM credential unavailable');
    }
    return token;
  }

  /**
   * 🔴 Партнёрский токен проверяем при СТАРТЕ, а не в момент подключения.
   *
   * Без него служба поднимается «здоровой», а каждое подключение CRM падает с
   * невнятным «подключение временно не настроено». Салон уверен, что дело в
   * его токене, и уходит. Приложение при этом обязано подниматься: тенанты на
   * внутреннем календаре живут и без CRM — поэтому громко предупреждаем, а не
   * отказываемся стартовать.
   */
  onModuleInit(): void {
    if (
      String(
        this.partnerToken() ?? process.env.YCLIENTS_PARTNER_TOKEN ?? '',
      ).trim()
    ) {
      return;
    }

    this.logger.error(
      'YCLIENTS_PARTNER_TOKEN не задан: подключение YClients и Altegio будет ' +
        'отклоняться для ВСЕХ салонов. Внутренний календарь при этом работает.',
    );
  }

  create(provider: CrmProvider, config: CrmAdapterConfig): CRMAdapter {
    switch (provider) {
      case CrmProvider.YCLIENTS:
        return new YclientsCRMAdapter(
          {
            ...config,
            baseUrl:
              config.baseUrl ||
              process.env.YCLIENTS_BASE_URL ||
              'https://api.yclients.com/api/v1',
          },
          this.partnerToken(),
        );
      case CrmProvider.ALTEGIO:
        return new YclientsCRMAdapter(
          {
            ...config,
            baseUrl:
              config.baseUrl ||
              process.env.ALTEGIO_BASE_URL ||
              'https://api.alteg.io/api/v1',
          },
          this.partnerToken(),
        );
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
