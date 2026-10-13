# Companion: нижняя навигация — 2026-10-14

Tested candidate: `a05d0c5b17375694704d9c692aaff1498e28f4a6`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `4e9a8c89a055537ea41f7455d216a2037a6ec72a`.
Navigation implementation: `86a9dc40383a2d2f4f9eeac956dc33bb66218ed6`.
The tested candidate additionally corrects responsive composer measurement and a
license-comment packaging refusal. No runtime/backend source changed.

## Поведение

Нижняя панель из пакета владельца открывает пять существующих разделов:
«Чат», «Лента», «Идеи», «Задачи», «Файлы». Активный раздел приходит из
`ShellView.workspace`; независимого состояния маршрута в React нет. Меню и
нижняя панель передают жесты одним обработчикам существующих workspace ports.
Повторное нажатие активного раздела не перечитывает данные и не сбрасывает детали.

Возврат в чат сохраняет черновик и переписку, фокусируется на области разговора,
не вызывая клавиатуру. Навигация скрывается в privacy, фото и fullscreen detail;
модальная форма задачи сохраняет собственное управление и блокирует фон.
При редактировании на touch-устройстве панель скрывается; это правило coarse-pointer
focus, а не доказательство обнаружения физической клавиатуры на iPhone.
Высота панели измеряется и резервируется под контентом. Подсказка и черновик
пересчитывают высоту при изменении ширины поля, включая 320 px.

Использованы только десять regular/bold path strings Phosphor из предоставленного
prototype bundle. Прототип не исполнялся и не переносился как приложение.
`maya-carrier-react/brand/companion-v1/navigation-icons.json` содержит источник,
его hash, hashes путей и upstream MIT attribution. Полный copyright/permission
notice включён в emitted CSS; новых ресурсов, dependencies или network exceptions нет.

## Свежие результаты

Все 20 команд выполнены на чистом неизменном committed SHA выше.
Начало: `2026-10-13T23:34:54Z`; окончание: `2026-10-13T23:38:47Z`.
[Полный архив](evidence/maya-companion-navigation-20261014/README.md) содержит
команды, логи, browser receipts, hashes и скриншоты.

| Область | Результат |
| --- | --- |
| Полный runtime | 828 PASS / 7 SKIP / 0 FAIL |
| Полный carrier | 188 PASS / 0 FAIL |
| Scoped backend owners / HTTP / C8 / C9 | 355 PASS / 23 suites |
| Existing scoped mutations | 79/79 killed, зелёные baselines |
| Emitted browser checks | 315 PASS, из них навигация 77 |
| Runtime/carrier architecture ratchets | PASS |
| Packaging tests | 18 PASS |
| Reproducible runtime / PWA–Capacitor parity | PASS, 8 файлов, только существующая endpoint substitution |
| Scoped backend test lint | PASS |

Навигационный browser proof проверяет пять реальных переходов и точный GET каждого
существующего reader, отсутствие preload и повторов активной вкладки, доступность
клавиатурой, 44 px targets на четырёх размерах, увеличение текста, нижние элементы
длинной ленты, draft/history, форму задачи и фото/privacy. Запоздалый ответ не
заменяет выбранный раздел, 403 не подменяется данными, отзыв сессии убирает
поверхности. Pending chat turn завершается один раз при уходе и возврате, без
второго writer. Все ответы искусственные, реальные App/React/runtime bytes.

Во всех шести browser suites внешний трафик, неожиданные API paths и JS/CSP ошибки
отсутствуют. Backend checks используют synthetic/mocked persistence и membership,
не базу салона. Скриншоты final run проверены визуально; native keyboard, safe-area
на физическом iPhone, Xcode signing и установка в этом проходе не проверялись.

## Коррекции до final proof

Первый browser сценарий не ожидал завершения resize/return-focus. После двух
animation frames и проверки фактического lane focus переходы выполняются обычными
нативными input events, без DOM click bypass. Отдельная ошибочная попытка нажать
«Выйти» в idle privacy исправлена на реальный отказ API/refresh и отзыв сессии:
кнопка «Выйти» по действующему контракту есть только в refused privacy.

Обрезание placeholder при resize 393→320 воспроизведено до исправления с отдельным
падающим assertion. После width-only ResizeObserver проходит тот же assertion и
проверка переноса черновика. Ограничения 50–138 px и runtime submit semantics не
менялись. Observer не реагирует на собственную запись высоты.

Первый final run остановился на URL в комментарии лицензии CSS. URL остался в
provenance JSON; MIT notice остался в CSS. Resource gate не ослаблялся. После
коррекций все 20 команд запущены заново; ранние PASS не заменяют final evidence.

## Граница этапа

Это **scoped local checkpoint, не release certification**. Семь runtime SKIP не
превращены в PASS. Полный backend/Platform CI, release mutation corpus и live
приёмка салона не выполнялись. «Файлы» остаются библиотекой существующих сохранённых
отчётов; «Идеи» — текущим ограниченным C8 reader, не новым генератором планов.

Save, новые категории ленты, generic media, новый вход в календарь, task date/undo,
Ideas-to-task требуют отдельных установленных контрактов. Навигация их не добавляет.
Production, сохранённая база салона, Keychain, реальные providers и модель не
использовались. Deploy, миграции, grant, OTP/YCLIENTS, push/merge и установка на
телефон не выполнялись. C10 не начинался. Документы добавлены после проверки,
отдельным коммитом без изменения проверенных product bytes.
