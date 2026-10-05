<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: d49cedf44520dce3d00d5cb4a42947c66e029393a70eb75c957502506129aa0e -->

# Итог диагностики и свежей сертификации

Final candidate: `2915ab8e7c089e2c1f39848cb795940e5267c119`

Branch: `codex/maya-controlled-integration-20260930`

Profile: `closed-input.no-handoff@1`

Полный свежий технический прогон завершён. Дефекты тестовой инфраструктуры доказаны и исправлены; дефект продукта не установлен. Код продукта, presentation и бюджеты таймаутов не изменены. Допуск к релизу остаётся закрытым из-за семи явно сохранённых границ FBE2E без отдельного принятия владельцем.

```yaml
BASELINE ROOT CAUSE: reproduced Darwin IPv6/IPv4 port shadowing; original three incident sockets unavailable
PRODUCT DEFECT: NO — not established
HARNESS DEFECT: YES
SV2-HTTP BASELINE: PASS
F88-1 BASELINE: PASS
F88-2 BASELINE: PASS
FULL MUTATIONS: PASS
CI-EQUIVALENT: PASS — local workflow-equivalent execution
FBE2E: synthetic probes PASS; acceptance PARTIAL
PROFILE-APPLICABLE FALSE: 0
GLOBAL FALSE: 2
CERTIFIED_FOR_PROFILE: NO
FULL-CONTRACT CERTIFIED: NO
READY FOR RELEASE AUTHORIZATION: NO
```

## Причина и предел доказательства

На исходном неизменённом `fed5f7df` в штатном окружении восьми mutation workers воспроизведено затенение IPv6-wildcard listener отдельным IPv4 listener. HTTP-клиент попадал в другой локальный процесс, а предназначенный ему сервер запрос не получал. Зафиксированы timeout и socket reset, состояние процессов, портов, сокетов, запросов, event loop и PostgreSQL. Исправление явно владеет готовым IPv4 listener на `127.0.0.1`; регрессия отличает старое поведение от исправленного.

Сокеты трёх исторических инцидентов SV2/F88 не были сохранены. Поэтому причинность для каждого из них по отдельности не утверждается. Доказаны воспроизведённый дефект harness, его before/after proof и новые зелёные SV2/F88 проверки: три независимых повтора, полный live suite и обязательные controls полного mutation programme.

Во время свежих прогонов также исправлены только тестовые дефекты: неполный booking admission mock, зависимость billing fixture от реальной даты и устаревшие привязки M9-27/28 после переноса USER writer. Добавлено отдельное доказательство изоляции assistant index. Все исправления имеют before/after proof; старые частичные прогоны не допущены как итоговые свидетельства.

Предыдущий кандидат `705d57cd` завершил 65 частей и девять повторов после сна, но его канонический сборщик отклонил обязательный unmutated live control. Регрессия воспроизведена: до исправления 4/54 FAIL, после — 54/54 PASS. Исправленный сборщик требует этот контроль и отклоняет отсутствующее, повреждённое или красное измерение. После изменения начат новый полный прогон на текущем SHA; receipts предыдущего кандидата в него не перенесены.

Проверка условий выполнения текущей кампании: PASS. 2 октября Mac находился в clamshell/maintenance sleep с 06:35:59 до 06:55:23 UTC. Пересеклись только WR parts 3/4 и 4/4: их зелёные оригиналы сохранены, но исключены из допуска. Обе части полностью повторены на том же SHA в новых proof DB и прошли без повторного сна или транспортных ошибок. Остальные 63 части не изменились. Лимиты времени и настройки питания не менялись. Финальная проверка: оставшихся тестовых процессов — 0, соединений с proof DB — 0; выделенный тестовый PostgreSQL сохранён.

## Полный текущий прогон

| Проверка | Результат |
| --- | --- |
| Backend | 5603 PASS / 587 suites / 0 FAIL |
| Widgets-live | 406 PASS / 37 suites / 0 FAIL |
| Runtime, Node 22 и 24 | 422 PASS / 7 SKIP / 0 FAIL на каждой версии |
| Carrier | 93 PASS / 0 FAIL |
| Legacy Python | 613 PASS |
| Native mutations | 44 batteries, 65 parts, 509 declarations; 506 applicable kills |
| Дополнительные L27 runtime mutations | 8/8 KILLED |
| HTTP/BIN и release binary | PASS |
| Безопасные FBE2E probes | 6/6 PASS |
| NS-1 roundtrip | 16/16 PASS |
| L27 | 17/17 PASS |
| 9.6, BS-1, NS-1 | PASS |
| Self-booking successor | 12/12 proofs; native SV2/SB1/SBV PASS |
| Profile, grant/revoke/expiry, old-token/adversarial | PASS — synthetic only |
| PWA/Capacitor parity, hashes | PASS; artifacts unchanged throughout certification |

Native corpus: 344 build-killed + 162 live-killed; два ранее объявленных HANDOFF pending и один обоснованный equivalent учтены отдельно, как kills не считаются. Baseline red: 0; mismatches: 0. Тестовые фильтры и сокращённые шаги не использовались. Отдельный предварительный диагностический прогон не заменяет полный корпус.

CI-equivalent означает локальное выполнение команд и postconditions workflow на macOS arm64, Node 22/24, Python 3.11 и изолированном PostgreSQL 16. Удалённый GitHub/Linux прогон и branch protection не заявляются. В каждом локальном mutation job соблюдён существующий 180-минутный бюджет.

Финальная перекрёстная проверка: 293 ссылки с хешами совпадают, неразрешённых ссылок — 0. Две ссылки FBE2E были пересчитаны после фиксации итоговых admission-полей индексов; предыдущий manifest сохранён. Сырые receipts и результаты мутаций не изменялись.

## Оставшиеся ограничения

FBE2E: **21 CLOSED / 3 PARTIAL / 4 OPEN**. Утверждённый AR-1 требует закрытия каждой из 28 limitations либо явного принятия её названной границы владельцем. Зелёные технические проверки не заменяют этого решения.

- **L2**: Fresh local checker PASS; advisory CI blocking/acceptance policy remains unresolved.
- **L5**: Booking tomorrow/day-window policy remains unresolved with L24; the repaired billing fixture clock does not change this product policy.
- **L20**: Supplying an UNKNOWN verdict is not a provider/Action Engine fault-produced UNKNOWN proof.
- **L23**: The carrier network structural-ratchet limitation remains; successful network probes do not replace that assertion.
- **L24**: The fixed booking availability window/timezone policy remains unresolved with L5.
- **L25**: Tap-as-delivery/render requires the retained lifecycle ruling; no new acceptance inferred.
- **L26**: Current strict mutation consumer does not retroactively approve the historical manual audit builder.

`G6-6` и `G13-R8` остаются глобальными STOP. Они исключены только из порога утверждённого профиля; полный контракт не сертифицирован. Ни сертификат, ни production grant не выпущены.

## Свидетельства

- [Итоговые receipts](CERTIFICATION-RECEIPTS.json)
- [Полный native corpus](COMPLETE-MUTATIONS.json)
- [Baseline admission](BASELINE-ADMISSION.json)
- [Условия выполнения текущей кампании](HOST-ENVIRONMENT-CHECK.json)
- [Полный повтор двух прерванных частей](SUSPEND-REEXECUTION.json)
- [Проверка завершения процессов и соединений](FINAL-PROCESS-LIFECYCLE.json)
- [Матрица 165 clauses](FRESH-CLAUSE-EVIDENCE.json)
- [FBE2E disposition](FBE2E-DISPOSITION.json)
- [Artifact stability](FINAL-ARTIFACT-STABILITY.json)
- [Финальная сверка 293 ссылок](FINAL-DELIVERY-HASH-CHECK.json)
- [Порядок фиксации метаданных](REPORT-INDEX-FINALIZATION.json)
- [Диагностика и before/after proofs](../harness-diagnosis-fed5f7df/ROOT-CAUSE.md)

Production migration/deploy/grant, реальный OTP, YCLIENTS effects, iPhone reinstall и Chapter 10: **0**.
