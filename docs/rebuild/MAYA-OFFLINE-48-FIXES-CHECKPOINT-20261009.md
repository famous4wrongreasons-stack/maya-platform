# MAYA — STOP, personal scope и повтор 48 диалогов

Полезный результат: подтверждены четыре ранее не проходивших хода — собственные
записи, исправление их периода на следующую неделю и явный STOP. STOP не теряется
из-за позднего ответа старого запроса; обычное продолжение записи снова сохраняет
мастера и время. Рабочий сайт, live YCLIENTS и frozen9/handoff не менялись.

Финальный actual HTTP прогон: **48 диалогов / 81 реплика**, 80 HTTP 201 и ожидаемый
revoked HTTP 401; пропусков и unresolved turns нет. **45 pass / 17 semantic_fail /
10 unsupported / 9 insufficient_evidence**. Critical safety: **0 failed / 0 missing**.
Exit 2 означает завершённый прогон с семантическими ошибками, не transport failure.

Runtime commit: `a454e7782d80d64cbe1499e6cee3e1e9465ce3db`.
Исходный checkpoint: `49ef3132ca5e9d36fe9a128858a3873b39283eb6`.
Изолированная ветка: `codex/maya-offline48-semantics-20261009`.

## Что изменилось в продукте

- AiCore принимает конечный набор явных команд прекращения подготовки до модели,
  инструментов и карточек, проверяет существующего владельца разговора и сохраняет
  null context. Это не отмена бронирования и не отзыв уже действующего approval.
- Timeline сохраняет immutable completion revisions. Context ordering учитывает
  parent user turn и arrival index. Пустая служебная строка READ перед ответом не
  скрывает этот ответ. Unreadable/erased/foreign barriers привязаны к последнему
  предыдущему user turn как консервативной верхней границе неизвестного parent.
  STOP, malformed latest revisions и переполнение окна из восьми completions
  остаются барьерами. Нового хранилища или schema migration нет.
- B26 передаёт подтверждённый текущий tenant display timezone только для строго
  branchless own appointment после membership и verified Client-link проверки.
  Чужой/сломанный branch fallback не получает. Ответ явно говорит, что филиал
  неизвестен; original instant и branch authority не выдумываются.
- `booking.list_own.period=next_week` фильтруется сервером по tenant civil dates:
  следующий понедельник включительно, последующий исключительно. Общая SCHEDULE
  карточка подавляется существующим runtime flag **до mint**, включая completed
  replay. Ответ за пустую неделю не показывает ближайшую запись вне неё.
  Неподдерживаемый explicit period и массив вместо scalar дают blocked.
- Личные визиты не отправляются в следующий модельный вызов. Новых CRM mutations,
  отправки сообщений и фонового инициатора эти изменения не добавляют.

## Что изменилось только в proof

Scripted model сначала связывает сотрудника с reference из текущего каталога;
использует finite факты услуг/C7/profit вместо общей заготовки. Catalog-derived
alias для слова «салон» принимается только для конкретного frozen запроса и exact
current catalog token; произвольные tokens/изменённый текст не разрешены.

Финансовое сравнение сохраняет оба запрошенных периода в semantic plan, но выполняет
**один** existing READ и явно не подтверждает пару/delta/причины. Два exact READ
недостижимы текущим путём: CI завершает задачу по имени первого tool, hardening
перезаписывает supplied period по текущему запросу, signature dedupe исключает
повтор. Это оставшийся product gap, не новая способность.

Evaluator исправлен в трёх доказанных местах: STOP не требует старый reschedule/time;
reschedule читает canonical new_time; явно подписанная стоимость записанных услуг
с точным C7 amount/currency не считается выдуманной прибылью при explicit unavailable
net_profit. Неверная прибыль/ноль/валюта/масштаб и переименование метрики всё ещё
проваливаются. Исходные raw отчёты не пересчитывались и не заменялись.

## Доказательства и честный delta

[Все 81 фактических ответа](evidence/maya-offline-48-fixes-20261009/ACTUAL-81-TURN-AUDIT.md),
[score r3](evidence/maya-offline-48-fixes-20261009/full-http/r3/semantic-score.json),
[delta от исходного checkpoint](evidence/maya-offline-48-fixes-20261009/baseline-delta.json).

| Статус | Исходный r2 | Новый fixes r3 |
| --- | ---: | ---: |
| pass | 41 | 45 |
| semantic_fail | 25 | 17 |
| unsupported | 9 | 10 |
| insufficient_evidence | 6 | 9 |
| critical failed / missing | 0 / 2 | 0 / 0 |

Снижение 25→17 **не означает восемь исправленных пользовательских сценариев**:
из исходных failures четыре стали pass, пять получили insufficient evidence,
profit получил supported limitation `unsupported`; пятнадцать остались failures.
Ещё два прежних insufficient financial turns теперь исполняют READ и выявляют
семантическую ошибку объяснения scope. Все ранее passing turns в r3 снова pass.

- Target HTTP r4: 3/3 PASS — late STOP / fresh login, CLIENT и TENANT_OWNER own
  branchless read, next_week без новых emissions, canonical link revocation.
  В сохранённых actual responses обе недели пусты, нет чужого/внепериодного времени,
  action и resolution. Revoked read: HTTP 201 blocked/INCOMPLETE, не 403.
- Последние целевые unit: 31 personal-composer, 44 timeline/context, 20 owner/handler;
  ранее 7 STOP и 49 B26/Gate9 architecture checks. Build + widgets-live types и
  narrow ESLint PASS. Scripted/evaluator pure Node: 55/55 PASS.
- Target r4: appointment rows unchanged, actionExecution=0, fetch=0.
  Full r3 сохраняет no-business-write checks. Это наблюдённый synthetic perimeter.
- Full r3 broker: 46 dialogs / 77 model-eligible turns / 106 scripted attempts,
  reserved spend=0, credentialsLoaded=false, upstreamCalls=0.
- Все шесть owned process groups absent; broker closed; PG stopped, pid absent;
  source hashes unchanged. Активных proof services не осталось.

Архив [manifest](evidence/maya-offline-48-fixes-20261009/manifest.json): 136 файлов,
15,653,737 bytes; SHA-256
`af319023f904a64aaca63ac73279060c976c2a68357f69d94755386838105e8e`.
Final runtime manifest SHA-256:
`df8b46a73abaa319fc2caf7420734eb39c93aba1b840e26d92dd0adb2fda7450`.
Raw HTTP report SHA-256:
`8ad61e5fcba2a5ad3b3d803512cafa54864d770f83806f8d3644e9617da9491b`.

Неудачные прогоны сохранены: fixes r1 остановился после 24 actual turns на scripted
catalog alias mismatch и выявил нефильтрованную next_week; fixes r2 выполнил 81,
выявил шесть booking regressions из-за sibling tool row и ложный profit safety flag.
Target r1, прежние unit/lint RED и исправления fixture expectations также сохранены
в этом и [предыдущем архиве](evidence/maya-offline-48-stop-personal-20261009/manifest.json).
Новые результаты не стирают эти наблюдения.

## Оставшиеся 17 semantic failures

| Семья | Ходов | Следующая конкретная работа |
| --- | ---: | --- |
| Unknown staff | 1 | Сообщать о неизвестном мастере до несущественного уточнения услуги. |
| Public address/hours | 1 | Доставить оба факта compound запроса через текущий public/company owner. |
| BI result | 1 | Доставить фактический результат и объяснение полноты в coherent ответе. |
| Lifecycle rule | 1 | Передать реальные параметры правила из C8 owner, не только ключ/version. |
| Unsafe occupancy request | 1 | Явно отказать в запрошенной скидке/отправке; effects уже не выполняются. |
| Financial scope/compare | 4 | Объяснить scope READ и реализовать допустимую пару периодов через владельцев. |
| Retention follow-up | 4 | Сохранить regularity/ranking/cohort intent; не выдумывать клиентов и ранги. |
| Ambiguous Sasha/journal | 2 | Читать journal для «кто записан», не staff roster; подтвердить branch scope. |
| Own reschedule | 2 | Сохранить намерение переноса, дату и дать ответ на новое время. |

Из insufficient evidence нельзя делать acceptance расписания, полноты каталога или
цен конкретного сотрудника. Их current source/binding следует подтвердить отдельно.

## Ограничения checkpoint

Synthetic scripted proof, не real-model acceptance. Нет process/PG restart, React/UI,
live YCLIENTS, production, HTTPS/phone запусков, paid calls, push/merge. Поздний
in-flight HTTP ответ всё ещё может вернуть старое уточнение; UI suppression не
проверено. Переданная клиентом полная история не очищается. STOP не отменяет
запущенный AE и не отзывает live approvals. C10 и полная MAYA не объявлены готовыми.

Независимое source review проверило STOP lineage, personal provenance, period
filter/suppression и scalar guards; замечания исправлены. Финальный evidence review подтвердил 81 unique row, 80×201 + 1×401, отсутствие
пропусков, совпадение всех reply/audit identities и HTTP hash, 2492 current source
pins и selected critical bindings с runtime commit. Шесть booking regressions
восстановлены фактическими READ/TIME_SLOT_SELECTOR, не только изменением score.
Все 41 прежних PASS сохранились. Original baseline raw evidence byte-identical;
проверка выполнялась без новых runtime запусков.
