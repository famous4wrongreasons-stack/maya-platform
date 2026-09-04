import { TenantContextService } from '../tenancy/tenant-context.service';
import { ActionEngineKernel } from '../action-engine';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';

import { buildPhoneLoginEmail, normalizePhoneE164 } from '../common/phone.util';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { Package5Wave2CanonicalCutoverService } from '../package5-wave2/package5-wave2-canonical-cutover.service';
import { TrialActivationBootstrapService } from '../package5-wave2/trial-activation-bootstrap.service';
import type { Package5Wave2Command } from '../package5-wave2/package5-wave2.service';
import {
  AiConfirmationReceiptService,
  type AiConfirmationMaterial,
  type AiConfirmationChildIntent,
} from './ai-confirmation-receipt.service';
import type { AiOnboardingBlueprint } from './ai-onboarding.types';
import type { ConfirmAiOnboardingDraftDto } from './dto/ai-onboarding.dto';
import { TRIAL_PERIOD_DAYS } from './trial-activation.service';

type Stored = Awaited<
  ReturnType<AiConfirmationReceiptService['readWithClaims']>
>;
type ChildInput = {
  externalStaffId?: string;
  role?: 'administrator' | 'staff';
  login?: Extract<
    Package5Wave2Command,
    { operation: 'configure_staff_access' }
  >['login'];
  changes?: Record<string, unknown>;
};

/** Receipt orchestration only; A17 is a separate, real canonical prerequisite. */
@Injectable()
export class AiConfirmationCoordinatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly receipts: AiConfirmationReceiptService,
    private readonly bootstrapper: TrialActivationBootstrapService,
    private readonly canonical: Package5Wave2CanonicalCutoverService,
    private readonly kernel: ActionEngineKernel,
    private readonly context: TenantContextService,
  ) {}

  async confirm(
    draftId: string,
    dto: ConfirmAiOnboardingDraftDto,
    blueprint: AiOnboardingBlueprint,
    slug: string,
  ) {
    if (!dto.trialActivationToken)
      throw new BadRequestException('Trial activation claim required');
    if (
      !blueprint.crmImported ||
      !blueprint.crmProvider ||
      !['yclients', 'altegio'].includes(blueprint.crmProvider) ||
      !blueprint.crmCompanyId
    )
      throw new BadRequestException('A real CRM preview is required');
    const claims = {
      draftId,
      draftToken: dto.draftToken,
      activationToken: dto.trialActivationToken,
    };
    const material = await this.material(draftId, dto, blueprint, slug);
    const stored = await this.receipts.claim({
      ...claims,
      expectedDraftRevision: dto.expectedDraftRevision,
      blueprint: this.json(blueprint),
      material,
    });
    await this.receipts.bootstrap(claims, this.bootstrapper);
    return this.resume(
      draftId,
      stored.receipt.expectedTenantId,
      stored.receipt.ownerUserId,
    );
  }

  async resume(draftId: string, tenantId: string, ownerUserId: string) {
    const stored = await this.receipts.readWithOwner(
      draftId,
      tenantId,
      ownerUserId,
    );
    return this.context.runAsSystemTenant(tenantId, () => this.run(stored));
  }

  private async run(stored: Stored) {
    const { expectedTenantId: tenantId, ownerUserId } = stored.receipt;
    const draftId = stored.draft.id;
    const restored = await this.receipts.childOutcomes(stored.receipt);
    const successful = new Set(
      restored
        .filter((x) => x.execution?.state === 'SUCCEEDED')
        .map((x) => x.child.key),
    );
    for (const { child, execution } of restored) {
      if (successful.has(child.key)) continue;
      if (execution?.state === 'UNKNOWN')
        return this.progress(stored, 'pending_reconciliation', successful);
      if (child.dependsOn.some((key) => !successful.has(key)))
        return this.progress(stored, 'pending_children', successful);
      const input = stored.material.children.find((x) => x.key === child.key)!
        .input as ChildInput;
      let command:
        | Omit<
            Extract<
              Package5Wave2Command,
              {
                operation:
                  'update_tenant_branding' | 'update_tenant_configuration';
              }
            >,
            'sourceIntentRef'
          >
        | Omit<
            Extract<Package5Wave2Command, { operation: 'claim_team_owner' }>,
            'sourceIntentRef'
          >
        | Omit<
            Extract<
              Package5Wave2Command,
              { operation: 'configure_staff_access' }
            >,
            'sourceIntentRef'
          >;
      if (
        child.actionClass === 'update_tenant_branding' ||
        child.actionClass === 'update_tenant_configuration'
      ) {
        command = { operation: child.actionClass, changes: input.changes! };
      } else {
        const prerequisite = await this.crmPrerequisite(stored);
        if (!prerequisite)
          return this.progress(stored, 'waiting_for_crm', successful);
        const link = await this.prisma.staffProviderLink.findUnique({
          where: {
            tenantId_provider_externalId: {
              tenantId,
              provider: prerequisite.provider,
              externalId: input.externalStaffId!,
            },
          },
        });
        if (!link || link.unlinkedAt)
          throw new ConflictException(
            'Approved CRM staff is missing; explicit owner review required',
          );
        const access = await this.prisma.crmStaffAccess.findUnique({
          where: { staffId_tenantId: { staffId: link.staffId, tenantId } },
        });
        if (
          !access ||
          access.externalStaffId !== input.externalStaffId ||
          access.status === 'disabled'
        )
          throw new ConflictException(
            'Exact canonical imported staff access required',
          );
        if (execution && execution.targetRef !== access.id)
          throw new ConflictException(
            'Canonical prerequisite target changed; frozen child cannot be rebound',
          );
        if (child.actionClass === 'claim_crm_team_owner') {
          command = { operation: 'claim_team_owner', accessId: access.id };
        } else if (
          child.actionClass === 'configure_crm_staff_access' &&
          input.role
        ) {
          if (
            input.login &&
            access.userId &&
            access.userId !== input.login.userId
          )
            throw new ConflictException(
              'Imported staff already has another login; explicit configuration required',
            );
          command = {
            operation: 'configure_staff_access',
            accessId: access.id,
            role: input.role,
            ...(input.login ? { login: input.login } : {}),
          };
        } else throw new ConflictException('Unsupported immutable child');
      }
      // The existing child planner/executor owns authority, target locks and retries.
      await this.canonical.execute(
        tenantId,
        { userId: ownerUserId },
        command,
        child.sourceIntentRef,
      );
      const completed = (
        await this.receipts.childOutcomes(stored.receipt)
      ).find((x) => x.child.key === child.key);
      if (completed?.execution?.state !== 'SUCCEEDED')
        return this.progress(stored, 'pending_children', successful);
      successful.add(child.key);
    }
    if (!(await this.crmPrerequisite(stored)))
      return this.progress(stored, 'waiting_for_crm', successful);
    await this.receipts.finish(draftId, tenantId, ownerUserId);
    return this.progress(stored, 'completed', successful);
  }

  private async crmPrerequisite(stored: Stored) {
    const blueprint = stored.draft
      .blueprintJson as unknown as AiOnboardingBlueprint;
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId: stored.receipt.expectedTenantId },
    });
    if (!integration) return null;
    const settings = integration.settingsJson as Record<string, unknown> | null;
    if (
      integration.provider !== blueprint.crmProvider ||
      !['yclients', 'altegio'].includes(integration.provider) ||
      (typeof settings?.companyId === 'string' ||
      typeof settings?.companyId === 'number'
        ? String(settings.companyId)
        : '') !== String(blueprint.crmCompanyId)
    )
      throw new ConflictException(
        'CRM provider/company differs from the approved preview',
      );
    if (
      integration.status !== 'active' ||
      !integration.verifiedAt ||
      typeof settings?.acceptedImportSnapshotHash !== 'string'
    )
      return null;
    const imported = await this.prisma.actionExecution.findFirst({
      where: {
        tenantId: stored.receipt.expectedTenantId,
        targetRef: `crm:${stored.receipt.expectedTenantId}`,
        actionClass: 'confirm_crm_import',
        capability: 'package5.wave3.confirm-crm-import.execute.v1',
        state: 'SUCCEEDED',
      },
      orderBy: { finalizedAt: 'desc' },
    });
    if (!imported) return null;
    const payload = await this.kernel.readTrustedNormalizedInput(
      stored.receipt.expectedTenantId,
      imported.id,
    );
    if (payload.providerSnapshotHash !== settings.acceptedImportSnapshotHash)
      return null;
    return integration;
  }

  private progress(stored: Stored, status: string, successful: Set<string>) {
    return {
      tenantId: stored.receipt.expectedTenantId,
      ownerUserId: stored.receipt.ownerUserId,
      ai_onboarding: {
        draft_id: stored.draft.id,
        confirmation_id: stored.receipt.confirmationId,
        draft_revision: stored.receipt.draftRevision,
        status,
        completed_children: successful.size,
        total_children: stored.receipt.children.length,
        next_step:
          status === 'waiting_for_crm'
            ? 'connect_crm'
            : status === 'completed'
              ? 'open_app'
              : 'resume_onboarding',
      },
    };
  }

  private async material(
    draftId: string,
    dto: ConfirmAiOnboardingDraftDto,
    blueprint: AiOnboardingBlueprint,
    slug: string,
  ): Promise<AiConfirmationMaterial> {
    const tokenHash = createHash('sha256')
      .update(dto.trialActivationToken!)
      .digest('hex');
    const ids = this.receipts.reservedIds(tokenHash);
    const ownerEmail = dto.ownerEmail.trim().toLowerCase();
    const ownerPhone = normalizePhoneE164(dto.ownerPhone);
    const ownerExternalStaffId = dto.ownerExternalStaffId?.trim() || null;
    const children: AiConfirmationChildIntent[] = [
      {
        key: 'branding',
        actionClass: 'update_tenant_branding',
        targetRef: ids.tenantId,
        dependsOn: [],
        input: this.json({
          changes: {
            appName: blueprint.businessName!,
            ...(blueprint.crmLogoUrl ? { logoUrl: blueprint.crmLogoUrl } : {}),
          },
        }),
      },
      {
        key: 'configuration',
        actionClass: 'update_tenant_configuration',
        targetRef: ids.tenantId,
        dependsOn: ['branding'],
        input: this.json({
          changes: {
            industryPresetId: blueprint.industryPresetId,
            calendarSource: 'external',
          },
        }),
      },
    ];
    if (ownerExternalStaffId)
      children.push({
        key: 'owner',
        actionClass: 'claim_crm_team_owner',
        targetRef: null,
        dependsOn: ['configuration'],
        input: { externalStaffId: ownerExternalStaffId },
      });
    const seenIds = new Set(ownerExternalStaffId ? [ownerExternalStaffId] : []);
    const seenEmails = new Set([ownerEmail]);
    const seenPhones = new Set(ownerPhone ? [ownerPhone] : []);
    const normalizedMembers: Prisma.InputJsonValue[] = [];
    for (const [index, member] of (dto.teamMembers ?? []).entries()) {
      const externalStaffId = member.externalStaffId.trim();
      const email = member.email?.trim().toLowerCase() || null;
      const phone = member.phone ? normalizePhoneE164(member.phone) : null;
      if (
        seenIds.has(externalStaffId) ||
        (email && seenEmails.has(email)) ||
        (phone && seenPhones.has(phone))
      )
        throw new BadRequestException('Duplicate owner/team identity');
      seenIds.add(externalStaffId);
      if (email) seenEmails.add(email);
      if (phone) seenPhones.add(phone);
      const key = `staff.${index}`;
      const loginEmail =
        email || (phone ? buildPhoneLoginEmail(slug, phone) : null);
      const userId = `p5u_${createHash('sha256').update(`ai-confirm-v1:${draftId}:${dto.expectedDraftRevision}:${key}`).digest('hex').slice(0, 28)}`;
      const login = loginEmail
        ? {
            userId,
            email: loginEmail,
            phone,
            branchId: ids.branchId,
            passwordHash: await bcrypt.hash(
              randomBytes(24).toString('base64url'),
              10,
            ),
            credentialIntentHash: this.receipts.fingerprint({
              draftId,
              revision: dto.expectedDraftRevision,
              key,
              loginEmail,
              phone,
            }),
          }
        : undefined;
      const input = {
        externalStaffId,
        role: member.role,
        ...(login ? { login } : {}),
      };
      normalizedMembers.push(
        this.json({
          externalStaffId,
          email,
          phone,
          displayName: member.displayName.trim(),
          title: member.title?.trim() || null,
          role: member.role,
        }),
      );
      children.push({
        key,
        actionClass: 'configure_crm_staff_access',
        targetRef: null,
        dependsOn: [ownerExternalStaffId ? 'owner' : 'configuration'],
        input: this.json(input),
      });
    }
    return {
      approvedInput: this.json({
        ownerEmail,
        ownerPhone,
        ownerName: dto.ownerName.trim(),
        ownerExternalStaffId,
        credentialIntentHash: this.receipts.fingerprint(
          dto.password?.trim() || 'server-generated-recovery-credential',
        ),
        members: normalizedMembers,
        blueprint,
      }),
      bootstrap: {
        tenant: {
          name: blueprint.businessName!,
          slug,
          defaultCurrency: 'RUB',
          defaultLocale: 'ru-RU',
          defaultTimezone: blueprint.crmTimezone || 'Europe/Moscow',
          trialEndsAt: new Date(
            Date.now() + TRIAL_PERIOD_DAYS * 86400000,
          ).toISOString(),
        },
        owner: {
          email: ownerEmail,
          phone: ownerPhone,
          encryptedName: this.encryption.encrypt(dto.ownerName.trim()),
          passwordHash: await bcrypt.hash(
            dto.password?.trim() || randomBytes(24).toString('base64url'),
            10,
          ),
        },
        branch: {
          name: blueprint.businessName!,
          address: blueprint.crmAddress || null,
          timezone: blueprint.crmTimezone || null,
        },
      },
      children,
    };
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
