# MAYA — повтор исходных 48 диалогов после schedule/journal wiring

R2 на `b6cd4d00e6d374ab2a9466f4f40144b345456e9e`: **54 PASS / 1 FAIL /
14 unsupported / 12 insufficient**, все 81 actual хода, critical 0/0. Три booking
empty исхода теперь объясняются явно; journal больше не утверждает смену источника.
Оставшийся FAIL — повторный вопрос о филиале, уже указанном пользователем
(`mt-ambiguous_entity_resolution-15:2`). Его узкая correction готовится отдельно.
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
и новый прогон готовятся отдельно; R1 не пересчитывается и остаётся FAIL.

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
