import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

export interface TrialActivationBootstrapCommand {
  activationTokenHash: string;
  tenant: {
    name: string;
    slug: string;
    defaultTimezone: string;
    defaultLocale: string;
    defaultCurrency: string;
    trialEndsAt: Date;
  };
  owner: {
    email: string;
    phone?: string | null;
    encryptedName?: string | null;
    passwordHash: string;
  };
  branch: {
    name: string;
    address?: string | null;
    phone?: string | null;
    timezone?: string | null;
  };
}

export interface TrialActivationBootstrapResult {
  tenantId: string;
  ownerUserId: string;
  branchId: string;
  activationId: string;
  resumed: boolean;
}

/**
 * D3-A protocol boundary. It intentionally does not create ActionExecution:
 * before the tenant exists there is no tenant-qualified action authority.
 */
@Injectable()
export class TrialActivationBootstrapService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async activate(
    command: TrialActivationBootstrapCommand,
  ): Promise<TrialActivationBootstrapResult> {
    this.validate(command);
    return this.serializable(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`package5:trial:${command.activationTokenHash}`}, 0))`,
      );
      const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "TrialActivation" WHERE "activationTokenHash" = ${command.activationTokenHash} FOR UPDATE`,
      );
      if (rows.length !== 1) {
        throw new NotFoundException('Trial activation claim was not found');
      }
      const activation = await tx.trialActivation.findUniqueOrThrow({
        where: { activationTokenHash: command.activationTokenHash },
      });
      const boundDraft = await tx.aiOnboardingDraft.findUnique({
        where: { trialActivationId: activation.id },
        select: { confirmationReceiptJson: true },
      });
      if (boundDraft && !boundDraft.confirmationReceiptJson)
        throw new ConflictException(
          'Draft activation requires a verified immutable confirmation receipt',
        );
      if (activation.status === 'completed' && activation.tenantId) {
        const ids = this.ids(command.activationTokenHash);
        if (activation.tenantId !== ids.tenantId) {
          throw new ConflictException(
            'Completed activation does not match the canonical tenant',
          );
        }
        return { ...ids, activationId: activation.id, resumed: true };
      }
      if (activation.status !== 'pending') {
        throw new ConflictException('Trial activation is already claimed');
      }
      if (activation.expiresAt <= this.now()) {
        throw new ConflictException('Trial activation expired');
      }

      const ids = this.ids(command.activationTokenHash);
      const slug = command.tenant.slug.trim().toLowerCase();
      const email = command.owner.email.trim().toLowerCase();
      const branchTimezone = command.branch.timezone?.trim() || null;
      await tx.tenant.create({
        data: {
          id: ids.tenantId,
          name: command.tenant.name.trim(),
          slug,
          subdomain: slug,
          status: 'trial',
          calendarSource: 'external',
          defaultTimezone: command.tenant.defaultTimezone,
          defaultLocale: command.tenant.defaultLocale,
          defaultCurrency: command.tenant.defaultCurrency,
          trialEndsAt: command.tenant.trialEndsAt,
          trialFullAccess: true,
        },
      });
      await tx.brandingSettings.create({
        data: {
          tenantId: ids.tenantId,
          appName: command.tenant.name.trim(),
          themeJson: {},
        },
      });
      await tx.branch.create({
        data: {
          id: ids.branchId,
          tenantId: ids.tenantId,
          name: command.branch.name.trim(),
          address: command.branch.address?.trim() || null,
          phone: command.branch.phone?.trim() || null,
          timezone: branchTimezone,
        },
      });
      await tx.user.create({
        data: {
          id: ids.ownerUserId,
          tenantId: ids.tenantId,
          branchId: ids.branchId,
          email,
          phone: command.owner.phone?.trim() || null,
          encryptedName: command.owner.encryptedName ?? null,
          passwordHash: command.owner.passwordHash,
          role: 'tenant_owner',
          status: 'active',
          memberships: {
            create: {
              tenantId: ids.tenantId,
              branchId: ids.branchId,
              role: 'tenant_owner',
              status: 'active',
              joinedAt: this.now(),
            },
          },
        },
      });
      await tx.trialActivation.update({
        where: { id: activation.id },
        data: {
          status: 'completed',
          tenantId: ids.tenantId,
          completedAt: this.now(),
        },
      });
      return { ...ids, activationId: activation.id, resumed: false };
    });
  }

  private ids(tokenHash: string) {
    const digest = createHash('sha256')
      .update(`package5.wave2.trial-bootstrap:${tokenHash}`)
      .digest('hex');
    return {
      tenantId: `p5t_${digest.slice(0, 28)}`,
      ownerUserId: `p5o_${digest.slice(0, 28)}`,
      branchId: `p5b_${digest.slice(0, 28)}`,
    };
  }

  private validate(command: TrialActivationBootstrapCommand) {
    if (!/^[0-9a-f]{64}$/.test(command.activationTokenHash)) {
      throw new BadRequestException('Activation token hash is invalid');
    }
    if (
      !command.tenant.name.trim() ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
        command.tenant.slug.trim().toLowerCase(),
      ) ||
      !/^[A-Z]{3}$/.test(command.tenant.defaultCurrency) ||
      !command.owner.email.trim() ||
      !command.owner.passwordHash ||
      !command.branch.name.trim()
    ) {
      throw new BadRequestException('Trial bootstrap facts are incomplete');
    }
  }

  private async serializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const code =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : '';
        const message = error instanceof Error ? error.message : '';
        if (
          (code === 'P2034' ||
            /40001|serializ|write conflict/i.test(message)) &&
          attempt < 3
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Trial bootstrap could not serialize');
  }
}
