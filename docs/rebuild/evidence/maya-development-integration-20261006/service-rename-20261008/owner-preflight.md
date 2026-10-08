# Service rename: independent owner preflight, 2026-10-08

**Вывод: title-only редактирование одной существующей услуги YCLIENTS входит в уже разрешённую разработку. Non-MONEY APPROVAL не запрещён. Сейчас можно подключать полезный текстовый READ preview через существующий C9. Для выбранного прямого chat → AiApprovalRequest → APPROVAL пути требуется отдельное узкое admission происхождения подтверждения; наследовать F74a/F74b нельзя.**

Проверка документации и текущих механизмов относительно HEAD `d90243a6cb655a82de1ceb347f25cddfd04de074`. Это preflight, не review нового rename runtime. Никакие tests/services/provider/model/SSH не запускались, рабочее дерево не изменялось. Параллельные изменения root в handler/catalog/runtime не включены в этот вывод. Единственный созданный файл — этот отчёт в `/tmp`.

## Уже разрешённая инженерная работа

[Product scope](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/product/README.md:35), строки 37–39 и 56–62: управление услугами через доступные YCLIENTS API, текущие права, единый CRM/action owner, mutations только через AE и честный UNKNOWN. Строки 52–54 отделяют development от production effects. [Management brief](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-YCLIENTS-MANAGEMENT-DECISION-BRIEF-20261007.md:3) прямо говорит: новый AE name/registration — engineering, не повторный product permission request; строки 17–21 отдельно разрешают external service create/update, finite owner extension, source-qualified preview и UNKNOWN reconciliation.

Поэтому отсутствие нового AE key, adapter или mapping само по себе **не owner blocker**. Можно делать typed source contract, read/preservation validation, bounded preview, finite executor/normalizer/reconciliation и synthetic tests. Реальная CRM mutation и production acceptance этим не разрешены.

[A27/A28 gate](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/CYCLE-06-BLOCKING-PACKAGE-5-WAVE-4-A27-A28-RUNTIME-CONTRACT-GATE.md:14), строки 14–17, 25–38, 53–76: A27 — local TenantCatalogItem, A28 — internal-calendar configuration. Их AC1 локальный executor не становится внешним YCLIENTS writer. Сохраняется `assertInternalCalendar`; внешний title-only effect требует собственного конечного descriptor под существующим AE. Строки 98–101 сохраняют прежние appointment snapshots.

## Минимальный полезный READ preview — допустим сейчас

`catalog.service.rename.preview`, `riskTier: read`, OWNER only, один явный current service ID и новое title; существующий `AiCore → C9.conversationRead → CRM → typed adapter`, server-composed текст «Это проект. Применение изменения пока не подключено». Показываются текущий и предлагаемый title, точная услуга/company и ограничения источника. Никакого AiApprovalRequest, AE ingress, approval/control intent или обещания применённого изменения.

Реестр должен быть атомарно полным: exact catalog definition, input validation, handler dispatch и C9 domain mapping. [c9.registry.ts](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/orchestration/c9.registry.ts:114) производит READ из `riskTier === 'read'` и отказывает неизвестному domain mapping. Это техническое derivation, **не автоматическое нормативное admission F36a**.

F36a — закрытый набор 15 C9-only reads; его fence 1 прямо запрещает catalog entries ([contract](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:674), строки 674–691, 743–747). Новый preview в него не входит. F3, строки 60–68, формально требует versioned recorded owner decision для изменения C9 вне F36a/b; F28, строки 434–444, фиксирует widget policy baseline. Эти нормы нельзя объявлять выполненными лишь потому, что tool имеет read risk.

При текущем явном разрешении разработки допустима **отдельно квалифицированная development registration**, без widget eligibility и без заявления о завершённой нормативной widget/release сертификации. Это тот же явно изолированный тип изменения, что принятый [goods-search checkpoint](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-YCLIENTS-GOODS-SEARCH-CHECKPOINT-20261008.md:29): точная TOOL/C9 delta, сохранённые historical census/hash, без изменения AE/production-policy registrations и без regeneration release profile. Прецедент не является новым F36a ruling. Не нужна F38 пара там, где нет mutation/COMMIT. Не использовать wildcard исключение из totality: отдельная exact pair и отрицательное доказательство отсутствия widget admission.

Уточнение после implementation review: существующий `capability-policy.ts:332` выводит POLICY_ROWS из всех C9_CAPABILITIES; новый READ автоматически получает C9 policy metadata (`consent_class: none`, `min_verification: SESSION_VERIFIED`). Исключать его из этой totality derivation не следует. Это не widget admission: закрытые owner-kind/projector/read-port mappings, release profile и отсутствие AE pairing/control сохраняют отказ. Указанное выше отсутствие новой policy registration относится к AE production policy, а не к вычисляемой C9 policy row. Предыдущая краткая формулировка «вне widget policy» была неточной и заменяется этим уточнением.

Обязательные bounds preview: current active tenant/OWNER и integration/branch/source identity; повторная проверка после awaits и на cached replay; source revision включает текущую provider identity; stale/incomplete/foreign/revoked → отказ/held, не пустой успех. Чужой ID не расширяет tenant. New title из текущего запроса, без model guess; server-only полный snapshot не отправляется модели. Preview остаётся проектом даже при успешно прочитанном источнике.

## APPROVAL: две разные ветви

| Путь | Что уже допускает контракт | Что ещё отсутствует |
|---|---|---|
| Обычный canonical AE approval | F30 допускает APPROVAL для operational/settings; F31 сверяет `requires_ae_approval` с registry. F74 требует настоящий consumed REQUEST_APPROVAL именно для того AE key. R3.11.1–5 описывают fresh nouns/policy binding и `ActionEngineKernel.decideApproval`. | Конечный service owner/request adapter, traced F38 pair, positive allowlist и exact C9 policy/admission. Это реализуемая обычная ветвь, не запрет non-MONEY. Нельзя объявить готовой по одному существованию интерфейса. |
| Прямой canonical chat → existing AiApprovalRequest → одна APPROVAL | Сейчас только отдельно названные F32a/F74a price и F32b/F74b goods. | **Именно новый typed canonical-chat origin admission для service rename.** Он снимает обычное требование consumed REQUEST_APPROVAL только для своей точной capability; до такого решения rename COMMIT не mintable. |

Точные нормы: [F29–31](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:446), строки 446–487 — positive closed allowlist, зарегистрированная policy и одна traced pairing; [F37–38](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:798), строки 808–813 — GAP без кнопки, mapping нельзя угадать по имени; [F74](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:1487), строки 1499–1508 — настоящий consumed REQUEST_APPROVAL; [F74a](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:1524), строки 1524–1550 — «for F32a alone», никакая иная capability не получает эту origin ветвь; [F74b](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:596) отдельно допускает goods. [R3.11](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:5181), строки 5181–5239 — decision-time re-resolution и два исключающих решения на одном subject.

Текущее исполнение подтверждает конечность: [CanonicalApprovalAdapter](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/widgets/owner-ports/canonical-approval.adapter.ts:21) отправляет request только в B35; decide — exact goods/price либо B35. [ApprovalRequestAdapter](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/widgets/owner-ports/approval-request.adapter.ts:38), строки 38–44 и 61–72, принимает только `communication.bulk-campaign.admit.v2`. Новый service REQUEST_APPROVAL owner ещё надо реализовать; подмена service approval ID на B35/ActionExecution ID недопустима.

Обычная AE_REQUIRED ветвь — допустимая инженерная альтернатива, но не молчаливая замена выбранного пользователем прямого chat flow вторым workflow. Она также не освобождает от exact registry/pairing/policy admission. Нельзя выдумать consumed REQUEST_APPROVAL задним числом, двойное одобрение или generic AiApproval handler.

## Почему нельзя переиспользовать MONEY admission цены

[F32a](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:566), строки 566–588, описывает только точный `crm.service.fixed-price.update.v1`, financial remains true, outer AiApprovalRequest, AE approval NONE, один effect attempt и UNKNOWN без redispatch. Это не общий service edit и не generic approval origin. [Executable predicate](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/widgets/pricing/service-price-widget.contract.ts:17), строки 17–55, сравнивает весь descriptor, а не похожее имя.

Чистый title-only descriptor может честно быть non-MONEY: F32, строки 540–553, не считает `crm_service` финансовым target сам по себе. Это необходимо проверить по реальному эффекту и facets; отсутствие financial нельзя использовать как обход positive allowlist. F74 ограничивает происхождение подтверждения независимо от MONEY.

Рекомендуемый первый field — только `title`; `booking_title`, `comment`, prices, duration, staff settings, booking flags и остальные provider fields не меняются. Не добавлять comment в тот же срез без отдельного смыслового/preservation контракта. Existing [servicePriceSnapshot](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/crm/yclients-service-price.contract.ts:134) проверяет exact company/service, completeness, local non-chain и полное сохраняемое состояние; строки 174–183 уже различают title, booking_title и comment. Это материал для переиспользования проверок, **не разрешение расширить price normalizer**. Для rename нужен собственный before/after hash, исключающий только title: текущий `nonPriceHash` в строках 233–266 включает title и не подходит как готовый non-title witness. Неизвестные provider preservation/readback semantics — техническая квалификация, не новое разрешение всей функции.

## Один конкретный следующий нормативный выбор

Для требуемого прямого chat flow предложить отдельное решение, условно `YC-SR1-CHAT-1` / новый F74c (название **предложено, ещё не принято**):

> Допустить в development одну текущую local non-chain услугу YCLIENTS к изменению только title через отдельный exact AE descriptor и non-MONEY APPROVAL, family operational с явно выбранным finite mapping. Использовать existing outer AiApprovalRequest и durable authenticated-turn provenance по separately named service-rename owner, без фиктивного REQUEST_APPROVAL и без второй AE approval. Current tenant-wide OWNER, original requester, immutable proposal/hash, source/permission revision, expiry и свежий before-state проверяются на decision и dispatch. Одна original approval subject/версия; approve/reject взаимно исключаются; исправление создаёт новую версию, replay не меняет parent/expiry. Prices/booking_title/comment/прочие поля сохраняются, UNKNOWN удерживает target и запрещает redispatch, success требует authoritative exact readback и matching AE receipt. Нет price/MONEY exception inheritance, generic service editor, batch, background, новой schema/retention или production authority.

Это решение меняет **точный carrier origin admission**, а не заново разрешает «редактировать услуги». В versioned delta должны появиться actual descriptor, traced F38 pair, policy/floor, noun/decision owner и origin guard; до их реализации никакой кнопки применения. Достаточно подготовить этот конкретный результат на review, продолжая safe callable preview. Рекомендация не является принятым owner решением и не объявляет C10/MAYA/release завершёнными.

## Привязка прочитанных оснований

Ниже SHA-256 committed bytes на указанном HEAD; колонка current-match — совпадение с прочитанными файлами рабочего дерева во время записи отчёта. Новые файлы rename не проверялись. 11 canonical/owner файлов совпали с HEAD. `c9.registry.ts` и `totality.spec.ts` изменились параллельно при работе root; их строки ниже привязаны к committed baseline, новые delta этим preflight не утверждаются.

| Source | SHA-256 | current-match |
|---|---|---|
| `docs/product/README.md` | `926a2b30ada5579da5005a157638a6675c6907cfed2064abeb4e01bdfbc525bd` | `true` |
| `docs/rebuild/MAYA-YCLIENTS-MANAGEMENT-DECISION-BRIEF-20261007.md` | `b2a9cfbaec61a6094735478c91654ebc7f3cfaa647914d7cec9f50c8051758c2` | `true` |
| `docs/rebuild/CYCLE-06-BLOCKING-PACKAGE-5-WAVE-4-A27-A28-RUNTIME-CONTRACT-GATE.md` | `6f39ff57431da691f92938e4903e9552cd60d011e09e372187216d18e9d2d6f4` | `true` |
| `docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md` | `0843f3cfc8c651423a8d3a355092aa27742163bcf5fc5ba99f8328a4f033398c` | `true` |
| `docs/rebuild/YCLIENTS-SERVICE-PRICE-CANDIDATE-2026-10-06.md` | `2fd120056cbeeaa82e0f5f3a72331deaa36e737c3df4a8f72abed907d76f678a` | `true` |
| `docs/rebuild/YCLIENTS-SERVICE-PRICE-UI-CANDIDATE-2026-10-06.md` | `acf909433bbe7d4b056c16c42dc5458af6d41009ae5a9c9dc782cab72d6b6dd2` | `true` |
| `docs/rebuild/MAYA-YCLIENTS-GOODS-SEARCH-CHECKPOINT-20261008.md` | `f36616f1aed67d0a3028796022e8f38fb0f6d6b268c6c232b6ad05ddd7fae6ac` | `true` |
| `maya-saas-backend/src/widgets/owner-ports/canonical-approval.adapter.ts` | `fbadf88c7a6b629b607e44a1a3322b4858c70acdc001fd4019b337749c3445e1` | `true` |
| `maya-saas-backend/src/widgets/owner-ports/approval-request.adapter.ts` | `5eb7204670552aa9e53364998175b158c09860f9ee7e85c38158890d0a001dc7` | `true` |
| `maya-saas-backend/src/widgets/pricing/service-price-widget.contract.ts` | `43c6a7116985667e6b7fb030f5d2157dbbb45223e47485fe619110d4a24e719e` | `true` |
| `maya-saas-backend/src/crm/yclients-service-price.contract.ts` | `197f896d4aad2de9240b0ff17788796fdf908626452a68d89bc2f2789eb474f5` | `true` |
| `maya-saas-backend/src/orchestration/c9.registry.ts` | `ffde3c29941570f20d9f05d2fd0ef7a1d683c31824fcad7743a18ef19fcfde5e` | `false` |
| `maya-saas-backend/src/widgets/authority/totality.spec.ts` | `c330296a5010285c2dd62a38f271bd4510b50bbb74a60edcbf0fac5e834cb2af` | `false` |
