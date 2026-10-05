"""Render the owner report only after strict fresh local + hosted admission."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parents[2]
out = root / 'outputs/ar1-single-operator-final-20261004'
repo = root / 'work/maya-controlled-integration'
read = lambda name: json.loads((out / name).read_text())
checkpoint = read('FINAL-CHECKPOINT.json')
local = read('CERTIFICATION-RECEIPTS.json')
candidate = checkpoint['candidate']
assert checkpoint['status'] == 'PASS' and checkpoint['certifiedForProfile']
assert not checkpoint['readyForProductionExecutionAuthorization']
assert checkpoint['productionOperations'] == 0
assert local['candidate'] == candidate
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert subprocess.check_output(['git', 'rev-parse', '@{upstream}'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
now = datetime.datetime.now(datetime.timezone.utc)
ios_expiry = datetime.datetime(2026, 10, 5, 8, 16, 21, tzinfo=datetime.timezone.utc)
ios_state = ('уже истёк; перед установкой требуется обновление владельцем'
             if now >= ios_expiry else 'ещё действует на момент этого отчёта')
rows = '\n'.join(
    f"| {run['workflowName']} | PASS | [{run['databaseId']}]({run['url']}) |"
    for run in checkpoint['actualHostedCi']
)
report = f'''# Maya: финальный single-operator AR-1 checkpoint

Зафиксировано: {now.isoformat()}. Все проверки ниже относятся к одному committed candidate `{candidate}`. Исторические результаты не подставлялись вместо свежих. Production-выпуск не выполнялся и не разрешён этим отчётом.

```yaml
FINAL CANDIDATE: {candidate}
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

Исходный checkpoint `77ecb3f5696583389e75592141f46fd0664d33d8` сохранён. Provenance: `b5621b10` — governance; `a55534bb` — formatter; `dcf51e1e` — обязательный R01 integration artifact до CI controls. Последнее изменение устранило воспроизведённый пропуск CI prerequisite; старый shell используется только как R01 fixture, release payload остаётся React AChat. Приложение, дизайн, booking и runtime presentation semantics в этом проходе не изменены; новых миграций нет.

## Свежая сертификация

| GitHub workflow | Результат | Прямой receipt |
|---|---|---|
{rows}

Локально и на GitHub собран полный объявленный mutation corpus: 47 batteries, 68 частей, 545 деклараций. 542 применимые мутации обнаружены тестами: 359 build-killed и 183 live-killed. Отдельно сохранены две ранее объявленные pending (`gate6#M17b`, `M18b`) и одна equivalent (`M10-5`). Pending не засчитываются как killed, не являются HANDOFF-исключениями и не получили нового waiver. Дополнительные L27 8/8 и packaging/trust 12/12 также прошли свежие проверки.

Backend: 5701 PASS; Widgets Live: 443 PASS; runtime на Node 22 и 24: по 424 PASS / 7 явных SKIP; carrier: 93 PASS; Python: 613 PASS. Production-binary и single-operator unit/live/binary proofs прошли. FBE2E: 26 CLOSED, две ранее одобренные ACCEPTED (L23, L26). NS-1, BS-1, L27, 9.6 и successor verification подтверждены свежими proofs.

Все обязательные counterfactuals прошли: tenant owner/session не заменяют global authority; Tenant A не выдаёт authority Tenant B; V1/V2 не отзывают grant другой версии; stale CAS, неверные bindings, истёкшие authorization и повторное включение после revoke запрещены. Audit atomicity, отсутствие plan/trial bypass, HANDOFF refusal, немедленное закрытие effective access после allowlist removal и возможность revoke после allowlist removal/certificate expiry/candidate replacement подтверждены.

Сон Mac во время локального прогона явно зафиксирован. Шесть пересекавшихся с ним частей исключены из admission и полностью выполнены заново; десять ещё не начавшихся выполнены после восстановления. Сохранены исходные receipts и 52 целых завершённых части того же SHA. Итоговый collector проверил все 68 частей; admitted sleep overlaps = 0. Таймауты и состав тестов не ослаблялись.

## Release rehearsal и упаковка

На изолированной PostgreSQL выполнены clean migration replay, backup/restore, rollback, реальный canonical login тестового global account, grant/revoke/expiry. Production schema/state проверялись только чтением. Остаются две ранее согласованные production migration: `20260929190000_client_link_challenge_json_v2` и `20260930120000_journal_detail_retained_date`; они в production не применялись.

R01 manifest/AASA, exact artifact hashes, React AChat для PWA и Capacitor, endpoint substitution/parity и отказ упаковки старого shell прошли. Выполнены unsigned и подписанная development iOS build/verification без установки. Development provisioning profile истекает **2026-10-05 08:16:21 UTC / 11:16:21 MSK**; {ios_state}. Это не App Store-сертификация и не acceptance на установленном iPhone.

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
- [COUNTERFACTUAL-PROOF-INDEX.json](COUNTERFACTUAL-PROOF-INDEX.json) — связь требований с исполнившимися assertions; сохранено исходное время индексации.
- [SOURCE-PROVENANCE.json](SOURCE-PROVENANCE.json) — сохранённый checkpoint, commits и все затронутые paths.
- [SUSPEND-RECOVERY-PROOF.json](SUSPEND-RECOVERY-PROOF.json) — прозрачное восстановление локального прогона.

Production deploy/migration/trust/grant, real OTP/YCLIENTS effects, iPhone installation, Chapter 10 и website work: **0**.
'''
(out / 'FINAL-RELEASE-REPORT.md').write_text(report)
runbook_path = out / 'OPERATOR-RUNBOOK.md'
runbook = runbook_path.read_text()
runbook = runbook.replace(
    f'Candidate для текущей сертификации: `{candidate}`. Сертификация ещё выполняется; разрешение на production execution не выдано.',
    f'Свежая локальная и полная GitHub CI-сертификация candidate `{candidate}` завершена успешно. Production execution не разрешён; готовность остаётся NO до подтверждения реального signer и доступа к global account.'
)
runbook_path.write_text(runbook)
paths = ['FINAL-RELEASE-REPORT.md', 'OPERATOR-RUNBOOK.md', 'FINAL-CHECKPOINT.json', 'CERTIFICATION-RECEIPTS.json']
inventory = {'candidate': candidate, 'createdAt': now.isoformat(), 'productionEffects': 0,
             'iosDevelopmentProvisioningExpiry': ios_expiry.isoformat(),
             'iosDevelopmentProvisioningExpiredAtReport': now >= ios_expiry,
             'files': [{'path': name, 'sha256': hashlib.sha256((out / name).read_bytes()).hexdigest()}
                       for name in paths]}
(out / 'FINAL-DELIVERY-INVENTORY.json').write_text(json.dumps(inventory, indent=2) + '\n')
print('Owner report and runbook finalized from admitted fresh receipts; production readiness remains NO.')
