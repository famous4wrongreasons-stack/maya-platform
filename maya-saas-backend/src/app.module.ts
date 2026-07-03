import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { BrandingModule } from './branding/branding.module';
import { CrmModule } from './crm/crm.module';
import { EncryptionModule } from './encryption/encryption.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { PrismaModule } from './prisma/prisma.module';
import { ServicesModule } from './services/services.module';
import { StaffModule } from './staff/staff.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    EncryptionModule,
    SubscriptionsModule,
    TenantsModule,
    UsersModule,
    AuthModule,
    BrandingModule,
    BranchesModule,
    CrmModule,
    ServicesModule,
    StaffModule,
    AppointmentsModule,
    AuditLogModule,
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
  ],
})
export class AppModule {}
