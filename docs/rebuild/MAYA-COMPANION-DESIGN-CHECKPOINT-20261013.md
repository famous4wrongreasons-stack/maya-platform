# Maya — первый перенос Companion v1 в настоящий AChat

Дата: 2026-10-13. Ветка: `codex/maya-local-crm-setup-20261010`.
Исходный чистый checkpoint: `957067080d7e8c8b7a1f107be69b377263955eb5`.
Владелец разрешил начать перенос переданного дизайна после обсуждения порядка
разработки. Это локальная реализация presentation, не release certification.

## Визуальный источник и перенесённая часть

[Исходная сверка пакета](MAYA-DESIGN-PACKAGE-INTAKE-20261011.md) сохраняется как
исторический документ; её `NOT STARTED` относится к 11 октября. Источник —
`/Users/stanislavmosin/Downloads/Maya_full_design_package`, выбранные logo v4,
Companion motion v1 и белая тема. В этом unit перенесены:

- общий белый фон и токены, реальные сообщения AChat, поле ввода и кнопки;
- персонаж, подпись Maya, имя бизнеса из существующего SessionView;
- меню с существующими назначениями приватности и товара по фото накладной;
- настройка движения на время сеанса, системный reduced motion и hidden pause;
- логотип на входе и в меню; PWA/install icons этого unit не меняются;
- 7 визуальных поз, из которых `success` пока только изолированная поза для
  тестов. Ответ модели вызывает `reply`, никогда не подтверждает business success.

В package нет dark/клиентского/staff макета. Общая тема не добавляет роль
«Владелец»: имя бизнеса приходит от сервера, продуктовые полномочия остаются
у существующих владельцев. Нарисованные статусбар, рамка телефона и демоданные
не перенесены. Приветливость ответов модели этим визуальным unit не изменяется.

## Техническая граница

React carrier остаётся единственным web payload owner. Backend, Prisma и
`maya-chat-shell/src` не меняются. Нет новых API, stores сообщений, маршрутов,
InputSchema, profile evaluator, выдачи `widgets.runtime` или HANDOFF.
Conversation/Session/Voice/Widget ports, retry identity, DetailSheet/NS-1,
render evidence и Action Engine сохраняют существующих владельцев.

Два PNG скопированы byte-for-byte и перечислены в
[`provenance.json`](../../maya-carrier-react/brand/companion-v1/provenance.json).
Конечный asset owner проверяет SHA-256 и запрещает symlink/подменённые bytes.
PNG встраиваются в существующий stylesheet: нет нового сетевого URL/CSP
исключения, произвольного image element или дополнительного serving endpoint.
CSS увеличивается примерно на 1.46 MB до HTTP-сжатия; произвольные data PNG,
локальные/удалённые URL по-прежнему отказываются. PWA и Capacitor получают
одинаковые artwork/CSS bytes.

Персонаж собран из React spans, исходного PNG-атласа и конечных literal SVG
expressions внутри CSS. Prototype `innerHTML`/custom element не используется;
общие HTML/JSX ratchets не ослаблены. Это 2.5D artwork, не 3D/Rive/vector original.
Кнопка справа открывает существующую приватность; календарь из макета нельзя
открыть произвольным локальным состоянием вместо canonical NAVIGATE.

## Что осталось для полного дизайна

| Раздел/поведение | Установленный источник и следующий шаг |
| --- | --- |
| Чат и базовый chrome | Реализованы здесь; локальная browser acceptance и отдельная итоговая release qualification |
| Лента | Нет dedicated carrier reader; сопоставить реальную server projection, роли и фильтры. `shell.notifications` не переименовывается в ленту |
| Идеи/план | Сопоставить existing recommendation/C9 projection и действие добавления. Не брать массив идей prototype и не исполнять business action из CSS-карточки |
| Задачи | `tasks.list` уже читает A23 `OperationalWorkItem` через AiCore/C9. `ai-tool-handler.service.ts` и `package5-wave1/operational-tasks.read.ts` существуют на текущей ветке. Нужны отдельная карта list route/read port и точные editor/completion contracts; отсутствие вкладки не означает отсутствие backend |
| Файлы/библиотека | Закрытые `shell.file`/`fs.report`/`fs.media` не являются listing API; нужен проверенный list reader и разрешённые действия |
| Расписание | Существующий NS-1 `fs.calendar` сохраняется через server-declared NAVIGATE/DetailSheet. Toolbar calendar требует canonical entry contract |
| Голос | Оформлена существующая кнопка и реальные состояния; новый полноэкранный voice screen и физический микрофон не принимались |
| Вложения | Плюс открывает только существующий GoodsPhoto owner; generic upload не добавлен |
| Success reaction | Не подключена к business outcome, пока нет точного presentation event/receipt owner для неё |

Пять текущих base routes — `shell.root/account/connections/privacy/notifications`.
Это не пять новых вкладок Chat/Feed/Ideas/Tasks/Files. Полный перенос требует
согласовать их с источниками и правами, сохранив один runtime, без mirror writer.
Следующий unit начинает с этой карты, а не с имитации работающих вкладок.

## Проверка и пределы утверждений

Воспроизводимые команды из `maya-carrier-react`: `npm test`,
`node build.mjs --self-test`, `node tools/release.mjs build`,
`node --test test/release.test.mjs`,
`node test/companion.browser.mjs /private/tmp/maya-companion-<unique-run>`.
Runtime: `npm test` в `maya-chat-shell`. Node 22, без provider environment.

Browser proof использует emitted React+runtime, временный профиль Chrome и
loopback HTTP с synthetic ответами. Он не подменяет проверку настоящего backend,
YCLIENTS, модели, пользователя или устройства. Отдельно проверяются 40 sealed
widget fixtures: non-style markup до/после темы должен совпасть полностью.

Свежие результаты и candidate binding: [evidence](evidence/maya-companion-design-20261013/README.md).
Полный mutation/FBE2E/CI aggregate не является частью этой scoped UI проверки.
Сертификат не наследуется: `CERTIFIED_FOR_PROFILE` этим unit не выдаётся.
Ни production, ни сохранённая база/ключи, ни iPhone не затронуты.
