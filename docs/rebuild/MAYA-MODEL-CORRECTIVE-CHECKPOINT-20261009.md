# Исправление диалога после первого actual-model прогона

**Локальная регрессия пройдена: выбранные 17:00 больше не вызывают повторный
вопрос о времени; подтверждение владельца продолжает общий обзор и сохраняет
предложение версии 1 с evidence. Новых provider calls — 0.** Это проверка
записанных ответов и явно синтетических продолжений, не новая приёмка модели.

Runtime: `8d9f30c4b03af10be5b324eb078f9200fb546290`.
Tested candidate с исправленным HTTP oracle:
`b9665758ffe0c8748d30f8847d648b6ee11b1763`.
Branch: `codex/maya-development-integration-20261006`.
[Evidence manifest](evidence/local-model-corrective-20261009/manifest.json),
SHA256 `2ef30348e504aa0d487d3817a2b25141f9b8a6e72bdcf73be58551ed51544c2d`.

## Почему Майя повторяла вопрос

Модель распознала `booking.create_own` и точные 17:00. Существующий C9 заново
проверил каталог и доступность, но успешная ветка с виджетом всегда возвращала
общий текст «Выберите подходящее время». Это была ошибка продолжения и
представления уже выбранного времени, не потеря semantic intent.

Теперь ответ и selector признают выбор, только если свежий owner result содержит
один реальный интервал с этой датой и временем в часовом поясе филиала, а C9
вернул действующий `TIME_SLOT_SELECTOR` из `booking.availability.read`.
Missing/stale/refused, несовпадающие дата/время, неоднозначные или неполные данные
не получают такое подтверждение. Отдельный pure presentation helper не читает
CRM и не даёт полномочий. Проверены секунды, миллисекунды, timezone и DST.

Фактический ответ через HTTP: «На 2026-10-10 в 17:00 (Europe/Moscow) найден
выбранный вариант. Откройте его, чтобы проверить детали и подтвердить запись.
Запись ещё не создана». Дальше остаётся существующий sealed selector → DRAFT →
confirmation → AE. В этом прогоне клик, создание booking draft и COMMIT не
выполнялись; свободный интервал не объявляется забронированным.

## Почему запрос владельца не помещался

В исходном прогоне owner follow-up вырос с 95 860 до 99 820 байт при cap 98 304.
27 доступных tools не изменились. В продолжение добавились сохранённый compound
plan, второй user turn и 14 required tools вместо двух. Полные одинаковые
property schemas повторялись внутри разных tool schemas.

Существующая wire-упаковка теперь сохраняет одинаковые property schemas один
раз и использует ссылки в отдельной таблице. Полные schemas восстанавливаются
без потери описаний, enum, required, дополнительных свойств и nested constraints.
Все tools, 91 intent row, permissions, semantic plan и cap сохранены. Это
упаковка запроса, не изменение политики или маршрутизации.

- Восстановленный unit input: **99 976 → 96 248 байт**.
- Дополнительный size fixture с предыдущим actual reply: **100 502 → 96 774**.
  Это только стресс-проверка сериализатора, не включение assistant prose в модель.
- Реальный новый локальный HTTP follow-up: **96 092 байта**, запас 2 212 до cap.
  Разница с историческими 99 820 — 3 728 байт. Все 27 tools и 14 required tools
  присутствуют в наблюдении. Размеры реконструкции не выдаются за исходные bytes.

Это доказательство для конечных проверенных диалогов, не гарантия размера любого
будущего разговора. Превышение лимита по-прежнему останавливается до dispatch.

## История и подтверждение владельца

HTTP replay передавал реальные предыдущие ответы и до исправления. AiCore
намеренно удерживает caller-carried assistant prose от модели: прежние ответы
могут содержать частные данные. Этот privacy filter сохранён. Проверенный вопрос
владельцу уже хранится в существующем encrypted semanticContext и восстанавливается
в bounded plan; новая память, схема и retention не добавлялись.

Новый HTTP probe подтверждает, что восстановленный `clarification_question`
совпадает с фактическим предыдущим HTTP reply, а model history остаётся user-only.
Отдельно исправлен diagnostic coverage: вызов model method или serializer без
полученного ответа больше не считается actual model output. Исторический raw
report не переписан.

## Исполненная проверка

**422 теста / 6 suites PASS**, включая приватность, точное время, planner schemas
и закрытую D6 import boundary. После типовых поправок повторены только 54 теста
двух изменённых specs. **10 replay tests PASS**, включая отказ replay в paid
modes до manifest/permit/output access. Widgets-live TypeScript, changed-source
ESLint и **10/10 K3** прошли. Независимый статический review закрыт; замечание
о CRM import устранено pure helper и точным presenter-only dependency census.

Два последовательных fresh owned PG/HTTP запуска сохранены отдельно:

| Запуск | Результат |
| --- | --- |
| [a](evidence/local-model-corrective-20261009/http-a/runner-report.json), `8d9f30c4` | **FAIL** oracle: тест ошибочно требовал `current:true` от составного ответа. Приложение уже вернуло HTTP 201, AVAILABLE и saved revision 1. |
| [b](evidence/local-model-corrective-20261009/http-b/runner-report.json), `b9665758` | **PASS-ungraded**, все 5 HTTP ходов / 3 диалога. Только oracle исправлен по существующему C9 contract; runtime не менялся. |

Составной ответ намеренно имеет `current:false`: финансовая часть — опубликованный
исторический снимок. Этот run имеет `replayed:false`; отдельная рекомендация —
AVAILABLE, `noSideEffects:true`, `executionAuthority:false`. Ответ связан с **ровно теми**
сохранёнными run/revision, которые он возвращает: revision 1 и непустые evidence.
Финансовых source handles — 1, recommendation refs — 2. Один ответ объясняет
ограничения источников и предлагает проверить время отдельным запросом либо
ничего не делать, без списков клиентов, вероятностей и придуманных скидок.

[Фактические HTTP ответы b](evidence/local-model-corrective-20261009/http-b/actual-http-turns.jsonl).
Transport использовал **3 записанных actual outputs с объявленной привязкой
alias/date и 2 scripted synthetic continuations**. Исходная ошибка даты первого
model tool call сохранена относительно business day, не исправлена replay.
Owner confirmation и administrator refusal — синтетические продолжения; их
нельзя считать доказательством поведения живой модели.

Использованы настоящие auth/HTTP/AiCore/model serializer/C9/PG owners. Booking
facts — внутренний календарь и synthetic verified Client; Occupancy — конечные
synthetic domain-port reads; финансы — C7 и native YCLIENTS adapter с synthetic
GET. Живых CRM запросов, provider calls, business writes и outbound — **0**;
business hash неизменен во всех пяти ходах. Credential не загружался.

[Cleanup](evidence/local-model-corrective-20261009/cleanup.json): у обоих запусков
broker PID и все шесть owned process groups отсутствуют, postmaster.pid отсутствует,
runner подтвердил остановку PG/broker и неизменность source. Заново платный
runner/permit/claim не создавались и старые не открывались.

Независимая сверка артефактов подтвердила 46 файлов evidence / 928 280 байт,
36 неизменённых HTTP artifacts и соответствие 2 441 source file tested commit.
`independent_review` проверил booking/wire/probe, `receipt_read_shell` —
написанный другим агентом replay transport. `checkpoint_review` сверил evidence,
но является автором replay transport: его artifact reconciliation не выдаётся
за независимое code review собственной реализации. Ошибка `current:true` в первом
HTTP oracle была пропущена начальным review, затем подтверждена и исправлена.

## Исходный платный результат и пределы

[Исходный actual fail](MAYA-LOCAL-ACTUAL-MODEL-RESULT-20261008.md) сохранён в
`856323e7f643dc596a77f5354eaeec03ba18655d`: **3 provider HTTP 200**, четвёртый
request заблокирован до provider. Usage: 49 674 input / 1 017 output tokens.
Резерв ledger **$0.33911196** — не billing. Расчёт по returned usage и архивной
официальной цене — **$0.03398186 off-peak**; фактическое списание аккаунта не
проверялось. Резерв dry gates новых replay также не является расходом провайдера.

Новый платный прогон потребует отдельного разрешения; потраченный grant закрыт.
Real-model quality, живой YCLIENTS, бронирование до receipt, browser/restart
приёмка этого increment, multi-company migration и C10 background authority
остаются открыты. Полное завершение MAYA/C10 не заявляется. Схема/retention/
autonomy не менялись, рабочий сайт не затронут, push/merge/deploy не выполнялись.
