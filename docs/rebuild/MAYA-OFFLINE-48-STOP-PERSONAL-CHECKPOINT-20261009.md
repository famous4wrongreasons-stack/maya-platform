# Offline 48: STOP и собственные записи — отдельный checkpoint

Полезный результат: явное «Стоп, ничего не меняй» завершает подготовку в
сохранённом контексте до модели, инструментов и карточек. Поздний ответ старого
запроса не восстанавливает прежний план на следующем ходе. Законная собственная
запись без филиала теперь показывается в подтверждённом текущем часовом поясе
салона с явным указанием, что филиал неизвестен.

Это локальное исправление поверх `49ef3132ca5e9d36fe9a128858a3873b39283eb6`.
Исходные 81 ответ, отчёты r1/r2 и oracle прежнего checkpoint не изменены.
Это не закрытие 25 semantic_fail и не приёмка всей MAYA/C10.

## Изменение пользовательского пути

- STOP — конечный явно заданный набор команд прекращения подготовки. «Отмени мою
  запись» не подменяется STOP. Существующий владелец разговора проверяет actor /
  tenant / conversation; затем записывается обычный ответ с null semantic context.
- Timeline сохраняет immutable completion и их hash как раньше. Контекст выбирается
  по порядку parent user turns, с последней версией каждого parent. Invalid lineage,
  erased/expired/foreign rows остаются барьерами. Окно по-прежнему не более восьми
  completions. Если late revisions вытеснили более новый STOP, старый parent раньше
  края полного окна не восстанавливается. Это может консервативно потребовать новое
  уточнение; расширения поиска и нового memory store нет. Gate9 selection turns не
  переклассифицируются.
- B26 читает tenant defaultTimezone в существующей READ ONLY / RepeatableRead
  транзакции после текущей membership / verified Client-link проверки. Только
  `branchId === null && branch === null` получает `timezone_source=tenant_default`.
  Чужой, отсутствующий или несовпадающий branch не получает этот fallback. Валидный
  branch timezone имеет приоритет. Исходный instant не изменён.
- Личные факты собираются сервером. Повторного модельного вызова с визитами нет.
  Tenant timezone — текущий пояс отображения, не выдуманный филиал и не утверждение
  об исходном provider calendar.

## Доказательства

[Архив и SHA-256 manifest](evidence/maya-offline-48-stop-personal-20261009/manifest.json):
35 файлов, manifest SHA-256
`69025cf9bb35d749815e367d57759fb7410666ade82de1cd710c92b4447d8cc2`.
В manifest HTTP r2 записаны исходный HEAD и hash каждого изменённого runtime/probe
файла; runtime проходил по working-tree delta, содержащемуся в checkpoint.

- 33 целевых AiCore теста: STOP и server-composed personal reply.
- 41 тест timeline/context: parent ordering, null/invalid barriers, bounded overflow.
- 20 тестов B26 / handler / formatter, включая foreign identity, invalid timezone,
  branchless provenance и отсутствие экспорта личных данных.
- 49 архитектурных тестов B26 и Gate9.
- Build и widgets-live TypeScript checks — PASS; narrow ESLint — PASS после исправления
  test-only matcher typing. Предыдущий lint failure также сохранён.
- [HTTP r2](evidence/maya-offline-48-stop-personal-20261009/http/r2/manifest.json):
  3/3 PASS; [полные фактические ответы](evidence/maya-offline-48-stop-personal-20261009/http/r2/actual-responses.json).
  Старый запрос → STOP → поздний completion → fresh login → следующий ход:
  restoredPlan=null, actionExecution=0. CLIENT и TENANT_OWNER видят только свою
  branchless запись в 16:00 Asia/Novosibirsk, не чужую в 17:00.
- После canonical ClientChannelLinkService.revoke с synthetic verifier следующий
  actual chat отвечает HTTP 201 safe_fallback, grounding blocked / C9 INCOMPLETE,
  без личного времени. Это не HTTP 403 и не проверка внешнего verification issuer.
- Appointment rows до/после совпадают, actionExecution=0, intercepted fetch=0.
  Это измеренный периметр этих сценариев. Owned PG stopped, postmaster.pid absent,
  selected source hashes unchanged.

Первый [HTTP r1](evidence/maya-offline-48-stop-personal-20261009/http/r1/manifest.json)
сохранён: STOP прошёл; два personal теста дошли до верного ответа, затем упали на
некорректном fixture update revokedAt без revocation evidence. Повтор использует
существующего владельца revocation, а не обход CHECK. Это fixture failure, не
исправление production constraint.

Независимое source/evidence review подтвердило устранение late-context resurrection
и совпадение пяти source hashes r2; новых blockers в этом ограниченном diff нет.

## Границы и оставшаяся работа

- STOP не отзывает уже выданные live approvals и не отменяет уже выполняющийся AE.
  Старый in-flight HTTP-запрос всё ещё может вернуть прежнее уточнение; скрытие такого
  позднего ответа в UI не проверялось. Доказано прекращение server context recovery.
- Переданная клиентом полная история сообщений не очищается этим изменением.
- Нет process/PG restart, React/UI, реальной модели, YCLIENTS, production, phone,
  уведомлений, платных вызовов, push или merge. Рабочий сайт и frozen9/handoff не менялись.
- Следующая неделя для own list, полноценный reschedule follow-up, lifecycle rule
  explanation, retention cohorts и остальные семьи из
  [классификации 25 сбоев](MAYA-OFFLINE-48-FAILURE-ROOT-CAUSES-20261009.md)
  не объявлены исправленными этим checkpoint.
- Scripted schedule/catalog, exact period comparison и source-grounded final replies,
  а также STOP/new_time evaluator regressions подготовляются отдельно; их результат
  должен подтверждаться новым HTTP-отчётом, не переоценкой исходных 81 ответов.
