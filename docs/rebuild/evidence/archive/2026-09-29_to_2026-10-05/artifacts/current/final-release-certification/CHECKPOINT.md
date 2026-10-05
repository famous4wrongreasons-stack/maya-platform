<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: db81b358a2fddac37ea653de4b170445895478967825540fce80766fdbb33eaa -->

# Final release certification — STOP

```yaml
FINAL CANDIDATE SHA: 6a40575cc0dc841a84f42367a45364ff7e626f09
PROFILE-APPLICABLE FALSE: 0 # inherited backend progress matrix; not certified
GLOBAL FALSE: 2 # G6-6 / G13-R8 STOP
FULL MUTATIONS: NOT RUN — STOP
CI-EQUIVALENT: FAIL / INCOMPLETE
FBE2E: FAIL — canonical NAVIGATE(w) parent return
PWA/CARRIER PARITY: NOT CERTIFIED — STOP
CERTIFIED_FOR_PROFILE: NO
FULL-CONTRACT CERTIFIED: NO
READY FOR RELEASE AUTHORIZATION: NO
```

Дефект: backend возвращает точный parent в `resolved_widget` (HTTP 200 / ACCEPTED), projection удаляет это поле, runtime сообщает успешное действие и оставляет прежний detail открытым. Это серверная ссылка возврата NS-1, а не Escape/Back/closeDetail.

По вашему условию сертификация остановлена на этом воспроизводимом дефекте. Код кандидата не менялся. Полные mutation/CI/parity-проверки после STOP не запускались; старые результаты не подставлялись.

[Точный дефект и воспроизведение](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/final-release-certification/STOP-NS1-PARENT-RETURN.md) · [Envelope и receipt](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/final-release-certification/receipts/source-roundtrip-observations.json) · [Статус всей программы](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/final-release-certification/PROGRAMME.json)

Оставшиеся blockers: runtime-путь канонического parent return; после его исправления — полная свежая сертификация нового точного кандидата. Production migration/deploy/grant, реальные OTP/YCLIENTS, iPhone reinstall, Chapter 10: 0.
