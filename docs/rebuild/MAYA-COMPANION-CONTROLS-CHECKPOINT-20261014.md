# Companion: меню и настройки вида библиотеки — 2026-10-14

Tested product candidate: `79fad41b5cdc293d1ec19e3fe7d3dcc923bf2c58`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `3d28c19837a2ab10ff507d2c464d43660203da6c`.

## Поведение и владельцы

Боковое меню содержит пять существующих разделов: Главный чат, Лента, Идеи,
Мои задачи и Библиотека. Открытый раздел — проекция текущего ShellView;
в React нет второй выбранной страницы. Повторный выбор текущего раздела
закрывает меню без повторного чтения или сброса. Возврат в главный чат проходит
через прежний `shell.root` и сохраняет черновик и переписку. Privacy помечается
отдельно; при открытом photo surface главный чат недоступен в меню, чтобы
сохранить собственный механизм закрытия этой поверхности. Ложной отметки
«Главный чат» в этом состоянии нет.

`LibraryViewMenu` показывает настройки библиотеки отдельным native dialog:
список/сетка и порядок по дате/названию. Выбор сразу вызывает существующие
`WorkspaceReadsPort.layout/order`; «Готово», крестик и Escape закрывают только
лист настроек и возвращают фокус. Сортировка доступна только при готовом
источнике, как до изменения. Настройки не создают сетевого запроса, сохранения
в базе, отдельного preference store или второго списка отчётов. Background
неактивен, Tab/Shift+Tab остаются внутри листа.

Визуальные источники — owner package `screens/10-drawer.png` и
`screens/07-library-menu.png`. Меню занимает до 83% узкого экрана, текущий раздел
выделен нейтральной плашкой. Переиспользованы уже разрешённые navigation icons
из `brand/companion-v1/navigation-icons.json`, с прежними bytes/license/provenance.
Лист библиотеки использует существующие цвета, viewport/safe-area правила и
скругление 22 px. В макете показаны демонстрационные пользователь и история:
фиктивные имя, роль, недавние разговоры и поиск не добавлены.

Backend, headless runtime, schema и release contract не изменены. Существующие
report readers, task/Feed writers, authority rereads и session invalidation
остаются у прежних владельцев. ReportSheet не переписан. Новых маршрутов,
booking authority, model context или загрузки медиа нет.

## Свежая проверка

Все 20 команд выполнены на чистом неизменном committed product candidate выше.
Начало: `2026-10-14T00:18:12Z`; окончание: `2026-10-14T00:22:11Z`.
[Архив](evidence/maya-companion-controls-20261014/README.md) содержит команды,
логи, receipts, manifest hashes и синтетические снимки.

| Область | Результат |
| --- | --- |
| Полный runtime | 828 PASS / 7 SKIP / 0 FAIL |
| Полный carrier | 191 PASS / 0 FAIL |
| Scoped backend owners / HTTP / C8 / C9 | 355 PASS / 23 suites |
| Existing scoped mutations | 79/79 killed, зелёные baselines |
| Emitted browser checks | 402 PASS; workspace 116, navigation 123 |
| Runtime/carrier architecture ratchets | PASS |
| Packaging tests | 18 PASS |
| Reproducible runtime / PWA–Capacitor parity | PASS, 8 файлов |
| Scoped backend test lint | PASS |

Browser proof использует реальные emitted React/runtime и замкнутые искусственные
HTTP fixtures. Проверены соответствие меню и нижней навигации, ровно существующие
GET на переход, отсутствие повторного GET при выборе текущего раздела, photo и
Privacy, сохранение черновика/переписки и прежние отказы доступа.

Лист настроек проверен при ширинах 320/393/427/1280, высоте 400 и 200% текста:
modal, фокус, Tab/Shift+Tab, Escape, повторное открытие, выбор и сохранение
layout/order в существующем runtime. Изменение настроек не вызывает HTTP.
Свежие шесть browser suites не имеют внешних запросов, неожиданных API paths
или JS/CSP ошибок. Скриншоты проверены визуально.

## Доказанная визуальная регрессия до final run

На development screenshot вместо значков меню были чёрные квадраты: новый
более специфичный CSS shorthand `background: currentColor` сбрасывал уже
разрешённое background image. Добавлена проверка наличия прежнего image и
прозрачного фона. На прежней сборке она падает с
`drawer preserves admitted icon images without opaque square backgrounds`.
После замены на `background-color: transparent` тот же probe проходит.
Иконки и их allowlist не заменялись, gate не ослаблялся. Development receipts
и screenshot сохранены отдельно; они не подменяют свежую final проверку.

## Граница этапа

Это scoped local checkpoint, не full release certification и не проверка на
данных салона. Семь runtime SKIP сохранены. Полный backend/Platform CI и полный
release mutation corpus здесь не запускались. 79 mutations проверяют прежних
workspace/tasks/Ideas owners; новое отображение проверено SSR и браузером.

PWA/Capacitor parity использует существующую подстановку endpoint. Физический
iPhone, native keyboard/safe areas, Xcode signing и установка не проверялись.
Production, сохранённая база салона, Keychain и реальные providers не использовались.
Deploy, миграции, grant, OTP/YCLIENTS, model calls, push/merge и установка на
телефон не выполнялись. C10 не начинался.

Открытые отдельные вопросы прежней карты — task undo, Save from Feed, generic
media, model-context discussion и новые source/route vocabulary — этим участком
не решены. Недавние разговоры, поиск и персональный профиль требуют собственного
канонического источника; демонстрационные данные макета им не служат.
Документация добавляется отдельным коммитом после тестов без изменения
проверенных product bytes.
