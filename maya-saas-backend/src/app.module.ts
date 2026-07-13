import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { BranchesModule } from './branches/branches.module';
import { BrandingModule } from './branding/branding.module';
import { CrmModule } from './crm/crm.module';
import { EncryptionModule } from './encryption/encryption.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { FeatureGuard } from './entitlements/feature.guard';
import { InternalCalendarModule } from './internal-calendar/internal-calendar.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { SubscriptionAccessGuard } from './guards/subscription-access.guard';
import { PrismaModule } from './prisma/prisma.module';
import { ServicesModule } from './services/services.module';
import { StaffModule } from './staff/staff.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { TenantResolutionMiddleware } from './tenancy/tenant-resolution.middleware';
import { validateRuntimeConfig } from './config/runtime-config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: validateRuntimeConfig,
    }),
    PrismaModule,
    TenancyModule,
    EntitlementsModule,
    EncryptionModule,
    SubscriptionsModule,
    TenantsModule,
    UsersModule,
    AuthModule,
    BillingModule,
    BrandingModule,
    BranchesModule,
    CrmModule,
    InternalCalendarModule,
    ServicesModule,
    StaffModule,
    AppointmentsModule,
    AuditLogModule,
    OnboardingModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantAccessGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SubscriptionAccessGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FeatureGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantResolutionMiddleware).forRoutes('*path');
  }
}
