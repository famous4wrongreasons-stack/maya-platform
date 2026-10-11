# Telegram → личная история в настоящем React AChat

Test checkpoint: `48cfa9eae631bc060681d0bcf5164f91c78154a4`.
Ветка: `codex/maya-local-crm-setup-20261010`. Дата: 2026-10-11.
Это локальное продолжение приёмки после C9, не C10 и не release certification.
Backend/runtime/carrier product sources, Prisma и callback byte-identical
предыдущему checkpoint `5cbc29080ee202f52f60eec1537368335258d773`.
Изменены только тесты/runner и отдельно уточнена документация Telegram setup.

Свежий финальный результат: **84 PASS / 0 FAIL**, две HTTP/PG suites
(65 initial/history/browser cases и 19 synthetic successor cases). Внутри двух
браузерных случаев — по 13 checkpoints. Types, scoped lint и проверка текущих
web build bytes PASS. Оба Chrome и выделенная PostgreSQL остановлены;
исходники оставались неизменными на протяжении финального прогона.

## Доказанный сценарий и его границы

Браузер использует текущие emitted React, runtime и callback. Его точные
HTTP-запросы передаются в настоящий AppModule на выделенной loopback PostgreSQL.
Внешние Telegram issuer, CRM source и ответ модели синтетические. CDP допускает
конечный набор запросов; остальные отклоняются. Дополнительно Chrome использует
deny proxy/resolver. Это не утверждение о проверке сетевых пакетов всей ОС.

Для CLIENT и TENANT_OWNER отдельно:

1. У существующего тестового User ещё нет ClientChannelLink. Это проверка
   первой клиентской привязки, не регистрации совершенно нового аккаунта.
   Поиск салона и Telegram start/complete
   выполняются через фактическую форму React и HTTP guards. Тестовая подпись
   Telegram проверяется настоящим verifier; исходный документ не теряется.
2. Возникает ровно одна начальная проверенная связь с точным Client. Роль
   пользователя остаётся прежней. Вход не выдаёт согласие на кабинет.
3. **Отдельно** выполняется существующий AppointmentReconciliationService,
   после появления Client identity. Это fixture вызов канонического владельца
   сверки, не новый HTTP endpoint и не побочный эффект входа/чтения/чата.
   Настройка истории включена существующим A22 в тестовой базе.
4. Через настоящий composer отправляются три вопроса: история визитов,
   последний состоявшийся визит, ближайшие записи. Транспорт не добавляет
   `audience`, роль, tenant или caller-selected Client. Сервер составляет
   ответы по каноническим данным; браузер показывает именно эти ответы.
5. Чужая запись того же салона в то же время, контакты и заметки не попадают
   в ответ. Личные результаты предыдущих ходов не передаются внешней модели.
6. Повторный вход восстанавливает ровно три пары user/assistant из одного
   persisted conversation. Дополнительной связи, зеркального writer или
   create/reschedule/cancel execution не возникает. Chat не повторяет сверку.

Проверка не доказывает живой Telegram consent/phone claim, текущую BotFather
configuration, Safari/PWA/iPhone lifecycle, чтение реальной истории владельца,
качество ответа живой модели или полную историю вне синхронизированного окна.
Имеющиеся successor cases выполняются только с тестовым verifier/transport;
это не подключение SMS и не разрешение реальной повторной привязки.

## Воспроизведение и receipts

Из `maya-saas-backend`, без `.env`/`.env.local`, с новым абсолютным output:

```sh
JEST_TELEGRAM_WITH_SUCCESSOR=1 node scripts/telegram-client-binding-proof.mjs /private/tmp/maya-personal-browser-new-proof --browser
```

Нужны локальные PostgreSQL 16, Chrome и установленные зависимости. Runner
создаёт только отдельную guarded proof DB и останавливает её после теста.
`summary.json` фиксирует свежие результаты точного committed checkpoint.
`receipts.json` содержит hashes исходных журналов, fixtures/proof source map и
браузерных снимков; raw журналы и изображения остаются локально. Компактные
browser JSON не содержат token, phone, Client id или текст частной истории.

Предварительные неуспешные прогоны сохранены и перечислены в summary. Причины:
общая IP-квота fixture, неправильная рабочая папка нового build runner,
невыбранное имя тестового tenant, неправильный selector кнопки, порядок
fixture сверки до создания Client и обработка штатного IPC disconnect как
аварии. Продукт под эти ошибки не менялся. Квота OAuth остаётся 30/10 минут:
новый тест доказывает 429 на 31-й попытке и сохранность остальных buckets.
Гигиена сбрасывает только loopback OAuth preflight между отдельными случаями
и только в guarded proof DB, не внутри проверок replay/concurrency.

## Публичный preflight и следующий реальный шаг

В `public-preflight.json` — два неавторизованных GET, без секретов и записей.
`https://mayaos.ru/oauth-callback.html` вернул 200; hash совпал с историческим
callback `1ba86ac44a87ebafcaf765a34f278b03408b4a7b`, а не текущим исправлением.
`https://mayaos.ru/maya-chat-shell/` вернул 404. Это результат именно этих URL,
не вывод о недоступности всего backend или всех адресов приложения.

Текущая [официальная инструкция Telegram](https://core.telegram.org/bots/telegram-login#registering-your-allowed-urls)
требует зарегистрированные Allowed URLs, включая OIDC redirects. Историческое
наблюдение domain-only сохранено в deploy/platform/README.md с датой; оно не
заменяет проверку сегодняшней регистрации платформенного `@mayaos_login_bot`.

Перед живым запуском остаются конкретные условия:

- Согласовать текущие React и callback на разрешённом HTTPS-адресе; подтвердить
  его регистрацию у Telegram и доступность credentials без раскрытия значений.
  В этом проходе ничего не публиковалось и настройки бота не менялись.
- Квалифицировать ограниченный private-read режим существующего local launcher:
  exact tenant/company, полный реестр клиентов для проверки единственности
  номера и ограниченное окно журнала. Старый public-catalog профиль не расширен.
- Проверить состояние той же сохранённой owner-БД и текущей Client lineage.
  Revoked episode нельзя автоматически восстановить initial login.
- Использовать текущих владельцев настройки истории/consent и получить свежий
  допуск на реальное частное чтение и модель. Предыдущее временное разрешение
  истекло. Никакие реальные карточки/история в этом proof не запрашивались.

LIVE PERSONAL ACCEPTANCE: NOT RUN. READY FOR LIVE LAUNCH: NO.
Новая release certification не заявляется. Production, grants, реальная
owner-БД, OTP, YCLIENTS business effects и iPhone не изменялись.
