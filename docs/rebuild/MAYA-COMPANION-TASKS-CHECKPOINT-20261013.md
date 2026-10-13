# Companion: «Мои задачи» — локальный read-only unit

Продолжение дизайна после `5b8d99db` и карты источников на `2d30e0fc`.
Используется supplied `Maya_full_design_package/screens/04-tasks.png`:
белый экран, общий Companion header, переключатель В работе/Готово,
разделённые строки и возврат к разговору. Prototype demo data не входят в продукт.

## Источник и права

Существующий A23 `GET /operational-work`:
`package5-wave1/operational-work.controller.ts`, `list`.
Настоящие JWT/tenant/role guards и controller остаются неизменными.
Запрос не содержит tenant, Client, assignee или фильтр из caller.
Сервер выбирает `tenantId + assigneeUserId + kind: task`, максимум 50 строк.
Это рабочие задачи текущего пользователя, **не личные клиентские визиты**.
Роль Client не получает доступ через новый экран; серверный 403 показывается явно.

Runtime net владеет одним фиксированным GET и существующим session refresh.
Projection оставляет только React key, заголовок, текст, срок и OPEN/COMPLETED.
Inbox/ActionExecution locators, next_actions и другие поля не поступают в carrier.
Некорректная или дублирующаяся строка отклоняет весь snapshot.
React не читает JWT, не вычисляет роли, не запрашивает API и не создаёт authority.

На ответе ровно из 50 строк показывается предупреждение о возможной неполноте,
включая пустой результат выбранного фильтра. Счётчики относятся к загруженным
строкам, а не всем задачам салона. API не отдаёт timezone: срок показан как точный
UTC instant с явной подписью UTC, без самостоятельного «сегодня/просрочено».
Отдельный chat READ `tasks.list` имеет другую projection; его гарантии
не приписываются этому endpoint.

## Один navigation owner

`createShell` получает фиксированный `workspace: tasks` и host-only
`openTasks()` без строки маршрута и параметров. Это представление приложения,
не новый WidgetRoute/DetailRoute и не второй router. `WidgetPort` не получает
`openTasks`; arbitrary widget/deeplink key не может открыть эту поверхность.
Все пять BASE_ROUTES, WidgetContract registry/profile digests, NAVIGATE/detail
authority и HANDOFF STOP неизменны. Переход в canonical detail или другую
base destination закрывает workspace. Выход из аккаунта очищает его.

`createOwnTasks` владеет загрузкой и данными: один запрос на открытие,
ручное обновление, локальный фильтр, отмена и удаление snapshot при закрытии,
смене сеанса и dispose. Поздний ответ из предыдущего сеанса отбрасывается.
429 требует явного повторного нажатия после Retry-After; автоматического
опроса и retry-loop нет.

Экран открывается из меню «Мои задачи». Composer скрыт, активный voice capture
отменяется существующим voice port. Escape/закрытие возвращают в текущий AChat;
черновик и Conversation identity не меняются. Обычные timeline и widget owners
остаются прежними. Новых render/delivery receipts нет.

## Границы

В этом unit нет создания, завершения, undo, переназначения и редактирования срока.
Backend create/complete существуют, но нуждаются в отдельном carrier unit
с их собственными idempotency/receipt/unknown semantics. Статусная отметка
задачи не является интерактивным checkbox.

Не добавлены фиктивные пять вкладок, Feed Save, generic media store,
новые модели/миграции, C10, разрешение HANDOFF или widgets.runtime grant.
Нет model/provider requests, доступа к сохранённой базе или Keychain,
production действий, установки iPhone, push или merge.

## Воспроизведение

Node 22, очищенное окружение, никаких реальных ключей:

- runtime build и `node --test conformance.test.mjs test/*.test.mjs`;
- `node test/own-tasks.mutations.mjs` — baseline + изолированные mutations;
- carrier `npm test`, `node build.mjs --self-test`;
- `node tools/release.mjs build`, `node --test test/release.test.mjs`;
- carrier `node test/companion.browser.mjs /private/tmp/maya-companion-<unique>`;
- carrier `node test/own-tasks.browser.mjs /private/tmp/maya-companion-<unique>`;
- backend `jest --runInBand src/package5-wave1/operational-work.http.spec.ts`.

Browser использует actual emitted React+runtime и synthetic loopback HTTP.
Backend HTTP test использует actual Nest/controller/guards и искусственный
Prisma fixture; это не PostgreSQL/live-salon end-to-end proof.
Prisma Client генерируется из текущей схемы без чтения .env, без базы/миграций.
Finite endpoint-list fixtures обновляются только добавлением существующего
GET; проверка единственного fetch site и отказ произвольных endpoints сохранены.

Результаты и точный candidate будут зафиксированы отдельным evidence commit.
Этот scoped unit не выдаёт новый `CERTIFIED_FOR_PROFILE` и не заменяет
полную release qualification.
