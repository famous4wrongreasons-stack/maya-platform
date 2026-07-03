import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UserRole, UserStatus } from '../common/domain.enums';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
  ) {}

  async login(dto: LoginDto) {
    const user = dto.tenantSlug
      ? await this.loginTenantUser(dto)
      : await this.loginPlatformOwner(dto);

    if (user.status !== 'active') {
      throw new ForbiddenException('User is not active');
    }

    return {
      access_token: await this.signToken(user),
      user: this.usersService.serializeUser(user),
    };
  }

  async register(dto: RegisterDto) {
    const tenant = await this.tenantsService.getTenantBySlugOrThrow(
      dto.tenantSlug,
    );

    if (!tenant.allowSelfRegistration) {
      throw new ForbiddenException(
        'Self registration is disabled for this tenant',
      );
    }

    if (tenant.status !== 'active' && tenant.status !== 'trial') {
      throw new ForbiddenException('Tenant is not accepting registrations');
    }

    if (dto.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        dto.branchId,
        tenant.id,
      );
    }

    await this.usersService.ensureEmailIsAvailable(tenant.id, dto.email);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.createUser({
      tenantId: tenant.id,
      branchId: dto.branchId ?? null,
      email: dto.email,
      phone: dto.phone ?? null,
      passwordHash,
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
    });

    return {
      access_token: await this.signToken(user),
      user: this.usersService.serializeUser(user),
    };
  }

  private async loginTenantUser(dto: LoginDto) {
    const tenant = await this.tenantsService.getTenantBySlugOrThrow(
      dto.tenantSlug!,
    );
    const user = await this.usersService.findTenantUserByEmail(
      tenant.id,
      dto.email,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  private async loginPlatformOwner(dto: LoginDto) {
    const user = await this.usersService.findPlatformOwnerByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  private async signToken(user: {
    id: string;
    tenantId: string | null;
    role: string;
  }) {
    return this.jwtService.signAsync({
      user_id: user.id,
      tenant_id: user.tenantId,
      role: user.role,
    });
  }
}
