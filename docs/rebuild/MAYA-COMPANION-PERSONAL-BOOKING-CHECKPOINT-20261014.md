# Companion: личная запись и нижний лист — 2026-10-14

Проверенный candidate: `26cd94b4ace838dc1cc692c0d8b521c6d7435fb5`. Ветка: `codex/maya-local-crm-setup-20261010`.
Предшественник: `ecd0148d`. Product commit: `610f98ec`; следующий `26cd94b4`
уточняет только тестовый клик после изменения viewport. Все восемь emitted payload
файлов до/после этого уточнения совпадают по хешам. Старый release certificate
не наследуется: это scoped local acceptance, не release certification.

## Реализовано

Существующий DetailSheet получил нижний лист Companion: белая поверхность,
скругления 22 px, декоративный handle, высота 81% видимого viewport,
неподвижная шапка и независимо прокручиваемое содержимое. Показывается только
по ShellView.fullscreen. Escape/кнопка закрытия по-прежнему вызывают closeDetail;
фокус возвращается к настоящему opener. Исходная карточка отображается целиком,
все server-authored ref, тексты и действия сохранены. Новый лист не вычисляет
права, маршрут или смысл ответа.

Личная запись использует тот же `PersonalBookingPort`: филиал → услуга → мастер
→ дата → canonical availability → preview → явное подтверждение → точный результат.
Добавлены стили выбранных вариантов, свободных окон, фактов предложения и основной
кнопки. Минимальная высота controls 44 px, текст даты не меньше 16 px; сохранены
клавиатурный обход, disabled state и отказ при занятости. Существующий текстовый
ввод даты YYYY-MM-DD не расширен до нового календарного/свободного InputSchema.
Часовой пояс, цены, длительности и результат поступают из прежних owners.

Backend, runtime, схема, Client Identity, Action Engine, AR-1 и HANDOFF не менялись.
Затронуты только три source-файла React/CSS и три test/harness файла.
Роль tenant_owner не стала клиентской: личная запись требует отдельного уже
подтверждённого personal-client context, как и раньше.

## Основание и граница дизайна

Owner reference: `Maya_full_design_package/screens/13-schedule.png` и соответствующий
prototype. Его демонстрационные строки и свободные окна не копируются в данные Maya.
В prototype кнопка «+» у окна открывает plan; это не разрешение записывать другого
клиента. Использована визуальная поверхность и типографика, без подмены источников.

`operations.journal.read@1` описывает записи дня, а не доступность. Его текущий
journal presenter отдаёт `gaps: []`. Свободные слоты личной записи приходят через
существующий availability transport с точными branch/service/staff/date. Пустота
журнала не превращается во «свободное окно»; новый generic booking endpoint отсутствует.

## Свежие проверки

Все нижеприведённые final результаты получены на чистом committed `26cd94b4ace838dc1cc692c0d8b521c6d7435fb5`.
Основной прогон: `2026-10-14T08:03:32Z` → `2026-10-14T08:07:11Z`.
Полный HTTP/PG proof: `2026-10-14T08:03:19.299Z` → `2026-10-14T08:05:40.998Z`.

| Проверка | Результат |
| --- | --- |
| Полный runtime | 828 PASS / 7 SKIP / 0 FAIL |
| Полный carrier | 195 PASS / 0 FAIL |
| Emitted browser: chat / navigation / voice / schedule | 35 / 207 / 56 / 35 PASS, всего 333 |
| NS-1 parent → detail → parent | 16 PASS |
| Packaging tests | 18 PASS |
| Runtime/carrier ratchets + reproducible runtime | PASS |
| PWA/Capacitor | PASS, 8 файлов; только разрешённая endpoint/CSP substitution |
| Personal owner: настоящий AppModule/HTTP/PG/React | prepare PASS + resume PASS |
| Layout личной записи | 15 checks: choice/slots/preview × 320/393/1280, 200% text, focus ring |

В full-stack proof пользователь остаётся tenant_owner с отдельным synthetic A18
Client binding. Вход начинается из настоящего `catalog.services.read` при нуле
исходных записей. Модель scripted, каталог/провайдер искусственные; ответы API
и авторизация проходят реальные owners без подстановки ответов браузеру.

- Внутренний успех: SUCCEEDED, 1 attempt, ровно 1 appointment.
- Отзыв связи/доступа перед NAVIGATE или перед подтверждением: REFUSED, 0 attempts,
  0 appointments; role/membership не меняются.
- Нет цены/валюты/длительности или точного branch binding: отказ; нулевая цена
  сохраняется как 0, не заменяется отсутствием данных.
- Изменение предложения: 409/отказ, 0 appointments; сохранённые исходные evidence
  не переписываются при restart.
- Тестовый provider сохраняет одну запись и теряет ответ: UNKNOWN, один dispatch.
  После реального перезапуска приложения и PostgreSQL: UNKNOWN, новых dispatch 0,
  provider ledger по-прежнему 1. Maya не сообщает успех и не показывает повторный confirm.
- Preview/results не выполняют скрытых записей. Приватная форма не добавляется
  в model history. Browser allowlist не зарегистрировал неожиданных запросов.

Свежие БД созданы только для тестов, все их кластеры остановлены. Сохранённая база
салона, Keychain и настоящие провайдеры не использовались. Эти результаты не доказывают
реальную модель, Telegram verification, YCLIENTS, iPhone или production release.

## Отклонённые прогоны и исправления стенда

1. HTTP final01: внешний sandbox-exec вокруг всего runner мешал собственному sandbox
   Chrome. Серверная facts-проверка завершилась, browser не дошёл до сценария;
   Jest истёк через исходные 120 секунд. Диагностический stderr Chrome:
   `sandbox initialization failed: Operation not permitted` / `Failed to initialize sandbox`.
   Это воспроизведено отдельно до API-сценария. На итоговом запуске используется
   штатный runner с собственным Chrome sandbox, закрытым proxy и request-stage
   allowlist; модель и provider заменены test-only transport. Внешний OS network
   fence остаётся у dependency-generation proof. Защита Chrome не отключалась,
   timeout не увеличивался. Диагностический прогон с нулём сценариев не является acceptance.
2. HTTP final02: новая проверка меняла viewport и сразу кликала по ещё меняющейся
   геометрии. Филиал не выбирался. Test-only `26cd94b4` ждёт применённый viewport,
   два кадра и фактический hit-test кнопки перед обычным mouse click. Нет JS `.click()`,
   повтора booking или изменения продукта. HTTP final03 прошёл все исходные
   положительные/отрицательные проверки плюс новые layout проверки.
3. После test-only commit весь scoped набор снова выполнен на final SHA. Первый
   зелёный scoped прогон сохранён как исторический и не подставлен вместо итогового.

## Что остаётся

- Самостоятельный календарь из шапки одним действием: текущая кнопка отправляет
  вопрос AChat, detail открывается только каноническим NAVIGATE.
- Полное представление заполненного журнала салона по макету; текущий sealed
  renderer сохраняет исходные строки, а не изображает demo time grid.
- Объединённые свободные окна журнала и booking shortcuts требуют настоящего
  canonical availability с конкретными услугой/мастером/филиалом/днём. Этот pass
  оформил уже существующую личную форму, не создал такой агрегированный источник.
- В detail сохраняется полная исходная карточка над формой; повторяющиеся
  server-owned заголовки/длинные сведения не удалялись ради компактного макета.
  Дальнейшая визуальная доработка должна сохранить весь RenderResult и controls.
- Полная повторная release certification, реальные запись/перенос/отмена и принятие
  владельцем не выполнялись. C10 не начинали.

[Архив результатов](evidence/maya-companion-personal-booking-20261014/README.md).
Production, migration/grant на реальных БД, push/merge/deploy, OTP/SMS/YCLIENTS,
платные модели и установка iPhone: 0. Schema replay — только новые synthetic БД.
