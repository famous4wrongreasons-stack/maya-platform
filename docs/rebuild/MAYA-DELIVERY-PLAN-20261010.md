# План завершения MAYA — 10 октября 2026

## Результат для владельца

**Цель — полная масштабная MAYA на общей multi-tenant codebase; салон владельца — первый пилот той же системы.** Кампании, четыре домена агентов, ограниченный C10 и последующая квалификация 1000+ салонов остаются в плане. Последнее указание владельца 10.10, 12:53 UTC: «продолжай работать над масштабной версией и выдай мне план действий а то я уже потерялся»; в 12:54 он подтвердил работу по плану и вынес дизайн в другой чат. Это заменяет промежуточный выбор выпуска только для одного салона.

Первый пилот позволяет проверить полезные функции раньше массового подключения, разнообразия конфигураций и нагрузки на 1000 салонов. Он почти не сокращает разработку ещё отсутствующих функций. Используем ту же codebase и tenant-aware архитектуру; не создаём отдельную версию с жёстко заданными company/branch, ослабленными правами или вторым orchestrator.

**Оценка всей функциональной поставки пока NOT_ESTIMABLE.** Независимая оценка известного интеграционного пакета — **12–24 инженерных дня**, но это не весь остаток MAYA и не обещание даты выпуска. Неизвестный объём API-операций, campaign delivery/measurement, customer knowledge и политики C10 нельзя честно включить в этот диапазон. Прежний ориентир «6–12 недель» отозван как неподтверждённый; эта оценка к нему не подгонялась.

Первый полезный сквозной путь — чат с реальными чтениями и подтверждёнными create/move/cancel — промежуточный результат внутри полного выпуска. Его готовность не объявляет завершёнными кампании, C10 или всю MAYA. Работа идёт в следующем порядке:

1. Собрать текущий кандидат: нормальный вход, бизнес/филиал, подключение YCLIENTS.
2. На первом салоне проверить реальные чтения, запись/перенос/отмену и подтверждённое изменение цены/графика.
3. Проверить полезный многошаговый диалог с настоящей моделью.
4. Закончить Admin/знания, аналитику, Lifecycle/кампании и оставшиеся согласованные API-операции YCLIENTS.
5. Довести совместную работу агентов и конкретные ограниченные C10 workflows.
6. Проверить текущий телефонный carrier/voice, восстановление, privacy и эксплуатацию.
7. Подключить второй независимый tenant и измерить нагрузку/изоляцию вплоть до выбранного envelope 1000 салонов.
8. Выпустить проверенный кандидат после отдельного допуска к целевой среде.

Независимые функциональные задачи выполняются параллельно; этот порядок показывает зависимости пользовательского результата, а не запрет начать пункт 4 до первого реального запуска. Дизайн ведётся в другом чате; здесь только необходимое функциональное соединение существующих интерфейсов.

| Цель | Что требуется | Что можно делать позже |
| --- | --- | --- |
| Первый полезный путь в приложении | Нормальный вход и права, одна проверенная company↔branch, текущие факты, диалог, собственная запись/перенос/отмена, честный результат и восстановление | Остальные функции продолжаются до полного первого выпуска |
| Полная функциональность на первом салоне | Все включённые ниже группы, реальные роли/источники/модель, кампании и конкретно ограниченный автопилот, эксплуатация и восстановление одного салона | Массовый rollout проверяется следующим этапом; функции не урезаются |
| **Масштабная MAYA — выбранная общая цель** | Те же функции плюс независимый второй tenant, разнообразие конфигураций, измеренная нагрузка/квоты/очереди и эксплуатация выбранной инфраструктуры | Срок устанавливается после измерений, а не умножением числа салонов |

Уже в первом пилоте обязательны foreign-tenant отказ, текущая авторизация, защита персональных данных, идемпотентность и восстановление. Порядок реальных установок не отменяет локальные проверки изоляции.

## Основание и уже завершённое исправление

План сводит [карту завершения](MAYA-FINAL-COMPLETION-MAP.md), [карту согласованных доменов](MAYA-APPROVED-DOMAINS-REMAINING-GAP-MAP-20261007.md), [остаток реализации](MAYA-IMPLEMENTATION-REMAINDER-20261008.md) и [YCLIENTS-first scope](../product/README.md). Более новые checkpoints в карте имеют приоритет над историческими строками. Это план работ по существующим владельцам, без новой системы сертификации.

Последний фактически проверенный normal-onboarding runtime: `11e16cd111af6fa571ed2b638fb2dac06acd31d1`; новый setup-read source checkpoint — `2777ca65ab69c71224e20971d491575d074eb096`, ветка `codex/maya-local-crm-setup-20261010`. Полная база текущего follow-up: **`77d41ef56254972d6ae849d497046ea02ac2487c`**.

[Подключение филиала и восстановление](MAYA-A17-SAME-ID-RECOVERY-HANDOFF-20261010.md) готовы локально: после потери запроса до регистрации пользователь явно повторяет ввод/согласие с прежним UUID; первая зарегистрированная версия материала сохраняет приоритет. Потеря ответа после выполнения восстанавливается чтением исходной операции. Нет автоматического нового действия или второго подключения.

Доказательства: 78 backend, 38 frontend/net/URL, 5 driver и 6 launcher tests; фактический HTTP/current React proof с 298 + 97 assertions и перезапуском Node/PostgreSQL; отдельный фактический запуск формы, штатного auth и atomic import на synthetic native YCLIENTS. [Архив](evidence/maya-a17-same-id-recovery-20261010/summary.json) сохраняет источники, ограничения и независимые reviews. Все собственные процессы этого запуска остановлены; новая owner demo не открыта.

Отдельный [native YCLIENTS setup-read профиль](MAYA-LOCAL-YCLIENTS-ONE-TIME-HANDOFF-20261010.md) теперь реализован: приватный partner ввод в TTY, user token в существующей React форме, собственная PostgreSQL, семь конечных GET templates, обязательная полная команда ≤50, отдельные явные install и activation/import. **29/29 focused tests и независимый static review PASS**; [evidence](evidence/maya-local-yclients-read-profile-20261010/summary.json). Новый профиль с AppModule/PG/настоящим TTY ещё не запускался. Реальные токены/YC не использованы; согласованный runtime слот и точный owner handoff остаются следующими. Это не full MAYA/C10 acceptance. Рабочий сайт, production, дизайн и телефон не менялись.

**Следующий функциональный разрыв уже закрыт локально:** на `4aec1a470a3b66766af3e20d867ef1fd9f2627ef` текущий React получил «Создать бизнес» через существующие standard trial APIs и обычный вход по паролю. Создаются бизнес/первый филиал/владелец; CRM подключается отдельно. При неопределённом ответе форма предлагает парольный вход и не создаёт бизнес повторно. Исправлены гонки старого входа с новой регистрацией и cleanup формы с успешной сессией; токены не передаются presentation. **117 focused synthetic/SSR tests, shell build, React guards/types/build PASS**, финальные 6 SSR повторены после исправления формы записи стилей. Независимый review и 13 точных source bindings сохранены в [evidence](evidence/maya-standard-onboarding-20261010/summary.json). Начальные SSR/compile failures сохранены. Actual normal onboarding HTTP/PG/current React теперь PASS на двух синтетических бизнесах: 8 initial + 2 restart checkpoints, реальная потеря signup ответа после commit, 7 password logins, те же owner/branch IDs и отсутствие дублей. [Evidence](evidence/maya-normal-onboarding-actual-20261010/summary.json). Mac runtime metadata blocker исправлен; 10 pure tests, builds и scoped ESLint PASS. Все собственные процессы остановлены. Real source/profile admission и widgets.runtime остаются открыты; это не завершение этапа A целиком.

## Состояние 12 групп поставки

Это 12 групп для планирования, не новый нормативный реестр агентов. «Реализовано», «соединено», «проверено» и «принято на реальном салоне» — разные состояния. Во всех строках полная реальная приёмка **NOT_ISSUED**. Наличие 163 `certified:false` не означает 163 дефекта; unmapped API operation тоже не означает отсутствующую реализацию.

| № / группа | Реализовано | Соединено в текущем приложении | Проверено и предел | Реальная приёмка | Точный остаток |
| --- | --- | --- | --- | --- | --- |
| 1. Естественный диалог и продолжение задач | Semantic selection, уточнения, исправления, возврат к теме, общие вопросы, bounded history | Текущий React → chat → сохранённый контекст и разрешённые source READ | Локальные scripted сценарии; отдельные 5 actual model responses имеют ungraded semantics | NOT_ISSUED | Репрезентативный multi-turn цикл по ролям; исправление воспроизводимых смысловых ошибок и непонятных состояний. Не заменять понимание перечнем точных фраз |
| 2. Один C9 и согласованный результат агентов | Runs/revisions/evidence, reviews/continuations, explicit Occupancy/Lifecycle/BI и Admin capabilities | READ bridge и конечный compound дают один ответ; не все capability READ вызывают отдельный agent reasoning | Локальные HTTP/React/restart; конечная композиция, не любые процессы | NOT_ISSUED | Замкнуть конкретные многодоменные задачи через существующий C9; проверить реальное планирование и единый ответ. Не строить agent v2/second orchestrator |
| 3. YCLIENTS, филиал и API-управление | Одна company↔branch, native readers, отдельные mutations, A17 atomic import и same-ID recovery | Текущая opt-in setup form, выбранные chat verticals | Synthetic native + HTTP/React/restart; real source пока не подключён | NOT_ISSUED | Обычный профиль и real setup; operation inventory → adapter/owner/chat/outcome. Создание/редактирование услуг, связей услуга–мастер и карточек сотрудников покрыты не полностью. Один салон не делает их готовыми |
| 4. Client identity, личные данные и запись | Verified A18 context, own/Admin create/move/cancel через AE, source fences и UNKNOWN | Текущий React и existing Admin owners | Internal/synthetic native booking, reload/restart и cancellation company fence | NOT_ISSUED | Real verified Client lifecycle и outcome; initial-only Client proof пока отсутствует. Старые импортированные записи могут не иметь необходимого canonical origin для переноса |
| 5. Maya Admin: консультация и знания салона | Public salon/catalog/staff facts, A22 staff-only guidance | Собственный чат MAYA; полного roundtrip нового внешнего inbound нет | Локальные роли, источники и privacy refusals | NOT_ISSUED | Customer-visible knowledge contract и его связь с existing owner; полезная реальная консультация. Внутренние правила нельзя объявить публичной политикой |
| 6. Owner analytics, C7/C8 | Published C7, bounded finance/expenses/reviews, qualified C8 и объяснение | Выбранные owner вопросы, периоды и compound | Локальные source/revision/restart proofs, не полнота финансов салона | NOT_ISSUED | Проверить реальные периоды, полноту выручки/расходов/прибыли и source mapping, корректность объяснений. Недоступные cash/profit и причинность не выдумывать; disabled численные модели не включать без квалификации |
| 7. Occupancy после отмен | Existing C5 Opportunity + current availability → C9 → сохранённая версия предложения | Явный запрос в текущем чате, limited варианты и evidence | Synthetic native HTTP/React/restart; occupied/expired/stale/incomplete/revoked/foreign outcomes | NOT_ISSUED | Наблюдаемая реальная отмена и текущее окно, полезный ответ модели. Фоновая инициатива относится к №11; никаких списков клиентов/скидок/вероятностей по умолчанию |
| 8. Lifecycle, аудитории и кампании | Qualified C8 suggestions; B35 immutable audience, approval и delivery kernel | Рекомендации подключены; полный chat→campaign→measurement путь не завершён | Локальные delivery/retry/restart/UNKNOWN; реальных отправок нет | NOT_ISSUED | Конкретный campaign ingress, аудитория/consent/content/route/cost confirmation, выбранная существующая доставка, outcome и измерение. Delivered не означает conversion. Кампании остаются в полном функциональном пакете |
| 9. Работа сотрудников | Own schedule/journal, dossier, задачи/team owners, отдельные schedule actions | Выбранные READ/approval пути; own tasks читают A23 | Локальные day/timezone/role/continuation proofs, не весь рабочий день | NOT_ISSUED | Составить непрерывный staff workflow, довести нужные task/effect связки и права. Для confirmed schedule решить точный SETTINGS_DRAFT profile вопрос; backend сам по себе не открывает карточку |
| 10. Лояльность, сертификаты, абонементы, referrals/reviews | Существующие канонические owners и отдельные чтения/действия | Частичное chat-покрытие | Исторические owner proofs + отдельные новые bounded READ | NOT_ISSUED | По каждой нужной операции соединить source→role→review→AE→outcome в текущем приложении. Не переписывать готовые owners и не выдавать legacy balance за факт YCLIENTS |
| 11. Ограниченный C10 | Explicit L0/L1/L2, C5 L2.5 shadow и durable C9 foundations | Явные запросы; автономного initiator нет | Explicit proofs не доказывают C10 | NOT_ISSUED | Зафиксировать tenant×domain×action, trigger/principal, лимиты, отзыв/stop и escalation; затем existing-owner admission/dedupe/restart/shadow outcome, далее отдельные реальные workflow. Пока только узкий proposed Occupancy envelope, не весь автопилот |
| 12. Доставка приложения, privacy, onboarding и эксплуатация | React/headless/widgets/history erasure, tenant/auth/entitlements, iOS packaging | Standard onboarding и password login теперь связаны в carrier; многие desktop пути и Debug API override существуют | Onboarding: synthetic/SSR/build; остальные локальные browser/restart/isolation и исторический install отдельны; текущая phone UI не принята | NOT_ISSUED | Normal profile/grant и actual onboarding qualification, current-candidate reachability, mobile/voice/reconnect/privacy, backup/restore одного салона. Затем реальный второй tenant, конфигурации и measured 1000-salon envelope |

Архитектурная граница остаётся из [C9 preflight](CYCLE-09-PREFLIGHT-AND-SCOPE.md): четыре домена — Admin, Lifecycle, Occupancy, BI. Источники фактов — CRM/C7/C8 и их канонические владельцы; mutations — только существующий AE. Presentation и рекомендация не авторизуют действие. Кампании используют B35/CD, а не пятого автономного агента.

## Порядок работ и критерии результата

| Этап | Конкретная работа | Зависимость / проверяемый выход |
| --- | --- | --- |
| A. Обычное локальное приложение | Normal AppModule/DB/secret profile и carrier onboarding проверены actual локально на синтетических аккаунтах; осталось штатно создать owner/branch владельца в допущенном real-source профиле и получить существующий корректный widget-release grant для candidate/profile | Source-bound текущие frontend/backend, обычный вход/выбор филиала. Trial имеет crm.integration/ai.owner, но не widgets.runtime. Setup form и полная widget chat/action готовность проверяются отдельно |
| B. Один реальный источник | Приватный ввод YC credentials после допуска; exact company↔branch; отдельные install и activation/import подтверждения; current catalog/staff/availability | Факты и версии читаются из этой компании, source change/отзыв закрывают доступ. Credentials не попадают в модель, transcript или evidence |
| C. Первый полезный сквозной путь | Общий/предметный диалог → факты → verified Client create/move/cancel → confirm → outcome; исправления/reload/UNKNOWN; для owner — базовые доступные факты | Наблюдаемые реальные результаты текущего кандидата. Собственный тестовый Client и конечные разрешённые действия; без silent notifications. Это промежуточный результат, не полный выпуск |
| D. Полный функциональный пакет | Остаток №2–11: публичные знания, YCLIENTS management, staff/price/schedule, loyalty, BI, Occupancy/Lifecycle, campaigns и scoped C10 | Конечные операции каждого домена работают через текущий чат/источник/owner. Ни одно отсутствие API/прав/факта не скрыто общей фразой «готово». Независимые owners реализуются параллельно A–C |
| E. Полная функциональная проверка на первом салоне | Согласованный набор реальных рабочих диалогов по ролям и всем включённым функциям; mobile/voice где включены; восстановление/отзыв/privacy; backup/restore и наблюдение одного салона | Пользователь может пройти целые рабочие задачи. Реальные model/source/action evidence отделены от synthetic. Доставка на выбранный адрес/устройство допускается отдельно; работающий сайт не является обязательной площадкой |
| F. Платформенное расширение | Второй tenant штатным onboarding; различия компании/ролей/timezone/данных; измеренные очереди/квоты/нагрузка и восстановление на выбранной инфраструктуре | Собственные результаты второго tenant и измеренный envelope. Только после них можно говорить о поддержанной нагрузке; сохранённые tenant fences обязательны уже A–E |

Критическая цепь первого полезного пути: **normal profile/onboarding/entitlements → подтверждённый real source и verified Client → текущий chat/model/confirmed actions → проверенный outcome → выбранный reachable carrier**. Для телефона нужен доверенный доступный HTTPS; локальный браузер не требует телефона и может проверяться раньше.

Полный функциональный пакет дополнительно ждёт самый длинный из путей D, особенно API management, campaigns и C10; масштабный выпуск также требует F. Ни реальный setup, ни быстрый успешный booking не закрывают эту часть автоматически.

### Незавершённые функции и соединительные задачи

1. **YCLIENTS operation coverage.** В [сохранённом inventory](evidence/maya-development-integration-20261006/yclients-api-inventory/operations.json) 304 documented operations. Исторические «4 evidence-mapped / 300 unmapped» — состояние привязки доказательств, не подсчёт отсутствующего кода. Для каждой операции сопоставить product disposition, API/права, native adapter, existing owner, chat intent, подтверждение, outcome и фактически выполненный proof. Первым делом закрыть services CRUD/bindings и staff lifecycle в согласованном объёме, отдельно от уже существующих prices/schedule. Не строить arbitrary HTTP tool. Архив не доказывает сегодняшние права конкретного YC приложения: они проверяются при реальном подключении.
2. **Знания и Client.** Выделить public customer facts из existing A22 staff guidance без второго knowledge store. Для первой привязки Client нужен точный approved trust contract; готовый verified путь продолжается независимо. Consent register/export остаётся отдельным отсутствующим owner path, а существующее удаление истории не выдаётся за полный export.
3. **Staff, prices, schedule и соседние домены.** Соединить имеющиеся readers/effects с текущим диалогом и review. Price clarification/confirmed PATCH уже имеет локальный proof; это не service CRUD. Schedule backend готов в своей части, но closed profile требует решения о способе редактирования. Для tasks/loyalty/certificates перечислять конечные операции, а не создавать модули заново.
4. **BI/Lifecycle/Occupancy.** Довести реальные источники, доступные периоды, явные пределы и композицию. Окно после отмены и опубликованный отчёт уже дают один сохранённый ответ; нельзя обещать произвольный сегодняшний полный обзор по исторической ревизии. Недостаток данных для ranking/calibration не лечится выдуманными числами.
5. **Кампании.** Соединить разрешённую C8 аудиторию с existing B35 ingress; показать адресатную область, текст, канал, стоимость/лимиты и confirm; наблюдать delivery/reconcile и отдельно outcome. Существующие inbox/Telegram/push/APNS возможности не доказывают выбранный действующий канал или клиентское согласие. Входящие новые каналы отложены; исходящие кампании не отменены. До выбора маршрута/политики невозможно оценить недостающую реализацию целиком.
6. **C10.** [Proposed Occupancy shadow](MAYA-C10-SCOPED-SHADOW-DECISION-BRIEF-20261007.md) описывает первый конечный workflow, не всю автономность. Нужны machine admission в existing C9, точная source/task revision, dedupe, current policy/отзыв и bounded stop. Нельзя обновлять expiring user event от имени scheduler. Пока конкретный contract не принят, продолжать explicit-request работу; ни новый timer, ни объявление disabled-by-default не заменяют отсутствующее основание. Следующие автономные workflow оцениваются каждый по выбранному действию; L3/L4 автоматически не разрешены.

## Оценка усилий и её пределы

Инженерный день — один сосредоточенный день работы инженера, знакомого с этой codebase. Это не длительность CI/LLM ответа и не обещание календарной даты. Оценка сделана на checkpoint `ad224bfd`, до последующего локального соединения onboarding; эта частичная реализация не обнуляет оставшиеся normal-profile/grant/real-qualification работы пакета. Диапазоны предполагают повторное использование существующих owners, отсутствие архитектурного fork, доступ к согласованным источникам, одну текущую ветку интеграции и конечные сценарии. Не предполагаются новые schema/retention решения без точного согласованного delta.

| Пакет | Оценка усилий | Уверенность / включено и исключено |
| --- | --- | --- |
| Normal profile + UI к existing onboarding API + существующие entitlements | **3–6 инженерных дней на исходный пакет** | Умеренная: API был готов, UI после оценки соединён локально. Normal profile/grant и actual qualification остаются. Работа с существующим grant включена технически; ожидание платформенных полномочий/certificate отдельно |
| Соединить известные conversation/read/booking/staff/confirmed-write пути в последовательный опыт | **5–10 инженерных дней** | Умеренная/низкая: переиспользуем готовые bounded paths. Только имеющиеся операции, без полного нового API CRUD, public knowledge contract или универсальных compound задач |
| Первый конечный real-model + real-CRM цикл этих путей, recovery и refusals | **4–8 инженерных дней** | Ниже: подготовка/исполнение/разбор одного цикла. Неизвестные исправления по его результатам не включены; доступ/согласованные действия предоставлены до цикла |
| **Известный пакет выше** | **12–24 инженерных дня** | Сумма трёх неперекрывающихся пакетов; замещает более раннюю узкую оценку 7–14, а не добавляется к ней. Не полный функциональный выпуск |
| Все оставшиеся included YCLIENTS операции, public knowledge/consent, полный loyalty/staff coverage, broad agent composition | **NOT_ESTIMABLE сейчас** | Не закрыта конечная operation→source→role→outcome карта. После её привязки оценивать недописанные функции и соединение отдельно, не «по дню на API» |
| Campaigns + реальные measurement; scoped C10 и последующие agreed workflows | **NOT_ESTIMABLE сейчас** | Не определены точные delivery/consent/measurement и autonomous principal/action envelopes. Первая shadow policy не равна всему автопилоту |
| Полная функциональная приёмка первого салона, voice/mobile и устранение обнаруженных дефектов | **NOT_ESTIMABLE сейчас** | Зависит от полного набора операций, достигнутого качества и выбранной delivery environment. Не исключено из цели из-за отсутствия оценки |
| Первый ограниченный цикл нагрузки после выбора инфраструктуры/envelope | **5–10 инженерных дней** | Низкая/умеренная: подготовка, прогон, измерение/анализ. Не включает неизвестную оптимизацию, second-tenant rollout или окончательную квалификацию 1000 салонов |

Это независимая source-based оценка review, не измеренная скорость будущей команды. Диапазоны не суммируются в срок «вся MAYA»: несколько обязательных пакетов пока неоценимы. Добавление агентов/инженеров не делит критический путь линейно.

Что именно ускоряет первый салон: полезный пилот можно получить до подключения второго tenant, широкой вариативности данных/настроек и большого load cycle. Эти работы остаются в выбранной масштабной цели. Даже известные 5–10 дней первого нагрузочного цикла нельзя назвать полной экономией календарного времени: часть может идти параллельно, а устранение узких мест ещё неизвестно. Нельзя обещать «вдвое быстрее» или объявить все функции готовыми только потому, что tenant один.

### Внешние ожидания — отдельная шкала

| Условие | Что требуется | Что может продолжаться без него |
| --- | --- | --- |
| Реальный YC источник | Приватные partner/user credentials, exact company/branch и права; конечный scope provider-read/local-import | Normal profile, UI, existing API mapping, локальные fixes. Presence-only проверка показала отсутствие ключей только в текущем shell/worktree; это не поиск по хранилищам владельца |
| Widget runtime | Existing platform-owner validate/grant для точного build/profile/certificate | Прямой A17 setup не требует widgets.runtime; права нельзя выдать fixture/SQL |
| Verified Client | Уже подтверждённый собственный Client либо approved initial-only proof | Public READ, owner/staff и already verified paths |
| Настоящая модель | Отдельно допущенный конечный run и приватный ключ/бюджет | Source owners, локальная механика и планирование сценариев. Исторические 5 replies с safe_fallback/ungraded не являются общей языковой приёмкой |
| Реальные actions/campaigns/C10 | Точный разрешённый эффект/получатели/consent/route, scoped autonomy policy | Explicit recommendations, previews и безопасная локальная разработка |
| Телефон / доступный runtime | Проверенный target, reachable trusted HTTPS и согласованная упаковка/установка | Текущий браузер и backend локально. Debug override уже есть; установленное production-target приложение не считается изолированным тестом |
| Точные product/schema choices | Initial Client, schedule editor, при необходимости multi-company и три PublicBooking FK — только относящиеся к затронутому пути | Независимые операции. Multi-company не блокирует одну company; PublicBooking FK не повод останавливать все локальные чтения |

Сроков ответа владельца/оператора/provider здесь нет: они не известны. SSH/hosting остаются на паузе; доступ к существующему серверу не обязательное условие локального пилота. Новых внешних действий, чтения секретов, provider/model calls, деплоя или установки этот план не разрешает.

## Параллельная работа и ближайший рабочий пакет

Параллельно допустимы: normal onboarding/UI; сопоставление и реализация отдельных native API операций; public knowledge/Client contract work; campaigns/C10 после их точных решений; подготовка реальных диалогов/источников. Изменения одного владельца и общей source schema согласуются до интеграции; pricing/notification isolation и другие соседние ветки не перезаписываются. Новая design-ветка ведётся отдельно: неизвестные/чужие изменения не редактируются; перед будущей интеграцией нужна явная сверка её контрактов с функциональной веткой.

Последовательно идут: фиксация общего кандидата → согласованный HTTP/PG слот на этом Mac → real setup → реальные confirmed effects → итоговая приёмка. Один источник/approval не переносится на другой candidate автоматически. Тяжёлые aggregate/load runs согласуются с parent, чтобы не мешать параллельным lanes.

Ближайший пакет разработки:

1. Normal onboarding, парольное восстановление и same-DB restart фактически проверены с текущим React и обычным AppModule на двух синтетических бизнесах. [Actual evidence](evidence/maya-normal-onboarding-actual-20261010/summary.json); прежний memory-lint blocker закрыт scoped PASS.
2. Отдельный real-YC-read профиль подготовлен и локально проверен source/synthetic transport tests. Передать владельцу [точный scope, приватный ввод и retention](MAYA-LOCAL-YCLIENTS-ONE-TIME-HANDOFF-20261010.md); после его разрешения и согласованного runtime слота выполнить первый фактический setup. Новый профиль/real provider ещё не квалифицированы; stage 0 proof не подменяет этот шаг.
3. В существующем API inventory выделить операции первого полного выпуска, явно отметить deferred/excluded и для included привязать current code/owner/недостающее. Это рабочий список реализации, не новый аудит.
4. Подготовить существующий verified Client и точные READ/create/move/cancel сценарии; затем при отдельном допуске выполнить первый real источник/model цикл.
5. Продолжать конечные функции №2–11; после инвентаря и первого real цикла заменить NOT_ESTIMABLE оценками конкретных исправлений. Показывать владельцу полезные результаты по мере готовности, не ждать финальной сертификации всей платформы.

## Масштабирование после первого пилота

Используем [существующий proposed load envelope](MAYA-REMAINING-READINESS-DECISIONS.md), не придумываем новый SLA. Ступени 1→10→100→1000 synthetic tenants; предложенные данные на tenant: 2 филиала, 10 сотрудников, 20 услуг, 1000 клиентов, 3000 записей. Пример 10% active × 2 sessions / 10s даёт 20 RPS на 1000 — это инженерная гипотеза, не наблюдаемое поведение салонов.

Первый цикл должен измерить offered/achieved throughput, p95/p99, ошибки, pool/locks/CPU/RSS/event loop, очереди/UNKNOWN, noisy-neighbor isolation, restart и backup/restore. Исторические ориентиры 30 min при 20 RPS, 5 min burst 100 RPS, soak 20 RPS на 2 часа, а также non-model READ p95 ≤500 ms / p99 ≤2 s — предложения для выбранной инфраструктуры, не обещание мощности текущего Mac или production. Существующие B35 limits не обходятся ради графика.

Отдельно нужны реальные provider quotas/latency и model cost; synthetic load их не доказывает. Одно успешно работающее приложение и отрицательные foreign-tenant tests не являются ни вторым реальным onboarding, ни квалификацией 1000 салонов.

## Границы согласованной поставки

- **Включены:** собственный MAYA chat/app, YCLIENTS-first согласованные операции, Admin/Occupancy/Lifecycle/BI, booking, staff work, owner analytics, loyalty/certificates/subscriptions/referrals/reviews, кампании и scoped C10. Voice/mobile остаются квалификацией существующих включённых поверхностей; телефония отдельно не добавляется.
- **Отдельная работа:** визуальный дизайн ведётся владельцем в другом чате; этот lane не выполняет redesign. Warehouse/photo/OCR пакет отложен. Сделанный код сохраняется; полный склад/закупки/поставщики не становятся новой целью.
- **Исключены либо ранее отложены:** телефония/автозвонки, самостоятельный content-generation module, универсальная бухгалтерия/payroll/fiscalization, другие CRM и новые внешние inbound messaging интеграции.
- **Неоднозначность каналов явная:** отсрочка нового Telegram/WhatsApp/MAX inbound не отменяет согласованную campaign функцию. Точный существующий outbound маршрут, получатели и consent надо выбрать; без этого delivery не объявляется готовой.
- **Website/real booking другой задачи не затрагиваются.** Существующие ограничения source/identity/retention/authority сохраняются. Любая новая схема, retention или autonomy decision останавливает только зависимое изменение до точного решения.

Ни полная функциональность первого салона, ни масштабная MAYA ещё не приняты. Этот документ сохраняет выбранную цель, завершённые локальные результаты и следующий исполнимый порядок работ; он не выдаёт C10 completion из contracts или synthetic proof. Штатный onboarding уже соединён и фактически проверен с текущим carrier; отдельный real-YC-read профиль реализован и source/synthetic-qualified. Ближайший шаг — точный owner handoff и согласованный первый запуск этого профиля, затем проверка реального источника. Готовность профиля не доказывает подключение.

