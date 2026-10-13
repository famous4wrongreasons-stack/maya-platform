# Maya Companion — лента и библиотека, локальный checkpoint

Дата: 2026-10-13. Ветка: `codex/maya-local-crm-setup-20261010`.
Кандидат кода: `ccd38792e3772f65165a9b2f0a7706e1151b145d`.
Предшественник: `1c2e03084dfdb08539bb039bce6329cf6365230c`.
Это продолжение переноса предоставленного дизайна после экрана «Мои задачи».
Это не release certificate, C10 или production release.

## Реализовано

- «Лента»: сохранённые уведомления текущего пользователя, время явно в UTC,
  локальный фильтр «Все / Непрочитанные», ручное обновление, предел 50 строк.
  Просмотр не изменяет серверную отметку прочтения и не отправляет уведомлений.
- «Библиотека»: доступные текущему пользователю сохранённые отчёты,
  список/сетка, локальная сортировка по дате источника или названию.
  Источник рассматривает последние 100 отчётов tenant **до** фильтра по получателю;
  интерфейс поэтому не выдаёт даже короткий/пустой результат за полную библиотеку.
- Открытие выбранного отчёта: новый запрос к существующему владельцу snapshot,
  проверка соответствия ID/типу/периоду/заголовку выбранной строки,
  сохранённые текст и canonical timezone без пересчёта периода в timezone устройства.
- Раздельные состояния загрузки, отказа, некорректного ответа и пустого результата.
  Повтор после 429 только вручную после указанного срока.
- Закрытие, смена экрана/сеанса и dispose отменяют запросы и очищают данные;
  поздний ответ не может вернуть старый экран или заменить новое чтение.
  Отказ при открытии отчёта очищает также ранее загруженные заголовки.
- Разговор, его сообщения и черновик сохраняются при возврате. Длинная библиотека
  возвращается к прежней позиции прокрутки; отчёт открывается с начала.

## Владельцы данных и границы

| Surface | Existing owner | Wire |
| --- | --- | --- |
| Feed | `InboxController.list` / `InboxService.listForUser` | GET `/inbox`, current authenticated tenant/user, `deletedAt: null`, newest first, default 50 |
| Report list | `OwnerReportSnapshotsController.list` / `OwnerReportStore.snapshots` | GET `/owner-reports`, retained encrypted runs, recipient + fresh membership checks, pre-filter cap 100 |
| Report body | `OwnerReportSnapshotsController.snapshot` / `OwnerReportStore.snapshot` | GET `/owner-reports/{server-listed UUID}/snapshot`, tenant composite lookup, immutable plan verification, current recipient/membership, retained payload |

Backend product owners не изменены. Добавлен только HTTP/source test с настоящими
Nest JWT/tenant/role guards и OwnerReportStore, искусственным Prisma и искусственно
зашифрованным retained plan. Это не доказательство работы на реальной базе.
Два тестовых слоя разделены: Nest/source с искусственным Prisma; emitted carrier
с искусственным HTTP. End-to-end на базе салона в этом проходе не запускался.

Frontend не выбирает tenant/user/role и не вычисляет права. Клиентская роль не
получает бизнес-доступ к этим источникам. Анонимный, отозванный, подменённый tenant
и чужой получатель проверены на отказ. Срок хранения и подмена manifest проверены
через реальный `readPlan`/snapshot owner. Report list сам по себе не даёт права
на последующее чтение: сервер проверяет его снова.

Network расширен только тремя типизированными GET. Исторический запрет `/inbox`
сохранён везде, кроме точного `PATHS.feed` существующего read endpoint; пути команд,
произвольные литералы и служебные producer endpoints по-прежнему запрещены.
Добавление UUID к report route допускается только с точным префиксом, фиксированным
суффиксом, UUID guard и неизменяемым параметром. Прежняя privacy-erasure проверка
не ослаблена. Семь новых отрицательных build probes проверяют эти границы.

Это фиксированные host workspace views, как «Мои задачи». Пять WidgetContract
base routes, registry/profile, HANDOFF и WidgetDetail authority не изменены.
Отчёт открывается внутри read-only Library, не выдаётся за `fs.report` и не
добавляется в timeline. `payload`, `deep_link` и source event IDs удаляются из
публичной read projection. Текст отображается буквально, React escaping;
никаких произвольных ссылок, HTML, markdown actions или передачи отчёта модели.

## Дизайн и незакрытый объём

Источник: предоставленный `Maya_full_design_package`, экраны `02-feed.png`,
`05-library.png`, `09-document.png`, разделы 6–9 `01_IMPLEMENTATION.txt`.
Общие белый фон, робот, типографика, разделители, список/сетка и меню используются
поверх React AChat. Это не заявление о полном переносе всех экранов пакета.

Категории Salon/Opportunities, Feed Save, «Обсудить» с передачей содержимого,
произвольное Media-хранилище, PDF download и generic document fullscreen в этот
unit не входят. Они не подменены декоративными работающими на вид кнопками.
Backend имеет отдельного PDF owner; его клиентское скачивание здесь не подключено.
Навигация через существующее меню; пять фиктивных бизнес-вкладок не созданы.

Следующий участок: определить точный существующий источник «Идей», его свежесть,
получателя и переход к задаче. Затем формы создания/завершения через A23, отдельно
от уже работающего read-only списка. Undo, Save и generic media требуют своих
канонических владельцев, а не локального изменения массива прототипа.

## Свежая проверка committed candidate

Все результаты получены после коммита `ccd38792`, на чистом и неизменном HEAD,
Node 22.23.3, с очищенным окружением. Позднейший evidence commit меняет только docs.

| Проверка | Результат |
| --- | --- |
| Runtime full suite | 785 PASS / 7 SKIP / 0 FAIL |
| Carrier full suite | 175 PASS / 0 FAIL |
| Nest/source + existing source contract suites | 53 PASS, включая 11 новых HTTP/source cases |
| Workspace mutations | green baseline, 13/13 killed |
| Existing own-tasks mutations | green baseline, 9/9 killed |
| Runtime build ratchets | 68/68 refuse, 24/24 admit; coverage 31/31, write 2/2, PWA 51/51, bypass 8/8 |
| Carrier ratchets | 72 refuse / 45 admit / 0 failures |
| Fresh emitted browsers | chat 35 / tasks 32 / feed-library 52 PASS |
| Packaging tests | 18 PASS |
| Runtime reproducibility + PWA/Capacitor parity | PASS, 8 files per target |

Семь SKIP требуют отдельный API fixture; это не PASS. Full Platform CI, полный
release mutation corpus, live FBE2E, физический voice и iPhone acceptance не
запускались. Предыдущая release certification на этот candidate не переносится.

[Отчёт, raw receipts и screenshots](evidence/maya-companion-feed-library-20261013/README.md).
Production, база салона, Keychain, реальные провайдеры, модель, OTP, YCLIENTS,
миграции, grants и iPhone не затрагивались. Push/merge не выполнялись.
