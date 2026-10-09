# Сверка расхода и подготовка повторной проверки Майи

**Три сохранённых ответа дают 49 674 prompt / 1 017 completion tokens.
Воспроизведённая оценка расхода — $0.03398186 off-peak; billing не проверен.
$0.33911196 — резерв, не списание. Новых provider requests — 0.**

Candidate зафиксирован отдельной Git branch
`codex/maya-retest-candidate-20261009` на
`0d90de11710e7212286a7e74755c8a12b55d116b`. Подготовка документов дальше не
передвигает эту branch. Разрешение, permit, claim и запрос ключа не создавались.

## Сверка сохранённого usage

[Machine-readable reconciliation](evidence/model-retest-preparation-20261009/usage-reconciliation.json)
содержит hashes трёх outputs и проверяет суммы против неизменённого
[исходного outcome](evidence/local-actual-model-20261008/terminal-outcome.json).
[Сами три ответа provider](evidence/local-actual-model-20261008/broker/model-responses.jsonl)
сохранены полностью: это structured semantic plans/tool selections, не готовые
человеческие фразы. Ответы пользователю составляло приложение.

| Ответ provider | Prompt | Cache hit | Cache miss | Completion | Оценка off-peak, USD |
| --- | ---: | ---: | ---: | ---: | ---: |
| Client: поиск времени | 14 504 | 0 | 14 504 | 321 | 0.01020822 |
| Client: «Запиши меня на 17:00» | 14 746 | 640 | 14 106 | 326 | 0.00996952 |
| Owner: обзор + окна + следующий шаг | 20 424 | 640 | 19 784 | 370 | 0.01380412 |
| **Итого** | **49 674** | **1 280** | **48 394** | **1 017** | **0.03398186** |

Все три HTTP 200; total tokens — **50 691**. Для каждой строки
`cache hit + cache miss = prompt`, `prompt + completion = total`.
Четвёртый запрос 99 820 > 98 304 байт остановился до provider, usage для него
нет. Два synthetic continuation из нового локального replay сюда не включены.

Расчёт воспроизводит сохранённую тарифную модель: peak cache-miss $1.32/M,
cache-hit $0.044/M, output $3.96/M; off-peak — половина. Peak результат —
**$0.06796372**. Формула: `(48 394 × 1.32 + 1 280 × 0.044 + 1 017 × 3.96) / 1M`,
затем × 0.5 для off-peak. Расчёт выполнен в целых nanoUSD, без округления tokens.

Последняя проверка официальной цены в предыдущем запуске была
2026-10-08 23:02:42 UTC. Архивный `pricing-observation.json` явно содержит
peak miss/output rates; cache-hit rate и off-peak multiplier в этом компактном
snapshot отдельно не записаны. Здесь они воспроизводят прежнюю recorded estimate,
а не выдаются за новую независимую проверку тарифов. По двум явно сохранённым
peak rates, без cache savings, консервативная оценка usage — **$0.069597**.
Billing, баланс, invoice и новое pricing API не запрашивались.

## Что произошло в разговоре

Первый реальный ответ модели распознал поиск времени; приложение показало выбор.
Второй распознал точные 17:00 и намерение записаться. Но код приложения после
успешной проверки доступности всегда возвращал один общий текст «Выберите время».
Поэтому Майя повторяла вопрос, хотя время уже было понято. Исправлена именно эта
ветка: свежий подтверждённый вариант теперь признаётся выбранным; для записи
сохраняется обычная проверка деталей и подтверждение, автоматического COMMIT нет.

Третий ответ модели выделил обзор, окна и рекомендацию. Приложение корректно
уточнило допустимость ограниченного обзора, но следующий запрос оказался слишком
большим. Повторяющиеся полные schema properties теперь упакованы без потери
инструментов или прав: новый actual HTTP body — 96 092 байта. В offline replay
owner confirmation дал единый ответ и сохранённую C9 revision 1 с evidence.
Его model continuation был явно synthetic: это ещё не новый ответ живой модели.

| Зафиксированная точка | Полный SHA |
| --- | --- |
| Исходный actual-model candidate | `5cc0b7178ccdbf3d6cdb50be5de3f3cd7a43dbf5` |
| Неизменённый actual fail / usage archive | `856323e7f643dc596a77f5354eaeec03ba18655d` |
| Runtime corrective code | `8d9f30c4b03af10be5b324eb078f9200fb546290` |
| Исправленный HTTP oracle, tested candidate | `b9665758ffe0c8748d30f8847d648b6ee11b1763` |
| Полный corrective evidence и frozen retest A candidate | `0d90de11710e7212286a7e74755c8a12b55d116b` |

[Corrective checkpoint](MAYA-MODEL-CORRECTIVE-CHECKPOINT-20261009.md) содержит
422 targeted tests, 10 replay tests, 5 HTTP 201, независимый review и cleanup.
Его evidence manifest SHA256:
`2ef30348e504aa0d487d3817a2b25141f9b8a6e72bdcf73be58551ed51544c2d`.

## Предлагаемый bounded retest

Подготовлены [точные cases, hashes, fixture gaps и proposed limits](evidence/model-retest-preparation-20261009/retest-plan.json).
Это **два последовательных этапа**, не включённый расширенный профиль.

| Этап | Объём | Attempts / spend cap / время | Верхняя reservation estimate | Готовность |
| --- | --- | --- | --- | --- |
| A: те же Client / Owner / Administrator | 3 диалога / 5 ходов | 12 / $2 / 10 минут | $1.71933696 | Existing executable profile, **не разрешён к запуску** |
| B: первые шесть priority follow-ups | 6 / 13 | 24 / $4 / 20 минут | $3.43867392 | **Профиль и finite fixtures ещё не реализованы** |
| Общий предлагаемый объём | 9 / 18 | 36 / $6 / 30 минут | $5.15801088 | Не является существующим одним shared profile |

В обоих этапах предложено сохранить один concurrent request, ≥6 секунд между
dispatch, timeout 30 секунд, 98 304 request bytes / 1 MiB response, ≤2 048 output
tokens за attempt. Формула upper reservation: `attempts × ((98 304 + 4 096)
× 1 320 + 2 048 × 3 960) nanoUSD`. Это местный body+framing reservation, не
tokenizer measurement и не доказанный provider billing maximum. Скидки и cache
savings в верхнюю оценку не включены. Свежую цену нужно проверить перед будущим
admission; сейчас внешних чтений не было.

36 полных timeout + 35 интервалов дают 1 290 секунд (21 минута 30 секунд),
без setup/PG/serialization/cleanup. Планирование, финальный ответ и retry занимают
отдельные attempts. Ни cap, ни время не гарантируют завершение всех ходов;
UNKNOWN/ошибка сохраняется и останавливает batch без автоматического повтора.
Неуспешный A нельзя молча обойти запуском B.

B точно повторяет первые шесть приоритетов существующего frozen batch:
carry-over даты/мастера (3), correction мастера и 19:30 (2), опечатка/неоднозначный
период (1), смена темы/возврат (3), compound обзор (1), general chat (3).
Новые реплики и gold assistant replies не генерировались.
Frozen batch SHA256: `926578b841249c06d8e63ae117c6e651aefca7e39565b3e2fb73bf086cbb817c`.
Отбор — конкретное предложение root для review по прежнему priority list;
полные 12 follow-up cases не объявляются включёнными или пройденными.

Оставшиеся text-confirmation, foreign-tenant и revoked-authority cases нужны как
механические safety controls перед положительными claims о booking authority;
revocation может законно остановиться до модели. Move→stop, cancel и ambiguous
staff остаются отдельным продолжением с точными fixture bindings. Если цель —
полный booking dialogue, text-confirmation надо добавить и в language batch:
тогда B становится 7 диалогов / 16 ходов и требует отдельного re-freeze.

## Точная readiness и следующий handoff

- **A:** исходный код и finite 3/5 runner существуют, исправления локально
  проверены. Dry `--prepare` выполнен только для source inventory, без процессов
  broker/PG/model. [Manifest](evidence/model-retest-preparation-20261009/candidate-source-manifest.json)
  SHA256 `9835ff59f46e3458a74aab49199de7604de85e1a344fe84d96e35bf8be36c857`.
  Его mode — DRY_HTTP; это не future paid manifest и не grant. Нужны новое точное
  разрешение владельца, свежая цена и позднейшая готовность владельца к защищённому
  локальному вводу. Старый permit/claim потрачен, не открывается заново.
- **B:** `core-conversation-source.mjs`, budget/admission и HTTP probe фиксируют
  3/5 и первый dataset. Не хватает отдельного finite profile, exact seed/preflight
  Елена/Никита/composite service, 19:30 и owner topic/schedule bindings. После
  реализации нужны offline current HTTP и review. **Одного approval недостаточно.**
- Изменения для B делаются на отдельном последующем candidate. Их нельзя назвать
  выполненными на frozen SHA этапа A. Для A брать точную branch/SHA выше,
  не текущий HEAD документационной подготовки.

Ни один платный запуск, permit, claim или key prompt сейчас не создан. Никаких
SSH, warehouse/design, рабочего сайта, production, CRM writes или outbound.
Evidence подготовки: [manifest](evidence/model-retest-preparation-20261009/manifest.json),
SHA256 `3d4cc60791c45d37487e8a59eab79ece11d9a2d377eb64b91d532363f673486f`.

Независимый read-only review подтвердил арифметику, hashes трёх артефактов,
точные frozen cases, branch и 2 441 source binding без расхождений. Тесты,
сервисы, сеть и модель в этой подготовке не запускались.
