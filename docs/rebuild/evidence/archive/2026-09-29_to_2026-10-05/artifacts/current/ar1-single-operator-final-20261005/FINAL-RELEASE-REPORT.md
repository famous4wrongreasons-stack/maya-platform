<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 888c5588e78892bd13012a9f051bb9dac482d4a46c9d24eba7097b666e9f0978 -->

# Maya: финальный single-operator AR-1 checkpoint

Зафиксировано: 2026-10-05T05:05:13.373315+00:00. Все проверки ниже относятся к одному committed candidate `dff728e85a97841dd72bd290992b888344780780`. Исторические результаты не подставлялись вместо свежих. Production-выпуск не выполнялся и не разрешён этим отчётом.

```yaml
FINAL CANDIDATE: dff728e85a97841dd72bd290992b888344780780
BRANCH: codex/maya-controlled-integration-20260930
MULTI-TENANT AUTHORITY PRESERVED: YES
SINGLE-OPERATOR AR-1: PASS
INDEPENDENT HUMAN REVIEW: false
CERTIFICATION: PASS — fresh local + all 6 hosted workflows
RELEASE REHEARSAL: PASS — isolated database only
PWA/IOS PACKAGING: PASS — React AChat; no iPhone installation
PROFILE: closed-input.no-handoff@1
PROFILE-APPLICABLE FALSE: 0
GLOBAL FALSE: 2
HANDOFF: STOP — G6-6 and G13-R8
CERTIFIED_FOR_PROFILE: YES
FULL-CONTRACT CERTIFIED: NO
PRODUCTION EXECUTION PATH CERTIFIED: YES
HEAD = origin: YES
WORKTREE CLEAN: YES
UNPUBLISHED REQUIRED SOURCE WORK: 0
READY FOR PRODUCTION EXECUTION AUTHORIZATION: NO
```

## Что изменилось

Продолжена сохранённая незавершённая реализация существующего AR-1. Один реальный global platform operator может также быть approver. V2 требует явного `independentHumanReview=false`, `reviewerId=null` и одной настоящей подписи владельца. Фиктивный reviewer и вторая собственная подпись отвергаются. Отдельного release engine или исключения для салона основателя нет.

Исходный checkpoint `77ecb3f5696583389e75592141f46fd0664d33d8` сохранён. Provenance: `b5621b10` — governance; `a55534bb` — formatter; `dcf51e1e` — обязательный R01 integration artifact до CI controls; `dff728e8` — выбор guarded CI database в offline unit fixtures. R01 prerequisite устранил воспроизведённый пропуск подготовки CI; старый shell используется только как R01 fixture, release payload остаётся React AChat. Приложение, дизайн, booking и runtime presentation semantics в этом проходе не изменены; новых миграций нет.

## Свежая сертификация

| GitHub workflow | Результат | Прямой receipt |
|---|---|---|
| MAYA Chat Shell | PASS | [37238710215](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/37238710215) |
| Canonical React release packaging | PASS | [37238710218](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/37238710218) |
| Widget Contract | PASS | [37238710222](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/37238710222) |
| Widgets Live | PASS | [37238710226](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/37238710226) |
| Platform CI | PASS | [37238710237](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/37238710237) |
| Widgets Mutation | PASS | [37238713168](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/37238713168) |

На изолированных GitHub runners выполнен полный объявленный mutation corpus; свежие части повторно приняты неизменённым canonical strict collector: 47 batteries, 68 частей, 545 деклараций. 542 применимые мутации обнаружены тестами: 359 build-killed и 183 live-killed. Отдельно сохранены две ранее объявленные pending (`gate6#M17b`, `M18b`) и одна equivalent (`M10-5`). Pending не засчитываются как killed, не являются HANDOFF-исключениями и не получили нового waiver. Дополнительные L27 8/8 и packaging/trust 12/12 также прошли свежие проверки.

Backend: 5712 PASS; Widgets Live: 443 PASS; runtime на Node 22 и 24: по 424 PASS / 7 явных SKIP; carrier: 93 PASS; Python: 613 PASS. Production-binary и single-operator unit/live/binary proofs прошли. FBE2E: 26 CLOSED, две ранее одобренные ACCEPTED (L23, L26). NS-1, BS-1, L27, 9.6 и successor verification подтверждены свежими proofs.

Все обязательные counterfactuals прошли: tenant owner/session не заменяют global authority; Tenant A не выдаёт authority Tenant B; V1/V2 не отзывают grant другой версии; stale CAS, неверные bindings, истёкшие authorization и повторное включение после revoke запрещены. Audit atomicity, отсутствие plan/trial bypass, HANDOFF refusal, немедленное закрытие effective access после allowlist removal и возможность revoke после allowlist removal/certificate expiry/candidate replacement подтверждены.

Предыдущий candidate `dcf51e1e` не прошёл hosted baseline: четыре unit fixture использовали локальные DB names при строгом GitHub CI mode. Воспроизведены те же 105 отказов при изменении только environment flags. Последний test-only fix дал 153/153 PASS в каждом режиме, включая 11 новых отказов для неверной конфигурации. Оба DB guard и compiled product bytes неизменны. Предыдущий corpus отменён как непригодный; его результаты не включены в текущую сертификацию. Здесь весь corpus свежий на новом SHA, а не повтор только упавшей части.

При финальной сборке отчёта исправлено чтение канонического `PARTITION-AS-DECLARED` во внешнем reporting adapter: предыдущая проверка ошибочно требовала статус целой battery от каждой части. Сохранён before-proof; 68 реальных частей и шесть negative checks прошли. Raw receipts, canonical strict collector и product candidate не изменены. См. `REPORT-FINALIZER-PROOF.json`.

## Release rehearsal и упаковка

На изолированной PostgreSQL выполнены clean migration replay, backup/restore, rollback, реальный canonical login тестового global account, grant/revoke/expiry. Production schema/state проверялись только чтением. Остаются две ранее согласованные production migration: `20260929190000_client_link_challenge_json_v2` и `20260930120000_journal_detail_retained_date`; они в production не применялись.

R01 manifest/AASA, exact artifact hashes, React AChat для PWA и Capacitor, endpoint substitution/parity и отказ упаковки старого shell прошли. Выполнены unsigned и подписанная development iOS build/verification без установки. Development provisioning profile истекает **2026-10-05 08:16:21 UTC / 11:16:21 MSK**; ещё действует на момент этого отчёта. Это не App Store-сертификация и не acceptance на установленном iPhone.

## Точные действия владельца

1. Подтвердить доступ к существующему **глобальному platform_owner**. Активная запись найдена; владение реальными credentials ещё не подтверждено. Пароль не отправлять в чат. Tenant-сессия для этого не подходит.
2. Подготовить свой Ed25519 signer вне Git, чата и production application files. Предоставить только публичный SPKI PEM, key ID, SHA-256 fingerprint SPKI DER и подтверждение хранения private key владельцем. Codex production private key не создавал и не хранит. Production trust installation в этом проходе не выполнялась.
3. После подтверждения этих prerequisites рассмотреть точный release packet, дать **отдельное production execution authorization** и подписать свежие canonical V2 bytes одной настоящей подписью. Packet должен использовать текущий CAS и актуальное окно до 24 часов; старый синтетический пакет не становится production authority. Второй реальный человек не требуется; независимого human review не было.
4. Для отдельного разрешённого iPhone-этапа подключить/разблокировать устройство и при необходимости обновить истёкший development profile своей Apple-учётной записью.
5. Реальный SMS OTP, новый verified Client episode и YCLIENTS create/reschedule/cancel требуют ещё одного явного разрешения перед первым таким эффектом.

После отдельного разрешения Codex может выполнить pre-state/backup, проверенные migrations, public trust installation, exact deploy, health/hash checks, current-session validate/grant/revoke и согласованный iPhone install. Сейчас ни один из этих production effects не выполнен. Внешние signer/account prerequisites остаются причиной `READY: NO`, несмотря на завершённую техническую сертификацию.

Подробный порядок с разделением «владелец вручную / Codex может»: [OPERATOR-RUNBOOK.md](OPERATOR-RUNBOOK.md).

## Доказательства

- [FINAL-CHECKPOINT.json](FINAL-CHECKPOINT.json) — финальный admission свежих локальных и hosted receipts.
- [CERTIFICATION-RECEIPTS.json](CERTIFICATION-RECEIPTS.json) — неизменённый hash-bound локальный пакет.
- [REQUIRED-COUNTERFACTUALS.json](REQUIRED-COUNTERFACTUALS.json) — свежие unit/live assertions и native mutation bindings для обязательных требований.
- [SOURCE-PROVENANCE.json](SOURCE-PROVENANCE.json) — сохранённый checkpoint, commits и все затронутые paths.
- [HOSTED-MUTATION-PROVENANCE.json](HOSTED-MUTATION-PROVENANCE.json) — привязка каждой части к свежему GitHub job и hash исходного artifact.
- [CI-UNIT-FIXTURE-MODES.json](CI-UNIT-FIXTURE-MODES.json) — проверка исправления unit fixtures на точном final HEAD.

Production deploy/migration/trust/grant, real OTP/YCLIENTS effects, iPhone installation, Chapter 10 и website work: **0**.
