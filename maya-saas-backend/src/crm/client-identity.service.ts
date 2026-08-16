import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';

import { phoneMatchKey } from '../common/phone.util';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/**
 * Теневая регистрация личности клиента на границе нормализации CRM.
 *
 * 🔴 До этого у Maya не было собственной идентичности клиента вовсе: внешний
 * `external_client_id` адаптер вычислял и ВЫБРАСЫВАЛ — пять вхождений в коде,
 * ни одного потребителя, ни одного поля в схеме. Единственным ключом
 * сопоставления был телефон, поэтому смена номера рвала историю атрибуции,
 * дубли карточек в CRM были неразрешимы, а смена CRM обнуляла связь с прошлым.
 *
 * ТЕНЕВАЯ — значит ни один существующий потребитель на неё не переключён.
 * Поиск клиента, лояльность, «Мои записи» и атрибуция продолжают работать по
 * телефону ровно как раньше. Здесь только копится связь, на которую переведут
 * потребителей отдельным следующим шагом.
 *
 * Поэтому запись строго побочная: любой её сбой гасится и не может испортить
 * ответ, ради которого пользователь пришёл.
 */
@Injectable()
export class ClientIdentityService {
  private readonly logger = new Logger(ClientIdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Зарегистрировать карточку внешней CRM. Идемпотентно.
   *
   * Повторный вызов с той же тройкой «арендатор + провайдер + внешний id»
   * возвращает ту же личность и только обновляет отметку свежести.
   */
  async registerCrmClient(params: {
    tenantId: string;
    provider: string;
    externalId: string;
    phone?: string | null;
    userId?: string | null;
  }): Promise<{ clientId: string } | null> {
    const tenantId = this.tenantContext.assertTenantId(params.tenantId);
    const provider = params.provider.trim().toLowerCase();
    const externalId = params.externalId.trim();

    if (!provider || !externalId) {
      return null;
    }

    const phoneHash = this.hashPhone(params.phone);

    const existing = await this.prisma.crmClientLink.findUnique({
      where: {
        tenantId_provider_externalId: { tenantId, provider, externalId },
      },
      select: { clientId: true, unlinkedAt: true },
    });

    if (existing) {
      // Карточку увидели живой: обновляем свежесть и снимаем отметку об
      // исчезновении, если она была. Переподключение той же CRM обязано
      // возвращать ТУ ЖЕ личность, а не заводить новую.
      await this.prisma.crmClientLink.update({
        where: {
          tenantId_provider_externalId: { tenantId, provider, externalId },
        },
        data: { syncedAt: new Date(), unlinkedAt: null },
      });

      if (phoneHash) {
        // Смена номера не создаёт новую личность — в этом весь смысл якоря.
        await this.prisma.client.updateMany({
          where: { id: existing.clientId, tenantId },
          data: { phoneHash },
        });
      }

      return { clientId: existing.clientId };
    }

    return this.createIdentityForCard({
      tenantId,
      provider,
      externalId,
      phoneHash,
      userId: params.userId ?? null,
    });
  }

  /**
   * Новая карточка — новая личность.
   *
   * 🔴 Совпадение `phoneHash` НЕ приклеивает карточку к существующему клиенту и
   * тем более не сливает клиентов. Один номер на семью — обычное дело, и
   * автоматическое объединение по нему склеило бы разных людей необратимо.
   * Слияние дублей остаётся отдельной осознанной операцией.
   */
  private async createIdentityForCard(input: {
    tenantId: string;
    provider: string;
    externalId: string;
    phoneHash: string | null;
    userId: string | null;
  }): Promise<{ clientId: string } | null> {
    try {
      const client = await this.prisma.client.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          phoneHash: input.phoneHash,
          crmLinks: {
            // tenantId у связи задаёт САМА связь с клиентом: внешний ключ
            // составной, (clientId, tenantId) → Client(id, tenantId), поэтому
            // задать арендатора отдельно нельзя — и не нужно.
            create: {
              provider: input.provider,
              externalId: input.externalId,
            },
          },
        },
        select: { id: true },
      });

      return { clientId: client.id };
    } catch (error) {
      // Гонка: две параллельные регистрации одной карточки. Уникальный ключ
      // не даёт задвоить связь, а повтор — это воспроизведение, а не сбой.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.crmClientLink.findUnique({
          where: {
            tenantId_provider_externalId: {
              tenantId: input.tenantId,
              provider: input.provider,
              externalId: input.externalId,
            },
          },
          select: { clientId: true },
        });

        return raced ? { clientId: raced.clientId } : null;
      }

      throw error;
    }
  }

  /**
   * Побочная запись: сбой гасится.
   *
   * Теневая регистрация не имеет права испортить ответ, ради которого
   * пользователь пришёл. Наружу уходит только код ошибки — ни номера, ни
   * секрета в логе быть не должно.
   */
  async tryRegisterCrmClient(params: {
    tenantId: string;
    provider: string;
    externalId: string;
    phone?: string | null;
    userId?: string | null;
  }): Promise<void> {
    try {
      await this.registerCrmClient(params);
    } catch (error) {
      this.logger.warn(
        `shadow client identity registration failed provider=${params.provider}: ${
          error instanceof Error ? error.name : 'unknown'
        }`,
      );
    }
  }

  /**
   * HMAC от того же ключа сопоставления, по которому идёт вся сверка сегодня —
   * последних десяти цифр номера. Сам номер никуда не сохраняется и не
   * логируется.
   *
   * Секрет отдельный от прочих намеренно: разные домены безопасности ротируются
   * независимо.
   */
  private hashPhone(phone: string | null | undefined): string | null {
    const key = phoneMatchKey(phone);

    if (!key) {
      return null;
    }

    const secret = this.configService.get<string>(
      'CLIENT_IDENTITY_HASH_SECRET',
    );

    if (!secret) {
      // Вне production секрета может не быть. Личность без телефона — законное
      // состояние: её опознаёт внешний идентификатор карточки.
      return null;
    }

    return createHmac('sha256', secret)
      .update(`maya-client-identity:v1:${key}`)
      .digest('hex');
  }
}
