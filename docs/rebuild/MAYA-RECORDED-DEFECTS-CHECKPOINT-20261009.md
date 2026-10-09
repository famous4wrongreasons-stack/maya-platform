# Продолжение обзора и закрытые данные: локальный corrective checkpoint

**Два локальных HTTP replay прошли: 10 реплик, ноль новых model/CRM вызовов
и бизнес-изменений.** Runtime/source:
`76eefbd233eae860209f053a0da837e84c7e1f84`.
Исходный реальный прогон сохранён без изменений в
`e8a6001019074dbed4b7669a211c9b568bcd6c46`:
[его результат](MAYA-LOCAL-AB-EXECUTION-20261009.md).
Это обработка записанных ответов и отдельного синтетического продолжения,
не новая приёмка живой модели.

## Продолжение C9

Actual owner response 2 повторял старый `request`, `today` и clarification.
Сохранённый вопрос уже восстанавливался правильно; сигнала выбора нового
ограниченного объёма в ответе модели не было. Сервер не превращает эти bytes
в согласие и не удаляет исходные ограничения.

Existing scoped conversation reader теперь передаёт планировщику отдельную
минимальную проекцию ожидающего READ: canonical scope, question, task intents.
Она появляется только после проверки сохранённого server marker и текущих
роли/инструментов. Свежий `dialogue_act=accept_bounded_review` продолжает тот же
набор задач только без entities, clarification и unresolved references.
Согласие без pending marker, другой набор задач или копия прежнего плана не
запускают C9. Права и текущие источники повторно проверяет существующий C9.

При неразрешённом выборе ответ честно сообщает об этом вместо повторения
прежнего вопроса. Новые ограничения сохраняются даже при противоречивом
accept/decline от модели; они не исполняются. Отказ завершает старый контекст
через existing NULL semanticContext. Новая память, схема, retention,
approval authority, словарь согласий и второй orchestrator не добавлены.

## Причина HTTP 503 и исправление

Оба фактических ADMIN outputs выбирали разрешённый `support.integration_status`,
но оставляли `tool_call:null` без clarification. Exact local reproduction дал
`ai_core_required_tool_missing`, две fake transport попытки и затем HTTP-style
503 `ai_model_unavailable`. Исторический HTTP error body не был сохранён;
точная причина доказана отдельно локальным воспроизведением на этих bytes.

Existing ConversationIntelligence owner теперь уточняет только одиночный
allowed/ready integration READ с явным null tool и без результатов. Intent,
provider и permission сохранены; ложный запрет роли не создаётся. Ответ:
«Секреты подключения и личные контакты я не раскрываю. Могу проверить состояние
интеграции без этих данных. Проверить подключение?» Это один planner response,
без natural responder, C9 READ, CRM, контактов или секретов. Другие задачи,
compound plans, отсутствующий tool_call, недоступные инструменты и мутации
не получают этот shortcut. Универсальное распознавание приватных запросов
или качество будущей классификации модели этим не доказаны.

## Исполненное доказательство

180 различных targeted backend tests / 6 suites, 18 transport replay tests,
production и widgets-live types, scoped ESLint, 10/10 K3 — PASS.
Независимый static review нашёл потерю поправки и незакрытый decline context;
оба замечания исправлены и покрыты регрессиями до HTTP source freeze.
Сохранены исходные RED, промежуточные тестовые ошибки и lint OOM при 1024 MiB;
общий scoped lint при 3072 MiB завершён после исправления форматирования и
одного test typing assertion. Aggregate suite не запускалась.

| Replay на source `76eefbd2` | Доказанный результат |
| --- | --- |
| `actual-20261009` | 5 recorded responses с объявленной привязкой booking alias/date; owner остаётся unresolved без C9; ADMIN отвечает HTTP 201 без READ. |
| `synthetic-accept-20261009` | 4 recorded responses + 1 явно synthetic owner acceptance; один C9 response с точно совпадающими persisted run/revision 1, одним financial handle и двумя recommendation evidence. |

В обоих случаях — 5 HTTP 201. Шестая историческая ADMIN retry проверена отдельно
unit replay; она не выдаётся за шестой HTTP response. В synthetic C9 ответе
`current:false`: финансовая часть остаётся последним опубликованным историческим
снимком. Occupancy outcome AVAILABLE, `noSideEffects:true`,
`executionAuthority:false`. Не исполнялись booking COMMIT, текущий React,
отдельный процессный restart, живой YCLIENTS, voice или C10.

Первый sandbox attempt остановлен `listen EPERM` до запуска PG; остался только
source manifest. Два допущенных последовательных local runs остановили собственные
PG и broker. Отдельная OS-проверка подтвердила отсутствие broker PIDs, всех
записанных process groups и postmaster.pid. Sources unchanged в обоих reports.
Рабочий сайт, production, исходные transcripts, ключи и прошлый закрытый grant
не менялись; paid permit не создавался. Push/merge/deploy не выполнялись.

[Evidence](evidence/local-replay-defects-20261009/manifest.json),
[архивный HTTP](evidence/local-replay-defects-20261009/archived-http/http-report.json),
[synthetic C9 HTTP](evidence/local-replay-defects-20261009/synthetic-http/http-report.json),
[cleanup](evidence/local-replay-defects-20261009/cleanup.json).

Следующая отдельная подготовка: единый ограниченный разговорный batch с одним
вводом ключа, общим бюджетом и продолжением независимых диалогов после semantic
FAIL. Это не новое разрешение на платные вызовы и не обещание полного покрытия MAYA.
