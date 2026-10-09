# MAYA — исходные 48 диалогов после услуг выбранного мастера

На **`9a54eb4a489ba61f80fabc793d28ba4aabbd9737`** выполнены все **48 диалогов / 81 actual HTTP ход**: **57 PASS / 0 FAIL / 14 unsupported / 10 insufficient**, critical 0/0. Все прежние **54 PASS сохранены**; изменились ровно три оценки. **Remaining27 → remaining24**. Exit 2 означает завершённый прогон с оставшимися семантическими ограничениями, а не общую готовность MAYA.

| Ход | Было → стало | Наблюдаемый результат |
|---|---|---|
| `current-admin-correction:2` | insufficient → PASS | Услуги Артёма из каталога выбранного сотрудника |
| `utt-services.price-062:1` | insufficient → PASS | Цена мужской стрижки у Марины |
| `utt-services.price-067:1` | insufficient → PASS | Та же предметная проверка для второго исходного запроса |

Изменение зависит от **product wiring и явно добавленных синтетических фактов**: текущая company/branch binding, активный Staff, уникальный provider link `71` и отдельно заданная связь сотрудник `71` → услуга `81`, 2000 RUB, 30 минут. Эти значения являются fixture facts, не реальными ценами. Общий список услуг не переименован в источник услуг конкретного мастера. Дополнение ограничено тремя точными case/turn; остальные 45 fixture paths сохранены.

Корпус, исходные реплики, scripted planner и evaluator не менялись. У всех трёх запросов сотрудник уже присутствовал в semantic plan как request-local alias; после проверенного чтения product code сохраняет фактическое имя каталога. Это наблюдаемая нормализация, не догадка о личности.

## Доказательства и проверки

Каждый из трёх ходов имеет **один фактический scoped adapter call** с точным tenant/company/branch/staff, отдельное событие источника и два `SETTLED TOOL_READ` C9 receipt. Их execution IDs совпадают с actual HTTP response и completed AiToolExecution того же tenant/actor. Расшифрованный сохранённый каталог совпадает с фактически возвращёнными service facts; relation hash пересчитывается из текущего Staff identity и этих услуг. Точные source hash/revision сохраняются отдельной закрытой проекцией, без phone sanitizer. Записанные receipt bytes прочитаны обратно и сверены.

Это сильнее существующей оценки, которая сама по себе не доказывает связь сотрудника и услуги. [Три source events](evidence/maya-offline48-after-staff-20261009/r1/offline-staff-service-source-reads.jsonl), [три persisted receipts](evidence/maya-offline48-after-staff-20261009/r1/offline-staff-service-scoped-receipts.jsonl), [связи с ответами](evidence/maya-offline48-after-staff-20261009/r1/offline-staff-service-turn-links.jsonl).

**60 pure fixture tests, scoped TypeScript и ESLint PASS**, source unchanged. Первый прогон тех же 60 тестов был зелёным, но выявил один type error и четыре lint error; исправлены только test code/type narrowing, raw logs сохранены. Основной продукт отдельно прошёл [1034 component tests и native HTTP/process/PG restart](MAYA-STAFF-SERVICES-HTTP-CHECKPOINT-20261009.md).

В общем прогоне **80 HTTP 201 и один ожидаемый revoked 401**. Все 2526 source SHA256 сверены с exact Git; исходники не менялись во время выполнения. Score SHA256: `c0155653599cb73d3657641c9f06571a7db1890638e4f413f7cafa2857f8d799`. Manifest SHA256: `5c1dff397bb7fccdcb4e412123d48bd9158071d034e3f30f4c3e34a358c0e3e0`.

Ранняя запись 401 в `actual-http-turns` сделана до последующей проверки отказа; `expectedRefusal` и `historyUnchanged` появляются в final HTTP report/offline audit. Связи одного хода сверены, но разные этапы проекции не объявляются byte-identical; raw не переписан.

Собственные PostgreSQL и broker остановлены; `pg_ctl status` — 3, PID-файл отсутствует, broker PID и все шесть command groups отсутствуют. Один Jest worker, Node heap 1536 MB, broker heap 64 MB, PG shared buffers 64 MB. Бизнес-снимки и наблюдаемые семейства записей не изменены после fixture setup; external provider calls и outbound отсутствуют в пределах данного proof. Это не OS-egress census.

[Raw score](evidence/maya-offline48-after-staff-20261009/r1/semantic-score.json), [exact source/delta verification](evidence/maya-offline48-after-staff-20261009/r1/source-and-delta-verification.json), [independent review](evidence/maya-offline48-after-staff-20261009/maya-offline48-after-staff-independent-review-20261009.json), [archive manifest](evidence/maya-offline48-after-staff-20261009/archive-manifest.json).

Существующий generic audit по-прежнему повреждает некоторые opaque hashes phone sanitizer-ом. В этом запуске это `followup-owner-topic-switch:2` и `current-admin-correction:2`. Для employee-service хода точный hash дополнительно сохранён и проверен в новом receipt; для schedule хода новая независимая проверка точного hash по generic полю не заявляется. [Скан](evidence/maya-offline48-after-staff-20261009/r1/generic-source-hash-redaction-scan.json). Raw artifacts и oracle не исправлялись задним числом.

## Оставшиеся зависимости

| Remaining24 | Ходов |
|---|---:|
| Выручка и сравнения — C7 денежный источник ещё не подключён | 6 I |
| Journal — неоднозначный сотрудник/филиал исходного запроса | 2 I |
| Публичные сведения филиала — semantic/source/oracle gaps | 2 I |
| Retention — когорта, регулярность, приоритет | 6 U |
| Подготовка изменения цены — отдельная lane | 2 U |
| BI с отсутствующими денежными данными | 1 U |
| Прибыль без подтверждённой базы | 1 U |
| Остатки без привязки к филиалу/складу | 2 U |
| Отзывы — точный месяц и определённые оценки | 2 U |

[Точные 24 хода и prerequisites](evidence/maya-offline48-after-staff-20261009/r1/remaining24-and-next-dependency.json).

Следующий узкий шаг через существующих владельцев — **отзывы за точный календарный период и явно выбранные оценки**. `ReportingPeriodResolver` уже распознаёт прошлый месяц, а `AiToolHandler.reportingWindow` вычисляет локальные границы. `BusinessContentService.listReviews` пока читает rolling days и одну exact rating; source projection не допускает верхнюю границу. Нужен конечный запрос `[from,toExclusive)` с сохранением `MeasurementReadService.reviewScope`, ролей, филиала и privacy.

Числовое значение «плохие» нигде не определено; оба frozen случая теряют rating в scripted plan. Нельзя молча назначить `≤3`. Честное уточнение оценок сохраняет месяц, но не гарантирует PASS одноходовых случаев. Для finance требуется реальное подключение canonical денежных фактов к C7, для inventory — branch/store attribution, для retention — соответствующие опубликованные C8 правила и отдельные факты регулярности/приоритета; одной подменой fixture этого не решить.

HTTP/auth/C9/PG настоящие, planner и domain-port sources синтетические. Этот общий прогон не проверяет native provider, real model, React, restart или UNKNOWN recovery; native staff READ и restart квалифицированы отдельно. Website, pricing mutations, frozen9/handoff, schema/retention и background authority не менялись. Ничего не опубликовано, не отправлено и не слито; общая MAYA/C10 — **NOT_ISSUED**.
