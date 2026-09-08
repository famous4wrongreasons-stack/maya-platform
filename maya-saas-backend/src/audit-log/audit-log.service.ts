import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { asJson } from '../common/json.util';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/**
 * Единственная точка записи аудита.
 *
 * Область действия ЗАЯВЛЯЕТСЯ вызовом, а не выводится из того, передали ли
 * арендатора: у каждой области свой метод, и подменить одну другой нельзя —
 * `log` требует `tenantId: string`, `logPlatformAction` его не принимает
 * вообще. Инвариант «tenant ⟺ есть арендатор, platform ⟺ нет» держит CHECK в
 * базе (`AuditLog_scope_tenant_check`), поэтому даже прямая запись мимо этого
 * сервиса не создаст третьего состояния.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Действие внутри арендатора. Принадлежность сверяется с контекстом. */
  async log(params: {
    tenantId: string;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }, tx: Prisma.TransactionClient = this.prisma) {
    const tenantId = this.tenantContext.assertTenantId(params.tenantId);

    return tx.auditLog.create({
      data: {
        scope: 'tenant',
        tenantId,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadataJson: params.metadata ? asJson(params.metadata) : undefined,
      },
    });
  }

  /**
   * Действие уровня платформы: вход владельца платформы, работа с арендаторами
   * снаружи. Арендатора у такого действия нет — и выдумывать его нельзя, иначе
   * платформенная запись окажется в истории чужого салона.
   */
  async logPlatformAction(params: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        scope: 'platform',
        tenantId: null,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadataJson: params.metadata ? asJson(params.metadata) : undefined,
      },
    });
  }

  /**
   * Записать, не мешая основной операции.
   *
   * 🔴 Аудит не имеет права ронять успешный запрос. В ai-core.service.ts:1338
   * исключение из аудита в блоке catch подменяло исходную ошибку: наружу уходил
   * другой класс сбоя, а настоящая причина деградации терялась. Там, где
   * действие уже совершилось и откатывать его поздно, запись обязана быть
   * попыткой, а не условием.
   */
  async tryLog(params: {
    tenantId: string;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.log(params);
    } catch (error) {
      this.logger.warn(
        `audit write failed action=${params.action} entity=${params.entityType}: ${
          error instanceof Error ? error.name : 'unknown'
        }`,
      );
    }
  }

  /** Платформенный близнец `tryLog`. */
  async tryLogPlatformAction(params: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.logPlatformAction(params);
    } catch (error) {
      this.logger.warn(
        `platform audit write failed action=${params.action}: ${
          error instanceof Error ? error.name : 'unknown'
        }`,
      );
    }
  }
}
