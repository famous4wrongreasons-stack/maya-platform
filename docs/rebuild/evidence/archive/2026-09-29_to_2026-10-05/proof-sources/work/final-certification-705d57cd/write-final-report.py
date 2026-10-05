from pathlib import Path
import json

root = Path.cwd()
out = root / 'outputs/final-certification-705d57cd'
read = lambda p: json.loads(p.read_text())
result = read(out / 'CERTIFICATION-RECEIPTS.json')
complete = read(out / 'COMPLETE-MUTATIONS.json')
baseline = read(out / 'BASELINE-ADMISSION.json')
reexecution = read(out / 'SUSPEND-REEXECUTION.json')
candidate = '705d57cd787e24d8944dbe764789e27fd9af3708'
assert result['candidate'] == complete['candidate'] == baseline['candidate'] == candidate
assert complete['status'] == result['localCiEquivalent'] == 'PASS'
assert result['mutationCorpus']['historicalReceiptsAdmitted'] == 0
assert baseline['wholeCorpusAdmission'] == 'PASS'
assert reexecution['candidate'] == candidate and reexecution['status'] == 'PASS'
assert result['productDefectEstablished'] is False
assert result['harnessDefectEstablished'] is True
assert len(result['remainingBlockers']) == 7

blockers = '\n'.join('- **' + row['id'] + '**: ' + row['boundary'] for row in result['remainingBlockers'])
report = f'''# Итог диагностики и свежей сертификации

Final candidate: `{candidate}`

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

Во время этого полного прогона журнал macOS зафиксировал сон после закрытия крышки с 18:10:27 до 18:39:17 UTC. Два live-теста в пересекающемся запуске достигли своего неизменённого timeout. Все {len(reexecution['requiredSlots'])} полных частей, пересекавшихся с этим окном, исключены из допуска и заново выполнены на том же SHA со всеми штатными suites и controls, без фильтров. Исходные receipts сохранены отдельно. Незатронутые части относятся к этому же свежему полному прогону; исторические результаты других кандидатов не использовались. Повторные части не пересекались со сном и не содержат транспортных timeout. Лимиты времени не увеличивались, время сна из них не вычиталось.

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

## Оставшиеся ограничения

FBE2E: **21 CLOSED / 3 PARTIAL / 4 OPEN**. Утверждённый AR-1 требует закрытия каждой из 28 limitations либо явного принятия её названной границы владельцем. Зелёные технические проверки не заменяют этого решения.

{blockers}

`G6-6` и `G13-R8` остаются глобальными STOP. Они исключены только из порога утверждённого профиля; полный контракт не сертифицирован. Ни сертификат, ни production grant не выпущены.

## Свидетельства

- [Итоговые receipts](CERTIFICATION-RECEIPTS.json)
- [Полный native corpus](COMPLETE-MUTATIONS.json)
- [Baseline admission](BASELINE-ADMISSION.json)
- [Полные повторные части после сна компьютера](SUSPEND-REEXECUTION.json)
- [Проверка завершения процессов и соединений](FINAL-PROCESS-LIFECYCLE.json)
- [Матрица 165 clauses](FRESH-CLAUSE-EVIDENCE.json)
- [FBE2E disposition](FBE2E-DISPOSITION.json)
- [Artifact stability](FINAL-ARTIFACT-STABILITY.json)
- [Диагностика и before/after proofs](../harness-diagnosis-fed5f7df/ROOT-CAUSE.md)

Production migration/deploy/grant, реальный OTP, YCLIENTS effects, iPhone reinstall и Chapter 10: **0**.
'''
(out / 'REPORT.md').write_text(report)
print(json.dumps({'candidate': candidate, 'report': str(out / 'REPORT.md')}))
