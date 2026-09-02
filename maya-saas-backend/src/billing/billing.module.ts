import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ActionEngineModule,
  ActionEngineRuntimeService,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BillingController } from './billing.controller';
import { BillingSchedulerService } from './billing-scheduler.service';
import { BillingService } from './billing.service';
import { BillingSystemGateway } from './billing-system.gateway';
import { P408TenantBillingCanonicalCutoverService } from './p4-08-tenant-billing-canonical-cutover.service';
import { P408TenantBillingExecutableService } from './p4-08-tenant-billing-executable.service';
import {
  P408ActionProviderReferenceCodec,
  P408YooKassaPaymentProvider,
} from './p4-08-yookassa-payment-provider';
import { YooKassaClientService } from './yookassa-client.service';

@Module({
  imports: [ActionEngineModule, SubscriptionsModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingSchedulerService,
    BillingSystemGateway,
    YooKassaClientService,
    P408YooKassaPaymentProvider,
    P408TenantBillingCanonicalCutoverService,
    {
      provide: P408ActionProviderReferenceCodec,
      useFactory: (config: ConfigService) =>
        new P408ActionProviderReferenceCodec(
          requiredActionSetting(config, 'ACTION_ENGINE_IDENTITY_SECRET'),
          requiredActionSetting(
            config,
            'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
          ),
        ),
      inject: [ConfigService],
    },
    {
      provide: P408TenantBillingExecutableService,
      useFactory: (
        prisma: PrismaService,
        actionEngine: ActionEngineRuntimeService,
        provider: P408YooKassaPaymentProvider,
        codec: P408ActionProviderReferenceCodec,
      ) =>
        new P408TenantBillingExecutableService(
          prisma,
          actionEngine,
          provider,
          codec,
        ),
      inject: [
        PrismaService,
        ActionEngineRuntimeService,
        P408YooKassaPaymentProvider,
        P408ActionProviderReferenceCodec,
      ],
    },
  ],
  exports: [BillingService, YooKassaClientService],
})
export class BillingModule {}

function requiredActionSetting(
  config: ConfigService,
  name:
    'ACTION_ENGINE_IDENTITY_SECRET' | 'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
): string {
  const value =
    config.get<string>(name)?.trim() ??
    config.get<string>('CRM_ENCRYPTION_KEY')?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
