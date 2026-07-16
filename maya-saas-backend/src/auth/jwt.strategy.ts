import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { UsersService } from '../users/users.service';
import { MembershipsService } from '../tenancy/memberships.service';
import { AuthSessionService } from './auth-session.service';

interface JwtPayload {
  user_id: string;
  tenant_id: string | null;
  role: UserRole;
  session_id: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly membershipsService: MembershipsService,
    private readonly sessionService: AuthSessionService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      throw new InternalServerErrorException('JWT_SECRET is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.session_id) {
      throw new UnauthorizedException('Session is required');
    }

    await this.sessionService.assertAccessSession(
      payload.session_id,
      payload.user_id,
      payload.tenant_id,
    );
    const user = await this.usersService.getUserOrThrow(payload.user_id);

    if (user.status !== 'active') {
      throw new UnauthorizedException('User is not active');
    }

    if (user.role === 'platform_owner' && !payload.tenant_id) {
      return {
        userId: user.id,
        sessionId: payload.session_id,
        tenantId: null,
        role: UserRole.PLATFORM_OWNER,
        email: user.email,
        branchId: null,
        membershipId: null,
        membershipStatus: null,
      };
    }

    const tenantId = payload.tenant_id ?? user.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant membership is required');
    }

    const membership = await this.membershipsService.getActiveMembership(
      user.id,
      tenantId,
    );

    return {
      userId: user.id,
      sessionId: payload.session_id,
      tenantId: membership.tenantId,
      role: membership.role as UserRole,
      email: user.email,
      branchId: user.branchId,
      membershipId: membership.id,
      membershipStatus: membership.status,
    };
  }
}
