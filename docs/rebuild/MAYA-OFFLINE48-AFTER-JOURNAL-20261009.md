# MAYA — повтор исходных 48 диалогов после schedule/journal wiring

Последующий [прогон после услуг выбранного мастера](MAYA-OFFLINE48-AFTER-STAFF-SERVICES-20261009.md) на `9a54eb4a` дал 57/0/14/10 и remaining24. Ниже сохранена исходная квалификация journal/schedule, без пересчёта её результатов.

Финальный R3 на **`4f88e8178e337d9f4d4b6740acbce1685e97a92e`**:
**54 PASS / 0 FAIL / 14 unsupported / 13 insufficient**, все 48 диалогов и 81 actual
HTTP ход, critical 0/0. Все прежние 52 PASS сохранены; из remaining29 закрыты ровно
два schedule хода, **27 остаются незавершёнными**. Exit 2 означает сохраняющиеся
семантические ограничения, не общий PASS или готовность всей MAYA.

Три промежуточных booking FAIL исправлены узким ответом на current empty READ.
Он требует завершённый свежий receipt, точную форму owner result и совпадение
tenant/staff/service/timezone/применимой branch revision. Failed/stale/malformed/
incomplete результаты остаются неопределёнными и blocked. Exact-time соседние
ветки не менялись. Journal/schedule catch не утверждает недоказанное изменение
источника и не переспрашивает сохранённый филиал. Оба исходных journal хода остаются
insufficient: **0 READ и 0 persisted work**, без выдуманного mapping.

Correction: `b6cd4d00` + `4f88e817`; финально **367 tests / 3 suites PASS**, scoped
types/lint и production types PASS, независимый source review без blockers. RED и
промежуточные GREEN logs сохранены; 367 не складываются с 363 предыдущего набора.
Финальные component tests используют synthetic completion seam, а durable proof
проверен отдельно [journal R5 на том же source](MAYA-EMPLOYEE-JOURNAL-HTTP-CHECKPOINT-20261009.md).
Корпус, model script, evaluator, реальные часы и fixtures между R1–R3 не менялись.

| Remaining27 | Ходов |
|---|---:|
| Выручка/сравнения: текущий C7 не производит cash; отдельный oracle gap | 6 I |
| Journal: owner resolution не подтверждён | 2 I |
| Сотрудник: admin correction и две цены | 3 I |
| Публичные сведения указанного филиала | 2 I |
| Retention: когорта, регулярность, приоритет | 6 U |
| Подготовка изменения цены | 2 U |
| Текущая BI-выручка без измеренных поступлений | 1 U |
| Прибыль без подтверждённой базы | 1 U |
| Остатки товаров | 2 U |
| Точный период/фильтр отзывов | 2 U |

[R3 score](evidence/maya-offline48-after-journal-20261009/r3/semantic-score.json),
[точные remaining27](evidence/maya-offline48-after-journal-20261009/remaining27.json),
[independent semantic delta](evidence/maya-offline48-after-journal-20261009/r3-independent-delta.json),
[integrity review](evidence/maya-offline48-after-journal-20261009/r3-integrity-review.json).
Score SHA256: `7f0de2d4ebc86720386d42b7b5659a2bf2642296c03bbf3b0e183d9f2f581a05`.
Сверены 2 516 source hashes с exact Git и все 81 response/audit/history связи.
Независимый semantic reviewer не писал реализацию/evaluator; integrity reviewer
написал evaluator и не заявляет независимую приёмку oracle.

Ограничение R3 audit: у первого schedule хода phone sanitizer частично повредил
`read_scope.source_hash`. По этому полю нельзя заявить независимую криптографическую
сверку. Scoped receipts, staff identity, результат и guards проверены; исходный
hash R1 проверен отдельно. Это не доказательство runtime drift; raw R3 не переписан.
Все три owned PG/broker и 18 групп команд завершены, источники не изменились
во время запусков. Full48 не упражняет restart/UNKNOWN recovery/React/live модель.

## Сохранённые промежуточные результаты

R2 на `b6cd4d00e6d374ab2a9466f4f40144b345456e9e`: **54 PASS / 1 FAIL /
14 unsupported / 12 insufficient**, все 81 actual хода, critical 0/0. Три booking
empty исхода теперь объясняются явно; journal больше не утверждает смену источника.
Оставшийся FAIL — повторный вопрос о филиале, уже указанном пользователем
(`mt-ambiguous_entity_resolution-15:2`). Его узкая correction проверена новым R3.
R2 также сохранён как FAIL, без пересчёта: [raw score](evidence/maya-offline48-after-journal-20261009/r2/semantic-score.json).
Ни корпус, ни evaluator, ни часы/fixtures между R1 и R2 не менялись.

R1 выполнен полностью на `28cad8fa2fe155c81dc130eb7545881fd340d860`: **48 диалогов,
81 actual HTTP ход, 51 PASS / 5 FAIL / 14 unsupported / 11 insufficient**,
critical 0/0. Это не общий PASS. Runtime, auth, C9 и PostgreSQL настоящие,
планирование/источники synthetic; real model/provider acceptance не заявляется.

По сравнению с прежними 52/0/14/15 изменились семь оценок, остальные 74 сохранены.
Независимый reviewer не писал implementation/evaluator; integrity reviewer — автор
evaluator и не заявляет независимую семантическую приёмку своего oracle.

| Ходы | Было → R1 | Фактический результат |
|---|---|---|
| followup-owner-topic-switch:2; mt-topic_switch_and_return-17:2 | I → PASS, два хода | Артём/Елена, current branch source, actual staff.schedule.read и два SETTLED C9 work |
| mt-ambiguous_entity_resolution-15:1/2 | I → FAIL, два хода | Journal READ отсутствует; исходный branch binding неизвестен, а ответ недоказанно говорит «изменились» |
| followup-client-carry-over:1; mt-booking_carry_over-12:1; mt-booking_carry_over-18:1 | PASS → FAIL, три хода | Completed availability READ вернул slots:[], ответ остался расплывчатым |

Два schedule PASS опираются на product wiring **и отдельное fixture enrichment**
`729b78ee`: active local Staff и unique link71 в уже подтверждённой company→branch
паре. Это не code-only улучшение. Остальные 46 fixtures, корпус, scripted plans
и evaluator не изменялись. В frozen48 по-прежнему нет однозначного положительного
journal запроса; [его отдельный HTTP proof](MAYA-EMPLOYEE-JOURNAL-HTTP-CHECKPOINT-20261009.md)
не меняет оценки этих двух неоднозначных ходов.

Три booking FAIL проявились из-за реального времени запуска: 18:17 Москвы вместо
примерно 16:35 в прежнем прогоне. Fixture работает 17:00–20:00, последний старт
19:30; current calendar требует 120 минут до записи. Поэтому slots:[] закономерен.
READ и C9 evidence сохранены, последующие шесть T2/T3 дали завтрашние окна и PASS.
Это пробел presentation успешного пустого чтения, не доказанная регрессия источника.

Journal fixture изначально не содержит company→branch binding. Отсутствие источника
нельзя описывать как установленное изменение. Исправление этих двух узких ответов
проверено новыми R2/R3; R1 не пересчитывается и остаётся FAIL.

Из прежних remaining29 два schedule хода подтверждены, **27 остаются незавершёнными**.
В R1 дополнительно наблюдаются три booking presentation FAIL: всего 30 non-PASS.
Финансы, retention, прочие employee/service, branch public information, inventory,
reviews и исходные journal cases этим checkpoint не объявляются завершёнными.

[Raw R1 и hashes](evidence/maya-offline48-after-journal-20261009/archive-manifest.json),
[score](evidence/maya-offline48-after-journal-20261009/r1/semantic-score.json),
[independent delta](evidence/maya-offline48-after-journal-20261009/r1-independent-delta.json),
[integrity review](evidence/maya-offline48-after-journal-20261009/r1-integrity-review.json).
Score SHA256: `cc7c4c03bb695ca29bb778f2b7e576e4f711a88269925f9ab6fa06fd6b00480b`.
Все 2 516 source hashes совпали с Git. Проверены 81 response/audit/history binding,
80 HTTP 201 и единственный ожидаемый revoked 401. PG и broker остановлены, шесть
owned command groups отсутствуют, pidfile отсутствует, sources unchanged.
Provider calls/credentials/business writes — 0/false/0 в пределах этого proof.

Website, frozen9/handoff, schemas, pricing lane и background authority не изменялись.
Общая MAYA/C10 — `NOT_ISSUED`; review/result не даёт разрешения на мутации или live запуск.
