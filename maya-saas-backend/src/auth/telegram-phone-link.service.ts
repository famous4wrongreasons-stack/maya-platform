import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

import { normalizePhoneE164 } from '../common/phone.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Подтверждение номера телефона через платформенного бота Telegram.
 *
 * Зачем это вообще. Лояльность, история визитов и запись живут в CRM салона и
 * находятся ПО НОМЕРУ. Telegram Login даёт имя и id, но номер не отдаёт: его
 * телеграм передаёт только по кнопке «Поделиться контактом», а она живёт в
 * переписке с ботом. Без номера MAYA не знает, кто этот человек в кассе, и
 * честно показывает пустой кабинет.
 *
 * Почему не ввод руками. Баланс баллов и история визитов — персональные данные.
 * Если принимать номер набранным с клавиатуры, любой, кто знает чужой номер,
 * увидит чужие бонусы и визиты. Телеграм же подтверждает владение номером сам,
 * бесплатно и без SMS-сервиса.
 *
 * Хранилище одноразовых кодов — существующий AuthFlowState: заводить отдельную
 * таблицу ради строки с кодом смысла нет, а лишняя миграция на проде — риск.
 */
@Injectable()
export class TelegramPhoneLinkService {
  private static readonly PROVIDER = 'telegram_phone_link';
  private static readonly TTL_MS = 10 * 60 * 1000;
  private readonly logger = new Logger(TelegramPhoneLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Шаг 1. Приложение просит ссылку. Возвращаем короткоживущий код и
   * deep-link на бота: `t.me/<бот>?start=<код>`.
   */
  async start(tenantId: string, userId: string) {
    const botUsername = this.requireBotUsername();
    const code = randomBytes(24).toString('base64url');

    await this.prisma.authFlowState.create({
      data: {
        tenantId,
        provider: TelegramPhoneLinkService.PROVIDER,
        state: code,
        // AuthFlowState рассчитан на OAuth, поэтому поля используем по смыслу:
        // redirectUri тут не нужен, а codeVerifier несёт того, кому привяжем
        // номер. Иначе бот не знал бы, чей контакт ему прислали.
        redirectUri: 'internal:telegram-phone-link',
        codeVerifier: userId,
        expiresAt: new Date(Date.now() + TelegramPhoneLinkService.TTL_MS),
      },
    });

    return {
      deep_link: `https://t.me/${botUsername}?start=${code}`,
      expires_in_seconds: Math.floor(TelegramPhoneLinkService.TTL_MS / 1000),
    };
  }

  /**
   * Шаг 2. Бот прислал контакт. Проверяем общий секрет, гасим код и
   * записываем номер пользователю.
   */
  async complete(params: {
    sharedSecret: string;
    code: string;
    phone: string;
  }) {
    this.assertSharedSecret(params.sharedSecret);

    const phone = normalizePhoneE164(params.phone);
    if (!phone) {
      throw new BadRequestException({
        message: 'Phone number is not a valid E.164 value.',
        error: { code: 'telegram_phone_link_invalid_phone' },
      });
    }

    const flow = await this.prisma.authFlowState.findUnique({
      where: { state: params.code },
    });
    if (
      !flow ||
      flow.provider !== TelegramPhoneLinkService.PROVIDER ||
      flow.consumedAt !== null ||
      flow.expiresAt.getTime() <= Date.now() ||
      !flow.codeVerifier
    ) {
      // Один код — одна привязка. Просроченный, чужой или уже использованный
      // код неотличимы снаружи намеренно: иначе перебор кодов подсказывал бы,
      // какие из них существуют.
      throw new UnauthorizedException({
        message: 'Phone link code is invalid or expired.',
        error: { code: 'telegram_phone_link_invalid_code' },
      });
    }

    const userId = flow.codeVerifier;

    await this.prisma.$transaction([
      this.prisma.authFlowState.update({
        where: { id: flow.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { phone },
      }),
    ]);

    this.logger.log(
      `telegram phone linked tenant=${flow.tenantId} user=${userId}`,
    );

    return { linked: true };
  }

  private requireBotUsername(): string {
    const username = this.configService
      .get<string>('MAYA_PLATFORM_BOT_USERNAME')
      ?.trim()
      .replace(/^@/, '');
    if (!username) {
      throw new BadRequestException({
        message: 'Platform Telegram bot is not configured.',
        error: { code: 'telegram_phone_link_not_configured' },
      });
    }
    return username;
  }

  private assertSharedSecret(supplied: string): void {
    const expected = this.configService
      .get<string>('MAYA_PLATFORM_BOT_SECRET')
      ?.trim();
    if (!expected) {
      throw new UnauthorizedException({
        message: 'Platform Telegram bot is not configured.',
        error: { code: 'telegram_phone_link_not_configured' },
      });
    }
    // Сравнение постоянного времени: обычное === утекает длину общего префикса
    // и делает подбор секрета измеримо дешевле.
    const left = createHash('sha256').update(supplied ?? '').digest();
    const right = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(left, right)) {
      throw new UnauthorizedException({
        message: 'Platform Telegram bot secret is invalid.',
        error: { code: 'telegram_phone_link_forbidden' },
      });
    }
  }
}
