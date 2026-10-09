# Исполняемый профиль B и единый план повторной проверки

**B реализован и прошёл локальную проверку механики: 6 диалогов / 13 HTTP 201,
10 canned outputs, 3 ZERO_MODEL. Внешних model/YCLIENTS calls — 0.**
Источники прошли отдельный preflight; понимание языка и вызов доменов из диалога
этим прогоном не доказаны. У general-chat администратора обнаружен конкретный
отказ до модели, который остаётся открытым продуктовым дефектом.

Этот checkpoint заменяет только прежнее утверждение «B ещё не реализован» из
[подготовки A/B](MAYA-MODEL-USAGE-AND-RETEST-PREPARATION-20261009.md).
Исторические paid evidence, потраченный permit/claim и frozen A не изменялись.

## Код и точные кандидаты

| Назначение | Зафиксированная версия |
| --- | --- |
| A, без изменений | `0d90de11710e7212286a7e74755c8a12b55d116b` |
| Основная реализация B | `e45231a890fb505c651756457ea59b34f4ae6412` |
| Исправление finite Jest transform и проверенный B | `a80e6c4d5218704b29d2b25bd75b1bacb419c053` |

A: branch `codex/maya-retest-candidate-20261009`, отдельный checkout
`/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-retest-candidate-a`.
B: branch `codex/maya-retest-candidate-b-20261009`, отдельный checkout
`/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-retest-candidate-b`.
Оба source checkout подготовлены; зависимости подключены существующей read-only
ссылкой. Документационный HEAD рабочей ветки не подменяет эти кандидаты.

Добавлен один закрытый профиль `core-followup-20261009/1` в существующие
budget, source, admission, runner, broker и local preparation. A остаётся default.
Ни нового orchestrator, ни второй системы авторизации, ни нового runtime feature
здесь нет. Recorded replay с captured outputs по-прежнему доступен только A/dry.
Расширен только конечный timeout B в существующем supervisor; cleanup не изменён.

B dataset: `maya-saas-backend/datasets/conversation-intelligence/core-followup-executable-20261009.json`.
SHA256: `0b22fbe04687028e59b0a5a3f4bf7395791fa52a88a9c3a342dd193aa6b8e2ca`.
Cases SHA256: `53e272080750736a157374723a0172de320a350ea4ff634496537b578603db71`.
Это ровно первые шесть frozen cases с добавленным `group`, без новых user turns
или assistant gold. Исторические metadata сохранены отдельно; действующий history
contract точно различает actual HTTP replies и user-only model input с серверным
semantic continuation из encrypted storage.

## Что проверено локально

- 65 pure Node tests: budget/profile/source/admission, включая 24 reservations,
  границы $4 / 20 минут, UNKNOWN без возврата резерва, halt, single-flight,
  повторное открытие ledger, подмену профиля/корпуса/source/permit и expiry.
  Admission tests используют синтетические истёкшие данные, не новое разрешение.
- 15 pure CLI/cleanup tests; TypeScript widgets-live и ESLint двух fixture files — PASS.
  Finite transform отдельно принимает profile helper и отклоняет неизвестный модуль.
- Owned HTTP/PG `-c`: Jest 1/1, все 13 ходов HTTP 201; реальные auth, policy,
  HTTP history и model serializer. Шесть отдельных стабильных conversations.
  Actual prior replies совпали с предыдущими HTTP replies, gold отсутствует.
- Елена/Никита и единая услуга «комплекс стрижка и борода»; today read и завтра;
  Максим завтра в 19:30 проверены через существующий INTERNAL availability reader.
- «основной филиал», Артём завтра 10:00–20:00 — через `staff.schedule.read`;
  C7 опубликован своим владельцем с фактическим периодом и tenant-wide scope.
  Compound имеет отдельную текущую Opportunity через существующий lifecycle.
  Topic-switch имеет C7/schedule и ноль Opportunities.
- B synthetic external availability отклоняет чужой tenant/branch, неизвестного
  или отсутствующего staff/service, неподдержанную дату/timezone. Девять негативных
  проверок не дают тестовому источнику фабриковать окно по ошибочному запросу.
- Все 13 business hashes неизменны, business writes пусты; upstream 0,
  forbidden effects пусты. Fixture setup происходил до измерения чат-ходов.

HTTP manifest SHA256:
`9107ab4f71c19109aef1c8d58a2878bc568d55e2ad9e0394b329ff9ec0ab18be`.
Независимый review сверил 2446 source hashes с файлами и Git blobs exact B,
app/broker журналы, actual history, бюджеты и отсутствие domain effects.
Максимальный запрос — 93 540 < 98 304 байт, минимальный dispatch interval — 6026 ms.
Резерв $1.15071924 — bookkeeping synthetic transport, **не реальное списание**.

Первый launcher `-a` не нашёл Node в вручную ограниченном PATH и не запустил runner.
`-b` дошёл до PG, но завершился до тестов: finite Jest transform не содержал новый
profile helper. Оба исходных failure log сохранены; `-c` проверяет исправленный SHA.
По прямой OS-проверке все 12 process groups двух PG-прогонов и оба broker отсутствуют,
PG остановлены, postmaster pidfiles отсутствуют. Новых permit/claim/key prompts нет.

## Известная граница и открытый дефект

Все десять canned outputs — заданные уточнения. В самих 13 chat turns
`sourceReads=[]`, `coordination=null`: preflight подтверждает доступность источников,
но не прохождение booking/C9 по этим репликам. Это не real-model, C10, React,
restart, full booking или branch analytics acceptance.

Три реплики `followup-admin-general-chat` дают `safe_fallback`,
`grounding.status=blocked`, domain `business_query`, ZERO_MODEL: «Этот запрос
недоступен для вашей текущей роли или тарифа…». Это наблюдаемый дефект обработки
обычного разговора при текущей роли ADMINISTRATOR, не успешное языковое покрытие.
Статический путь отказа — `AiCoreService.groundingRequirement` и финансовый
guard при отсутствии analytics tool; это не повод повышать роль/тариф fixture.
Он сохранён для отдельного исправления; новые runtime features в этот slice
не добавлялись. B остаётся запускаемой диагностикой, не обещанием 13 model answers.

## Один план A → B для следующего разрешённого запуска

| Этап | Диалоги / ходы | Attempts | Spend cap | Максимальное окно |
| --- | ---: | ---: | ---: | ---: |
| A, exact SHA выше | 3 / 5 | 12 | $2 | 10 минут |
| B, exact SHA выше | 6 / 13 | 24 | $4 | 20 минут |
| Предлагаемый общий объём | 9 / 18 | 36 | $6 | Два последовательных окна |

**Общий cap $6 ещё не разрешён.** Два существующих конечных профиля требуют
двух свежих, точно связанных permits; единого нового shared-budget framework нет.
При блокирующем A не продолжать B молча. Планирование, final rendering и retry
занимают отдельные attempts. UNKNOWN/timeout/malformed/non-2xx сохраняются и
останавливают batch без автоматического повторного dispatch или refund.

Оба этапа: concurrency 1, dispatch interval ≥6 секунд, request timeout 30 секунд,
request ≤98 304 bytes, response ≤1 MiB, output ≤2048 tokens/attempt. Полный местный
upper reservation A+B — $5.15801088 по сохранённым conservative rates; это не
доказанный billing maximum. Cap/TTL не гарантируют завершения всех ходов, и cleanup
может закончиться после окна допуска. PG/Jest выполняются последовательно:
один worker, heap ≤3072 MiB, broker ≤256 MiB, PG 64/4 MiB, 30 connections.

Data: только эти frozen development utterances, синтетические tenants/actors,
каталоги/расписания/finance/Opportunity и разрешённый обезличенный серверный контекст.
App ingress — локальный `/api/ai/chat`. Единственный будущий внешний model endpoint
— `https://api.deepseek.com/chat/completions`, model `deepseek-v4-pro`. Реальный
YCLIENTS, production, website, outbound, warehouse/design и SSH не входят в план.
Свежую цену и допустимость данных проверить перед будущим admission.

Оба checkout успешно выполнили **только dry `--prepare`**:
[A manifest](evidence/model-followup-b-ready-20261009/ready-a-dry-manifest.json)
SHA `e7fd32e742a66128dfdcb1ff73a7dcb2b1fcfeeb4a1ba779dd18b7c88ce0594e`,
[B manifest](evidence/model-followup-b-ready-20261009/ready-b-dry-manifest.json)
SHA `694f223449af98962d663e662fa876bcdce11bd44cf8729eeae4759aa7c0ca48`.
Это source readiness, не paid authority; DRY_HTTP manifest не переделывается в live.

Минимальный handoff: root в подходящее время сообщает этот scope, два exact SHA,
data/endpoint, caps и известный Admin defect; получает одно явное разрешение на
два этапа. Затем из соответствующего backend checkout делает свежий
`core-local-prepare.mjs --prepare --output <new canonical private root>`;
для B добавляет `--profile core-followup-20261009/1`. Existing preparation выдаёт
точные broker/runner argv и новый manifest. Root связывает свежие permits с этим
manifest, проверенной ценой и разрешением; только после этого допустим существующий
защищённый локальный ввод владельцем в broker. Ключ не передаётся в чат/env/файл.
Старый paid grant, permit и claim не переиспользуются. Ночью ничего из этого не
запускалось и у пользователя не запрашивалось.

[Evidence manifest](evidence/model-followup-b-ready-20261009/manifest.json) включает
неизменённые failed/passed runs, тесты, source manifests, OS cleanup и review.
46 файлов / 1 654 747 bytes; manifest SHA256:
`47b156cbdcf888fdbe211bad6aff6cedd66652c95566ff9710cd3b18c41d1542`.
