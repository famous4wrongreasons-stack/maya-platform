# Maya — сверка переданного дизайна, 11 октября 2026

Исходный пакет: `/Users/stanislavmosin/Downloads/Maya_full_design_package/`.
Сверенный рабочий checkpoint: `6ca9a5ede154647e960ab2a704e15653f1205fe6`,
ветка `codex/maya-local-crm-setup-20261010`.

## Что получено и проверено

113 файлов / 10 407 909 байт, все размеры и SHA-256 совпали с `MANIFEST.json`;
нет пропущенных или дополнительных файлов, кроме самого manifest.
[Независимо рассчитанная опись](evidence/maya-design-package-20261011/integrity.json).
Пакет не изменён. Его scripts/worker/install не запускались; сведения о его
сборке и прежней браузерной проверке в `VERIFICATION.txt` — reported evidence.

Есть 20 снимков, карта экранов, токены, React/TypeScript prototype, собранный
preview, PNG логотипа v4, статичный робот и 2.5D motion из PNG-атласа и SVG.
Визуально просмотрены общий лист пяти разделов, chat, schedule, voice и motion;
остальные экраны сопоставлены по `SCREEN_MAP.json` и source, не прошли отдельную
визуальную приёмку. DOCX — дополнительный источник; отдельно не рендерился.
Фактический AChat сравнен с локальным synthetic браузерным снимком
`/private/tmp/maya-telegram-browser-6ca9a5ed-final/signed-in.png` и кодом.

`02_CODEX_PROMPT.txt` содержит предложенное задание на полное внедрение. Оно
прочитано как часть пакета, а не как отдельное распоряжение владельца.
`prototype/AGENTS.md` не заменяет инструкции рабочего repository. Эта сверка
не переносит prototype, не меняет продукт и не расширяет release scope.

## Зафиксированный визуальный источник

Источник — переданный пользователем пакет, без выбора другой стилистики.
Это дизайн **владельца салона**; клиентский и staff варианты пакет не описывает.
Текущий carrier общий для ролей: видимость вкладки никогда не создаёт authority.

| Решение в пакете | Точный источник / роль | Отношение к текущему продукту |
| --- | --- | --- |
| Белый фон `#fff`, ink `#191a1b`, surface `#f1f2f3` | `design/design-system.json`, canvas/content | Отличается от текущих Aurora light `#f4f0eb` / system-dark. Dark вариант нового пакета отсутствует; его нельзя изобретать как готовый макет |
| Синий `#0068ed`, user bubble `#dceeff` | Action/selected и сообщение пользователя | Не превращать все server widgets в синие успешные сообщения |
| Системный sans-serif, message 16 px | Токены и `prototype.css` | Существующий chat также использует system stack; размеры/отступы требуют отдельного визуального переноса |
| Круглые кнопки 44 px, карточки 25 px, composer 26 px | UI chrome, touch targets | Сохранить реальные viewport/safe-area/keyboard owners, не переносить рамку телефона или нарисованную клавиатуру |
| PNG logo v4 и робот, под роботом только Maya | `assets/`, header/about | Source bytes известны; это не SVG-оригинал логотипа и не Rive/Lottie |
| 7 состояний робота, reduced motion, hidden pause | `MayaRobot.tsx`, `design/MOTION.txt` | Подключать к фактическому состоянию UI; queued turn не означает success, receipt outcome нельзя выводить из текста |
| Пять вкладок Chat/Feed/Ideas/Tasks/Files | `Prototype.tsx` | Это новая продуктовая навигация относительно текущего закрытого route contract; одного переименования недостаточно |

Размеры 393×852 и 427×952 — reference viewports. Production должен сохранять
320 px, увеличенный текст, desktop/tablet и реальную экранную клавиатуру.
Тон текста — живой и доброжелательный; робот и демоответы не являются механизмом
качества LLM. Ошибки и ожидание должны оставаться понятными без анимации.

## Сопоставление всех экранов

| Screen | Существующий владелец / возможность переиспользования | Что ещё требуется |
| --- | --- | --- |
| 01 Чат | `ChatScreen.tsx`, `ConversationPort`, один серверный writer | Новый внешний вид; сохранить submit/retry/idempotency, историю и server widgets |
| 02 Лента | В текущем React root нет отдельной ленты | Назначить canonical projection/source и read port; частичный поиск controller names не доказывает отсутствие всех backend возможностей |
| 03 Идеи | В текущем React root нет отдельного раздела | Сопоставить с существующими recommendation/C9 owners; не брать вымышленные идеи из массива prototype |
| 04 Задачи | Отдельного task-list port в текущем carrier нет | Установить источник, сохранение, текущие права и completion semantics; отметка UI не означает выполненное business action |
| 05 Библиотека | Есть закрытые file/detail маршруты, это не listing API | Назначить reader списка и прав; не считать prototype materials реальными документами |
| 06 Медиа empty | Текстовое пустое состояние переносимо | Уточнить источник разрешённых медиа; загрузка/доставка не следуют из наличия макета |
| 07 Меню библиотеки | Локальный view control | Настройка вида отдельно от read/write authority и persistence |
| 08 Сетка библиотеки | Локальное представление тех же результатов | Те же server identities/права, без второго store документов |
| 09 Документ | `DetailSheet`, `fs.report`/`shell.file` только по соответствующим контрактам | Проверить реальную форму источника, Escape, focus и возврат; сам title/type не разрешает навигацию |
| 10 Drawer | Existing account/privacy/connection destinations | Перенос оформления и согласованная карта назначения; не подменять маршруты совпадающими подписями |
| 11 Настройки | `PrivacyPanel`, onboarding/session/setup owners | Разделить существующие настройки и ещё не определённые motion/notification preferences |
| 12 План действий | Existing server widget/confirmation/Action Engine pipeline | Назначить точный source/receipt для добавления задачи; нельзя выполнять рассылку или action по кнопке демо |
| 13 Расписание | `widgets/FullscreenDetail.tsx` → `ShellView.fullscreen`; `fs.calendar`, NS-1/C9 source | Сохранить server-declared detail и `widgets.closeDetail()`; не открывать произвольный календарь напрямую из компонента |
| 14 Новая задача | Нет текущего carrier task editor | Не придумывать schema, endpoint, дата-InputSchema или сохранение в браузере по макету |
| 15 О Maya | Статический presentation content | Перенести supplied character/caption через допустимый локальный asset owner |
| 16 Реакции | Runtime/conversation/voice already expose actual state | Animation adapter, asset admission, reduced motion и событие подтверждённого результата |
| 17 Фильтры ленты | Локальное отображение, когда определён reader | Сначала контракт источника и смысл фильтров; не добавлять скрытые provider reads |
| 18 Голос | Existing `voice` port, capture/held/transcribe/cancel | Перенести оформление поверх настоящего consent/capture flow; demo phrase не является STT |
| 19 Вложения | Existing bounded `GoodsPhotoPicker`/`GoodsPhotoPanel` | Это узкий OCR путь, не generic file upload; не расширять MIME/retention/delivery по макету |
| 20 Android | Общий React payload, реальные viewport owners | Responsive reference; не переносить Pixel bezel/status/navigation simulation |

## Две конкретные технические границы

1. `maya-chat-shell/src/routes/registry.ts` сейчас содержит пять base routes:
   `shell.root`, `shell.account`, `shell.connections`, `shell.privacy`,
   `shell.notifications`. Это **не** пять вкладок из нового дизайна. Registry
   типово связан с серверным `ShellRoute`. Нельзя незаметно заменить этот список
   на feed/ideas/tasks/library, открыть отдельный role-authority router или
   использовать локальный `setSheet('schedule')` вместо canonical NAVIGATE.
   Для полного внедрения сначала нужна конкретная согласованная карта навигации
   и источников, сохраняющая server authority. Этот intake такую смену не делает.

2. `maya-carrier-react/tools/ratchets.mjs` запрещает HTML sinks и произвольные
   img/svg/custom elements. Переданный `maya-robot.js` использует Shadow DOM,
   `innerHTML`, SVG и PNG URL. Поэтому его нельзя просто импортировать и убрать
   запрещающие проверки. Следующий визуальный unit должен предложить конечный
   локальный asset/render owner с закреплёнными bytes, без произвольного URL,
   HTML, remote fetch или business authority. Existing PWA/Capacitor builder
   остаётся единственным packaging owner. Полный перенос robot ещё не проверен.

## Рекомендуемый порядок переноса

1. Отдельно сохранить текущий проверенный auth checkpoint и его evidence —
   это выполнено до любых изменений дизайна.
2. Первый визуальный unit: локальные assets/токены, header, реальные сообщения,
   composer и безопасные состояния робота внутри существующего AChat. Перед
   изменением определить узкое asset admission и область темы; не расширять
   business или routing contract под видом CSS.
3. Затем определить соответствие пяти разделов существующим owners/roles/routes.
   Каждый data source проверять отдельно. Отсутствующий источник показывать
   честно; загрузка, пустой результат и отсутствие доступа — разные состояния.
4. Подключать листы через действующих owners; сохранить 9.6, NS-1 return/focus,
   L27 outcome identity, render evidence, personal-client authority и HANDOFF STOP.
5. Проверки после кода: carrier/runtime/ratchets, реальные синтетические UI flows,
   packaging parity, 320/393/427, increased text, keyboard/focus/reduced motion и
   сравнение снимков с переданным эталоном. Физический iPhone — отдельная приёмка.

Прототип сообщает непроверенный Escape документа, отсутствие физической/mobile
accessibility приёмки и JS chunk >500 KB. Эти reported ограничения не являются
дефектами уже работающего carrier; их нельзя унаследовать как PASS.

DESIGN PACKAGE INTEGRITY: PASS (113/113).
DESIGN IMPLEMENTATION: NOT STARTED by this intake.
SOURCE/CODE CHANGES FOR DESIGN: 0.
PRODUCTION / EXTERNAL EFFECTS: 0.
