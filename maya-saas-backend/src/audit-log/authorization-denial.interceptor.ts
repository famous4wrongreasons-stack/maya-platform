import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuditLogService } from './audit-log.service';

/**
 * Отказы авторизации оставляют след.
 *
 * До этого не оставляли нигде: `RolesGuard`, `TenantAccessGuard`,
 * `TenantContextService` и страж журнала CRM бросают `ForbiddenException`
 * молча, а access-лога в проекте нет. Владелец не мог ни обнаружить перебор
 * чужих идентификаторов, ни доказать его постфактум — в базе не было ни одной
 * строки, а в journald только запись о самом запросе.
 *
 * Перехватчик, а не фильтр: фильтр обязан сам сформировать ответ, и любая
 * неточность там меняет контракт ошибок для всех клиентов. Здесь мы только
 * наблюдаем и пробрасываем исходное исключение дальше — тело ответа
 * формирует тот же штатный обработчик Nest, что и раньше.
 *
 * Пишем только 403. Неаутентифицированный 401 — обычный шум (протухший токен,
 * первый заход), и запись каждого превратила бы журнал в свалку, а заодно дала
 * бы любому желающему дешёвый способ раздувать нашу же таблицу.
 */
@Injectable()
export class AuthorizationDenialInterceptor implements NestInterceptor {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof ForbiddenException) {
          void this.record(context, error);
        }

        throw error;
      }),
    );
  }

  private async record(
    context: ExecutionContext,
    error: ForbiddenException,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      route?: { path?: string };
      user?: AuthenticatedUser;
    }>();

    const tenantId = this.tenantContext.get()?.tenantId ?? null;
    const metadata = {
      method: request.method ?? 'unknown',
      // Путь маршрута, а не URL: в нём нет ни идентификаторов, ни query, где
      // могли бы оказаться персональные данные.
      route: request.route?.path ?? 'unknown',
      reason: error.message,
      handler: context.getHandler().name,
    };

    // Арендатора не выдумываем. Если контекст не установлен — отказ случился до
    // привязки, привязать его не к кому, и запись пойдёт платформенной.
    if (tenantId) {
      await this.auditLog.tryLog({
        tenantId,
        userId: request.user?.userId ?? null,
        action: 'authz.denied',
        entityType: 'http_route',
        entityId: metadata.route,
        metadata,
      });
      return;
    }

    await this.auditLog.tryLogPlatformAction({
      userId: request.user?.userId ?? null,
      action: 'authz.denied',
      entityType: 'http_route',
      entityId: metadata.route,
      metadata,
    });
  }
}
