Независимый proof review: QUALIFIED PASS. Блокеров в ограниченном функциональном подтверждении не найдено. Проверены фактически выполненные browser-attempt4 и http-attempt1 на runtime commit 3829590932f7efb456438a0d94446f9e6eb6fca1; новые тесты, сервисы, HTTP-запросы или изменения source reviewer не запускал.

| Proof | Результат | Checkpoints | Native GET с synthetic fetch | Synthetic parser | Synthetic receipt context READ | Эффекты |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| browser-attempt4 | 1/1 Jest test PASS; actual current React/HTTP/PG | 20 | 4 | 3 | 10 | Ровно 1 после явного canonical approve |
| http-attempt1 | 1/1 Jest test PASS; actual HTTP/PG | 10 | 2 | 2 | 6 | Ровно 1 после явного approve; повтор approve не добавляет эффект |

Это два отдельных свежих изолированных proof DB. Число «1 эффект» относится к каждому запуску, а не к их сумме. В обоих forbidden=[], нет outbound/посторонних business writes; до approve соответствующие ActionExecution и synthetic dispatch равны 0. После approve сохраняется ровно один SUCCEEDED для crm.goods.receipt.create.v1.

Проверенные сценарии и границы:

- Browser проходит настоящую UI email/debug авторизацию; файл задаётся через native file input, запросы проходят реальный локальный backend. Page guard не подставляет API ответы. Backend DI заменяет извлечение строк и receipt context/dispatch; настоящий CrmAdapterFactory/YclientsCRMAdapter выполняет search/item через строго ограниченный synthetic fetch. Это функциональное подтверждение plumbing, не реального OCR или YCLIENTS receipt.
- До выбора строки и явного поиска нет source READ. Категория не является выбираемым товаром. После item-read receipt fields остаются пустыми; все quantity/unit/cost/currency/store/time вводятся явными действиями. Версия 1 отклоняется без прихода; исправленная версия 2 имеет другой payloadHash и точную сумму 28.125. Encrypted arguments отклонённой версии не меняются.
- Приход появляется только после отдельного certified /widgets/intent approve в browser. HTTP дополнительно повторяет существующий approve и проверяет отсутствие второго synthetic dispatch. Новый review ingress сам эффект не исполняет.
- Response-loss fault применяется на стадии Response после реального HTTP 201 receipt-review. UI показывает неопределённость и отключает повторную подготовку. В DB остаётся один pending proposal для второго товара; новой ActionExecution для него нет. Это PENDING APPROVAL после потери ответа, НЕ AE UNKNOWN и не доказательство reconciliation.
- Cancel удерживает parser до закрытия формы, затем разрешает поздний ответ. Поля не возвращаются, дальнейшие source READ/approval/effect не появляются, server buffer после parser завершения обнулён. Это отмена текущего upload, не crash/restart recovery.
- Reload выполняет UI re-login и сохраняет ранее успешный canonical receipt; счётчики goods requests и widget intents не увеличиваются. /ai/chat не вызывается. Не заявляется восстановление ephemeral photo draft или продолжение потерянного review.
- Browser revocation после reload возвращает 401 (refresh также 401); parser/native GET/approval/effect counters остаются прежними. HTTP отзывает membership внутри awaited parser: response не содержит lines, buffer очищен, следующий upload отказывается до нового parser call.
- HTTP меняет текущие CRM settings (currency) и проверяет старый source_revision отдельно для search, item-read и receipt-review: все дают exact 409 goods_source_changed, без новых C9 READ, receipt-context READ и approval. Это source-witness drift, не multi-company migration acceptance.

Source/harness binding проверен независимо:

- Browser source-hashes содержит 1976 entries: 1963 repository files совпали с committed Git blobs указанного commit и текущими bytes; 13 scratch files совпали с сохранёнными harness copies.
- HTTP содержит 1808 entries: 1795 repository files совпали с тем же Git commit/current bytes; 13 scratch files совпали с архивом. Эти 13 scratch bytes идентичны между двумя финальными запусками.
- Все 39 файлов ранее принятого code review также совпали с commit. Всего сверено 1981 различное Git blob. Пересчитаны оба manifest.sourceSha256 из исходного порядка JSON map, а также launcher/supervisor/network-fence hashes.
- Оба manifest: sourceUnchanged=true, harnessUnchanged=true. Scratch harness не является Git-committed runtime: scratchHarnessGitBinding=false сохранён честно. Сохранённый proof-plan/header является исторической preparation snapshot; факт выполнения определяется final manifests/Jest/observations.

Точные SHA-256 итоговых ключевых артефактов:

| Артефакт | SHA-256 |
| --- | --- |
| browser-attempt4/manifest.json | 0fd4d4e3322847f5ba43c3896bd0ddff217d28030c85b84f5b8a7200989c114f |
| browser-attempt4/source-hashes.json | a4b58c38571bf9b4d5bff173c4c81b04603c991e78b853121e8dbb5f55512012 |
| browser-attempt4/goods-photo-http-observations.json | e713795825b56ea9391df9e9c50da06f98cf5f984fcaa8856086b97cfb3c2ff0 |
| browser-attempt4/browser-jest.json | 9a7f57eece486c1214100ac2d37b6e6106f1860b54ae470be68c9c4f4877be43 |
| http-attempt1/manifest.json | 0d95426df0ba9afa754cfafc20c9b2122f5b42e19dc6fa696d15823e0adae8a1 |
| http-attempt1/source-hashes.json | eab0edf9e2362bb37ed9d56ff32236752bf947504b19908a49e34fea3f6066d2 |
| http-attempt1/goods-photo-http-observations.json | ea8c8a9a353dd8d8c6844e12f5affdfc24754a5411230e3dd44fe27a39a75532 |
| http-attempt1/http-jest.json | 009da92ec1e0da301a51d4a42be4b691ebcdc4a4c5030ab3645403e799178d2d |
| shared executed native-proof.mjs | b4646d5ede778e63a095f500564a1b6b3a6daae4892c1b9ec6087973faf6e09d |

Cleanup: четыре browser и два HTTP owned groups closed/absent с exit 0; их отсутствие дополнительно проверено signal-0 metadata lookup. Оба pg-stop.log подтверждают server stopped, оба postmaster.pid отсутствуют, clusterStopped=true. Browser cleanup закрывает свой Chrome/dev server и удаляет временный Chrome profile. Нет утверждения, что retained scratch PG data/evidence удалены.

Неуспешные browser attempts 1–3 сохранены как FAIL. Их 13 harness copies каждый совпали со своими записанными hashes. Между ними и attempt4 просмотрены только fixture изменения: realpath entry guard для /tmp↔/private/tmp; ожидание enabled UI controls и полей; более подробный error stack; сохранение harness copies; допуск существующего receipt-context READ на reject. Dispatch admission остался только phase=approve и explicit synthetic flag. Attempt3 завершился до эффекта: 6 checkpoints, 1 parser, 2 GET, 0 synthetic effects. Ни один failed attempt не используется как полный PASS; их owned groups закрыты и PG остановлены по сохранённым manifests.

Квалификация: default parser по-прежнему честно даёт 503; synthetic extraction не доказывает качество OCR. Нет реальных документов, модели, paid/provider calls, A17 connection, внешнего YCLIENTS receipt, restart/reconciliation, multi-company/schema, production/site, background autonomy или C10 acceptance. Нулевые model/external-provider calls относятся к guarded fixture path, не к общесистемному сетевому аудиту. Это функциональная DOM/HTTP приёмка; дизайн не принят: сообщённые parent header/composer overlap и serif draft form остаются вне данного PASS. Нового разрешения владельца из этого отчёта не выводится.
