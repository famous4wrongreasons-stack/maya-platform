# Final independent evidence checkpoint

Закрыто 2 из 11 evidence gaps. G7-FR6b: **L**, доказана кардинальность всей canonical pairing table + штатный HTTP/BIN COMMIT. R-1a: **U**, live typed positive/refusal и отдельно исключённая SPOKEN часть по принятому OD-3 A. U не считается strict live. Остальные девять не повышены по fixture/RI тестам.

```yaml
FALSE CLAUSES: 16 # 18 → 16; за всю программу 31 → 16
EVIDENCE_MISSING: 9
IMPLEMENTATION_MISSING: 0
OWNER_DECISION_REQUIRED: 6
INTEGRATION_OWNED: 1 # 9.6 остаётся false
FINAL OWNER DECISION PACKET: READY
AR-1 ENVELOPE: READY # PROPOSED, UNAPPROVED, NOT ACTIVATED
SAFE TO INTEGRATE: NO
```

**GATES LIVE CONTRACT-COMPLETE 4/15 · WITH U-CLASS 8/15 · STOPPED CLAUSES 0 · BLOCKED-DISCHARGE CLAUSES 0**. Все 165 строк: 127 L / 4 L-T / 18 U / 16 false. Перенос 9.6 в INTEGRATION_OWNED не закрывает clause и не меняет её код.

Branch: `codex/widget-release-programme-20260929`
Worktree: `/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/widget-release`
Proof-source HEAD: `13b4a4f88f8b7feb69762e97f73689f4921425db`
Current test-source HEAD: `22292a1e76c19b547a05c559a196aac12317ff6d`. Финальный documentation commit — в DELIVERY.json. Mutation receipts сохраняют свой настоящий HEAD; единственная последующая backend delta — отдельный U ledger test. Runtime и прежние killers не менялись.

## Проверка

- Affected backend: 16 suites / 239 PASS; отдельные pairing/readback/absence: 59 PASS.
- Полный widgets live: 26 suites / 368 PASS; fresh U ledger: 1 PASS.
- HTTP evidence: 9 PASS; BIN: 17/17. Manifest: 22 строк, 20 claims, 0 violations.
- Mutations: **122/122 as declared**, 0 baseline failures / 0 mismatches. Включены полные Gate 7, Gate 8-R, pairing и WF/WR/H-harness/AB batteries. Это targeted receipts, не новая full remote CI certification.
- Typechecks live/scripts, build, scoped lint и K3 **10/10** PASS. Audit selftests **57**, receipt/lineage selftests **47** PASS.
- Предыдущая full backend regression 578 suites / 5458 PASS сохранена с неизменными runtime bytes; заново полная backend suite в этом проходе не заявляется.
- Claude overlap **0**; production/OTP/YCLIENTS effects **0**. Новых schema changes нет.

## Точные оставшиеся blockers

1. **G6-13** — real Gate-6 allow / Gate-14 authority disagreement с metric: нужен test-only synchronization/observation путь к отдельному BIN-процессу; текущий счётчик только in-memory. Это evidence-engineering dependency, не новое product decision.
2. **G7-5, G7-BOOK1, G11-I9, G13-I3** — canonical production non-draft initial action/ancestry, appointment reread и single-use pairing proof. Прямой minter не является этим источником.
3. **G7-FR6d** — whole no-MONEY / PAYMENT_HANDOFF / F80 E-INDEP proof.
4. **G12-R1b, G12-I11, G13-R2** — production detail/w NAVIGATE target evidence. Имеющийся T1 schedule target s не заменяет его.
5. **G6-6 / G13-R8** — destination-specific receiving owner contract, текущий STOP сохранён; обычный booking и SB-1 не зависят от HANDOFF.
6. **G8-3 / G8-4 / G8-5t / G8-DENY** — явный scope или именованные input owners. Не превращены в U без решения.
7. **9.6 — INTEGRATION-OWNED.** Нужен combined carrier/backend candidate с одной persisted user-turn identity. Отсутствующий `maya-chat-shell/dist/web` — INTEGRATION-ONLY CHECK, не backend failure. Artifact Claude не копировался; его assertions не ослаблены.
8. **AR-1:** предложенный полный contract готов, но не одобрен и не реализован entitlement writer. Ни threshold, ни ratchet unlock не выполнены. В proposal явно закрыт риск автоматического trial grant при смене `planned`.

FBE2E whole limitations сохранены: **13 CLOSED / 6 PARTIAL / 9 OPEN**. Их presentation/effect/policy boundaries не закрываются новым backend test. SB-1 mechanism не менялся, реальная повторная верификация не запускалась.

`SAFE TO INTEGRATE: NO` относится к отсутствующей проверке combined candidate/9.6/integration CI. Текущие backend checks зелёные. Release readiness и activation — отдельные, всё ещё закрытые gates.

Все owner choices и шесть частей AR-1 собраны в **DECISIONS.md**. По каждой из исходных 11 evidence clauses implementation owner, proof и результат — в **CLAUSE-DISPOSITION.md**. Полный текущий расчёт воспроизводится **recompute.mjs**, отказывает на drift/неполных receipts; исторические документы не переписаны.

**STOP после этого checkpoint.** Merge, deployment и activation не выполнялись.
