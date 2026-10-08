# Одна существующая услуга YCLIENTS: официальный контракт

Проверено 8 октября 2026 года для MAYA `d90243a6cb655a82de1ceb347f25cddfd04de074`. Результат: для первого локального среза подходит **read-only предложение явного переименования основного `title` одной точно выбранной услуги**. Подготовку preview и синтетический сценарий чтения можно реализовать сейчас; запись требует отдельного разрешения точной границы сохранности `print_title`, описанной ниже. Документация не доказывает безопасность разреженного запроса `{title: ...}` и не заменяет acceptance настоящего провайдера.

## Источники и воспроизводимость

Официальный [OpenAPI YCLIENTS](https://developers.yclients.com/ru/) прочитан заново без авторизации 2026-10-08T11:39:49Z. HTML: 10 060 503 байта, SHA256 `ed57f3e1908597d58e880184d7cea555534d6243837d5648069b114f4326bd36`. Из `const __redoc_state.spec.data` извлечён OpenAPI 3.0.3: 248 URL-шаблонов, 304 HTTP-операции. Извлечённый JSON **полностью равен** сохранённому 2026-10-07 источнику и имеет тот же SHA256 `9ba4c2deca4197aeee333c95b4d641f19073ef91b40279b0fc83651bd502157b`, зафиксированный существующим `docs/rebuild/evidence/maya-development-integration-20261006/yclients-api-inventory/archive.json`.

Веб-инструмент отказал из-за размера страницы; обычное чтение из sandbox не разрешило DNS. Единственное последующее разрешённое чтение публичной страницы прошло с HTTP 200. Это чтение документации, не API бизнеса. Файлы: `official-current.html`, `official-current-openapi.json`, `official-fetch*.json`, `official-projection.json`, `source-refs.json`. Машинные ссылки содержат точные JSON pointers, URL операций и SHA256 узлов. Вторичные SDK и неофициальные статьи не использовались.

## GET и изменение услуги

| Назначение | Документированный URL относительно `https://api.yclients.ru` | Статус |
| --- | --- | --- |
| Точная существующая услуга | `GET /api/v1/company/{company_id}/services/{service_id}` | Актуальный; 200, 403, 404 |
| Изменение | `PATCH /api/v1/company/{company_id}/services/{service_id}` | Актуальный; описан 200 |
| Старый способ | `PUT /api/v1/services/{company_id}/{service_id}` | Явно `deprecated: true`; описан 201 |
| Права пользователя в филиале | `GET /api/v1/user/permissions/{company_id}` | Описан 200 |

Официальные разделы: [GET услуги](https://developers.yclients.com/ru/#tag/Uslugi/operation/Получить%20список%20услуг%20%2F%20конкретную%20услугу), [PATCH услуги](https://developers.yclients.com/ru/#tag/Uslugi/operation/Изменить%20услугу), [устаревший PUT](https://developers.yclients.com/ru/#tag/Uslugi/operation/Устаревшее.%20Изменить%20услугу), [права](https://developers.yclients.com/ru/#tag/Polzovatel/operation/Получить%20список%20прав).

GET/PATCH требуют `Accept: application/vnd.yclients.v2+json`, `Content-Type: application/json` и `Authorization: Bearer <partner token>, User <user token>`. Оба идентификатора находятся в URL. `salon_service_id` — отдельный идентификатор связи услуги с компанией в сети; подменять им `id/service_id` нельзя.

GET возвращает `success/data/meta`; схема `data` — массив. Даже с точным URL нужна проверка ровно одной строки с нужным `id` и исходной компанией. Пример GET использует числовые строки, хотя схема ряда полей объявляет числа. Нормализация должна быть точной, без округления и выбора первого совпадения.

## Обязательные и необязательные поля актуального PATCH

`services_change_companyid_request_data_types.required` содержит **14 полей**:

- Строки: `title`, `booking_title`.
- Числа: `category_id`, `price_min`, `price_max`, `duration`, `tax_variant`, `vat_id`, `seance_search_start`, `seance_search_finish`, `step`, `seance_search_step`.
- Boolean: `is_multi`, `is_need_limit_date`.

Необязательные по схеме: `technical_break_duration`, `discount`, `comment`, `date_from`, `date_to`, `dates`, `weight`, `service_type`, `api_service_id`, `online_invoicing_status`, `price_prepaid_percent`, `price_prepaid_amount`, `abonement_restriction_value`, `is_abonement_autopayment_enabled`, `autopayment_before_visit_time`, `staff`.

Существенные ограничения:

- `technical_break_duration`: nullable number, 0–3600, шаг 300 секунд. **Пропуск означает null**, то есть настройку технического перерыва филиала. Пропуск не доказан как сохранение текущего значения.
- `dates`: описание явно говорит, что без массива доступны все даты указанного периода. Для ограниченного календаря требуются точные даты, а не реконструкция.
- `duration` и интервалы — секунды. У duration в описании указан default 3600; это не разрешение подставить час вместо неизвестного исходного значения.
- `staff[]` в этом PATCH описан только через `id` и `seance_length`. Для длительности указан шаг 15 минут. Дополнительные настройки связей нельзя выкидывать ради соответствия этому узкому объекту.
- API не задаёт `maxLength` для `title/booking_title/comment`. Лимит 240 для нового названия можно выбрать как существующее ограничение MAYA, но не называть правилом YCLIENTS. В [интерфейсной справке](https://support.yclients.ru/200) для описания указан отдельный лимит 450; равенство UI-описания и полного wire-контракта comment требует аккуратной квалификации.

Схема GET перечисляет только 4 из 14 обязательных PATCH-полей. В ней отсутствуют `booking_title`, `duration`, `is_multi`, `is_need_limit_date`, четыре параметра поиска/шага и два налоговых параметра. Значит, опубликованная схема GET сама по себе **не гарантирует полноту исходного состояния**. При неполной реальной строке — отказ до подготовки/отправки. Примеры ответа PATCH богаче, но нельзя выполнять изменение ради получения недостающих данных.

Старый PUT не имеет массива `required` в request schema. Его пример одновременно использует `active/api_id`, тогда как свойства запроса называют `service_type/api_service_id`. Это несогласованность документации, а не доказательство optional/merge semantics или повод выбрать устаревший endpoint.

## Длительность и назначение сотрудника — отдельный объём

| Операция | Поля и ответы |
| --- | --- |
| `POST /company/{company_id}/services/{service_id}/staff` | Обязательны `master_id`, `seance_length`, `technological_card_id` (последнее допускает null); 201/401/403/404/422 |
| `PUT /company/{company_id}/services/{service_id}/staff/{master_id}` | Обязательны `seance_length`, `technological_card_id`; 200/401/403/404/422 |
| `DELETE .../staff/{master_id}` | Отвязка; 204/401/403/404 |
| `POST /company/{company_id}/services/links` | Обязательны `service_id`, `master_settings`, `resource_ids`, `translations`; response map пуст |

В первых двух методах длительность сотрудника ограничена 300–86100 секундами. `links` одновременно затрагивает технологические карты, часы/минуты, индивидуальную цену, ресурсы и переводы. Он не подходит для скрытого изменения названия. [Справка сотрудника](https://support.yclients.ru/5-8-241) подтверждает самостоятельность его длительности и индивидуальной цены. Переименование не должно назначать/отвязывать мастеров, менять длительность, цены или ресурсы.

## Права, сетевые услуги и смысл названия

Официальный permissions schema имеет отдельные флаги `settings_services_access`, `services_edit`, `settings_services_edit_title_access`. Последний прямо относится к основному названию и названию онлайн-записи. Для цены существует отдельный `settings_services_edit_price_access`, для связей и длительности — `edit_master_service_and_duration`. **Title-specific путь не должен требовать price-edit только из-за переиспользования старого price reader.** Точный набор прав, который провайдер проверит для полного PATCH с неизменными чужими полями, без бизнес-вызова не проверен.

У comment нет отдельного флага в найденной схеме; официальный [сетевой раздел](https://support.yclients.ru/429) допускает запрет локального изменения описания и цены. Ответ содержит `is_chain`, `is_price_managed_only_in_chain`, `is_comment_managed_only_in_chain`. Для первого среза отказ по сетевой/неясной принадлежности — разумное локальное ограничение, не выдуманное правило title API.

[Справка услуги](https://support.yclients.ru/200) различает основное название, `booking_title` и название в чеке: пустое специальное имя наследует основное. Поэтому сохранение пустой строки не сохраняет её **эффективное отображение** после смены title. Для обещания неизменного онлайн-названия нужен явно заданный непустой `booking_title`; для печатного имени надо отдельно учитывать fallback `print_title`. Не менять booking_title автоматически и не обещать неизменность всех производных отображений без фактов.

**Точный предел `print_title`.** В свежем service OpenAPI это поле отсутствует в свойствах GET response, PATCH request и PATCH response schemas. Оно присутствует только в примере ответа PATCH 200: `#/paths/~1api~1v1~1company~1{company_id}~1services~1{service_id}/patch/responses/200/content/application~1json/example/data/print_title`. Writable `print_title` найден в schemas товаров (`goods_company_request_data_type`, `goods_company_request_with_rules_data_type`), но это другой домен. Нельзя переносить его в payload услуги по аналогии. Сохранение непустого print_title при пропуске поля не документировано; даже наличие значения в GET не доказывает write-preservation. Для текущего решения — **preview-only с явной границей, будущая запись заблокирована до квалификации точного контракта**, а не до общего запроса новых прав владельца.

## Минимальный предлагаемый контракт MAYA

Инженерное предложение, не утверждение о новых возможностях провайдера:

1. Явный запрос владельца → точный tenant/company/service → uncached GET permissions и GET service. Один кандидат; неоднозначность требует выбора.
2. Read-only preview показывает старый и предложенный основной title, исходный booking_title и ограничения. Подготовка допустима только для полного поддержанного baseline; неизвестные поля, настройки связей и сетевой scope не заполняются догадками.
3. Только после устранения указанной границы `print_title` будущая запись — существующее canonical approval/AE, один актуальный PATCH. Сервер строит **полный документированный payload из свежего baseline**, заменяя только title. Копируются все поддержанные присутствующие writable поля; значения с документированным default/расширением не пропускаются. Сырые response-only поля не пересылаются как произвольный payload.
4. Перед dispatch повторно сверяются действующие права, источник, точные идентификаторы и hash полного baseline. До dispatch расхождение означает stale/refused и ноль PATCH.
5. После dispatch требуются `success:true`, точный идентификатор и title в ответе, затем uncached GET с совпадением изменённого title и всех сохранённых наблюдаемых полей. Потерянный ответ, ошибка/неполный readback или дрейф — UNKNOWN, без повторного PATCH и без автоматического rollback.

В OpenAPI операции нет If-Match/ETag, idempotency key или гарантии атомарного сравнения revision. Повторный GET уменьшает окно гонки, но не превращает её в compare-and-swap; post-readback не отменяет уже случившуюся перезапись. Поэтому локальный synthetic PASS нельзя называть проверкой атомарной сохранности у реального YCLIENTS.

Существующий `yclients-service-price.contract.ts` уже сохраняет technical break/dates и отказывает при богатых staff links; это подходящий ориентир для bounded qualification. RUB/fixed-price/non-multi ограничения этого helper — ограничения текущей реализации, а не обязательные ограничения переименования API. Новый read-only путь следует отделить от права менять цену.

**Оставшиеся точные границы:** неполный GET не даёт безопасного write payload; omission semantics всех optional полей не установлены; richer staff/resource/translation/chain settings выходят за первый срез; provider CAS и native acceptance отсутствуют. Read-only preview и его локальные синтетические проверки эти границы не блокируют. Полезное предложение в чате не должно показывать исполнимое подтверждение записи, пока write-контракт не квалифицирован.

Ни сервисы, ни тесты, ни API бизнеса не запускались. Runtime/схема/документы репозитория не менялись. Рабочий сайт не затрагивался.
