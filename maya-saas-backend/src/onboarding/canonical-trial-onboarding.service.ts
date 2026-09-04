import { Package5Wave2CanonicalCutoverService } from '../package5-wave2/package5-wave2-canonical-cutover.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';

import type { AuthClientMetadata } from '../auth/auth-client-metadata';
import { AuthService } from '../auth/auth.service';
import { normalizePhoneE164 } from '../common/phone.util';
import { CalendarSource } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { TrialActivationBootstrapService } from '../package5-wave2/trial-activation-bootstrap.service';
import { CreateTrialSignupDto } from './dto/create-trial-signup.dto';
import { TRIAL_PERIOD_DAYS } from './trial-activation.service';

/** Public/admin initiator of the existing atomic pre-tenant authority. */
@Injectable()
export class CanonicalTrialOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bootstrapper: TrialActivationBootstrapService,
    private readonly encryption: EncryptionService,
    private readonly tenants: TenantsService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly context: TenantContextService,
    private readonly canonical: Package5Wave2CanonicalCutoverService,
  ) {}

  async activate(dto: CreateTrialSignupDto) {
    if (!dto.trialActivationToken || dto.trialActivationToken.length < 32)
      throw new BadRequestException('Trial activation claim is required');
    this.tenants.assertHostNamesAllowed({ slug: dto.slug });
    // Billing/extra calendar setup remains under its existing canonical flow.
    if (
      dto.planId ||
      (dto.calendarSource && dto.calendarSource !== CalendarSource.EXTERNAL)
    )
      throw new BadRequestException(
        'Trial activation requires canonical external CRM setup; configure other capabilities after activation',
      );
    const activationTokenHash = createHash('sha256')
      .update(dto.trialActivationToken)
      .digest('hex');
    const activation = await this.prisma.trialActivation.findUnique({
      where: { activationTokenHash },
      include: { draft: { select: { id: true } } },
    });
    if (!activation || activation.expiresAt <= new Date())
      throw new UnauthorizedException(
        'Current trial activation claim required',
      );
    if (activation.draft)
      throw new ConflictException(
        'Draft-bound activation must use its immutable confirmation receipt',
      );
    const password =
      dto.password?.trim() || randomBytes(24).toString('base64url');
    const result = await this.bootstrapper.activate({
      activationTokenHash,
      tenant: {
        name: dto.name,
        slug: dto.slug,
        defaultTimezone: dto.branchTimezone || 'Europe/Moscow',
        defaultCurrency: 'RUB',
        defaultLocale: 'ru-RU',
        trialEndsAt: new Date(Date.now() + TRIAL_PERIOD_DAYS * 86400000),
      },
      owner: {
        email: dto.ownerEmail.trim().toLowerCase(),
        phone: normalizePhoneE164(dto.ownerPhone),
        encryptedName: dto.ownerName
          ? this.encryption.encrypt(dto.ownerName.trim())
          : null,
        passwordHash: await bcrypt.hash(password, 10),
      },
      branch: {
        name: dto.branchName || dto.name,
        address: dto.branchAddress,
        phone: dto.branchPhone,
        timezone: dto.branchTimezone,
      },
    });
    if (dto.industryPresetId)
      await this.context.runAsSystemTenant(result.tenantId, () =>
        this.canonical.execute(
          result.tenantId,
          { userId: result.ownerUserId },
          {
            operation: 'update_tenant_configuration',
            changes: { industryPresetId: dto.industryPresetId },
          },
          `trial:${activationTokenHash}:configuration`,
        ),
      );
    return result;
  }

  /** Call only after a verified activation/draft claim or exact owner-session check. */
  async ownerSession(
    tenantId: string,
    ownerUserId: string,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    return this.context.runAsSystemTenant(tenantId, async () => {
      const member = await this.prisma.membership.findUnique({
        where: { userId_tenantId: { userId: ownerUserId, tenantId } },
        include: { user: true },
      });
      if (
        !member ||
        member.status !== 'active' ||
        member.user.status !== 'active' ||
        !['tenant_owner', 'business_owner'].includes(member.role)
      )
        throw new UnauthorizedException(
          'Exact active canonical owner required',
        );
      const tenant = await this.tenants.getTenantByIdOrThrow(tenantId);
      return {
        ...(await this.auth.issueSession(member.user, metadata)),
        user: this.users.serializeUser(member.user),
        tenant: this.tenants.serializeTenant(tenant),
        temporary_password: null,
        booking_mode: 'preview',
        calendar_source: tenant.calendarSource,
        next_step: 'connect_crm',
        trial: {
          days: TRIAL_PERIOD_DAYS,
          ends_at: tenant.trialEndsAt,
          full_access: tenant.trialFullAccess,
        },
      };
    });
  }
}
