# Разговорная MAYA: покрытие и следующий набор

**9 диалогов — smoke, а не полный разговорный прогон.** Подготовлен расширенный
представительный набор: **48 сценариев / 81 пользовательская реплика** из уже
существующих текстов. Это frozen proposal, не исполняемый профиль и не запрос
ключа. Текущие 9/18/$6/36 calls/30 min, их исходники, manifest и ожидаемое согласие
владельца не изменены. Работа находится в отдельной ветке от
`b74d62851de075a48f2c10bf5da48524c8ca0e47`; сеть и сервисы не запускались.

## Что есть в корпусе

[Пересчитанная карта](evidence/conversation-coverage-20261009/corpus-inventory.json)
содержит hashes и распределение по ролям: 32 domains во всём corpus,
30 в dev. Churn/loyalty не представлены в dev; test-примеры для заполнения этих
пробелов не переносились.

| Источник | Все строки / семейства | Development | Использование |
| --- | ---: | ---: | --- |
| `utterances.jsonl` | 11 352 / 946 | 1 116 строк / 93 семейства, 12 стилей | Отдельные намерения, опечатки, разговорные/краткие формы. 10 443 уникальных текста во всём файле. |
| `multi-turn.jsonl` | 1 050 / 175 | 96 диалогов / 16 семейств, 7 archetypes | Перенос контекста, исправления, неоднозначность, возврат темы, подтверждение/отмена. |
| `current-candidate-development-20261007.json` | 24 / 8 authored families | 33 реплики | Текущие доменные варианты и отрицательные условия fixture. |
| `adversarial.jsonl`, `contrastive.jsonl` | 600 + 600 строк | Все `test` | В новый development-набор не выбирались. |

Employee не входит в предложенные 48. Распределение по ролям — в карте.
Пересечения `family_id` между train/dev/test внутри двух основных файлов нет.
Все 1 116 dev labels имеют `ready`; историческая разметка **не доказывает текущую
доступность инструмента, источника или HTTP-сценария**.

## Frozen selection и карта сценариев

[Точные 48 cases](evidence/conversation-coverage-20261009/frozen-proposal.json):
source path, row SHA256, family refs, роль и неизменённые user turns для каждого.
Assistant gold, expected numbers и исходные готовые ответы не копировались.

| Пакет | Сценарии / реплики | Содержание и текущая исполнимость |
| --- | ---: | --- |
| Существующий union | 9 / 18 | Booking preview, явное compound BI+Occupancy, отказ в секретах, carry-over, correction, typo, topic return, general chat. Исполняется существующим core runner; dry proof — 17 HTTP201 + один намеренный skip. Нового live run нет. |
| Текущие доменные cases | 15 / 20 | Личные записи/пустой результат, чужой tenant, публичные сведения/каталог, price correction/чужой филиал, BI и отсутствие данных, Lifecycle/revocation, Occupancy/source drift/запрет рассылки, товар/вид цены. Есть отдельный current-candidate keyless adapter; в union эти IDs не зарегистрированы. |
| Dev multi-turn | 10 / 29 | Два новых carry-over, два finance follow-up, два retention drill-down, ambiguous staff, text confirmation, move→stop, другой topic return. Требуют finite fixtures и проверки наблюдаемых результатов. |
| Dev одиночные | 14 / 14 | 7 пар: цена услуги, адрес, integration status, прибыль, склад, объяснение термина, отзывы. Шесть typo/neutral пар и одна formal/short. Требуют fixture/assessment binding. |

Роли: **13 client / 12 admin / 23 owner**. Всего **33 source family refs**:
13 historical multi, 11 historical single, 8 current authored, 1 compound proof.
Это не 48 независимых примеров. Повторные варианты одной семьи считаются вместе;
smoke сохраняет известную смешанную lineage, включая прежний train-derived пример.
Все 24 дополнительно выбранные строки исходных JSONL — `dev`, не `test`.
В некоторых typo/neutral парах исходная роль также меняется: они не доказывают
изолированное влияние опечатки. Тексты и роли намеренно не переписаны.

Owner-покрытие опирается на C7/C8 и текущую CRM через один C9; корпус не даёт
доступа к контактам, спискам клиентов, прогнозам и мутациям. Например, retention
«кого вернуть» может требовать честного отказа/уточнения вместо списка клиентов.
Client text confirmation не считается widget approval или выполненной записью.
Admin finance/intents не получают owner-права из исторической разметки.

Полнота permissions, payroll/loyalty, payments/expenses, settings/notifications,
branch combinations, service/goods CRUD, voice/photo/carrier остаётся за пределами
48. Большой корпус содержит часть этих тем, но 48 cases не обещают 99% качества
или закрытие всей MAYA.

## Что действительно запускается и чего не хватает

1. **Core 9/18:** готовый закрытый runner/broker/admission; semantic FAIL сохраняет
   ответ, пропускает зависимые ходы и продолжает следующий независимый диалог.
   Transport/usage UNKNOWN, unsafe effect, non-201 и budget/revocation — STOP.
2. **Current-candidate 24/33:** отдельный существующий keyless HTTP runner по восьми
   группам. [Архивный full proof](MAYA-CURRENT-CANDIDATE-FULL-KEYLESS-CHECKPOINT-20261007.md)
   на `832c86c6` дал 32 HTTP201 и ожидаемый 401, 30 canned model responses и три
   zero-model хода. Это исполняемая synthetic механика, не live broker для 48 и
   не новая проверка на сегодняшнем HEAD. Старое поле корпуса `httpBinding:
   NOT_IMPLEMENTED_FOR_THIS_MANIFEST` описывает происхождение; adapter появился
   позднее и виден в `current-candidate-http.probe-spec.ts`.
3. **Расширенные 48 сейчас не запускаются одной командой.** Новый JSON лежит в
   docs/evidence, не подключён к registry. У core только A/B/union; старый current
   профиль ограничен 24 dialogs/64 turns, поэтому 48/81 туда не помещается.
   Нельзя просто передать другой файл или продолжить старый ledger.
4. **Конкретная недостающая работа:** перенести проверенные finite source recipes
   в существующий core probe для выбранных ID; привязать staff/service/branch/date,
   личные записи, C7/C8 версии, неоднозначных «Саш», store/review fixtures. Сейчас
   B-fixtures допускают узкие точные tuples; неизвестный tuple — UNKNOWN, а не
   выдуманная свободная запись. Не фабриковать C7 refs для live CRM.
5. Нужны ожидаемые исходы для *конкретных* отрицательных условий: revoked session
   должен остаться 401 без поддельного assistant reply; безопасный ожидаемый отказ
   нельзя потерять в общем non-201 STOP. Потребуется finite обработка такого case,
   а не разрешение продолжать после любого 503. Scope/date/staff исправления,
   compound evidence и отсутствие данных нужно оценивать по actual response и
   canonical facts, не только по неповторению предыдущей фразы.
6. Затем один новый фиксированный профиль, локальный dry proof и отдельное
   ограниченное согласие на расширение. Переиспользовать существующий broker,
   общий cap, actual-history replay, source pins и cleanup; нового eval platform
   или второго orchestrator не требуется. Ожидаемое согласие на 9 этого не заменяет.

**UNKNOWN — отдельная ось.** Corpus-фраза не создаёт transport loss или потерянный
ответ CRM. Имеются fake-transport usage checks, `replay-semantic.test.mjs` и
`provider-unknown.live-spec.ts`; последний проверяет отдельный synthetic action
path. Их controls перечислены рядом с selection, не добавлены к 48/81 и не дают
разрешения на COMMIT. Restart/receipt recovery также проверяются отдельно;
обычный follow-up не доказывает сохранение после реального restart.

## Цена: только арифметика двух прежних пилотов

Всего наблюдались **9 provider responses, 151 827 input + 2 801 output tokens**.
Архивные peak estimates: $0.06796372 за 3 и $0.118550696 за 6 ответов; это не invoice.
[Исходные расчёты](evidence/local-conversation-union-20261009/checks/cost-arithmetic.json).

| Возможные provider responses | Исторический cache mix | Те же tokens без cache hits | Reservation при максимальном body/output |
| ---: | ---: | ---: | ---: |
| 81: один ответ на ход | $1.68 | $1.90 | $11.61 |
| 98: наблюдавшееся 6/5 retry ratio, округлено | $2.03 | $2.30 | $14.04 |
| 162: иллюстрация двух попыток на ход | $3.36 | $3.81 | $23.21 |

Последняя колонка — консервативный reserve, не ожидаемый счёт. 162 — иллюстрация,
не выбранный лимит и не доказанный максимум model stages. Пилоты были короткими,
B и новые домены живой моделью не проверены; реальные prompts, retries, cache и
zero-model/skipped turns изменят итог. Перед любым новым платным scope нужны
тогдашние тарифы и отдельные bounds. Здесь тарифы заново не проверялись: сеть запрещена.
Ни $6/36 текущего smoke, ни его разрешение не расширены.

## Коротко о Keychain и двух исправлениях

**Keychain:** предлагается отдельная local login generic-password запись:
service `ru.mayaos.dev.local-model.deepseek.v1`, account `local-owner-<uid>`, без sync.
Отдельный явный enrollment; после admission broker получает ключ один раз в RAM,
без argv/env/log/file и передачи runner. При lock/denial — STOP без fallback.
Удаление записи не стирает уже выданный ключ из RAM: сначала stop, при необходимости
provider revoke. ACL общего Node/helper не гарантирует broker-only для того же UID;
строгая изоляция требует собственной проверяемой code identity. Это
[readonly proposal](MAYA-LOCAL-KEYCHAIN-PROPOSAL-20261009.md), доступа к Keychain не было.

**Owner повторял вопрос:** scoped history уже восстанавливался. Реальная модель
на «Да, такой ограниченный обзор» снова вернула прежние `dialogue_act=request`,
`today` и `requires_clarification:true`; свежего выбора предложенного READ scope
в output не было. Сервер не мог считать это согласием. Исправление передаёт
минимальный server-owned `pending_owner_review` и требует свежий
`accept_bounded_review` с тем же набором задач и без новых entities/clarification;
неразрешённый ответ, correction и decline обрабатываются отдельно. Никакого
словаря «да» или обхода C9 authority. Живое понимание после исправления не проверено.

**ADMIN 503:** обе записанные model попытки выбрали разрешённый
`support.integration_status`, но `tool_call:null` без clarification. Validator
требовал READ, выдавал `ai_core_required_tool_missing`; после двух попыток —
`ai_model_unavailable`/503. Эти сохранённые outputs локально
воспроизводят именно этот путь отказа; исторический error body не был записан.
Existing policy owner
теперь для этого одиночного allowed/ready null-tool плана возвращает отказ раскрывать
секреты и вопрос о проверке подключения, без CRM READ и повторного model stage.
[Код и доказательство обоих исправлений](MAYA-RECORDED-DEFECTS-CHECKPOINT-20261009.md).
