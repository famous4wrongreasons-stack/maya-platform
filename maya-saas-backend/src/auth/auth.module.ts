import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AuthController } from './auth.controller';
import { AuthFlowSystemGateway } from './auth-flow-system.gateway';
import { AuthSessionRepository } from './auth-session.repository';
import { AuthSessionService } from './auth-session.service';
import { AuthSessionSystemGateway } from './auth-session-system.gateway';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PhoneAuthDeliveryService } from './phone-auth-delivery.service';
import { SocialAuthService } from './social-auth.service';
import { TenantAuthRepository } from './tenant-auth.repository';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    PrismaModule,
    UsersModule,
    TenantsModule,
    TenancyModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const configured = Number(
          configService.get<string>('JWT_ACCESS_TTL_SECONDS'),
        );
        const expiresIn =
          Number.isFinite(configured) && configured >= 300 && configured <= 3600
            ? configured
            : 900;

        return {
          secret: configService.get<string>('JWT_SECRET'),
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthFlowSystemGateway,
    AuthSessionRepository,
    AuthSessionService,
    AuthSessionSystemGateway,
    JwtStrategy,
    PhoneAuthDeliveryService,
    SocialAuthService,
    TenantAuthRepository,
  ],
  exports: [AuthService],
})
export class AuthModule {}
