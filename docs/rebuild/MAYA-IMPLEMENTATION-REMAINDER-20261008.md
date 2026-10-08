# Что ещё не реализовано в согласованной MAYA — 2026-10-08

Сверка кода на `1483b334` с [YCLIENTS-first scope](../product/README.md), [картой завершения](MAYA-FINAL-COMPLETION-MAP.md) и [картой доменов](MAYA-APPROVED-DOMAINS-REMAINING-GAP-MAP-20261007.md). Ниже отсутствующие функции отделены от частично связанных путей и проверки уже существующего кода. Историческая пометка в карте не отменяет более новый checkpoint. Это не release certification.

## Отсутствующие функции

| Функция | Конкретный остаток и источник |
| --- | --- |
| Реальное распознавание фото накладной | Production `GoodsPhotoParser.parse` возвращает `goods_photo_parser_not_configured`. Upload validation, временное preview и review есть. [Код](../../maya-saas-backend/src/ai-tools/goods-photo.service.ts). |
| Создание и изменение товаров в YCLIENTS | Есть чтение товаров и приход существующего товара; каталожных create/update портов нет. [CRMAdapter](../../maya-saas-backend/src/crm/crm-adapter.interface.ts), [goods checkpoint](MAYA-YCLIENTS-GOODS-VERTICAL-CHECKPOINT-20261007.md). |
| Создание/редактирование услуг, связей услуга–мастер и карточек сотрудников в YCLIENTS | A28 реализует INTERNAL. Отдельные native операции цены/графика не дают полного управления внешним каталогом. [Контракт](../../maya-saas-backend/src/action-engine/package5-wave4-executable.contract.ts), [source guard](../../maya-saas-backend/src/package5-wave4/package5-wave4.service.ts). |
| Несколько компаний YCLIENTS и управление их привязками | Текущая реализация хранит одну точную tenant-owned пару company/branch. Multi-company routing/UI не добавлены. [Settings contract](../../maya-saas-backend/src/crm/crm-provider-settings.ts). |
| Первая Client-привязка без прежнего verified channel | Перенос существующего доверия и successor relink есть. Initial-only bootstrap отсутствует; нужен выбор доверенного initial proof. [Точный остаток](MAYA-FIRST-CLIENT-LINK-REMAINDER-20261007.md). |
| Публичные знания и правила салона для клиента | A22 staff-only guidance реализован. Отдельного customer-visible контракта нет; внутренние правила нельзя выдавать за публичную политику/разрешение. [Карта владельцев](MAYA-FINAL-COMPLETION-MAP.md). |
| Канонический consent register/export | Consent facts и history erasure есть; отдельного register/export и зарегистрированного READ для consent/identity карточек нет. [READ admission](../../maya-saas-backend/src/widgets/consent/consent-bodies.ts), [export boundary](../../maya-saas-backend/src/widgets/consent/data-subject-acts.ts). |
| Фоновый C10 initiator | C5 shadow и explicit C9 работают. Нет собственного background principal/admission и tenant-wide bounds; требуется scoped решение владельца. [Decision brief](MAYA-C10-SCOPED-SHADOW-DECISION-BRIEF-20261007.md). |

## Частично реализованные пути

- Приход существующего товара: adapter/AE/review есть, но selected-store/type permissions не допускаются до квалификации точного source contract. Это не отсутствие adapter. [Receipt checkpoint](MAYA-YCLIENTS-RECEIPT-ADAPTER-CHECKPOINT-20261007.md).
- Выходной/перерыв/график: native backend есть; текущий закрытый профиль не допускает обязательный SETTINGS_DRAFT editor. [Открытое product choice](MAYA-DEVELOPMENT-PROFILE-CHOICE-20261006.md).
- C9: Occupancy, Lifecycle, BI и ограниченный compound вызываются; произвольные многодоменные процессы не замкнуты. Зарегистрированный `C9ModelGateway.reason` без рабочего caller не означает отсутствие уже действующих agents/strategy.
- Loyalty, сертификаты, абонементы, расходы, staff tasks/dossier/team имеют владельцев и отдельные READ/effects. Остались конкретные operation→source→role→confirmation связки; объявлять целые домены отсутствующими нельзя. Конкретный дефект `tasks.list` теперь закрыт [A23 READ checkpoint](MAYA-OWN-TASKS-CHECKPOINT-20261008.md): текущие статусы читаются из OperationalWorkItem, история отдельно, 331 unit tests и 7 HTTP/current React checkpoints PASS. Это не полная приёмка task create/complete или всех соседних доменов.

## Не считать отсутствующими функциями

UNKNOWN → CONFIRMED, native reschedule UNKNOWN после app/PG restart и 14:30 → 15:00 уже закрыты локально [receipt checkpoint](MAYA-BOOKING-RECEIPT-STATUS-CHECKPOINT-20261008.md). [Topic return](MAYA-TOPIC-RETURN-CHECKPOINT-20261008.md) закрывает конкретный разрыв после общего вопроса. Эти результаты используют synthetic provider/scripted semantics, а не реальную языковую приёмку.

Real provider/model/voice/device acceptance, calibration, attribution, scale/SLO, RT8/package/ledger и production qualification — самостоятельные проверки и ограничения, не новые отсутствующие модули. Три PublicBooking FK требуют [решения о семантике замены parent](MAYA-PUBLIC-BOOKING-FK-CHOICE-20261006.md), а не нового booking owner.

Metadata SSH уже получил разрешение на одну точную попытку; она завершилась transport timeout без inventory. Новое выполнение не предпринимается. Initial Client trust, scoped C10, schedule editor exception и PublicBooking FK остаются отдельными решениями. Goods F32b/F74b ранее одобрены. Новые внешние messaging ingress, другие CRM, телефония, самостоятельный content module и полная бухгалтерия отложены или исключены текущим scope. 300 unmapped API operations не означают 300 отсутствующих функций.

## Следующий отсутствующий функциональный срез

Для запроса владельца о привязке филиалов следующий отсутствующий срез — несколько одновременных компаний/филиалов YCLIENTS с явным выбором текущего источника. Нынешний `maya.crm-branch-binding/1` хранит одну точную пару `companyId + branchId`; не следует выдавать его локальную проверку за multi-company routing. Следующий bounded preflight должен определить хранение нескольких точных связей, выбор разрешённого источника и сохранение существующей одиночной связи. Новая схема/retention не одобрены исходной задачей: если они понадобятся, нужен конкретный вариант для решения владельца. Это не блокирует чтение исходников и подготовку локального среза без production вызовов и не требует повторного разрешения на уже работающую одиночную привязку.
