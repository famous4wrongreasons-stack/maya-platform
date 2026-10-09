# MAYA — журнал сотрудника: HTTP, текущий филиал и перезапуск

**Подтверждён отдельный explicit READ через настоящий HTTP/auth/C9 и изолированную
PostgreSQL:** журнал выбранного сотрудника за день, полный или неполный источник,
сохранённые evidence и повтор после перезапуска. Успешный runtime source:
`4f88e8178e337d9f4d4b6740acbce1685e97a92e` (R5). Независимый source/evidence review —
qualified PASS. Это synthetic integration proof, не приёмка живого YCLIENTS,
модели, браузера или всей MAYA/C10.

Продуктовый код журнала:
`84eedcb65820ebe063ca14cd5a8217e53187dcb3` —
[owner wiring и 875 component tests](MAYA-EMPLOYEE-JOURNAL-OWNER-WIRING-20261009.md).
Предыдущий успешный runtime source расписания:
`23a01139574202d8d39e9baee89c5375fdf8a7ba` —
[отдельный schedule proof](MAYA-EMPLOYEE-SCHEDULE-HTTP-CHECKPOINT-20261009.md).
Последующие `b6cd4d00` и `4f88e817` уточняют ответы об успешном пустом availability
и неподтверждённом staff source, включая сохранение уже известного филиала.
[367 component tests и повтор 48/81](MAYA-OFFLINE48-AFTER-JOURNAL-20261009.md)
проверяют эту correction; продуктовые права и фоновые полномочия не расширены.

## Что выполнено

AppModule, auth, настоящий planner validator, C9, runtime, CRM, Analytics,
AppointmentPeriodReader и native YCLIENTS adapter работают совместно. Подменены
только model planning и конечный transport: разрешены явно перечисленные GET
к synthetic endpoint, нет fallback к сети. Тестовые привязки company→branch и
StaffProviderLink создаются непосредственно в собственной БД; это не A17 activation.

- Запрос «Покажи записи Артёма на завтра» даёт один ответ с услугой, временем,
  сотрудником, филиалом и его часовым поясом. Branch `Pacific/Kiritimati` намеренно
  отличается от tenant `Pacific/Honolulu`; день и native query соответствуют филиалу.
- Два C9 READ — catalog и journal — сохраняют work/execution/input/result references.
  Original, cached repeat и повтор в новом процессе после PG restart имеют одинаковые
  references; replay не добавляет native GET. История восстанавливается из сохранённого
  зашифрованного текста. Хеш всего C9 graph сравнивается на каждой соответствующей
  границе, а не между состояниями до и после дополнительных отрицательных запросов.
- Native partial состоит из полной страницы в 200 записей и её повторения.
  Фактический diagnostic — `page_limit_reached` после двух страниц. Ответ явно
  сообщает неполноту и ограничение отображения; отсутствие других записей не утверждается.
  Это не отдельное доказательство всех ветвей остановки при отсутствии прогресса.
- Provider `paid_full` даёт «отмечена завершённой в CRM», а не утверждение о посещении.
  Outward attendance остаётся nonmeasured с null-счётчиками; имена, телефон и комментарий
  synthetic клиента отсутствуют в ответе, публичном result и model input.
- Два Саши не разрешаются по отсутствию связи у одного из них. Единственная Елена
  без StaffProviderLink также не превращается в пустой журнал. Нет journal GET
  после таких отказов, foreign/unconfigured branch и branch-restricted actor.
- Foreign tenant не получает run/history. Отзыв membership во время catalog read
  останавливается canonical principal boundary до journal GET; следующий запрос
  отозванного пользователя не вызывает модель. Изменение integration revision
  блокирует старый request key без нового native GET. Это metadata drift, не company cutover.

STAFF имеет действующую Staff71/user/branch identity и получает серверный отказ
до модели. CLIENT получает direct-tool 403; в обычном чате реальный parser
подтверждает denied/F/not_available и отсутствие инструмента. Текст CLIENT отказа
задан модельной fixture, grounding `not_required`: качество отказа настоящей LLM
и серверная детерминированная формулировка этим не доказаны. Client identity не создаётся.

## Результаты и сохранённые неуспешные попытки

R4 на `28cad8fa` и финальный R5 на `4f88e817`:
**prepare + PG restart + resume PASS**. В каждом — две Jest stages; 14 chat HTTP запросов
(11×201, 2×403, 1×401), 12 scripted planner calls, 15 synthetic native GET (14+1).
Direct-tool/foreign-run/history проверки считаются отдельно от 14 chat запросов.
Два C9 READ не равны числу native GET. Конечный business snapshot неизменен,
наблюдаемые business write families и unexpected transport calls пусты.
Глобального доказательства отсутствия любых записей в БД нет: chat/evidence
сохраняются по назначению.

R1–R3 сохранены как FAIL. R1 scripted CLIENT plan вызвал невыданный инструмент;
R2 ошибочно ожидал `blocked` у существующего no-tool CLIENT пути; R3 смешал этот
путь с действующим STAFF pre-model отказом. Исправлены только test contracts.
Ни один FAIL не переименован в PASS и production policy не изменялась ради оценки.

Driver tests — 4 PASS; narrow types/lint/diff — PASS. Отдельный fixture unit run —
34 PASS; поздняя замена provider enum на правильный строковый литерал проверена
типами/lint и actual HTTP. Промежуточные ошибочные type/lint logs сохранены.
Это не сумма с прежними 875 tests и не новый aggregate gate.

[Архив и hashes](evidence/maya-employee-journal-http-20261009/archive-manifest.json),
[R5 manifest](evidence/maya-employee-journal-http-20261009/r5/manifest.json),
[prepare observations](evidence/maya-employee-journal-http-20261009/r5/prepare-observations.json),
[resume observations](evidence/maya-employee-journal-http-20261009/r5/resume-observations.json),
[independent review](evidence/maya-employee-journal-http-20261009/r5-independent-review.json).
Все 1 847 source hashes сверены с Git; source digest
`607764a43e244b616efb277e00023a1d9e20ce4df45d4e5e5661239c7a3d93ac`.
Manifest SHA256: `671ef993dc63a980b48c5977463d36edae6035080524e48094428b867fedbfa0`.

У всех пяти попыток source unchanged, owned PG stopped, `postmaster.pid`
отсутствует, дополнительный `pg_ctl status` завершён с 3. Process-group absence
этот driver не доказывает. Raw logs сохранены без нормализации конечных переводов строк.

## Граница checkpoint

В исходных 48 диалогах нет положительного journal запроса с однозначным сотрудником.
Этот proof не повышает их оценки. Повторный полный корпус и его remaining cases
оцениваются отдельно по actual evidence, включая ошибки оценщика и времени fixtures.
Нет live provider/model/production/HTTPS/phone, бизнес-мутаций, уведомлений,
background initiator, новых схем или политик retention. Frozen9/handoff и рабочий
сайт сохранены; push/merge/deploy не выполнялись. Общая MAYA/C10 — `NOT_ISSUED`.
