# Companion: «О Maya» — 2026-10-14

Tested product candidate: `1da26ad9a24d91bd809f236d0b54c9e9635c2695`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `95ce9154` (completed voice sheet checkpoint).

## Поведение и границы владельцев

Нажатие на Maya в шапке теперь открывает нижний лист «Привет, я Maya».
Персонаж увеличен до 135×135 по owner reference; подпись остаётся только Maya.
Кнопка персонажа вызывает прежний `greet`, а изображение использует те же
`state`, `event` и настройку `moving`, что шапка. Новый controller, таймер,
local success state, voice capture или AI-запрос не добавлены. Состояние thinking
не заменяется приветствием. Закрытый лист не монтирует второй персонаж.

«Давай поговорим» закрывает лист и при необходимости вызывает существующий
возврат в `shell.root`. В уже открытом чате это только закрытие — без navigation,
нового turn или повторного history read. Сохраняются черновик и переписка.
При `current === null` (например, у формы фото) кнопка недоступна: лист не
подменяет владельца закрытия инструмента. Keyboard/focus trap пропускает эту
отключённую кнопку. Сам статический экран не создаёт business authority.

Native dialog блокирует фон. Фокус начинается на заголовке, Tab/Shift+Tab
остаются внутри листа; Escape/крестик возвращают фокус к кнопке «О Maya».
Возврат из рабочего раздела в чат по-прежнему фокусирует chat lane без открытия
клавиатуры. System reduced motion и существующая настройка сеанса действуют
и на увеличенного персонажа; скрытая вкладка останавливает движения.

Backend/runtime/capture/session/API/schema/permissions/release contracts не
изменены. Product diff: только `AboutMayaSheet.tsx`, `CompanionHeader.tsx` и
`styles.css`; существующий `navigation.browser.mjs` расширен на 47 проверок.
Dependency, assets и admission allowlists не расширялись.

## Reference lock и намеренные адаптации

Источник — `Maya_full_design_package/screens/15-about-maya.png`, ветка `about`
в `prototype/src/Prototype.tsx`, related `prototype.css`/motion reference.
Перенесены белый нижний лист, radius 22, handle, увеличенный персонаж, подпись,
двухстрочное приветствие и синяя основная кнопка. Используется существующий
finite atlas owner, не prototype web component или HTML sink.

Описание: «Обсудим важное, разберёмся в вопросах и найдём следующий шаг».
Демонстрационная подпись о вымышленных данных не показана в приложении;
описание не обещает автоматическую рассылку или непроверенную бизнес-операцию.
Мелкий текст использует уже существующий muted `#65696f` вместо reference
`#737e8c`: контраст на белом 5.52:1 вместо 4.12:1. Роль цвета сохранена.

Лист ограничен 560 px на широком экране. Высота/позиция используют существующие
App visible-viewport CSS variables; 200% текста и короткая высота прокручиваются.
Рамка телефона и нарисованная клавиатура из prototype не перенесены.

## Свежие результаты

11 команд выполнены заново на чистом неизменном committed candidate выше:
`2026-10-14T06:41:07Z` → `2026-10-14T06:44:35Z`.
[Архив](evidence/maya-companion-about-20261014/README.md) содержит commands/logs,
три browser receipts, screenshots и hashes.

| Проверка | Результат |
| --- | --- |
| Полный runtime | 828 PASS / 7 SKIP / 0 FAIL |
| Полный carrier | 194 PASS / 0 FAIL |
| Emitted chat browser | 35 PASS |
| Emitted navigation + About browser | 170 PASS (47 добавлено) |
| Emitted synthetic voice browser | 56 PASS |
| Packaging tests | 18 PASS |
| Runtime/carrier architectural ratchets | PASS |
| Runtime reproducibility / PWA–Capacitor parity | PASS, 8 файлов |

About browser проверяет настоящий keyboard open; конечное и повторное
приветствие; отсутствие запросов при open/greet/close/layout; Tab и Escape;
инертность фона; 320/393/427/1280; 200% текста при высоте 440; доступность CTA;
reduced motion; hidden pause; общий переключатель движения; возврат из чата
без запроса; сохранность каждого из четырёх разделов без reread; возврат из
библиотеки через canonical root; запрет обхода формы фото; сохранение thinking.
Прежние session revocation, pending turn, exact read и no-writer checks сохранены.
Всего 261 browser checks. Реальные emitted React/runtime, замкнутые HTTP fixtures;
внешние запросы, неожиданные API и JS/CSP errors — 0.

## Development диагностика

Первый build корректно отказал на неразрешённом HTML tag `br`. Закрытый список
не расширен: строка теперь содержит newline, а CSS задаёт `white-space: pre-line`.
Refusal log сохранён. Второй build прошёл.

Первый browser run остановился в harness: сохранение DOM reference возвращало
сам DOM через CDP `returnByValue`, что вызвало Object reference chain is too long.
Harness теперь сохраняет reference внутри страницы и возвращает boolean.
Проверка замены узла при повторном greeting сохранена. Следующий development
run прошёл 170 checks. Final evidence получено отдельным свежим запуском после
commit, не перенесено из development receipts.

## Что этот checkpoint не доказывает

Это локальная визуальная интеграция после C9, не новая release certification.
Полный backend, Platform CI и mutation corpus здесь не запускались: серверные
и runtime contracts не менялись. Их прежние результаты не названы свежими.
7 runtime SKIP не названы PASS. Реальный iPhone, native keyboard/safe areas,
Xcode build/install и реальный speech provider не проверялись.

Production, сохранённая база салона, Keychain, реальные providers и платежи
не использовались. Deploy, migration, grant, OTP/YCLIENTS, push/merge и установка
на телефон не выполнялись. Документация фиксируется отдельно без изменения
product bytes. Source/policy gaps в основной карте остаются открытыми.
