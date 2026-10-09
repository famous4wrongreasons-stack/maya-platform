# MAYA — дата журнала после уточнения сотрудника

Запрос «Покажи записи Саши на завтра» сохраняет точную дату и часовой пояс филиала до уточнения имени. После настоящего перезапуска приложения и PostgreSQL новое «Саша Иванов» читает журнал за исходный день; повтор запроса использует прежние C9 receipts без нового чтения. **959 тестов / 19 suites, 4 driver tests, scoped и production TypeScript, lint PASS. HTTP prepare 396 + resume 326 assertions PASS.**

Исходная точка: `ca70076b35afc4aaa299b8bfe9bb34f2954c7723`. Проверенный runtime и probe: `bad0a002e286d78fd9e1332cee3b666380cb203a`. Это отдельная цепочка продолжения, без нового PASS для исходного хода.

## Исправление и владельцы

После успешного актуального catalog READ существующий semantic task получает абсолютную дату и имя филиала, даже если сотрудник неоднозначен. Закрытый шестипольный `journalCalendar` хранится рядом с plan в существующем зашифрованном и удаляемом semanticContext. Новая таблица, retention policy и второй orchestrator не вводятся. Маркер не передаётся модели и не является разрешением на чтение.

Restore сверяет текущий branch ID, имя, timezone и CRM sourceRevision. Перед новым catalog READ повторно проверяется источник; существующий runtime сохраняет проверки доступа и источника вокруг provider/cache awaits. Новая явно исправленная дата сохраняет проверку прежнего источника филиала. Изменение binding/timezone/source требует нового уточнения. Старое относительное `tomorrow` без подтверждённого календарного маркера не пересчитывается от нового now.

Только конечные employee/date/source clarification состояния допускают продолжение без имени. Такой ответ снова уточняет сотрудника и не открывает журнал всей команды. Существующие STOP/null/erasure/principal/retention барьеры не обходятся. Fingerprint включает серверный календарный маркер: новая версия источника не теряется в immutable completion dedupe. Источником фактов остаются CRM/AppointmentPeriodReader и существующий C9 READ.

## Доказательства

Три первоначальных RED-теста воспроизвели потерю даты в Москве и в дни весеннего/осеннего DST Берлина: ожидалась абсолютная дата, оставалось `tomorrow`. Все три проходят после исправления. Component проверки также охватывают invalid date, закрытую форму маркера, source/branch/timezone drift, date-only correction, смену источника во время ожидания planner, запрет расширения до whole-team journal, STOP/null и отсутствие маркера во входе модели.

В четырёх новых calendar-continuation synthetic tenants используются два Саши с действующими provider links. Выбор по наличию связи невозможен. Старый отдельный ambiguity control с отсутствующей связью сохранён. Начальный неоднозначный запрос выполняет один catalog C9 READ и ноль journal READ. Сохранённые context/marker hashes и история переживают перезапуск приложения и PostgreSQL.

Контролируемое civil-time input в настоящую функцию чтения меняется с `2026-11-01T03:59:59Z` на `2026-11-01T04:00:01Z`: полночь в `America/New_York`. JWT, retention и системные часы не подменялись. Новое full-name-only сообщение не содержит date/branch; намеренно неверные model tool arguments не задают фактический scope. Ответ сохраняет **1 ноября**, хотя новое вычисление «завтра» дало бы 2 ноября. Настоящий AppointmentPeriodReader получает `2026-11-01T04:00:00Z` … `2026-11-02T04:59:59.999Z`, ровно **25 часов**. Это controlled-date proof, не естественное ожидание полуночи.

Продолжение выполняет два settled C9 READ: свежий catalog и один journal. Journal source возвращает неполную страницу; ответ прямо указывает неполноту и ограничение отображения. Полнота всех записей, явка и свободные окна этим не подтверждаются. Same-key replay сохраняет run и source receipts, добавляет ноль native/period reads. Три отдельные смены sourceRevision, timezone и branch binding после restart дают blocked с нулём новых чтений и без старых journal facts.

Сохранены исходные negative controls: foreign tenant/history/run, restricted branch, source drift при replay, отзыв membership во время catalog READ, последующий 401, прямые STAFF/CLIENT 403. STAFF chat отказ — серверный; CLIENT chat denial prose — scripted, без language acceptance.

Всего **23 chat requests: 20×201, 2×403, 1×401**, отдельно два direct-tool 403. 21 scripted planner call и 28 synthetic native GET; это разные счётчики. Неожиданных вызовов нет; observed business-family hashes после fixture setup не изменились. Это ограниченный census, не OS-level egress доказательство.

[Prepare](evidence/maya-journal-calendar-continuation-20261009/http/r1/prepare-observations.json), [resume](evidence/maya-journal-calendar-continuation-20261009/http/r1/resume-observations.json), [source/cleanup verification](evidence/maya-journal-calendar-continuation-20261009/http/r1/source-and-cleanup-verification.json). Все **1862** source hashes совпали с exact Git commit; исходники во время proof неизменны. Собственный PG остановлен: `pg_ctl status=3`, postmaster PID отсутствует. Manifest SHA256: `b56a3f418a7201febb246bfa88063025f49c57f855e6cb22d844cdbc5bad8b65`.

Первый общий gate сохранён как FAIL: 927/959. Новая fixture предлагала null tool там, где actual parser требует READ proposal; её `structuredClone` переносил чужой JS realm, который strict plain-record validator правильно отклоняет. Исправлены fixture tool proposal и JSON roundtrip без ослабления assertions. Один helper test ошибочно считал пустой string ID malformed container; исправлен вход `staff:null`. Production runtime после review не менялся.

Broad test type-check также обнаружил старый четырёхаргументный constructor в неизменённом `crm.staff-schedule-source.spec.ts`; это не закрыто. Финальный scoped type-check охватывает все пять изменённых TS файлов, production type-check — production проект. Исходный spec успешно выполняется в 959 unit tests. Все failed raw logs сохранены.

## Статус и следующий срез

[Исходные 81 хода](MAYA-REVIEW-CLARIFICATION-COMPLETION-20261009.md) не перезапускались и не переоценивались: **57 PASS / 0 semantic FAIL / 12 unsupported / 10 insufficient / 2 clarification pending**. Остаются 22 других незакрытых хода и 2 unanswered clarification. Отдельное завершение журнала не приписывается initial turn; frozen9 и handoff остаются на прежних SHA.

Следующий безопасный missing link: отдельные exact 037/041 public branch address сценарии. В исходной диагностике scripted plan теряет branch, а booking fixture не имеет company↔branch binding. Supplemental proof явно подготовит эти синтетические предпосылки, пройдёт существующий C9→public CRM source путь и покажет отказы без binding/при mismatch. Исходные corpus, planner script, fixtures и оценки останутся неизменны; новой production capability предварительно не требуется.

Real HTTP/auth/C9/PG, scripted model и synthetic native transport. Live YCLIENTS/model, production binding, browser, общая MAYA/C10 acceptance — **NOT_ISSUED**. Нет CRM business mutations, outbound, фонового инициатора, новых schema/retention/autonomy решений, website/phone/pricing изменений, push/merge/deploy.

[Независимый source review](evidence/maya-journal-calendar-continuation-20261009/maya-journal-calendar-independent-source-review-20261009.json), [независимый evidence review](evidence/maya-journal-calendar-continuation-20261009/maya-journal-calendar-independent-evidence-review-20261009.json), [архив](evidence/maya-journal-calendar-continuation-20261009/archive-manifest.json).
