# Companion: лист новой личной задачи — 2026-10-14

Tested product candidate: `42bde026f9d0407f9eba2cfc5e8c18e829192526`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `aa657bdd0c0a769788ecca17f05e8fd1effb60f0`.

## Реализованное поведение

Существующая форма «Новая задача» приведена к нижнему листу owner design:
белая поверхность, скругление 22 px, handle, компактный заголовок, подпись
«Для вас · без срока», отдельная прокрутка полей и синяя основная кнопка.
Сверху остаётся доступное закрытие; лист размещается по существующим
`--maya-viewport-height` и `--maya-viewport-top`, а не по предположению о высоте
клавиатуры. На широком экране ширина ограничена 560 px, на узком — вся ширина.

Native dialog делает фон неактивным. Tab/Shift+Tab ходят только по доступным
элементам, в том числе когда pending/unknown отключает поля и отправку.
Escape закрывает только форму. Если кнопка открытия недоступна во время
операции, фокус возвращается к заголовку списка. Позднее подтверждение уже
закрытой формы больше не перехватывает фокус. Подтверждение при открытой форме
закрывает её как прежде; новая форма не закрывается от старого confirmed state.

Создание по-прежнему вызывает только `OwnTasksPort.create(title, detail)`.
Канонический runtime/A23 сохраняет текущего пользователя, title до 160,
description до 4000 и отсутствие срока. Два настоящих обязательных поля
оставлены, хотя прототип содержит одно демонстрационное поле. Демонстрационная
дата не превращена в реальный срок. Назначение другому человеку, undo, новая
authority или второй writer не добавлены. Backend, runtime, persistence,
schema, API DTO, grants и release contract не менялись.

Unknown остаётся неопределённым результатом: форма не показывает успех,
не разрешает новую отправку и предлагает прежний явный повтор той же операции.
Закрытие не отменяет уже отправленную команду. Закрытый несохранённый черновик
формы очищается как раньше; черновик AChat и его переписка сохраняются.

## Reference lock / решения представления

| Решение | Источник | Сохранённая роль |
| --- | --- | --- |
| Нижний лист, белая поверхность, handle, radius 22 | owner `screens/14-new-task.png`, prototype sheet CSS | Форма над существующим экраном, не отдельный маршрут |
| Доступные поля и явная основная кнопка | тот же макет и текущий A23 contract | Настоящие title/body без выдуманной даты или assignment |
| Видимый viewport и отдельная прокрутка | текущий `App.useVisibleViewport`, прежние report/library sheets | Единый владелец browser geometry, без нового keyboard bridge |
| Закрытие, возврат фокуса, pending/unknown | существующий task owner и native modal | Доступность интерфейса без отмены/повтора бизнес-операции |

Новых assets, dependency или изменений network/resource allowlist нет.

## Свежая проверка

Все 20 команд заново исполнены на чистом неизменном committed candidate выше.
Начало: `2026-10-14T05:52:30Z`; окончание: `2026-10-14T05:56:28Z`.
[Архив](evidence/maya-companion-task-sheet-20261014/README.md) содержит команды,
полные логи, receipts, hashes и синтетические screenshots.

| Область | Результат |
| --- | --- |
| Полный runtime | 828 PASS / 7 SKIP / 0 FAIL |
| Полный carrier | 191 PASS / 0 FAIL |
| Scoped backend owners / HTTP / C8 / C9 | 355 PASS / 23 suites |
| Existing scoped mutations | 79/79 killed, зелёные baselines |
| Emitted browser checks | 428 PASS; task actions — 54 |
| Runtime/carrier architecture ratchets | PASS |
| Packaging tests | 18 PASS |
| Reproducible runtime / PWA–Capacitor parity | PASS, 8 файлов |
| Scoped backend test lint | PASS |

Task browser proof проверяет native modal, описание scope, обязательные пределы,
Tab/Shift+Tab для empty/filled/pending/unknown, неактивный фон, отсутствие POST
при вводе/закрытии/resize, размеры 320/393/427/1280, высоту 400, 200% текста,
уменьшенный visible viewport 320 с offset 38 и доступность отправки по Tab.
Последний сценарий — искусственная проверка browser geometry, не физическая
iOS-клавиатура. Скриншоты формы просмотрены и сопоставлены с owner reference.

Удержанный серверный ответ доказывает отсутствие оптимистической строки и
двойной отправки. Закрытие pending формы сохраняет status и корректный фокус;
поздний ответ не крадёт его. Потерянный create response даёт unknown; явный
повтор использует одинаковые body/idempotency identity, даёт ровно одну mutation
в тестовом владельце, затем reread показывает одну задачу. Старые проверки
complete/retry/substituted target/no capability сохранены.

Шесть browser suites выполняют реальные emitted React/runtime с замкнутыми
HTTP fixtures. Внешние запросы, неожиданные paths, JS/CSP errors — 0.

## Development диагностика

Первый дополнительный viewport probe остановился на синтаксисе harness: helper
принимает выражение, а setup передал несколько statements. Setup обёрнут в IIFE.
Следующая попытка пыталась повторно сфокусировать уже сфокусированную кнопку
после искусственного изменения viewport. Receipt показал корректную геометрию
листа (top 62, bottom 358), scrollTop 0 и кнопку вне видимой части полей.
Повторный `focus()` того же элемента не выполнял новый keyboard transition.
Probe уточнён до реального действия: фокус поля, уменьшение viewport,
Tab через описание к отправке. Строгая проверка видимости кнопки сохранена и
усилена проверкой activeElement. Product CSS ради этого результата не менялся.
Development failures и исправленный проход сохранены отдельно; final evidence
получен новым запуском на committed candidate, а не переиспользован.

## Границы

Это scoped local checkpoint после C9, не C10, full release certification или
приёмка на данных салона. 7 runtime SKIP не названы PASS. Полный backend,
Platform CI и полный release mutation corpus здесь не запускались; 79 mutations
проверяют существующие workspace/tasks/Ideas owners, не новый отдельный корпус.

Физический iPhone, native keyboard/safe areas, Xcode signing и установка не
проверялись. Production, сохранённая база салона, Keychain и реальные providers
не использовались. Deploy, миграции, grant, OTP/YCLIENTS, модель, push/merge и
установка на телефон не выполнялись. Документация фиксируется отдельно после
проверки без изменения product bytes. Остальные source/policy gaps прежней
карты не объявляются закрытыми этим визуальным этапом.
