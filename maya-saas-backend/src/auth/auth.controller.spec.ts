import { Reflector } from '@nestjs/core';

import { ALLOW_SUBSCRIPTION_REQUIRED_KEY } from '../decorators/allow-subscription-required.decorator';
import { AuthController } from './auth.controller';

/**
 * Структурная проверка, а не проверка поведения: доказывает, что управление
 * собственным доступом не спрятано за платным фильтром.
 *
 * Без декоратора SubscriptionAccessGuard закрывал 402 весь контроллер после
 * окончания триала — владелец не мог ни выйти, ни отозвать сессию, при том что
 * /auth/refresh помечен @Public и продолжал продлевать украденную. Снять
 * декоратор одной строкой легко, и ни один поведенческий тест этого бы не
 * заметил: гварды в модульных тестах не регистрируются.
 */
describe('AuthController subscription fence', () => {
  it('lets the owner manage sessions after the trial has expired', () => {
    const allowed = new Reflector().getAllAndOverride<boolean>(
      ALLOW_SUBSCRIPTION_REQUIRED_KEY,
      [AuthController],
    );

    expect(allowed).toBe(true);
  });

  it('keeps the ability to end a session reachable on every auth route', () => {
    // Декоратор стоит на классе, поэтому покрывает и logout, и список сессий, и
    // точечный отзыв — включая маршруты, которые появятся здесь позже.
    const routes = [
      'logout',
      'listSessions',
      'revokeAllSessions',
      'revokeSession',
    ];

    for (const route of routes) {
      expect(
        typeof (AuthController.prototype as Record<string, unknown>)[route],
      ).toBe('function');
    }

    for (const route of routes) {
      const allowed = new Reflector().getAllAndOverride<boolean>(
        ALLOW_SUBSCRIPTION_REQUIRED_KEY,
        [
          (AuthController.prototype as Record<string, unknown>)[route],
          AuthController,
        ],
      );
      expect(allowed).toBe(true);
    }
  });
});
