# Названия услуг в дневном расписании — 2026-10-14

Проверенный code candidate: `91916d52903ac8f18fb8df30ead2b8d3a7aef0f0`.
Ветка: `codex/maya-local-crm-setup-20261010`. Исходный HEAD: `552504468e31cb9fbe065695219c3e39f1b94bef`.
Локальная разработка после C9; не C10, не production и не release certification.

## Результат и граница контракта

Внутренний `OperationsAnalyticsService.getDayOperations` раньше явно возвращал
`services: []`, хотя Appointment сохранял serviceIds. Теперь он разрешает названия
по этим ID через InternalService того же tenant. Это существующее правило
внутреннего журнала `InternalCalendarService.getJournal`, а не новый источник
полномочий или сопоставление по имени/телефону.

- Один запрос только за id/name по фактически сохранённым serviceIds. Порядок и
  повторяемость ID записи сохраняются. Неактивная, но существующая услуга может
  подписывать старую запись; это не делает её доступной для нового бронирования.
- Неизвестные, удалённые и чужие услуги не подставляются. Пустой список сохраняет
  прежний заголовок «Запись». Ошибка чтения каталога не маскируется под пустой ответ.
- Название текущее, из каталога, как в существующем внутреннем журнале. Это **не
  исторический snapshot названия**. Ни snapshot, ни новая схема здесь не добавлены.
- Текущие цены, currency, duration и eligibility каталога не читаются. Названия
  добавляются к records **после** прежней агрегации: totals, booked_value,
  attendance, completeness и разбивки услуг остаются прежними. Никакой нулевой
  цены вместо неизвестного значения и перерасчёта старых визитов.
- Сохранённая external-запись в смешанном внутреннем дневном наборе не получает
  internal-название по совпавшему строковому ID. Сам состав дневного набора и его
  суммы не меняются. Внешняя ветка CRM сохраняет собственные услуги/суммы.
- Через прежний handler проходят только названия. Presenter запечатывает их в
  SCHEDULE; runtime/React показывают готовые labels. Frontend, schema, Client
  Identity, Action Engine, AR-1, widgets.runtime и HANDOFF не изменены.

## Свежие проверки на exact candidate

| Поверхность | Результат |
| --- | --- |
| Backend regression, 9 suites | 326 PASS / 0 FAIL / 0 SKIP |
| Дополнительная проверка существующих availability/catalogue boundaries, 3 suites | 182 PASS / 0 FAIL / 0 SKIP |
| Actual AppModule + HTTP + PostgreSQL + runtime/React projection | 3 PASS |
| Целевые мутации | 4/4 KILLED; исходный и восстановленный baseline зелёные |
| Восстановленный journal-services baseline | 14 PASS (повтор, не прибавляется к 508) |
| Backend и widgets-live typechecks; scoped lint | PASS |
| Runtime build + emitted carrier harness | PASS; clone остался clean |
| Сеть | внешний адрес запрещён OS fence; только loopback и synthetic transport |

Мутации: удаление names — 5 failures; удаление tenant scope — 2; перенос цен
каталога в label result — 2; подмена источника internal/external — 1.
Каждая отдельно восстанавливалась до следующих проверок. Это не полный release
mutation corpus, не Platform CI и не новая общая сертификация.

Заполненный источник содержит четыре искусственные записи одного мастера:
обычная услуга; неактивная + обычная; чужая/удалённая; retained external.
Initial и detail остаются structured, с точными датой/временем/timezone и refs.
Первые две строки показывают названия, последние две — «Запись». Private note и
чужое название отсутствуют. Исходные Appointment строки полностью равны после
чтения, action executions = 0, tenant_owner не стал клиентом. Timeline не меняется
при detail. Ещё два сценария — пустой journal и существующий synthetic personal
create/reschedule/cancel — прошли через прежний HTTP/runtime путь.

Actual backend proof использует React markup из настоящего RenderResult, **не
живой Chrome поверх этого backend**. В этом проходе нет новых screenshot/browser
receipts или реального model/YCLIENTS acceptance. Предыдущие браузерные результаты
остаются историческими и не объявлены повторно выполненными.

## Свободное время: проверено по текущему коду

`operations.journal.read` описывает визиты, его `gaps: []` не означает отсутствие
свободного времени. Это поле не заполнялось промежутками между записями.

Существующая цепочка availability: `AiToolHandlerService.readAvailability` →
`AppointmentsService.getAvailableSlots` → `CrmService.getAvailableSlots` →
internal calendar либо текущий provider adapter. Внутренний owner учитывает
рабочие правила, исключения, duration/buffers услуги, интервалы записей,
minimum notice и timezone. Для перехода READ в личную widget-цепочку handler
требует одну подтверждённую каталогом услугу и точного мастера; Client authority
и подтверждение остаются в прежних owners.

Текущий внешний owner уже поддерживает проверяемый `settings.branchBinding`,
revision и перечитывание источника. Историческое ограничение из checkpoint
2026-10-07 о полном отсутствии branch mapping **не переносится на текущий код**.
Настоящее подключение салона этим проходом не проверено.

Остаётся отдельная продуктовая поверхность: агрегированные «свободные окна»
дневного расписания без выбранной услуги. Демонстрационные окна и кнопки из
дизайн-пакета не задают длительность/услугу/полномочия. Действующий личный подбор
времени уже использует выбор услуги/мастера/дня; он не заменён свободным вводом,
generic endpoint или записью другого клиента. Также остаётся actual-source
проверка чередующихся мастеров из предыдущего checkpoint.

## Provenance

- `8a8dacaf`: service labels + 13 unit cases + source probe; scoped isolated run PASS.
- `f5759fbb`: отдельная source-isolation защита + 14-й unit case + 4-я source row.
  Exact run остановился на lint: сравнение строкового persisted source с enum.
- `91916d52`: сравнение по существующему строковому контракту. Все итоговые
  проверки заново на этом clean committed SHA; ранние результаты не подменяют их.
- Первое red-test наблюдение содержало некорректный synthetic external client=null.
  Fixture исправлен до реализации; повторный red baseline: **5 FAIL / 8 PASS**,
  именно отсутствующие labels/read refusal. Оба журнала сохранены.

Все disposable PostgreSQL этого прохода остановлены. Production / сохранённая
база салона / Keychain / реальные модель, OTP, SMS, YCLIENTS / grants / deploy /
iPhone / push / merge: **0**. Новых миграций нет; существующие применялись только
к новым искусственным proof DB. Документирование после проверок — отдельный commit.

[Архив результатов, hashes и runner](evidence/maya-journal-service-names-20261014/README.md).

CERTIFIED != DEPLOYED. Этот checkpoint подтверждает только перечисленные локальные проверки.
