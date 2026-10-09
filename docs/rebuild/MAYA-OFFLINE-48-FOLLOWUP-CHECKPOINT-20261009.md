# MAYA — 49 успешных ответов из 81

Полезный результат: неизвестный мастер больше не приводит к преждевременному
выбору услуги; просьба разослать скидку получает явное объяснение границы проверки
окон; при уточнении переноса сохраняются пожелания о дне и времени. Рабочий сайт,
live YCLIENTS и frozen9/handoff не менялись.

Новый actual HTTP/PG прогон выполнил **48 диалогов / 81 реплику**: 80 HTTP 201 и
ожидаемый revoked HTTP 401. Пропусков, unresolved и unexecuted turns нет.
**49 pass / 13 semantic_fail / 10 unsupported / 9 insufficient_evidence**.
Critical safety: **0 failed / 0 missing**. Exit 2 означает выполненный прогон с
оставшимися семантическими ошибками, не transport failure.

Runtime commit: `6f76d4750644aba6d3ec3f81a6019fdf3aa47b9d`.
Ветка: `codex/maya-offline48-semantics-20261009`.
Предыдущий полный runtime: `a454e7782d80d64cbe1499e6cee3e1e9465ce3db`.

## Что исправлено

1. **Unknown staff** — AiCore проверяет явного сотрудника по текущему catalog READ
   до service READ. Unknown/ambiguity запрашивает имя; failed/stale/malformed source
   объясняет недоступность каталога. Tenant/branch/source guards и повторная привязка
   preference сохранены. [Отдельный checkpoint](MAYA-UNKNOWN-STAFF-CHECKPOINT-20261009.md)
   содержит 5/5 actual target HTTP tests, включая реальный foreign-tenant synthetic
   provider: один current-tenant READ, ноль selectors, appointments и AE.
2. **Occupancy clarification** — существующий отказ от неподдерживаемого сценария
   явно говорит, что проверка не назначает скидки и не рассылает сообщения. Он не
   подтверждает свободное/занятое окно без источника и не принимает model claim об
   отправке. Ни нового READ, ни dispatch, ни другого orchestrator нет.
3. **Reschedule clarification** — для единственного allowed/ready
   `booking.reschedule_own` ответ повторяет допустимые дату и время как пожелание:
   «пятница, 20:00», с явным «возможность переноса ещё не проверена». Конечный словарь
   дней и строгие guards исключают произвольный текст, private references,
   malformed/unresolved значения. Missing appointment по-прежнему требует выбора.
   Нового слота, календарной даты, разрешения или выполнения это не создаёт.
4. **Public address/hours proof** — продукт уже отвечал верно. Fixture oracle
   ошибочно сравнивал actual CRM profile с другим branding snapshot. Test-only
   recorder теперь наблюдает возвращённый `getCompanyProfile` с привязкой к
   tenant/company/provider. Snapshot помечен как last-observed, не authority.
   Evaluator требует текущий квалифицированный `company.business-hours.read` для
   адреса вместе с часами. Address-only сохраняет canonical `catalog.staff.read.salon`
   и branding projection; отсутствие branch binding остаётся insufficient.
   Несуществующий `company.profile.read`, один snapshot, stale/failed/empty result
   и неверные значения PASS не дают. Новых provider calls и изменений gold нет.

Commits: `754ee4fe` (staff), `2756709a` (occupancy/reschedule), `ca24c904`
(observed public fixture), `6f76d475` (public owner evidence).

## Actual evidence и честный delta

[Все 81 фактических ответа](evidence/maya-offline-48-followup-20261009/ACTUAL-81-TURN-AUDIT.md),
[raw score](evidence/maya-offline-48-followup-20261009/full-http-r1/semantic-score.json),
[delta предыдущего прогона](evidence/maya-offline-48-followup-20261009/previous-delta.json).

| Статус | Исходный r2 | Предыдущий fixes r3 | Новый follow-up r1 |
| --- | ---: | ---: | ---: |
| pass | 41 | 45 | 49 |
| semantic_fail | 25 | 17 | 13 |
| unsupported | 9 | 10 | 10 |
| insufficient_evidence | 6 | 9 | 9 |
| critical failed / missing | 0 / 2 | 0 / 0 | 0 / 0 |

Все 45 предыдущих PASS сохранились. Четыре перехода FAIL→PASS: unknown staff,
admin address/hours, occupancy unsafe dispatch, reschedule turn 2. **Три — продуктовые
исправления; admin — исправление fixture/evaluator для уже корректного ответа.**
Исходные raw отчёты не переписаны и не пересчитаны. Снижение 25→13 не означает
двенадцать реализованных возможностей: прошлые limitation/insufficient переходы
остаются в [предыдущем checkpoint](MAYA-OFFLINE-48-FIXES-CHECKPOINT-20261009.md).

Локальные проверки: 44 booking component tests + 20 binding tests; 48 Occupancy;
15 mutation clarification; 15 public audit tests; 59 scripted/evaluator pure Node
tests. Target HTTP 5/5 PASS. Relevant TypeScript и narrow ESLint PASS. Первая scoped
types проверка test factory выявила nullable plan; исправление и исходный RED log
сохранены, runtime failure этим не заявляется.

Full broker: 46 dialogs / 77 model-eligible turns / 106 scripted responses;
reserved spend=0, credentialsLoaded=false, upstreamCalls=0. Это не фактическая
стоимость/качество real model. Все шесть owned process groups closed/absent,
broker closed, PG stopped, pid отсутствует, source hashes unchanged.

Архив [manifest](evidence/maya-offline-48-followup-20261009/manifest.json): 47 файлов,
6,477,235 bytes; SHA-256:
`3f73e474978d2f168ee78de1c7ca5f99fbff3117d397ed1b6edd6525fcd7d36a`.
Runtime manifest SHA-256:
`e83d412d10f9af17905403b4c685322a382fb62c1327ca449201ce1aebc99837`.
Raw HTTP report SHA-256:
`91b32f6d68345f9b2b7be0231fdd4f42977e8002d0ed540c28f58daf677cf105`.
Expectation descriptors SHA-256 остался:
`880c6c535512004d4005c762d14d3e4a68a95c13f6abf89b8e9f9035e32d2a1b`.

Независимое evidence review подтвердило все 2492 source hashes против runtime Git
и файлов, все 81 reply/history/audit bindings, неизменность corpus/dataset/expectations,
четыре перехода статуса и сохранение прежних PASS. Архивные копии сверены с raw run;
исходные отчёты сохранены. Для expected 401 начальный HTTP journal ещё не содержит
позднюю проверку history: score связан с финальным HTTP report/offline audit после
этой проверки, а не с байт-в-байт первоначальной journal entry. Cleanup подтверждён
отчётами, PG stop log и отсутствием pid-файла. Итог review: qualified no blocker.

## Оставшаяся работа

| Семья | Ходов | Конкретный незакрытый разрыв |
| --- | ---: | --- |
| Published BI | 1 | Запрос опубликованных показателей за октябрь идёт в live measurement. Existing latest-published C9 ingress не принимает exact month. Нельзя переименовывать live результат в published. Timestamp fragments также попадают в numeric guard; косметический текст не исправляет выбор источника. |
| Lifecycle rule | 1 | В ответе отсутствуют реальные параметры правила C8. |
| Financial scope/compare | 4 | Owner scope не объясняется; оба периода не прочитаны. CI завершает задачу по первому tool name, period hardening и signature dedupe не дают доказанную пару READ. |
| Retention follow-up | 4 | Script теряет regularity/ranking/cohort preferences. Existing C8 bounded review не выбирает эту когорту и не ранжирует её возврат. Safe next step — сохранить свежие условия и объяснить предел через existing clarification, без READ до отдельного согласия на bounded alternative. |
| Sasha/journal | 2 | Script выбирает roster вместо журнала «кто записан»; branch ambiguity остаётся. |
| Own reschedule, turn 1 | 1 | Script заменяет исходное намерение переноса на `booking.list_own`. Чтение собственных записей уже работает, но цель переноса в первом ответе не сохранена. |

Ещё 10 unsupported и 9 insufficient не являются acceptance функций. В частности,
branch-specific public address, расписание и employee-specific price требуют своих
source/binding доказательств. Этот checkpoint не изменяет привязки реальных филиалов.

## Предел доказательства

Независимое source review каждого нового изменения: qualified no blocker. Данные
синтетические, модель scripted. Нет live YCLIENTS, paid/model/production/HTTPS/phone,
React/UI или process/PG restart acceptance; нет push/merge. Новая background autonomy,
schema или retention policy не добавлена. Один C9 и существующие владельцы READ
сохранены; AE остаётся владельцем мутаций, presentation authority не выдаёт.
Полная MAYA и C10 не объявлены завершёнными.
