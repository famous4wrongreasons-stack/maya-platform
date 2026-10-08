# MAYA — точное изменение для нескольких компаний YCLIENTS

Статус: **предложение для решения владельца; миграция и multi-company runtime не выполнялись**. Исходник: `e30f4e01b54cf3f33fff98e34d7c8e9f8d097152`; существующая одиночная привязка сохранена. Это отдельный блокер, не запрет продолжать согласованные capabilities.

## Единственный предлагаемый вариант

Оставить **один `CrmIntegration` на tenant, один владелец credentials A17, общие install/activate/import/disconnect и tenant-wide generation**. Внутри него хранить несколько явно проверенных пар YCLIENTS company ↔ MAYA branch. Disconnect по-прежнему отключает всю интеграцию и все её источники, отзывает соответствующий derived access и сессии. Независимые подключения, секреты, новые владельцы и частичный disconnect не предлагаются.

Это уточняет источник идентичности и основание доступа, а не создаёт второй CRM owner. Existing AE остаётся единственным mutation executor. Выбор в чате — только presentation; он не даёт прав и не заменяет актуальную проверку источника.

## Почему одного массива в settingsJson недостаточно

1. `CrmIntegration.tenantId` уникален; `maya.crm-branch-binding/1` допускает одну пару, `binding.companyId` обязан совпадать с `settings.companyId`. Это действующий, а не multi-company контракт.
2. `reconcileCrmTeamAccess` читает весь `CrmStaffAccess` tenant и все `StaffProviderLink` tenant/provider. Отсутствующий в текущей выборке сотрудник получает disabled, membership suspended, session revoked и unlinked link. Поэтому последовательный sync компании B после A может отозвать сотрудников A даже без совпадения external ID. Это статический вывод из кода, не инцидент в реальном YCLIENTS.
3. `CrmClientLink` и `StaffProviderLink` имеют ключ `(tenantId, provider, externalId)`, `CrmStaffAccess` — `(tenantId, externalStaffId)`, `Appointment` — `(tenantId, crmProvider, crmExternalId)`. Источник company не входит в ключ. Глобальная уникальность ID YCLIENTS здесь не доказана и не предполагается.
4. `UnresolvedClientIdentityHold` имеет `sourceNamespace`, но уникальность всё ещё tenant/provider/externalId. `ReconciliationRun` и его lease привязаны к tenant/provider. Одного branchId на Appointment недостаточно для исторической принадлежности: branch mapping может измениться.

Источники: [settings contract](../../maya-saas-backend/src/crm/crm-provider-settings.ts), [schema](../../maya-saas-backend/prisma/schema.prisma), [team reconciliation и source revisions](../../maya-saas-backend/src/crm/crm.service.ts), [A17 disconnect](../../maya-saas-backend/src/package5-wave3/package5-wave3.service.ts). Согласованная семантика A17: [runtime gate §D1-A](CYCLE-06-BLOCKING-PACKAGE-5-WAVE-3-A15-A17-A18-RUNTIME-CONTRACT-GATE.md), [schema approval brief](CYCLE-06-BLOCKING-PACKAGE-5-BUSINESS-DECISION-CLOSURE-SCHEMA-APPROVAL-BRIEF.md), [Cycle 03 source resolution](CYCLE-03-SCHEMA-GATE.md).

## Семантический delta перед миграцией

| Владелец / данные | Требуемое изменение |
| --- | --- |
| `CrmIntegration` | Сохранить singleton и секрет. Tenant-wide A17 target/generation и общий disconnect не менять. |
| Новый дочерний источник `CrmIntegrationSource` | Tenant-qualified identity источника: `id`, `tenantId`, nullable `integrationId`, `provider`, `companyId`, явно выбранный `branchId`, monotonic revision и состояние active/revoked. Active требует exact текущий integration; nullable допустим только для закрытой исторической source row. Компания — неизменная часть source identity; смена компании создаёт новый источник. Уникальные активные company и branch внутри интеграции; tenant-qualified FK к integration/branch. Источник без доказанной пары не активируется. |
| `CrmClientLink`, `StaffProviderLink` | Добавить nullable source reference для legacy. Новые доказанные связи идентифицировать по `(tenant, source, externalId)`; source фиксирует provider/company. Сохранить прежние Maya Client/Staff owners. Нельзя объединять разные источники по имени, телефону или одинаковому номеру. |
| `CrmStaffAccess` и новое основание доступа `CrmStaffAccessSource` | Сохранить одну существующую canonical access row на Maya staff/user в tenant. Хранить отдельное основание от точной source-qualified staff link. Sync B изменяет только основания B; активное основание A сохраняет derived access. Grant/user/role не выводится из совпадения external ID. Отзыв последнего основания снимает только CRM-derived access; ручное suspension не снимается. Existing owner exceptions и общий disconnect сохраняются. |
| `Appointment` | Новые provider rows обязаны иметь source-qualified booking identity и соответствующие staff/client links. Scope источника участвует в uniqueness и lookup; старый branchId сам по себе не является доказательством company. INTERNAL rows не получают внешний source. |
| `UnresolvedClientIdentityHold` | Разделить квалифицированные `(tenant, source, externalId)` и legacy unresolved identities; hold одной компании не присваивается другой. Не освобождать старые holds из-за текущего settings.companyId. |
| `ReconciliationRun`, ingestion и сравнение отсутствия | Полнота, watch-start и lookup baseline должны относиться к конкретному источнику. Можно сохранить существующую более строгую tenant/provider lease; новая параллельность не нужна. Успешный sync B не даёт права объявлять исчезновение объектов A. Company→tenant/source resolution остаётся fail-closed при ambiguity. |
| Source receipts / cache / pending proposals | Включить integration identity/generation, source id/revision, exact company/branch, timezone и actor scope в существующие witnesses. Rebind/revoke/disconnect делает старые receipts/cache/proposals непригодными для нового READ/effect; история не переписывается. Revalidate перед чтением/возвратом/AE. |

Существующий global disconnect физически удаляет `CrmIntegration`. В предлагаемой схеме та же A17-транзакция сначала закрывает все дочерние sources и их основания, обнуляет только их nullable `integrationId`, затем удаляет credential owner прежним способом. Source identity/provider/company/branch и исторические ссылки остаются у tenant; FK к integration не должен каскадно стирать их или мешать согласованному disconnect. Повторная установка не оживляет закрытые sources/links автоматически. Это сохраняет существующий lifecycle удаления секрета и требует явного schema gate для новых relations, а не изменения общего disconnect.

`sourceId = NULL` означает только legacy unknown, не текущую компанию и не «любую компанию». Существующие глобальные unique constraints нельзя просто удалить: при переходе нужны отдельные partial uniqueness для legacy и source-qualified rows, одновременный перевод всех читающих identity ports и проверяемый migration inventory. Tenant/Staff/User uniqueness canonical access остаётся. Это additive migration с последующим контролируемым cutover; никакого автоматического destructive merge/backfill.

Для legacy допустимо заполнение company/source только по уже сохранённому проверяемому company-qualified происхождению конкретной строки. Нынешний `settings.companyId`, совпавший телефон/имя и sole-current-company не являются таким доказательством. Неопределённые строки остаются legacy/held, исторически читаемыми с квалификацией; source-dependent mutation/authority от них не выдаётся. Одиночный режим сохраняет прежний API/поведение до явного multi-company cutover, а не получает молчаливую миграцию.

Все consumers старых ключей входят в обязательный cutover inventory: identity, team access, onboarding/trusted Client link, appointment reconciliation/availability/booking, loyalty/certificates/subscriptions и CRM-backed sources. Marketing/consent/recovery и import-derived `externalRef` также должны либо получить доказанный scope, либо fail-closed остаться недоступными для нового multi-company режима. Нельзя включить второй источник и оставить соседний consumer выбирать первый tenant integration/company. Это граница допуска, не разрешение массово переписать отложенные домены.

Предложение не устанавливает новую retention: source/link history следует существующему owner lifecycle; новая expiry/purge/retention policy не утверждается. FK/delete/migration SQL и конечный consumer inventory должны пройти отдельный schema gate после выбора этого варианта, до применения миграции. Секреты, raw PII, модельные данные и новый background initiator не добавляются.

## Обязательные отрицательные проверки после решения

- Sync B после A сохраняет staff links, access и сессии A; неполный/упавший B sync не закрывает ничьи основания. Повтор и restart не меняют результат.
- Одинаковые provider client/staff/appointment IDs у A/B не объединяют личности, визиты, grants, receipts или cache. Foreign tenant/branch/actor и неоднозначный source отвергаются до source access/effect.
- Общий disconnect/revoke закрывает **все** соответствующие источники и derived access, инвалидирует старые выборы/receipts/proposals; поздний response старого источника не принимается.
- Историческая link без доказанной company не получает source автоматически. Доказанный singleton сохраняется; unknown legacy остаётся held. Rebind не присваивает старые факты новой компании.

До этого решения: multi-company runtime, схема и данные не изменены. Уже работающая одиночная привязка остаётся самостоятельным [checkpoint](MAYA-YCLIENTS-BRANCH-BINDING-CHECKPOINT-20261007.md). Безопасный explicit-request C9/досье и другие независимые capabilities продолжаются.
