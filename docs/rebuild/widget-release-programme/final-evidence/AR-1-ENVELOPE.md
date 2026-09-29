# AR-1 — proposed activation contract

Status: PROPOSED / UNAPPROVED / NOT ACTIVATED. Product choice and options are in DECISIONS.md. No writer or activation is implemented by this document.

### 1. Threshold

- Зафиксирован один combined candidate: backend Git SHA, backend build digest, carrier source/build digest, contract/registry versions, полный digest 165-clause matrix, evidence/mutation/CI artifact digests. Изменение runtime bytes, registries или carrier после certification инвалидирует release certificate.
- **false = 0, BLOCKED-DISCHARGE = 0, unresolved STOP = 0** в утверждённом release scope. Все 165 строк перечислены; исключение не исчезает из denominator. L/L-T имеют допустимые свежие proofs; U — только settled scope и четыре обязанности OD-3 A. Отдельно печатаются strict и with-U; для полного текущего scope требуется **WITH U-CLASS 15/15**, не недостижимое «strict 15/15».
- 9.6 остаётся **INTEGRATION-OWNED**: один canonical persisted user-turn id, typed и widget lowering, доказанные на combined candidate. Carrier transport/render/resolve, retries, errors и integration-only artifact check зелёные; mirror writer запрещён.
- Полная применимая CI/mutation matrix без surviving mutants, красных baseline или подмены restricted receipts полной CI. Исторические receipts допускаются только по отдельно утверждённой provenance/invalidating-change policy; этот пакет её не предполагает. Без неё release использует fresh candidate receipts.
- Все FBE2E limitations либо закрыты доказательством, либо явно приняты владельцем с именованной границей; принятый limitation не отменяет security gate. Дата/окно/timezone, tap-as-delivery и реальный provider-fault proof не считаются закрытыми этим проходом.
- Шесть FBE2E prerequisites проверены без раскрытия секретов: AI config; CRM connection/credentials для соответствующего provider path; entitlement dependencies; canonical authenticated Client authority; согласованные service/staff/slot; отдельное разрешение ровно обозначенного real-effect test. OTP delivery/re-verification — отдельное разрешение, если нужны; механизм SB-1 не равен действующей проверке конкретного человека.

### 2. Approver

- Product/release owner явно утверждает scope, exact candidate/certificate digest, tenant allowlist, окно и rollback owner. Для этого проекта решение даёт владелец задачи; принадлежность к tenant_owner сама по себе не даёт таких прав.
- Отдельный именованный security reviewer подтверждает authority isolation, U bases, receipt admission, approved receiver/input scope и ratchet replacement. Независимый reviewer не заменяется самосертификацией writer.
- Исполнитель — явно назначенный platform release operator, аутентифицированный существующей доверенной platform identity. Agent не получает grant authority из текста отчёта. Имена reviewer/operator и tenant ids обязательны в **execution authorization**, до неё применение запрещено.
- Authorization одноразово связывает `release_id`, candidate/certificate digest, exact tenant ids, environment, operator/approver identities, expected entitlement version, `not_before`, `expires_at`. Не caller-authored authority и не user-role inference. Подпись/защищённый источник authorization определяются в writer implementation и проверяются adversarial tests; неподписанный local JSON сам по себе недопустим.

### 3. Entitlement writer

- Предлагаемый canonical owner: новая узкая операция в entitlements domain, одна reviewed operator entry; существующий публичный features API остаётся read-only. Это **новая предлагаемая операция**, сегодня её нет.
- Единственные операции: `validate/dry-run`, `grant`, `revoke`, `status`. `grant` требует approved immutable authorization, exact tenant/feature/candidate, ещё действующий threshold certificate и CAS ожидаемого состояния. Без wildcard, plan expansion, trial expansion, default tenant или grant-by-SQL.
- В одной транзакции: повторная проверка authorization/precondition, CAS `TenantEntitlement`, canonical `AuditLog` с реальными actor/approver, old/new state, release/certificate id и correlation digest. Повтор с тем же authorization и теми же bytes возвращает ту же квитанцию; другая tenant/candidate/expiry версия — отказ. Failed audit ⇒ rollback grant. Внешних booking/OTP/provider calls здесь нет.
- Предлагаемый первый grant: **ровно один explicitly named tenant, максимум 24 часа, без автоматического продления**. `expiresAt` обязателен; уже существующий entitlement reader исключает истёкшие overrides. Повторная выдача требует нового authorization. Неизменность certificate и связь с реально запущенным build проверяются при apply.

### 4. Rollback / revocation

- До grant назначается on-call rollback owner и испытывается `revoke`. Операция ставит explicit deny `enabled=false` с durable audit; retry идемпотентен. Сначала deny, затем rollback приложения при необходимости.
- Причины немедленного revoke: mismatch candidate/certificate, authority/tenant leak, replay/consumption failure, unsafe owner effect, неразрешённый grant, недостоверная activation receipt. Expiry прекращает допуск без продления.
- Проверка после revoke: `/features/effective` исключает key; обычный и ранее выданный widget token больше не проходят FeatureGuard/owner rechecks, новые drafts/commits не запускаются. Проверить независимые процессы/кэш и запрос, начавшийся до revoke. Если in-flight boundary не обеспечивает заявленную остановку, activation blocked до исправления. Уже совершённые эффекты не «откатываются» изменением entitlement; UNKNOWN остаётся на canonical reconciliation.
- Rollback не возрождает revoked ClientChannelLink, не меняет роли и не использует revoked OTP evidence. Прямой SB-1 personal route и его own permissions остаются отдельным authority contract; revoke widget feature не должен обещать отмену всех остальных booking routes.

### 5. Ratchet unlock

- Текущие dark-only проверки остаются неизменны до отдельного reviewed release commit. `scripts/k3-gateway-check.mjs` check 8, writer scan/check 10, `refusal-codes-covered.spec.ts` и programme dark check обновляются согласованно: accepted certificate + единственный writer + explicit tenant + fail-closed negative controls.
- **До снятия `planned` необходимо отдельно запретить auto-trial grant для `widgets.runtime`.** Сегодня `trialGrantable` допускает platform features с readiness != planned: простое изменение readiness включило бы widgets всем full-access trials. Новый ratchet должен убивать именно этот bypass. Планам key по-прежнему не выдаётся.
- Сканер не ослабляется до «разрешить все entitlements writes»: allowlist только одной approved entry/owner, direct Prisma/raw SQL/seed/migration writers запрещены; proof fixture exception остаётся ограничен proof DB.
- Negative mutations: forged/missing/expired certificate; changed build; foreign tenant; wildcard; unauthenticated operator; stale CAS; repeated/rebound authorization; audit failure; auto-trial/plan grant; direct writer; missing revoke; expiry ignored. Каждый обязан fail closed. FeatureGuard, all other entitlement/policy checks и A2.2 не обходятся.

### 6. Activation proof

1. Сначала synthetic/staging proof exact candidate: dry-run без изменений, approved grant, unauthorised/cross-tenant/expired/replay negatives, independent-process visibility, revocation/expiry + old-token refusal; durable before/after audit. Никаких реальных OTP/YCLIENTS effects.
2. Отдельное owner execution authorization для exact production tenant/candidate/window. Перед apply сверяются running build, certificate, effective features, authorization identity и expected entitlement version. При любом несовпадении — STOP.
3. После apply сохраняются redacted receipt: real actor/approvers, release/candidate/evidence hashes, exact environment/tenant, before/after/expiry, verification observations и rollback rehearsal receipt. Секреты, OTP и клиентские данные в release artifact не попадают.
4. Один реальный booking — **отдельный** согласованный effect proof с конкретными service/staff/slot, current Client authority и owner receipt. Само включение feature не считается booking success. Без этого разрешения проверка заканчивается на безопасных read/refusal paths.

**AR-1 ENVELOPE: READY — proposed contract. APPROVED: NO. WRITER IMPLEMENTED: NO. ACTIVATED: NO.**
