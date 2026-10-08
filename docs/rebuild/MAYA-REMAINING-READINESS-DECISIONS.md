# MAYA — решения для следующего шага

## Текущие отдельные вопросы — 2026-10-08

Это обновление списка решений для текущей development-ветки, **не их одобрение**.
Карточка графика добавлена рядом с тремя уже ожидающими ответами. Работа над
безопасными локальными сценариями продолжается независимо; перечисление не
разрешает identity binding, фоновые запуски, SSH или production effects.

| Вопрос | Точное предлагаемое решение и граница | Текущий статус |
|---|---|---|
| Первая привязка Client без прежнего verified channel | Разрешить initial-only A18 branch для единственной существующей цепочки account → Client → exact CRM card после успешного OTP на номер, свежо прочитанный из этой карточки. Это откроет личные записи/историю; владение номером не исключает shared/reissued number. Нет поиска/слияния по телефону, подмены V2 predecessor или допуска неоднозначной цепочки. [Полный исходный вопрос и риск](MAYA-FIRST-CLIENT-LINK-REMAINDER-20261007.md#decision-brief-smallest-reuse-of-an-existing-trusted-proof-owner). | **PENDING**; существующий verified Client path не требует повторного разрешения. |
| Scoped C10 Occupancy shadow | Назвать один tenant и начало pilot, принять либо исправить [точный proposed envelope](MAYA-C10-SCOPED-SHADOW-DECISION-BRIEF-20261007.md#минимальный-пакет-решения-владельца): одна новая current C5 Opportunity revision → proposal-only C9, без CRM mutations/outbound/model calls. Предлагаемые 10 admissions/день не являются утверждённым лимитом. Нельзя обновлять user event от имени scheduler. | **PENDING**; explicit-request L0/L1/L2.5 продолжается. |
| Read-only SSH inventory | Разрешить только уже рассмотренный metadata collector: `botadmin@api.mayaos.ru` через существующий `mocine3388@prime.beget.com`, `python3 - --collect`, reviewed bytes на stdin, ≤10 минут, $0; без secret contents, setup, service/permission changes или paid calls. Exact argv, pin и [automatic-review rejection](MAYA-REAL-MODEL-PREREQUISITES-20261007.md#concrete-read-only-inventory-collector--not-executed-on-target) остаются прежними. | **REJECTED / PENDING exact permission**; процесс не создан, SSH/collector не выполнялись, retry/workaround не разрешён. |
| Карточка однодневного графика в текущем closed profile | **Разрешить только для графика одного мастера за один день исправление обычным сообщением в чате вместо обязательного отдельного редактора; после правки заново показать текущие/новые интервалы и потребовать новое подтверждение?** Рекомендуется этот узкий вариант. Он относится только к `schedule_rule` / существующему A15; остальные SETTINGS_DRAFT и HANDOFF остаются закрыты. [Точная нормативная поправка и неизменные fences](MAYA-DEVELOPMENT-PROFILE-CHOICE-20261006.md#minimal-owner-choice). | **PROPOSED — NOT APPROVED**; до ответа текущая карточка недоступна в closed profile. |

Последний вопрос меняет ровно продуктовую обязанность non-chat fallback из
SETTINGS.4. Это не повторное разрешение на управление графиком и не новое
разрешение AE/роли. [Нативный source checkpoint](MAYA-NATIVE-SCHEDULE-SOURCE-CHECKPOINT-20261008.md)
доказывает backend/full-scope synthetic путь, но не closed-profile доступность.
Если исключение не одобрено, этот профиль сохраняет текущий отказ. Реальный
HANDOFF-редактор потребует отдельной конкретной receiver/profile квалификации;
его нельзя включить переименованием в NAVIGATE или REFINE.

Ни один ответ не подразумевает принятие остальных трёх вопросов. Этот документ
не меняет normative/generated contract, runtime, физическую схему, retention,
права, credential access или release trust. **NOT_ISSUED.**

## Исторический readiness pass — 2026-10-05

Ниже сохранён прежний документ и его тогдашние статусы; они не заменяют текущие
checkpoint и четыре точных вопроса выше.

Дата: 2026-10-05. Проверенный код: `c9e1013ca27dcd372ebcd5b306cdb4f46ce4f274`, ветка `codex/maya-b35-completion-20261005`. Это короткий readiness pass по существующим контрактам, **не новый аудит, не разрешение на release и не заявление о завершении MAYA**. Реализация в этом проходе не менялась. Evidence выполненной работы — в [completion map](MAYA-FINAL-COMPLETION-MAP.md).

## Решения владельца

| Решение | Рекомендация и граница | Что оно разблокирует |
|---|---|---|
| Website: **generic finder сейчас или opaque preselect** | Рекомендуется approved opaque preselect: сохранить выбранные салон/мастера через серверно разрешаемый opaque handle под существующими invite/booking owners. Handle несёт preference, не Client/approval authority. Generic finder — допустимая альтернатива только с явным согласием на потерю автоматического preselection. Решение пока pending. | Контракт входа с сайта. NT8 запрещает URL parsing tenant/staff; `#r=w&h=…` сейчас не имеет действующего публичного resolver. |
| Inbound: **бот каждого салона или общий бот MAYA** | Рекомендуется installation собственного бота каждого салона при общей реализации. Общему боту нужен явный выбор/привязка tenant до маршрутизации. | Tenant admission первого customer inbound; CRM integration не заменяет channel installation. |
| Inbound: **retention unlinked и dedupe tombstone** | Рекомендуемый вариант из текущего плана: ceiling 180 дней с возможностью короче, включая unlinked content/метаданные; erasure удаляет linkable content. Нужно выбрать допустимость хранения unlinked, срок минимального tombstone и обращение с ещё unresolved action evidence. Не копировать срок другой подсистемы. | Receipt schema + lifecycle. Без решения schema не добавляется. |
| C10: **первый автономно инициируемый сценарий и его envelope** | Рекомендуемый первый scope: один pilot tenant × OCCUPANCY × read/recommend по существующей current Opportunity; L1, показ владельцу внутри MAYA, без booking mutations, outbound delivery и L3/L4. Это предложение, не уже разрешённый цикл. | Проектирование первой C10 initiation policy; подробности ниже. |
| Live acceptance: **конкретный pilot и разрешённые effects** | Подтвердить authenticated tenant/branch/owner и controlled verified Client с собственными каналами; определить допустимые уведомления/CRM effects и cleanup только созданных тестом объектов. Отдельно разрешить нужный backend release и конкретные live действия. | Проверка с реальным provider. `muzhskaya-estetika-3` — только публичный candidate. SMS flag не отключает внешние automation/reminders. |

Первые три решения уже pending; повторных запросов или обходных реализаций не требуется. Phone process launch подтверждён; UI/login ещё требуют наблюдения владельца. Установленный payload использует неизменённый production API. Повтор install/trust/Mirroring не нужен.

Основания: [NT8](MAYA-WIDGET-CONTRACT-V1.md), [website finding](MAYA-FINAL-COMPLETION-MAP.md#website-canonical-entry--bounded-contract-finding-2026-10-05), [inbound plan](MAYA-INBOUND-COMPLETION-PLAN.md), [tenant invite owner](../../maya-saas-backend/src/tenants/tenant-pwa.service.ts), [carrier parser](../../maya-chat-shell/src/shell/deeplink.ts).

## C10: что отсутствует, а что не требует нового решения

Применяется L-модель [architecture gate §9–10](MAYA-ORCHESTRATOR-AGENTS-ARCHITECTURE-GATE.md): L0 читает/отвечает; L1 рекомендует; L2 готовит подтверждаемое намерение; L2.5 shadow не исполняет; L3/L4 — отдельная ограниченная автономия. Нельзя приравнивать строку `L3_CANONICAL` отдельного capability к выданному агенту blanket permission.

**Без новой autonomy policy допустимо:** по свежему запросу пользователя читать доступные canonical facts, возвращать source-qualified ответ/структурную рекомендацию через существующий C9; исправлять обнаруженные дефекты этих путей и писать isolated tests. Пользователь может явно выбрать существующую Opportunity. L0/L1 не требуют создания нового scheduler, нового policy store или ещё одного business owner. `c9.registry.ts` уже назначает read capabilities четырём доменам; `c9.store.ts` проверяет текущий principal, event token и Opportunity/task correlation. Существующие C6/C8 schedulers сохраняются — их не надо заново объявлять C10.

**Для самостоятельной повторной инициации недостаёт выбранной product policy**, а не просто слова «разрешаю автономию»:

- точные tenant × agent domain × capability/action class и максимальный уровень; какие классы остаются с текущим confirmation;
- trigger/условие нового цикла, частота/quiet window и адресат рекомендации; повтор той же Opportunity revision не должен становиться новым разрешением на effect;
- лимиты на частоту/аудиторию/стоимость и, если появятся денежные effects, суммы; область kill switch и получатель escalation при UNKNOWN, исчерпанном бюджете или отсутствии источника;
- измеримый результат выбранного сценария, scope shadow сравнения и критерий перехода выше. Owner approval не заменяет выполненные shadow/reconciliation условия. Сейчас **не предлагается** включать L3/L4.

Это конкретизация уже указанных `limits/kill switch/escalation`, не новый approval board, ADR-процесс или governance gate. Значения этих полей для первого C10 scope пока не выбраны. [C9 scope](CYCLE-09-PREFLIGHT-AND-SCOPE.md#3-product-objective-and-boundaries) прямо отделяет repeated initiation; [carry-forward](CARRY-FORWARD-REGISTER.md) задаёт tenant × domain × action class. [AgentTask](../../maya-saas-backend/prisma/schema.prisma) имеет default `L2_5_SHADOW`; [engine](../../maya-saas-backend/src/opportunities/opportunity.engine.ts) отвергает другую autonomy и side effects. Снять этот guard без замещающего утверждённого контракта нельзя. `entryRef` — существующий seam, не готовый autonomous launcher.

[C9 budget](../../maya-saas-backend/src/orchestration/c9.budget.ts) уже ограничивает один run: 2 домена, 12 tool calls суммарно/6 на домен, 12 model calls, 120 секунд reasoning. Это **не tenant-wide daily autonomy quota**. `aiCost: null` в default не разрешает бесплатный/безлимитный paid execution: `c9AssertPaidAllowance` требует валидный price manifest и положительный cap. Денежную сумму здесь не выдумываем.

## Предложение измеримого load envelope

**Все числа ниже — инженерные допущения для isolated benchmark, не реальные traffic/data volumes и не обещанная capacity.** Их можно уточнить по pilot наблюдениям; это не дополнительные обязательные owner approvals или release gates. В этом проходе нагрузка не запускалась.

| Параметр | Предлагаемый тест |
|---|---|
| Tenant stages / dataset | 1 → 10 → 100 → 1000 synthetic tenants; для каждого 2 branches, 10 staff, 20 services, 1000 Clients, 3000 appointment facts с историей. Последний stage: 1 млн Clients и 3 млн appointment facts. Это выбранные fixture cardinalities. |
| Активность | Допущение: 10% tenants активны одновременно, по 2 sessions, один запрос/session/10 секунд. На 1000 tenants это **20 requests/s** (100 × 2 / 10), не эмпирическая оценка. |
| Профиль HTTP | 70% canonical reads, 20% chat/C9 reads, 5% confirmed simulated actions, 5% same-key retry/resume. External CRM/model/delivery — controlled adapters; entitlement/auth/AE/DB настоящие. Отдельно мерить overhead backend и добавленную provider latency. |
| Длительность | 20 requests/s на 30 минут; burst 100 requests/s на 5 минут; затем soak 20 requests/s на 2 часа. Предварительно прогреть caches, сохранить cold/warm результаты отдельно. |
| Noisy tenant / faults | Отдельный прогон: 10 tenants дают 80% нагрузки. Вводить loss-after-effect, concurrent retry и worker restart; зависшие UNKNOWN не пересылать. Нет настоящих сообщений/платежей/CRM writes. |
| Предлагаемые ориентиры | Non-model reads p95 ≤500 ms / p99 ≤2 s; full C9 с фиксированной fake provider latency p95 ≤5 s; неожиданные 5xx <0.1% вне fault window. После burst pending backlog возвращается к baseline ≤5 минут; p95 тихих tenants ≤2× их baseline. Это гипотезы для оценки, не нормативные SLO. |
| Что обязательно сохраняется из contract | Ноль cross-tenant раскрытий/эффектов; ноль повторных provider effects для одного intent; UNKNOWN не FAILED; текущая authority/consent проверяется. Accepted message не считается conversion/revenue. |

Записывать actual throughput и offered load отдельно, p50/p95/p99, отказанные/bounded requests, retries, возраст pending и UNKNOWN по отдельности, DB pool wait/locks, CPU/RSS/event-loop lag и source completeness. Реальные provider quotas, latency и модельные затраты проверяются отдельно в разрешённом pilot: fake-edge benchmark их не сертифицирует. B35 уже ограничивает явную аудиторию 500 Clients и окно worker 25 секунд; нагрузочный сценарий не должен молча обходить эти границы ([bulk owner](../../maya-saas-backend/src/marketing/canonical-bulk.service.ts), [delivery](../../maya-saas-backend/src/communication-delivery/communication-bulk-delivery.service.ts)).

## Git и текущая граница работы

Одна попытка `git fetch --no-tags origin` успешна. `origin/main = d6583a96c58b3b75b0ecfadc3a3b01e55b3b9015`; `origin/codex/maya-controlled-integration-20260930 = dff728e85a97841dd72bd290992b888344780780`. Main — ancestor integration (1067 commits между ними). Checkout/HEAD не переключались; push/merge/deploy отсутствуют.

В завершённых delivery slices новых известных безопасных незакрытых дефектов не осталось. Следующая **уже выбранная** реализация website/inbound/C10 blocked указанными product решениями; live acceptance — конкретной авторизацией и pilot scope. Это не утверждение, что вся безопасная L0/L1 работа или весь продукт исчерпаны: bounded L0/L1 improvements и предложенный isolated load test допустимы без новой autonomy policy, но новый такой scope не реализовывался/не аудировался в этом коротком проходе. **Общая задача MAYA не завершена.**
