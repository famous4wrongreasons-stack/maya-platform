# Реальное локальное подключение YCLIENTS: сохранение, активация и импорт — 11 октября 2026

## Проверенный результат

Source: `bfc832425f031975ec6a59a7eb72bb40b967d000`, branch `codex/maya-local-crm-setup-20261010`. Это ограниченная приёмка существующего локального бизнеса, не production release и не полная приёмка MAYA. Этот проход не меняет runtime/product source.

Владелец самостоятельно ввёл credentials и подтвердил два отдельных действия в текущем React. Реальный connect завершился HTTP **201** 10.10 в 23:16:30 UTC (11.10, 02:16:30 Europe/Moscow); activate/import — HTTP **201** в 23:19:16 UTC (02:19:16 local). В UI наблюдались «Подключение активно» и подтверждение сервером активации/импорта; отдельное нажатие status-read снова показало сохранённое активное подключение.

Read-only запрос к точно идентифицированной прежней локальной базе подтвердил:

- одно `CrmIntegration`, provider `yclients`, status `active`, `verifiedAt`/`lastSyncAt` заполнены, `acceptedImportSnapshotHash` присутствует, ошибки нет;
- ровно по одной A17 execution для install, activate и confirm-import: все `SUCCEEDED`, `dryRun=false`, `local_transaction_committed`; receipt identity совпадает с execution; confirm-import имеет `atomicProjection=true`;
- 6 `Staff`, 6 `StaffProviderLink` и 6 `CrmStaffAccess` в `pending_contact`. Это импорт карточек; сотрудникам не выданы учётные записи/активный вход.

Полный закрытый trace содержит 25 завершённых реальных provider GET/HTTP 200: по 5 companies, book_services, categories, team и company. Это один набор для save и четыре canonical reread-набора внутри явно подтверждённой activation/import операции. Trace не переполнен. У всех пяти team-ответов допуск `management_collection_contract`, `total_count` отсутствует. Исходные provider тела, токены, имена и внешние ID не публикуются. Полнота команды опирается на контракт unfiltered management collection, а не на независимо сообщённое total.

## Что означает «импорт»

Существующий `CrmService.applyCanonicalImportProjection` сохраняет команду, её provider lineage/access, сведения компании и отметку sync; A17 сохраняет принятую версию snapshot. Услуги действительно прочитаны через native YCLIENTS и вошли в preview/snapshot; **полный отдельный локальный каталог услуг этот owner не материализует**. Этот проход не создаёт второй catalog owner и не подтверждает availability/booking. HTTP 200 каталога не доказывает правильность каждого бизнес-значения или полезность ответа модели.

## Перезапуск и предел доказательств

После остановки реального окна та же база независимо открыта только для чтения на приватном Unix socket. Система PostgreSQL и database hash сверены с runtime receipt. Active status, accepted import, три прежние execution/версии/timestamps и все 6 карточек/links сохранились без новых операций. Затем тот же source/AppModule/React/PG запущен в существующем network-closed diagnostic режиме: health и readiness HTTP 200. Итоговая штатная остановка и контроль после неё приведены в summary.

Это доказывает сохранность данных после DB/process restart и возможность старта backend. **Повторный owner login и отображение active connection после полного app restart не выполнены**: diagnostic профиль допускает только health reads. UI status-reread перед остановкой был выполнен. Его запрос `/integrations/crm` не входит в connect/activate/operation trace; отсутствующий trace-запрос нельзя выдавать за operation GET receipt.

Два ручных завершения (реальное окно и первый diagnostic restart) сохранили `runtime_summary_missing`, process exit 1. Процессы и PG остановлены, source/private state совпали; persisted операции остались успешными. Это открытый дефект/ограничение shutdown receipt, не провал импорта. История не переписана: отдельный повтор diagnostic завершается штатно по таймеру. Новый зелёный receipt не подменяет отсутствующий финальный provider summary реального окна.

## Сохранность и следующий этап

[Машиночитаемые факты, provenance и hashes](evidence/maya-owner-yc-activation-20261011/summary.json). Raw receipts остаются приватно вне Git. В repository только разрешённые статусы/счётчики, пути и SHA256; без database dumps, секретов и персональных полей. Бизнес, база, исходные служебные ключи и все предыдущие отказы сохранены. Новых migrations/initdb/signup/credentials rotation нет. Production, сайт, iPhone, grant, real OTP/SMS, paid model, чтение клиентов/записей и YCLIENTS business writes не выполнялись.

Непосредственный blocker сохранения/активации закрыт реальными фактами. Следующая приёмка: обычный owner login после app restart и доступные company/service/staff факты в AChat на том же local tenant через существующих owners. Текущий setup-only профиль не разрешает paid model, availability/appointment/customer reads или business mutations; не расширять его автоматически. Real booking/Client verification, multi-tenant scale и C10 этим результатом не закрыты. Прежние 9 backend + 1 runtime broad-test failures не переобъявлены зелёными. Push не повторялся после прежнего отказа автоматической проверки безопасности; этот checkpoint — локальный.
