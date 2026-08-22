import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { TenantStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** Арендаторы, которым мост вправе что-то принести. */
const OPEN_TENANT_STATUSES: TenantStatus[] = ['trial', 'active', 'past_due'];

export interface BridgeSourceRef {
  /** Провайдер CRM, от имени которого говорит источник. */
  provider?: string | null;
  /** Идентификатор компании У ПРОВАЙДЕРА. Устойчив, живёт в интеграции. */
  externalCompanyId?: string | number | null;
  /** Слаг арендатора. СОВМЕСТИМОСТЬ, а не источник истины. */
  tenantSlug?: string | null;
}

export interface BridgeTenantResolution {
  tenantId: string;
  slug: string;
  /** Чем разрешили. Нужно, чтобы видеть, кто ещё сидит на совместимости. */
  resolvedBy: 'integration' | 'slug_compatibility';
}

export interface BoundBridgeIntegrationSource {
  provider: string;
  externalCompanyId: string;
}

/**
 * Разрешение «аутентифицированный источник → арендатор» для мостов приёма.
 *
 * 🔴 Зачем понадобилось. Мост старого бота слал `tenant_slug`, зашитый в его
 * окружении. Слаг разошёлся с боевым (`muzhskaya-estetika` против
 * `muzhskaya-estetika-3`), и КАЖДЫЙ вызов моста получал 403: за неделю 37
 * отказов, а в Maya OS не попало ни одной карточки о записи. Мастер видел
 * уведомление в Telegram, система — ничего.
 *
 * 🔴 Почему не «поменять слаг на правильный». Это заменило бы одну зашитую
 * строку другой, и следующее переименование арендатора сломало бы приём снова,
 * так же молча. Слаг — это ИМЯ, которое владелец вправе менять; идентичность
 * арендатора им быть не может.
 *
 * Порядок разрешения:
 *
 *   1. `(провайдер, идентификатор компании)` → `CrmIntegration` → арендатор.
 *      Это устойчивое отображение: оно живёт в данных, его владелец не
 *      переименовывает, и оно уже используется границей CRM.
 *   2. Слаг — только совместимость для источников, которые ещё не научились
 *      присылать интеграцию. Использование логируется.
 *
 * Отказ — явный: молчаливой подстановки «единственного арендатора» здесь нет.
 * С двумя арендаторами в базе такая догадка однажды доставит чужие данные не
 * тому салону.
 */
@Injectable()
export class BridgeSourceService {
  private readonly logger = new Logger(BridgeSourceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Сравнение секрета моста за постоянное время.
   *
   * 🔴 Раньше inbox сравнивал `!==`, а recovery — `timingSafeEqual`, хотя
   * секрет один и тот же. Один способ на оба входа, чтобы разница не решала,
   * какой из них проще подобрать.
   *
   * Сравниваются свёртки: `timingSafeEqual` требует равной длины, и на голых
   * строках разная длина сама по себе стала бы утечкой.
   */
  assertBridgeSecret(
    provided: string | undefined,
    envKey: string,
    codes: { disabled: string; unauthorized: string },
  ): void {
    const expected = String(process.env[envKey] || '').trim();
    if (!expected || expected.length < 24) {
      throw new UnauthorizedException({
        message: 'Bridge is not configured.',
        error: { code: codes.disabled },
      });
    }

    const digest = (value: string) =>
      createHash('sha256').update(value, 'utf8').digest();

    if (
      !timingSafeEqual(digest(String(provided || '').trim()), digest(expected))
    ) {
      throw new UnauthorizedException({
        message: 'Invalid bridge token.',
        error: { code: codes.unauthorized },
      });
    }
  }

  /**
   * Bind a mutation-capable bridge credential to one configured integration.
   *
   * The request body is only an assertion. It cannot select another tenant:
   * the trusted provider/company identity comes from the server environment
   * that owns the bridge credential.
   */
  assertBridgeIntegrationBinding(
    ref: Pick<BridgeSourceRef, 'provider' | 'externalCompanyId'>,
    envKeys: { provider: string; externalCompanyId: string },
    codes: { disabled: string; mismatch: string },
  ): BoundBridgeIntegrationSource {
    const provider = String(process.env[envKeys.provider] || '')
      .trim()
      .toLowerCase();
    const externalCompanyId = String(
      process.env[envKeys.externalCompanyId] || '',
    ).trim();

    if (!provider || !externalCompanyId) {
      throw new UnauthorizedException({
        message: 'Bridge integration binding is not configured.',
        error: { code: codes.disabled },
      });
    }

    const assertedProvider = String(ref.provider ?? '')
      .trim()
      .toLowerCase();
    const assertedCompanyId = String(ref.externalCompanyId ?? '').trim();
    if (
      assertedProvider !== provider ||
      assertedCompanyId !== externalCompanyId
    ) {
      throw new ForbiddenException({
        message: 'Bridge source does not match its integration binding.',
        error: { code: codes.mismatch },
      });
    }

    return { provider, externalCompanyId };
  }

  /** Арендатор для аутентифицированного источника. Отказ — явный. */
  async resolveTenant(
    ref: BridgeSourceRef,
    notFoundCode: string,
  ): Promise<BridgeTenantResolution> {
    const byIntegration = await this.resolveByIntegration(ref);
    if (byIntegration) return byIntegration;

    const bySlug = await this.resolveBySlug(ref.tenantSlug);
    if (bySlug) {
      this.logger.warn(
        `bridge tenant resolved by slug compatibility: ${bySlug.slug}. ` +
          'Source should send provider + external company id.',
      );
      return bySlug;
    }

    throw new ForbiddenException({
      message: 'Tenant not found for bridge ingest.',
      error: { code: notFoundCode },
    });
  }

  /**
   * Strict resolver for mutation-capable bridges. Unlike ingest compatibility,
   * a write initiator may never select a tenant by a mutable slug.
   */
  async resolveTenantByIntegration(
    ref: Pick<BridgeSourceRef, 'provider' | 'externalCompanyId'>,
    notFoundCode: string,
  ): Promise<BridgeTenantResolution> {
    const resolved = await this.resolveByIntegration(ref);
    if (resolved) return resolved;

    throw new ForbiddenException({
      message: 'Tenant not found for bridge integration.',
      error: { code: notFoundCode },
    });
  }

  private async resolveByIntegration(
    ref: BridgeSourceRef,
  ): Promise<BridgeTenantResolution | null> {
    const provider = String(ref.provider ?? '')
      .trim()
      .toLowerCase();
    const companyId = String(ref.externalCompanyId ?? '').trim();
    if (!provider || !companyId) return null;

    // `settingsJson` — Json, поэтому сравнение идёт на стороне приложения:
    // интеграций у арендатора одна, строк здесь единицы, а не тысячи.
    const integrations = await this.prisma.crmIntegration.findMany({
      where: { provider, status: 'active' },
      select: {
        tenantId: true,
        settingsJson: true,
        tenant: { select: { slug: true, status: true } },
      },
    });

    const matches = integrations.filter((integration) => {
      const settings = (integration.settingsJson ?? {}) as {
        companyId?: string | number | null;
      };
      const raw = settings.companyId;
      // Число или строка — иначе это не идентификатор компании, а мусор.
      if (typeof raw !== 'string' && typeof raw !== 'number') return false;
      return String(raw).trim() === companyId;
    });

    // Две интеграции на одну компанию провайдера — это не «возьмём первую»:
    // это неоднозначность, при которой доставить можно не тому салону.
    if (matches.length !== 1) {
      if (matches.length > 1) {
        this.logger.error(
          `bridge company ${provider}:${companyId} maps to ${matches.length} tenants`,
        );
      }
      return null;
    }

    const [match] = matches;
    if (!OPEN_TENANT_STATUSES.includes(match.tenant.status)) return null;

    return {
      tenantId: match.tenantId,
      slug: match.tenant.slug,
      resolvedBy: 'integration',
    };
  }

  private async resolveBySlug(
    slug: string | null | undefined,
  ): Promise<BridgeTenantResolution | null> {
    const normalized = String(slug ?? '')
      .trim()
      .toLowerCase();
    if (!normalized) return null;

    const tenant = await this.prisma.tenant.findFirst({
      where: { slug: normalized, status: { in: OPEN_TENANT_STATUSES } },
      select: { id: true, slug: true },
    });
    if (!tenant) return null;

    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      resolvedBy: 'slug_compatibility',
    };
  }
}
