# Companion: лист сохранённого отчёта — 2026-10-14

Tested candidate: `4adc54beb81f6f64e9d7c8ac412b39f4915e0a66`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `0ec1a61581ce76179d331074d0e8290a8c91be55`.

## Поведение и владельцы

Сохранённый отчёт открывается листом поверх библиотеки по предоставленному
`Maya_full_design_package/screens/09-document.png`. Список остаётся на месте;
закрытие возвращает фокус на тот же документ и сохраняет прокрутку. Escape,
верхняя кнопка закрытия и «К списку отчётов» используют один прежний `port.back()`.
Native modal блокирует фон. Текст доступен для отдельной прокрутки мышью и
клавиатурой; длинный заголовок не вытесняет весь текст на узком экране.

`ReportSheet` — только представление `WorkspaceReadsView.detail`. Loading,
exact report tuple, перечитывание доступа, отмена и отказ остаются у существующих
runtime/net/backend owners. React не хранит вторую копию отчёта, не добавляет
writer, route или authority evaluator. Это retained report, не WidgetDetail и
не `ShellView.fullscreen`. Backend, runtime, schema и release contract не изменены.

Содержимое выводится обычным текстом. Произвольные HTML, ссылки и внутренний
payload не исполняются. Обсуждение отчёта с моделью, загрузка файлов, выдуманные
метрики из прототипа и новая авторизация этим изменением не добавлены.

## Свежая проверка

Все 20 команд выполнены на чистом неизменном committed candidate выше.
Начало: `2026-10-13T23:56:04Z`; окончание: `2026-10-14T00:00:02Z`.
[Архив](evidence/maya-companion-report-sheet-20261014/README.md) содержит полные
команды, логи, receipts, hashes и синтетические снимки экрана.

| Область | Результат |
| --- | --- |
| Полный runtime | 828 PASS / 7 SKIP / 0 FAIL |
| Полный carrier | 189 PASS / 0 FAIL |
| Scoped backend owners / HTTP / C8 / C9 | 355 PASS / 23 suites |
| Existing scoped mutations | 79/79 killed, зелёные baselines |
| Emitted browser checks | 340 PASS; Feed/Library/report sheet — 100 |
| Runtime/carrier architecture ratchets | PASS |
| Packaging tests | 18 PASS |
| Reproducible runtime / PWA–Capacitor parity | PASS, 8 файлов |
| Scoped backend test lint | PASS |

Browser proof охватывает modal/focus/Tab/Escape, фон библиотеки и навигации,
точную позицию длинного списка, независимую прокрутку отчёта, PageDown,
loading без старого текста, запоздалый ответ после закрытия, отказ доступа и
подменённый snapshot. Проверены ширины 320/393/427/1280, уменьшенная высота 400,
200% текста и максимальный допустимый заголовок 160 символов. Черновик и
переписка сохраняются, отчёт не становится сообщением чата.

В шести browser suites нет внешних запросов, неожиданных API paths и JS/CSP
ошибок. Все данные искусственные; исполняются реальные emitted React/runtime.
Снимки проверены визуально. Физический iPhone, его клавиатура/safe areas,
Xcode signing и установка не проверялись. Parity — существующая сертифицированная
подстановка endpoint, не новая release certification.

## Диагностика до final run

Первый build остановился на отсутствии типизации HTMLElement у focus target;
тип уточнён без расширения доступных DOM/API возможностей. В development browser
assertion возврата завершающее выражение ошибочно возвращало DOM-узел вместо
boolean. Диагностика зафиксировала одинаковую прокрутку 1656 до/после, закрытый
лист, 21 строку и правильный активный документ. После `!!` тот же проход зелёный;
это исправление harness, не ослабление проверки. Ранние receipts архивированы
отдельно и не заменяют final evidence.

## Граница этапа

Это scoped local checkpoint, не release certification или приёмка на данных
салона. Семь runtime SKIP сохранены. Полный backend/Platform CI и полный release
mutation corpus здесь не выполнялись; mutations проверяют существующие владельцы
workspace/tasks/Ideas, а браузер — новое представление.

Production, сохранённая база салона, Keychain и реальные providers не использовались.
Deploy, миграции, grant, OTP/YCLIENTS, model calls, push/merge и установка на
телефон не выполнялись. C10 не начинался. Документация добавлена отдельным
коммитом после тестов без изменения проверенных product bytes.
