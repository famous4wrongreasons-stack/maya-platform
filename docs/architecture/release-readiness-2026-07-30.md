# MAYA OS Release Readiness

Дата среза: 2026-07-30.

## Решение

Код MAYA OS готов к закрытому пилоту на двух изолированных бизнесах.
Коммерческий запуск для самостоятельного подключения не завершён: до него
нужны production-домен, реальные provider credentials, активированная CRM
первого пилота и контролируемый live-write canary.

Существующая «Мужская Эстетика» остаётся отдельным рабочим контуром. Новый
multi-tenant runtime не должен получать её production-трафик до явного
подтверждения владельца и прохождения canary.

## Готово в коде

### Платформа

- Tenant, Membership, TenantContext и deny-by-default tenant isolation.
- Tenant-scoped сессии, роли, feature gates, планы и entitlements.
- BrandingConfig, универсальные industry presets и demo tenant.
- Email, Yandex ID и Telegram auth contracts, refresh rotation и revoke.
- Десятидневный trial, self-serve onboarding и учёт только завершённых
  регистраций.
- Internal calendar, услуги, специалисты, расписание, time off и записи.
- Создание, отмена и недеструктивный перенос записи.
- Customer portal, история посещений, repeat booking и loyalty ledger.
- Role-scoped analytics, расходы и безопасные AI approval flows.
- YClients/Altegio CRM connection lifecycle: verify, preview, activate,
  recheck и disconnect.
- YooKassa server flow, idempotency и webhook foundation.
- Tenant-aware AI chat, tool policy, PII redaction и fail-closed boundaries.

### PWA и iOS

- Один и тот же рабочий интерфейс MAYA для PWA и Capacitor iOS.
- Tenant и user scoped chat history.
- Role-aware клиентский, сотруднический и owner chat.
- Effective feature registry является authoritative после авторизации.
- Customer portal, лояльность, CRM status и operational screens подключены к
  multi-tenant API.
- Pending AI approvals восстанавливаются с сервера; payload не хранится в
  браузерном кеше.
- Universal runtime не отправляет сообщения или аудио в legacy backend.
- Production CTA MAYA OS показывает «Скоро»; полный trial доступен только в
  локальном/private preview режиме.
- На старых iPhone CTA переносится на две строки без обрезания.
- Последняя debug-сборка синхронизирована, собрана, установлена и запущена на
  тестовом iPhone.

## Последний verification gate

- NestJS typecheck: пройден.
- TypeScript scripts typecheck: пройден.
- ESLint: пройден.
- NestJS unit: 76 suites, 404 tests пройдены.
- NestJS e2e: 1 test пройден.
- Prisma validate: пройден.
- NestJS build: пройден.
- Legacy Python compile: пройден.
- Legacy Python: 252 tests пройдены.
- PWA/iOS inline scripts: 52 scripts пройдены.
- PWA pre-publication contracts: пройдены.
- iOS native pre-publication contracts: пройдены.
- Quick replies regression checks: пройдены для PWA и iOS.
- Capacitor source/public parity: подтверждена.
- iOS device build/install/launch: пройдены.
- Production dependency audit: high/critical уязвимостей не найдено.

Полный development audit показывает advisory в транзитивной test/build
toolchain. Forced fix требует несовместимых downgrade Jest/Nest/ESLint и не
применяется. Production dependencies и CI gate остаются зелёными.

## Текущий runtime

- Новый NestJS backend доступен на временном HTTPS API host и отвечает на
  liveness/readiness.
- Public `malesthetic.pro/api/*` пока не направлен в multi-tenant backend.
- Tenant `muzhskaya-estetika` остаётся в безопасном состоянии:
  `booking_mode=preview`, live writes выключены, CRM activation не завершена.
- Swagger не опубликован публично; metrics защищены авторизацией.
- CORS ограничен доверенными origin.

## Что блокирует коммерческий запуск

### Внешняя инфраструктура

- Финальный API/PWA domain, DNS, TLS и same-origin reverse proxy для `/api`.
- Production PostgreSQL backups, restore drill, log retention и alerts.
- Точные OAuth callback URLs после утверждения финального домена.

### Реальные провайдеры

- Platform-owned ключи Yandex ID, Telegram, email и SMS в secret store.
- YooKassa shop, production webhook и платёжные реквизиты.
- Least-privilege YClients/Altegio credentials первого пилота.
- Реальный AI provider key/model в production secret store.

### Acceptance

- Второй реальный бизнес как tenant-isolation pilot.
- Read-only CRM reconciliation для каждого пилота.
- Явное одобрение конкретного tenant и окна live-write canary.
- Проверка create/cancel/reschedule с одной контролируемой записью.
- TestFlight/App Store signing, privacy metadata и публикационное решение.

## Безопасный порядок запуска

1. Поднять финальный production/staging host с PostgreSQL, backups и HTTPS.
2. Внести provider credentials напрямую в server secret store.
3. Подключить два пилотных tenant в `preview`.
4. Сверить услуги, мастеров, график, клиентов, бонусы и аналитику с CRM.
5. Провести tenant-isolation и role acceptance matrix.
6. Включить live writes только одному tenant на ограниченное окно.
7. Проверить запись, отмену, перенос, idempotency и audit trail.
8. Вернуть `preview` при любом расхождении; выпускать production только после
   письменного подтверждения владельца.

## Действия владельца

Codex может завершить код, CI, сборки и инструкции. Владелец должен:

- выбрать финальный домен и одобрить DNS/TLS/reverse-proxy переключение;
- создать или подтвердить provider accounts и самостоятельно внести секреты;
- выбрать второй пилотный бизнес и дать согласие на read-only CRM проверку;
- определить tenant и время live-write canary;
- подтвердить платежные реквизиты и YooKassa webhook;
- подтвердить TestFlight/App Store и финальный production cutover.

До этих подтверждений безопасный статус проекта: **код готов к закрытому
пилоту, public self-serve и live CRM writes закрыты**.
