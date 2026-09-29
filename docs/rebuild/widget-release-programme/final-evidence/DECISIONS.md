# Final owner decision packet — proposed, not executed

Все варианты ниже — предложения для решения владельца. OD-3 A, OD-4 B, OD-5 B и SB-1 уже приняты; повторного решения по ним не требуется. Новые варианты здесь не выбраны. `widgets.runtime` остаётся выключенным; D3 / AR-1 STOP сохраняется. Числа допуска берутся из `current-audit.json`, а не из исторических ceiling figures.

## D-H — G6-6 / G13-R8: receiving owner

**QUESTION:** Оставить HANDOFF закрытым в текущем выпуске или заказать первый конкретный receiving contract для уже зарегистрированного `handoff.settings@1` → `C9:settings.read` → `shell.account`?

**OPTION A — уже действующее решение, повторного одобрения не нужно:** Сохранить STOP для HANDOFF. Не считать signer доказательством landing verification. G6-6/G13-R8 остаются false. Прямые canonical booking и SB-1 personal-client routes продолжают независимо; это не разрешение включить общий widget feature.

**OPTION B:** Утвердить отдельный destination-specific пакет для settings/account: backend settings owner проверяет текущие principal, tenant, session, floor и sensitive destination; presentation owner принимает только `shell.account`. Handle означает переход к экрану и не разрешает вызов capability. Предлагаемый V1 handle связывает версию, tenant, principal proof, source widget/intent, route и expiry; сервер проверяет MAC и перечитывает исходную запись. После expiry, смены principal, отзыва связи, erasure или смены target — отказ. Предлагаемый landing повторно читаемый до expiry, без бизнес-эффекта; single-use исходного HANDOFF сохраняется. Изменение настроек требует отдельного обычного авторизованного запроса. Это новый versioned receiving contract, не generic endpoint.

**RECOMMENDED OPTION:** A для текущего booking checkpoint. B — отдельный согласованный backend + presentation unit.

**EXACT SECURITY/PRODUCT CONSEQUENCE:** A не даёт нового перехода и не закрывает две строки. B задаёт явную receiving authority, но не использует полномочия виджета для выполнения действия. Текущий signer возвращает только HMAC без lookup payload и verify API: его нельзя объявить готовым receiver. Точный маршрут обработки и presentation owner должны быть согласованы до реализации B; файлы Claude в этом проходе не меняются.

**WHAT IT UNBLOCKS:** B разрешает подготовить/реализовать конкретный receiver после согласования transport boundary и доказать G6-6/G13-R8. A сохраняет независимость обычного booking от этого STOP. Ни A, ни B не включают runtime.

**SCHEMA/MIGRATION IMPACT:** A — нет. Для предлагаемого B self-contained signed payload + существующая retained intent identity могут избежать новой таблицы; это нужно доказать до реализации. Если потребуется persistent lookup, consumption или retention correlation — отдельное минимальное schema decision, без автоматической миграции.

## D-8 — четыре решения об открытом вводе

Текущий minter допускает закрытый schema input; `EMPTY_INPUT_BOUNDS_REGISTRY` и `EMPTY_INPUT_NORMALIZER_REGISTRY` пусты. `c9SafeText` и fail-closed validation существуют. Это не четыре отсутствующие функции. AMB-21d до отдельного scope decision остаётся инженерным ограничением, поэтому строки нельзя объявить U только по OD-3 A. Уже существующий journal date scalar вне `InputSchema` не является зарегистрированным Gate-8 bounds source.

| Clause / QUESTION | OPTION A — settled scope текущего выпуска | OPTION B — расширить scope | RECOMMENDED OPTION | EXACT SECURITY/PRODUCT CONSEQUENCE / WHAT IT UNBLOCKS | SCHEMA/MIGRATION IMPACT |
|---|---|---|---|---|---|
| **G8-3:** нужны ли bounded integer/decimal/date/time/datetime поля виджетов? | Явно исключить эти `InputSchema` kinds из текущего выпуска; сохранить mint refusal и пустой registry. | Назвать первый конкретный field/kind, capability owner и versioned bounds source; определить timezone/unit, актуальность, tenant/principal scope и отказ при недоступности источника. Bounds перечитываются при submit, envelope bounds не дают authority. | **A** для текущего booking scope. | A разрешает заново проверить четыре U-duty; само решение не закрывает строку. B открывает реализацию только именованного источника, без произвольного диапазона или календарной политики. | A — нет. B — существующий owner может не требовать БД; новые persistent fields согласуются отдельно. |
| **G8-4:** какие normalizers разрешены? | Не выпускать text/phone fields, требующие `normalizer_ref`; неизвестный ref продолжает отказывать. | Для конкретного поля утвердить versioned deterministic normalizer и точные изменения строки; idempotence, locale и порядок `c9SafeText → normalizer → c9SafeText` обязательны. | **A**. | A оставляет закрытые selector inputs; B нельзя заменить произвольным trim/lowercase или caller-defined кодом. Требуется доказать, что нормализация не меняет адресата/смысл действия и не превращает DENY в успешный ввод. | A — нет. B — новый registry entry сам по себе не требует SQL; retention рассматривается с полем. |
| **G8-5t:** нужен ли свободный текст в widget input? | Исключить text fields текущего выпуска, сохранив minter refusal и safe-text механизм. Это не запрет обычных сообщений чата. | Назвать конкретный field/use case, canonical owner, max length, normalizer, разрешённые категории данных, retention/erasure и безопасный дальнейший sink. | **A**. | A разрешает U-proof только для исключённой widget ветки. B создаёт новый контентный канал; существующий `c9SafeText` необходим, но сам не определяет продуктовую цель, хранение или authority. | A — нет. B — существующее content storage может подойти; новый storage contract отдельно. |
| **G8-DENY:** как квалифицировать DENY для исключённых open-input веток? | Принять тот же closed-input scope. Сохранить `use_secure_surface` / `bound_violation` и отсутствие owner call для отказа; четыре U-duty обязательны. | При принятии любого B выше включить реальный registered-source DENY в его production HTTP/BIN proof: unsafe text → `use_secure_surface`; invalid/missing bounds → `bound_violation`; unknown normalizer → `use_secure_surface`; no actuation, no input echo. | **A**, только совместно с G8-3/4/5t A. | DENY остаётся отказом, не исправлением, не частичным успехом и не обходом через другой owner. Вариант B — обязательная часть named source unit, а не отдельный generic endpoint. | A — нет. B — собственная новая таблица для DENY не предлагается. |

Варианты B требуют названных владельцем полей и источников; фиктивный source «для прохождения теста» не предлагается. A не меняет certified contract молча: scope ruling фиксируется отдельно, затем executable absence/refusal/mechanism proofs и audit basis должны пройти. Phone остаётся в ранее согласованном отдельном G8-5p scope. До решения все четыре строки — OWNER_DECISION_REQUIRED.

## AR-1 — полный предлагаемый activation envelope

**QUESTION:** Принять следующий release contract как основу отдельного implementation/release unit? Принятие текста не является разрешением deployment, выдачи entitlement или реального booking.

**OPTION A (recommended):** Один tenant-explicit, ограниченный по времени запуск после полного допуска матрицы текущего scope; существующие plan/trial grants для widgets остаются запрещены.

**OPTION B:** Заказать отдельный ограниченный release scope с точным списком capability/effect/target/input classes и исполняемыми запретами на все исключённые ветки. Одного меньшего числа false или слов «booking only» недостаточно: нынешний общий `widgets.runtime` не изолирует такой scope. До новой specification/ratchets — STOP.

**RECOMMENDED OPTION:** A. Это точный и проверяемый порог, без выдуманного численного shortcut.

**EXACT SECURITY/PRODUCT CONSEQUENCE:** A допускает лишь явно перечисленный tenant на согласованном candidate. TENANT_OWNER не получает release-admin authority, CLIENT_ROLES не расширяются, verified personal-client binding не создаётся автоматически. B означает новую отдельную work unit и не разрешает убрать fences.

**WHAT IT UNBLOCKS:** После отдельного одобрения — реализацию единственного entitlement writer и замены dark-only ratchets на более сильный certified-release gate. Сейчас writer отсутствует и ничего не выполняется.

**SCHEMA/MIGRATION IMPACT:** Предлагается использовать существующие `TenantEntitlement` (`enabled`, `expiresAt`, `configJson`, `reason`, unique tenant+feature) и `AuditLog`. Новые таблицы/колонки не предлагаются. До implementation нужны executable persistence/CAS/audit/replay proofs; если существующей атомарности/корреляции недостаточно — отдельное schema decision. Произвольный JSON без проверенного release authorization не даёт права на grant.

Полная спецификация: **AR-1-ENVELOPE.md**. Шесть обязательных частей:

| Field | Proposed contract |
|---|---|
| **threshold** | Exact combined candidate + contract/build/evidence digests; 165 строк перечислены, false/blocked/unresolved STOP = 0, WITH U-CLASS 15/15 при сохранённом strict count; четыре U-duty, fresh CI/mutations, 9.6 и carrier integration proofs; FBE2E prerequisites и отдельное real-effect authorization. |
| **approver** | Явное решение product/release owner по exact tenant/candidate/window; именованные независимый security reviewer и platform operator. TENANT_OWNER не становится release-admin. Approval текста не разрешает execute. |
| **entitlement writer** | Одна новая узкая операция entitlements domain: validate/dry-run, grant, revoke, status. Trusted single-use authorization, CAS, atomic TenantEntitlement + AuditLog, один tenant, максимум 24 ч, без auto-renew. Никаких SQL/seed/plan/trial grants. Операции сегодня нет. |
| **rollback/revocation** | Explicit deny до rollback приложения, durable audit, идемпотентный retry; expiry прекращает допуск. Проверить старые tokens, независимые процессы, кэш и in-flight boundary. Совершённые эффекты не отменяются entitlement rollback; UNKNOWN идёт в reconciliation. |
| **ratchet unlock** | Отдельный reviewed commit заменяет dark-only checks certified-release проверками, не удаляет защиту. До смены planned — явный запрет widgets trial expansion. Только один approved writer; mutations на forged/stale/cross-tenant authorization, audit failure, replay, bypass и expiry. |
| **activation proof** | Сначала synthetic/staging grant→revoke/expiry с adversarial proofs. Production apply только по новому exact execution authorization; redacted before/after receipt. Real OTP и booking — отдельные разрешения, не часть текущего прохода. |

**AR-1 ENVELOPE: READY — proposed. APPROVED: NO. WRITER IMPLEMENTED: NO. ACTIVATED: NO.** При сохранённом D-H STOP порог общего runtime не выполнен; это не блокирует прямые canonical booking / SB-1 paths.

## Ответ владельца

Для изменения текущего HANDOFF STOP нужен D-H B; иначе принятое A сохраняется без повторного решения. Новые решения: G8-3/4/5t/DENY A/B (при B — конкретные поля/owners); AR-1 A/B. Это выбор contract/scope, не команда выполнения. В этом checkpoint работа останавливается; 9.6 не реализуется и Claude не меняется.
