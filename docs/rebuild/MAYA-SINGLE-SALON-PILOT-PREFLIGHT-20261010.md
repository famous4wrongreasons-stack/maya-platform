# Один салон: конкретный read-only preflight и план реальной приёмки

**Один pilot поддержан существующим single-company contract. Решение о нескольких компаниях не является условием этого пилота.** Локально найдена историческая пара tenant/branch/YCLIENTS от 05.10, но её текущая действительность и безопасный runtime с нужной интеграцией не подтверждены. Следующее действие — одна свежая несекретная metadata-выписка, выполненная оператором, уже имеющим доступ к существующему runtime/БД. Ни credentials, ни новый SSH-доступ для этого отчёта не нужны.

Этот отчёт подготовлен только чтением локального source и сохранённых evidence. Новые тесты, сервисы, provider/model вызовы, SSH, Keychain, чтение credentials, schema/prod changes не выполнялись. Рабочий сайт не затронут.

## Полные версии

- Исходный baseline: **`aa8feb8a726cc8a162d4527da0e2333c0977c28a`**.
- Завершённый локальный code+evidence checkpoint: **`9fcf66f05c9911a1b4332831158c26ec4decec39`**.
- В нём runtime cancel fix: `9099199a76f20ce3ebe499c58ef049281be289c2`; exact HTTP/PG candidate: `1cb7f4dd0a85cc915459672a9727de328de82129`. После него изменена только документация.
- Эти SHA не являются доказательством установленной версии на сервере.

## Какой именно салон известен и чем подтверждён

| Поле | Доступное локальное свидетельство | Current статус |
| --- | --- | --- |
| Tenant | `cmsuavtar0003bjyrfngxsne6` | Кандидат из read-only production summary от 05.10; сегодня не проверен |
| Integration | `cmsuavtcq0007bjyrpr1z68yi`, provider YCLIENTS, active, external, live mode | Исторические значения; текущие status/revision не получены |
| Company | `503759` | Исторический ID, не current authority |
| Maya branch | `cmsuavtaz0005bjyr8nyrxdat` | Историческая принадлежность tenant; текущая явная binding не получена |
| Timezone | `Europe/Moscow` | Историческое значение; current branch override / tenant fallback не проверены |
| Service / staff | `7572285` / `3278920`, 60 минут, 200000 minor RUB; окна на 06.10 | Только исторические факты; в новый preview не переносить |
| Test contact | Ранее владелец передал контролируемый контакт для guest test | Значение здесь не читалось и не переносится; это не verified Client proof |
| Verified Maya Client / link | Для реального пилота конкретные Client/link/account refs в доступных receipts не найдены | Не установлен; synthetic IDs не подходят |

Источник пары — [сохранённый guest acceptance plan](WEBSITE-GUEST-ONE-RECORD-ACCEPTANCE.md), строки «Read-only production mapping verified 2026-10-05». Это документарное историческое свидетельство: в проверенных локальных JSON/Markdown evidence отдельный raw receipt с точными tenant/branch IDs не найден. Я не повышаю summary до свежей проверки.

Само совпадение company и branch в документе **не доказывает наличие текущего** `settingsJson.branchBinding.contract = maya.crm-branch-binding/1`. Этот позднее реализованный контракт и его положительный native proof описаны в [single-pair checkpoint](MAYA-YCLIENTS-BRANCH-BINDING-CHECKPOINT-20261007.md). Нельзя вывести binding из имени, единственного филиала, staff ID или tipsCompanyId.

## Единственное минимальное следующее действие

**Оператор существующего салонного backend предоставляет один свежий read-only metadata receipt для указанного исторического tenant-кандидата.** Это запрос результата, а не ключей, дампа БД, env-файла, токена сессии или нового SSH-подключения. Сначала только DB/runtime metadata, без YCLIENTS calls. Если tenant уже другой, выписка должна явно назвать выбранный владельцем текущий tenant, а не подменить его по совпадению имени/телефона.

Обязательный минимум первого ответа — `observedAt`, mapping query ниже и идентификатор/version runtime, откуда взята выписка. Остальные уже доступные runtime/principal metadata можно приложить к тому же receipt; если их нет, отметить `unknown`, не задерживая первую read-only проверку. Никаких дополнительных доступов сейчас не запрашивается.

Структура одного receipt:

1. **Mapping:** whitelist проекция ниже. Если строка отсутствует или binding null/mismatched, так и указать. Не выбирать филиал автоматически.
2. **Runtime:** идентификатор фактически существующего runtime, установленный Git/build SHA, применённый migration revision, loopback/private/public exposure, принадлежность его БД (отдельная pilot или shared production), использует ли он ту же integration in place; есть ли уже изолированный способ выполнить этот exact candidate без production deployment и копирования credentials. Для outbound — фактический статус локальных notification/reconciliation workers и внешних webhook consumers. Не читать Environment/EnvironmentFile, credential contents, process argv с возможными секретами или произвольные логи. Отсутствующее поле — `unknown`, не предположение.
3. **Test principal:** только уже выбранный владельцем тестовый account/Client/link reference, активность account/membership, ровно один актуальный same-tenant `maya_user` link, verification/subject versions, отсутствие revocation/merge, результат действующего consent/feature admission. Без имени, телефона, subject hash, challenge/session token и verification payload. Нет выбранного verified test principal — `not_established`; не создавать link SQL-ом или fixture verifier.

Mapping query для оператора, уже подключённого к нужной БД; здесь **не выполнялась**. Она читает только перечисленные metadata и не читает `encryptedApiToken`, contact fields, raw settings или secret references:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '3s';
SELECT CURRENT_TIMESTAMP AS observed_at,
       t.id AS tenant_id, t.status AS tenant_status,
       t."calendarSource" AS calendar_source,
       t."defaultTimezone" AS tenant_timezone,
       i.id AS integration_id, i.provider, i.status AS integration_status,
       i."updatedAt" AS integration_updated_at,
       i."verifiedAt" AS integration_verified_at,
       i."lastCheckedAt" AS integration_last_checked_at,
       i."settingsJson"->>'companyId' AS configured_company_id,
       i."settingsJson"->'branchBinding'->>'contract' AS binding_contract,
       i."settingsJson"->'branchBinding'->>'companyId' AS binding_company_id,
       i."settingsJson"->'branchBinding'->>'branchId' AS binding_branch_id,
       b.id AS owned_bound_branch_id, b."tenantId" AS branch_tenant_id,
       b.timezone AS branch_timezone, b."updatedAt" AS branch_updated_at
FROM "Tenant" t
LEFT JOIN "CrmIntegration" i ON i."tenantId" = t.id
LEFT JOIN "Branch" b
  ON b.id = i."settingsJson"->'branchBinding'->>'branchId'
 AND b."tenantId" = t.id
WHERE t.id = 'cmsuavtar0003bjyrfngxsne6';
ROLLBACK;
```

Эта выписка не заменяет canonical нормализацию, current source revision и provider permission check перед действиями. `GET /api/integrations/crm` — существующий DB-backed status owner без provider вызова; его `has_credentials: true` в serializer не доказывает работоспособность ключа. Credentials не нужно читать для устранения нынешней неопределённости mapping/runtime.

## Можно ли сейчас выполнить pilot без переноса secrets и production deploy

**По доступным локальным фактам — пока не установлено.** Это не утверждение, что подходящего runtime нигде нет.

- Локальный candidate и native adapter есть. Проверенные контуры использовали собственные synthetic PostgreSQL/credentials/transport, все закрыты. `widgets-live` намеренно не читает `.env`, удаляет внешние app env vars и допускает только proof DB. Превращать его в live provider запуск подстановкой реальных ключей нельзя.
- Завершённый real-model broker обеспечивал только DeepSeek и synthetic CRM. Его permit закрыт; он не является YCLIENTS credential broker или CRM runtime.
- Remote metadata attempt от 08.10 завершился `SSH_TRANSPORT_FAILED_NO_INVENTORY`; stdout 0, runtime inventory не установлен ([receipt](evidence/maya-development-integration-20261006/metadata-inventory-second-20261008/manifest.json)). Сообщение о работавшем прямом запуске не опровергается, но не устанавливает код, DB, integration и outbound isolation нужного pilot.
- Guest plan ссылается на другой recovery candidate `2fe4b30389dbdb3df94172da537ea9c029d299cc` и незавершённую isolated setup квалификацию. Он не подтверждает установку `9fcf66f0` или нового cancel fence.

Если receipt покажет уже существующий scoped private runtime с нужным source и compatible code/schema, можно использовать его in place в разрешённом контуре. Если есть только production runtime без fix или synthetic Mac runtime без интеграции, конкретным следующим блокером станет **отсутствие пригодного места исполнения текущего candidate**, а не multi-company. Ни копирование production DB/credentials, ни deploy/setup автоматически из этого плана не следуют.

## Существующий adapter и verified Client путь

Один `CrmIntegration` на tenant уже хранит одну явную `companyId ↔ branchBinding.branchId` пару. Normalizer и A17 проверяют совпадение company и ownership branch. При отсутствующей mapping её можно подготовить через существующий authenticated connect → pending activation → activate/import contract; это отдельное изменение конфигурации, не read-only preflight. Сервер способен повторно использовать same-provider credentials без их переноса оператору. Новый schema или multi-company framework для этой пары не нужен.

`CrmService` выбирает `YclientsCRMAdapter` внутри действующего сервера. Current branch source witness учитывает integration revision/settings/base URL и effective branch timezone. Перед create/move/cancel действующие владельцы перепроверяют source и authority. Для move/cancel нужен сохранённый canonical **Client create** origin этой записи: старый импортированный record или guest receipt не заменяет его.

Предпочтительный pilot principal — уже действующий verified `maya_user` link явно тестового Client в выбранном tenant. Для owner account нужен explicit `personal_client` context. Если другого Maya link ещё нет, но есть другой verified exact Client channel, существующий A18 V1 может перенести доказанную связь через challenge/consume. SB-1 V2 применим к revoked predecessor и использует SMS; не применять его к never-linked человеку. Без исходного trusted channel/bootstrap proof такой Client пока не допущен; не открывать новый initial-link flow в рамках приёмки. [Точные действующие пути](MAYA-FIRST-CLIENT-LINK-REMAINDER-20261007.md).

Контакт не даёт Client authority. Дополнительная граница provider: native client create отправляет `phone/fullname` в `book_record`, а не жёстко выбранный provider Client ID. Поэтому до записи оператор должен подтвердить, что фактически разрешённый owner-ом контакт принадлежит единственной явно тестовой карточке этого company и не совпадает с реальным клиентом; отсутствие/неполнота такого подтверждения блокирует мутацию. Проверять только выбранного test principal/contact, не выгружать клиентскую базу в evidence. После create сравнить actual provider Client ID с выбранной тестовой карточкой; при расхождении не переносить/отменять чужую запись. MAYA User.contact / exact CRM link fallback — данные записи, не самостоятельное доказательство тестового статуса.

## Конечная real-CRM acceptance: один Client, одна запись

Это **план следующего отдельно scoped исполнения**, без вызовов сейчас. Ранее данное разрешение на собственные тестовые CRM записи/cleanup не запрашивается повторно как общее разрешение. Текущие runtime, principal, notifications и точные source/slot должны укладываться в подтверждённый scope; неизвестные значения не заполняются историческими данными.

1. **Read-only admission.** В выбранном runtime получить текущую canonical пару и source revision, подтвердить active source, Client/session/link/consent/features. Затем в разрешённом provider-read контуре проверить нужные catalog/staff/availability/record-read и write permissions, реальные правила phone confirmation/prepayment и уведомлений. Один staff, одна услуга, два разрешённых будущих свободных интервала; fixed price/currency/duration и timezone с offset. Не использовать устаревшие окна/цену 05.10. Не читать чужие визиты или контакты для «проверки связи».
2. **Create, ровно одно подтверждение.** Через current Client preview → BOOKING_CONFIRMATION → canonical owner/AE. Один неизменный confirmation idempotency key, allowBusy=false, SMS/email flags ниже. После SUCCEEDED сохранить в private scoped receipt `(tenant, integration revision, company, branch, Maya Client/link ref, Appointment.id, provider record ID R, provider test Client ID, create AE ID, exact start/service/staff/facts hash)`. R берётся из результата/проверенного origin, не из догадки или «последней записи». Проверить только R и его факты.
3. **Move той же записи.** Свежий own reschedule preview на второй свободный интервал; отдельное подтверждение и свой неизменный operation key. Только non-destructive PUT для R, сохранение company/branch/test Client, service/staff/duration/price. Проверить сохранение `Appointment.id` и provider R, новый start, один AE/PUT. Ни DELETE+create, ни перенос другой записи не допускаются.
4. **Cancel той же записи.** Свежий own cancel preview/подтверждение через исправленного owner и AE. Проверить current source, origin и принадлежность R тестовому Client. Один DELETE существующего cancellation adapter, затем authoritative canceled/gone outcome именно R исходной компании, durable AE/receipt и mirror. Никакого raw DELETE/ручного SQL, bulk cleanup или самостоятельного обхода owner. Если подтверждённый scope разрешает только обратимый cleanup, а provider cancellation для R не квалифицирована как допустимая, остановить именно этот шаг до точного решения по R.
5. **Итог и остановка.** Максимум одна новая booking и последовательно один move/один cancel, до трёх mutation dispatches. Ноль платежей/скидок/marketing/чужих изменений. Никаких намеренных timeout/race/fault injections или повторных мутаций в live pilot: они уже проверены synthetic. На любом UNKNOWN остановить следующие действия, сохранить исходный AE/key/R. Только уже существующий explicit status READ для create/move или read-only investigation той же записи; cancel может остаться MANUAL_REQUIRED. Не менять key/nonce, не начинать второй create, не сбрасывать browser/AE state. Если безопасный cleanup не завершён, явно отчитаться об одной оставшейся тестовой записи/интервале.

Для первого provider pilot модель не нужна: registered READ/preview/COMMIT достаточно, это сохраняет чистую границу provider acceptance. Реальный LLM поверх реальных CRM фактов — отдельная стадия с текущим PII/redaction и допуском; исторические пять model replies её не доказывают. Результат pilot: три связанные AE outcomes и неизменный R, а не просто зелёный UI.

## SMS и прочие уведомления

| Источник | Проверено в текущем source | Что остаётся доказать/разрешить |
| --- | --- | --- |
| Verified Client create | Owner и canonical Client plan принудительно задают `notifyBySmsHours: 0`; native payload `notify_by_sms: 0`, `notify_by_email: 0` | Это suppress flags запроса, не глобальный запрет YCLIENTS; provider confirmation/automation настройки current не прочитаны |
| Client move | Native PUT передаёт `send_sms: false` | Provider hooks/другие каналы этим не исключены |
| Client cancel | Native DELETE не передаёт отдельный suppress-notification параметр | Нулевые cancellation notifications из этого кода гарантировать нельзя |
| Newsletter/marketing | `is_newsletter_allowed:false` есть только в guest providerRequestId ветке | Не приписывать этот flag Client pilot; payload Client create не даёт общей гарантии marketing opt-out |
| Maya reminder/delivery workers | Synthetic proof не является свидетельством настроек живого runtime | Нужны текущие disabled/isolated dispatcher и queue boundaries, включая shared DB consumers |
| YCLIENTS admin/staff SMS/email/push и внешние webhooks | 05.10 в summary восемь типов имели нули; тогда существовал active legacy webhook service | Сегодня неизвестны; настройки company не исключают downstream доставку старым ботом/каналами |
| Вход/reverification | Использовать уже verified Client/session; V2 SMS только при нужной reverification | Не запускать OTP для «проверки»; реальный SMS — отдельный известный побочный эффект |

Контрольные точки source: [Client create owner](../../maya-saas-backend/src/appointments/client-appointment-create.service.ts), [CRM source/revision и canonical Client plan](../../maya-saas-backend/src/crm/crm.service.ts), [native create/move/cancel payloads](../../maya-saas-backend/src/crm/adapters/yclients-crm.adapter.ts), [verified channel issuer](../../maya-saas-backend/src/crm/client-channel-runtime.service.ts).

**Гарантированное исключение** возможно только при подтверждённом полном охвате источников доставки для этой тестовой записи: нет provider confirmation/reminder/admin/staff sends, внешние consumers не отправляют, runtime/DB очереди не обрабатываются внешним sender. Одних flags и отключения scheduler на новом процессе недостаточно при shared DB или внешнем webhook. В рамках read-only подготовки ничего из этого не отключать.

Если zero-delivery не доказано, вынести в точный approval только известные необходимые доставки: channel/event (create/move/cancel/OTP), проверенный контролируемый destination reference и предел количества. Исторический guest plan уже фиксирует разрешение обычных YCLIENTS уведомлений **на тот контролируемый тестовый контакт**; не просить его повторно при доказанно том же scope. Оно не покрывает staff/admin/bot/третьих получателей и не превращает неизвестные webhook destinations в разрешённые. При неизвестном получателе или неограниченном fan-out остановить мутацию; не пытаться обеспечить тишину изменением production company settings без решения владельца.

## Финальная локальная capability matrix

Результаты относятся к указанным exact candidates; строки нельзя склеивать в один никогда не выполнявшийся live end-to-end run.

| Capability / candidate | Real model | Provider / данные | Что фактически принято локально |
| --- | --- | --- | --- |
| Current React → AiCore, booking search/17:00 preview; `5298378590a93fb9dd4afaa778eb01bf94bf477c` | Да: часть 5 DeepSeek HTTP200, всего 3 UI logins/5 rendered replies | Synthetic CRM, реальных YC calls 0 | Model transport + server-bounded response; visible safe_fallback, semantics ungraded; booking mutation не было |
| Explicit owner report + отменённое окно через один C9; тот же real-model candidate | Да для semantic planning; отдельный C9 reasoning model не доказан | Synthetic C7/Opportunity/availability | C9 PROPOSED revision1/evidence2, noSideEffects=true; не background C10 и не live availability |
| Current React create → move → cancel; `6ed41427827e5bceee3e98842d5116044d3628c4` | Scripted | Synthetic INTERNAL CRM | Одна Appointment, три AE, результаты после reload/relogin; live YC не проверен |
| Single company↔branch A17 + native availability; `d1e42074400a9d706ab5ddbac8b4daf3af137346` | Не запускалась | Native YC adapter / synthetic transport | HTTP/PG, 7 checkpoints, actual process/PG restart, current source refusal; live mapping не подтверждена |
| Native Client create/cancel source fence; `1cb7f4dd0a85cc915459672a9727de328de82129` | Запрещена в probe | Native YC adapter / synthetic transport | 21 HTTP cases, 220 units; company drift/revocation/replay/UNKNOWN. Browser/restart не заявлены этим proof |
| Историческая production pair и provider settings 05.10 | Не относится | Summary исторических read-only checks | Кандидат для fresh metadata lookup; не current binding/permissions/notification proof |
| Один реальный verified Client booking → move → cancel на scoped runtime | NOT RUN | Real YCLIENTS NOT RUN | Точный путь подготовлен; current runtime/mapping/test principal/outbound ещё нужно установить |
| Общая MAYA/C10, multi-company и фоновая автономия | Не приняты | Не приняты | `NOT_ISSUED`; не условие для отдельного single-salon proof |

Источники evidence: [real model](MAYA-CURRENT-REACT-REAL-MODEL-20261010.md), [React lifecycle](MAYA-BOOKING-FOLLOWUP-REACT-20261010.md), [branch contract](MAYA-YCLIENTS-BRANCH-BINDING-CHECKPOINT-20261007.md), [cancel fence и raw before/after](MAYA-CANCEL-SOURCE-FENCE-20261010.md).

Независимый read-only review документа: **qualified PASS**, историческая/current граница, единственный metadata next step, notification flags и capability matrix проверены; новых blockers не найдено. Никаких тестов или процессов для этого документа reviewer не запускал.
