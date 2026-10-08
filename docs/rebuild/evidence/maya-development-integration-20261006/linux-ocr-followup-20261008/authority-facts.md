# F32b/F74b и оставшееся решение по услуге

Read-only сверка на HEAD `a8001804`, 2026-10-08. Код, memories, тесты, сервисы и сеть не изменялись/не запускались. Этот файл — исследовательский отчёт, не новое одобрение.

## Что уже одобрено

**F32b/F74b относятся только к приходу товара с закупочной себестоимостью. На переименование услуги они не переносятся.**

- **F32b / GR-PC1:** отдельный MONEY subtype `inventory_receipt_purchase_cost`; C9 `inventory.goods.receipt.prepare` → AE `crm.goods.receipt.create.v1`, action `create_crm_goods_receipt`, target `crm_goods_receipt`. Одна строка прихода одного существующего физического товара, одна company и один склад, положительное дробное количество в явно выбранной catalog unit. OWNER проверяет quantity/unit/cost/currency/date, точную сумму и текущий source/permission witness. Это закупочная стоимость прихода, а не изменение продажной цены, платежи, новый SKU или пакетный приход. [Точный контракт](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:590).
- **F74b:** отдельное происхождение approval из аутентифицированного canonical chat turn через существующий `AiApprovalRequest`, immutable payload hash и исходного requester. Только для этой named lane producing REQUEST_APPROVAL refs могут быть null. Текущие tenant-wide TENANT_OWNER/BUSINESS_OWNER, tenant/membership/source/permission/expiry проверяются повторно; исправление создаёт новую версию; replay не меняет parent или TTL. Одна execution attempt; UNKNOWN/потеря ответа не допускают resend; успех требует attributed receipt/readback и соответствующий persisted AE SUCCEEDED. [Provenance и исключения](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:596).
- Разрешена реализация этой конечной code/test/carrier mapping. Решение не разрешает реальную складскую запись, production/release, внешнюю передачу фотографий или фоновую автономию. Уже утверждённый F32a price subtype не расширен. [Граница approval](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-GOODS-RECEIPT-CARRIER-DELTA-PROPOSAL-20261007.md:26).

## Исходная реплика владельца: что действительно найдено

[Canonical decision record, строка 3](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-GOODS-RECEIPT-CARRIER-DELTA-PROPOSAL-20261007.md:3) записывает: владелец ответил **«да» 2026-10-07 в 09:57:42 UTC** на exact one-owner/one-existing-item/one-store purchase-cost confirmation proposal; parent передал решение с transcript evidence. Строка 11 фиксирует, что утверждены название и все перечисленные ограничения, строки 17–24 — сами ограничения. Контракт повторяет timestamp и точный admitted descriptor.

**Исходная user/assistant transcript-пара с message ID и thread ID в доступном bounded поиске не найдена.** Здесь «да» и время цитируются из производной canonical записи, а не из заново извлечённой user message. Проверены релевантные repo/scratch decision records; readonly immutable main checkpoint `/Users/stanislavmosin/.codex/memories_1.sqlite` по F32b/GR-PC1/time; October local rollouts и archived_sessions по exact subtype/GR-PC1/time. Это не заявление об отсутствии исходной реплики во всех возможных хранилищах. Полную формулировку исходного вопроса, его время или Sentinel/thread ID нельзя восстанавливать догадкой. Parent может дополнить конкретным original transcript locator; история не изменялась.

## Что осталось решить для переименования услуги

**Нормативная ветка:** proposed `YC-SR1-CHAT-1` / F74c — отдельный operational non-MONEY descriptor для изменения только внутреннего `title` одной существующей local YCLIENTS service текущим tenant-wide OWNER/BUSINESS_OWNER. Предложены C9 `catalog.service.title.update` → existing CRM owner → AE `crm.service.title.update.v1`, source-qualified immutable `AiApprovalRequest` → свой typed canonical-chat origin → APPROVAL → existing AE. Это пока proposed names/admission, а не зарегистрированный writer. F32a/F74a price и F32b/F74b goods не дают эту authority. [Точная pending decision](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-YCLIENTS-SERVICE-RENAME-ADMISSION-20261008.md:7).

**Уже допустимая инженерная альтернатива:** обычный AE `approvalRequirement: REQUIRED` и настоящий consumed `REQUEST_APPROVAL`, с соответствующим finite service request/decision owner и положительными registrations. Это не запрещено общим контрактом; реализация отсутствует и такой workflow не выдаётся за уже одобренный direct-chat origin. Нельзя подделывать consumed intent ради one-card UX. [Alternative](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-YCLIENTS-SERVICE-RENAME-ADMISSION-20261008.md:13), [F74 consumed-record rule](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:1499).

**Смысл изменения названий нужно формулировать буквально:**

1. Изменить только внутреннее `title`, сохранив фактически видимое название в онлайн-записи и печати — текущий узкий proposal.
2. Разрешить также изменение online/printed названий в случаях, когда они пусты и наследуют внутреннее `title` — иной, более широкий эффект, который нельзя молча считать вариантом 1.

У YCLIENTS отдельные поля `title`, `booking_title` и **`print_title`** (не `printed_title`). Сохранение пустого raw поля не сохраняет его видимый текст после смены inherited title. Материализация старого видимого текста в пустое поле тоже изменяет ещё одно raw поле и не укладывается буквально в «менять только title». Это семантическая граница предложения; она не заменяет provider qualification ниже. [Recorded official support findings](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/evidence/maya-development-integration-20261006/service-rename-20261008/source-refs.json:629), [current preservation promise/gap](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/MAYA-YCLIENTS-SERVICE-RENAME-ADMISSION-20261008.md:21).

## Почему PATCH пока нельзя включить

Официальный архив описывает `PATCH /api/v1/company/{company_id}/services/{service_id}`. В его `services_change_companyid_request_data_types` **14 обязательных полей**, даже если пользователь хочет изменить одно название:

| Поле | Назначение / поведение в узком rename |
|---|---|
| `title` | Внутреннее основное название; единственное намеренно изменяемое поле |
| `category_id` | Категория; сохранить |
| `price_min` | Минимальная стоимость; сохранить |
| `price_max` | Максимальная стоимость; сохранить |
| `duration` | Длительность в секундах; сохранить, не подставлять default 3600 |
| `booking_title` | Отдельное название онлайн-записи; сохранить с учётом inheritance |
| `is_multi` | Индивидуальная/групповая услуга; сохранить |
| `tax_variant` | Система налогообложения; сохранить |
| `vat_id` | НДС; сохранить |
| `is_need_limit_date` | Ограничение дат онлайн-записи; сохранить |
| `seance_search_start` | Начало доступного времени записи в секундах; сохранить |
| `seance_search_finish` | Конец доступного времени записи в секундах; сохранить |
| `step` | Шаг вывода сеансов в секундах; сохранить |
| `seance_search_step` | Шаг поиска сеансов в секундах; сохранить |

[Полный required list в сохранённой official schema](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/evidence/maya-development-integration-20261006/service-rename-20261008/official-projection.json:1225). Schema и PATCH operation независимо сверены равными полному сохранённому OpenAPI `/tmp/maya-service-edit-20261008/official-current-openapi.json`; SHA-256 полного capture `9ba4c2deca4197aeee333c95b4d641f19073ef91b40279b0fc83651bd502157b`, projection SHA-256 `95e01584ef973e8fadb7cb82d8399b17fa4a1955a27d345aa9376a4c5c390d4e`. Это локальная сверка ранее полученной official evidence, не новый сетевой запрос и не actual provider acceptance.

`comment` и `print_title` в эти 14 не входят: `comment` является отдельным optional write field; услуга `print_title` отсутствует в GET/PATCH schemas и встречается только в PATCH response example. Его write/omission-preservation semantics не доказаны; writable одноимённое поле товара не является контрактом услуги. [Exact print_title finding](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/evidence/maya-development-integration-20261006/service-rename-20261008/source-refs.json:686).

Недостаточно послать `{title: newTitle}` либо дописать недостающие значения догадкой. GET schema не гарантирует 10 из обязательных write fields; optional `technical_break_duration` при omission становится null и наследует branch setting, а omission `dates` открывает все даты в переданном интервале. Не подтверждены sparse PATCH preservation, print_title handling, полный набор текущих source facts и conditional-write/CAS. Нужны точные provider semantics и отдельно разрешённая qualification source/readback; одобрение F74c или варианта наследования названия не устанавливает факты API. [Missing fields/defaults](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/evidence/maya-development-integration-20261006/service-rename-20261008/source-refs.json:605), [qualified limits](/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/evidence/maya-development-integration-20261006/service-rename-20261008/source-refs.json:677).

Разрешённая текущая функция остаётся callable READ preview с честным old/new и zero approval/AE/provider effect. Это не новая просьба разрешить service management в целом.
