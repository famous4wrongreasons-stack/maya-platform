# Карта исполнения CRM-запроса MAYA (Цикл 0)

> Составлено 2026-08-15 по ветке `codex/maya-brain-systemic-release-20260815` (HEAD `2589bc74`).
> Код НЕ менялся. Это снимок того, как запрос проходит систему сегодня.

## Короткая цепочка

```
POST /api/ai/chat
 → AiCoreController.chat
 → AuthenticatedUser (tenantId, userId, role)         ← guard + @TenantScoped
 → AiCoreService.chat
   → обезличивание (PII redact)
   → детерминированные обработчики ДО модели          ← 17 точек safe_fallback
   → AiToolRuntimeService.listTools
     → AiToolPolicyService.listAllowed                ← ЕДИНСТВЕННЫЙ движок прав
       → EntitlementsService.getEffectiveEntitlements
       → фильтр MAYA_AI_TOOL_CATALOG (49 инструментов)
   → дополнительный фильтр isBusinessOnlyTool         ← только для аудитории «клиент»
   → groundingRequirement (маршрутизация/отказ)
   → AiCoreModelService → DeepSeek v4-pro / OpenAI
   → tool_call
 → AiToolRuntimeService.execute
   → registry.get → validateArguments → policy.assertCanExecute
   → approvals (если approvalPolicy ≠ none)
   → AiToolHandlerService
     → CrmService
       → CrmAdapterFactory.create(provider)
       → YclientsCRMAdapter → YClients API
   → нормализация
 → результат обратно в модель
 → сторож чисел (strictNumbers / groundingEvidence)
 → ответ
```

## Слои

### 1. Точка входа

| | |
|---|---|
| Файл | `maya-saas-backend/src/ai-tools/ai-core.controller.ts:34` |
| Класс/функция | `AiCoreController.chat` |
| Ответственность | Принять один ход разговора |
| Вход | `AuthenticatedUser`, `AiCoreChatDto` (`messages`, `surface`) |
| Выход | Результат `AiCoreService.chat` |
| Проверяет прав | Ничего сам: `@ApiBearerAuth()` + `@TenantScoped()` (`decorators/tenant-scoped.decorator.ts`) |
| Возможности | — |
| Credentials | — |
| Ошибки | 401 (нет токена), 400 (валидация DTO) |
| Другой слой прав | Нет |

Контроллер тонкий — 82 строки, две ручки (`chat`, `transcribe`). Претензий нет.

### 2. Ядро разговора

| | |
|---|---|
| Файл | `maya-saas-backend/src/ai-tools/ai-core.service.ts` (4500 строк) |
| Класс/функция | `AiCoreService.chat` |
| Ответственность | Обезличить, собрать список инструментов, решить о заземлении, крутить цикл «модель → инструмент → модель», проверить числа |
| Вход | `AuthenticatedUser`, `AiCoreChatDto` |
| Выход | Ответ + `toolsUsed` + `action` |
| Проверяет прав | Косвенно — через `runtime.listTools`. Плюс собственный фильтр `isBusinessOnlyTool` (:578) для аудитории «клиент» |
| Возможности | `groundingRequirement` (:1700) решает, нужен ли инструмент и какие годятся как доказательство |
| Credentials | Не касается |
| Ошибки | `ai_model_tool_not_allowed` (:1061), `closedForAccess` → честный отказ по тарифу |
| Другой слой прав | **Да — `isBusinessOnlyTool` поверх политики** |

### 3. Единый движок прав

| | |
|---|---|
| Файл | `maya-saas-backend/src/ai-tools/ai-tool-policy.service.ts` (151 строка) |
| Класс/функция | `AiToolPolicyService.listAllowed` / `assertCanExecute` / `canDecide` |
| Ответственность | Единственное место, где решается «можно ли этому пользователю этот инструмент» |
| Вход | `tenantId`, `userId`, `role`, `surface`, определение инструмента |
| Выход | Список разрешённых определений / исключение |
| Проверяет прав | Профильная фича по роли (`ai.owner` / `ai.admin` / `ai.consultant`), `allowedRoles`, `allowedSurfaces`, `riskTier ≠ restricted`, все `requiredFeatures` |
| Возможности | Читает entitlements арендатора |
| Credentials | Не касается |
| Ошибки | `ForbiddenException` |
| Другой слой прав | Вызывает `EntitlementsService` |

**Дублей нет.** `assertFeature` / `getEffectiveEntitlements` вызываются только из
`entitlements.service.ts`, `ai-tool-policy.service.ts`, `tenants.service.ts`,
`features.controller.ts`, `feature.guard.ts` — то есть один движок AI-прав и один
HTTP-guard для обычных ручек.

### 4. Каталог возможностей

| | |
|---|---|
| Файл | `maya-saas-backend/src/ai-tools/ai-tool.catalog.ts` (1302 строки) |
| Объект | `MAYA_AI_TOOL_CATALOG` — 49 инструментов |
| Ответственность | Единственный реестр: имя, описание для модели, схема входа, роли, площадки, требуемые фичи, риск, политика подтверждения, таймаут, поведение при сбое |
| Другой слой прав | Нет — реестр декларативный |

**Дублей реестра нет.** Один массив, из него строится `Map` в
`AiToolRegistryService` (`ai-tool-registry.service.ts:50`).

### 5. Реестр и валидация аргументов

| | |
|---|---|
| Файл | `ai-tool-registry.service.ts` (1212 строк) |
| Функции | `list`, `get`, `validateArguments` |
| Ошибки | `ai_tool_not_found` (:63, :69, :506), `BadRequestException` на аргументах |
| Особенность | `get` прячет `riskTier: 'restricted'` под тем же `ai_tool_not_found` |

### 6. Runtime исполнения

| | |
|---|---|
| Файл | `ai-tool-runtime.service.ts` (1070 строк) |
| Функции | `listTools` (:82), `execute` (:104), `listApprovals`, `approve` |
| Порядок в `execute` | `registry.get` → `validateArguments` → `policy.assertCanExecute` → `handler.normalizeArguments` → хеш входа → approvals или `executeNow` |
| Проверяет прав | Делегирует политике — своей логики прав нет |

Порядок правильный: право проверяется до любого побочного эффекта.

### 7. Исполнитель

| | |
|---|---|
| Файл | `ai-tool-handler.service.ts` (**5084 строки**) |
| Ответственность | Реализация всех 49 инструментов: аналитика, расписание, клиенты, расходы, кампании, задачи |
| Зависимости | `CrmService`, аналитические сервисы, Prisma |
| Риск | Самый большой файл в пути. Один `switch` на 49 веток |

### 8. CRM-сервис и адаптеры

| | |
|---|---|
| Файлы | `crm/crm.service.ts`, `crm/crm-adapter.factory.ts`, `crm/adapters/*.ts` |
| Адаптеры | `yclients`, `dikidi`, `whitelines`, `salon-online`, `mock` — по одному на CRM |
| Фабрика | `create(provider, config)` — один `switch`; `ALTEGIO` намеренно использует адаптер YClients (тот же API) |
| Credentials | `encryptionService.decrypt(existing.encryptedApiToken)` (`crm.service.ts:295`) |
| Ошибки | Типизированы: `crm_token_required`, `crm_company_discovery_not_supported`, `crm_company_profile_unavailable`, `crm_journal_range_invalid`, `crm_journal_range_too_large` и другие |

**Дублей адаптера YClients нет.** Один класс, одна фабрика, один интерфейс
`CRMAdapter` (`crm-adapter.interface.ts`).

### 9. Модель

| | |
|---|---|
| Файл | `ai-core-model.service.ts` (1492 строки) |
| Провайдеры | DeepSeek `deepseek-v4-pro` (по умолчанию), OpenAI `gpt-5.4-mini` |
| Промпт | `CORE_INSTRUCTIONS` + персона по роли |
| Размер персон | `DIRECTOR_PERSONA` — **33 842 байта**, `ADMIN_PERSONA` — 5 921 байт |
| Описания инструментов | ещё ~17–25 КБ на запрос |

## Что уже соответствует требованиям цикла

| Требование | Состояние |
|---|---|
| Один реестр возможностей | ✅ `MAYA_AI_TOOL_CATALOG` |
| Один движок прав | ✅ `AiToolPolicyService` |
| Один путь адаптера YClients | ✅ `CrmAdapterFactory` → `YclientsCRMAdapter` |
| Один источник статуса интеграции | ✅ `CrmService.getIntegrationStatus` |
| Один runtime-резолвер инструментов | ✅ `AiToolRuntimeService.listTools` |
| Типизированные ошибки CRM | ✅ коды `crm_*` |
| Право проверяется до побочного эффекта | ✅ порядок в `execute` |
| Multi-tool рассуждение | ✅ цикл с `maxToolSteps` |

## Что расходится с требованиями

| № | Требование цикла | Факт | Файл |
|---|---|---|---|
| 1 | Промпт не должен быть статической копией реестра | Персона директора перечисляет инструменты по именам | `ai-core-model.service.ts:264, :362, :409` |
| 2 | Промпт компактный | 33,8 КБ персона + ~17–25 КБ описаний = ~15–20k токенов прозы в каждом запросе | `ai-core-model.service.ts:191` |
| 3 | Один фильтр инструментов | Поверх политики есть второй — `isBusinessOnlyTool` | `ai-core.service.ts:578` |
| 4 | Роутер помогает, а не блокирует | 17 возвратов `safe_fallback`, часть — ДО обращения к модели | `ai-core.service.ts:528–1276` |
| 5 | Нет ложного «нет доступа» | `closedForAccess` срабатывает по entitlements арендатора: без фичи `analytics.business` любой денежный вопрос закрывается | `ai-core.service.ts:1784` |
| 6 | Нет монолитов в критическом пути | `ai-tool-handler.service.ts` — 5084 строки, `ai-core.service.ts` — 4500 | — |

## Не проверено на этом цикле

- Реальные entitlements боевого арендатора (нужен доступ к БД VPS).
- Матрица ошибок YClients (429/401/403/timeout) — Цикл 14.
- Живой прогон golden-вопросов на модели — Цикл 12.
