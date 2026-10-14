# Companion: настройки — 2026-10-14

Tested product candidate: `064094e659817a5cd720b147f0239d502512bcce`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `dd083f2f2318b6faaab4b2d346e45c39a577888c` (About Maya evidence).

## Реализованное поведение

«Настройки» в существующем меню открывает нижний лист по owner reference.
Имя и название салона берутся из `SessionView.display`, который уже содержит
только `userName` и `tenantName`. Роль, новые права, CRM-карточка и контакты
не запрашиваются и не выводятся. При отсутствии имени показан «Ваш аккаунт»;
значения отображаются React text nodes, включая HTML-подобный ввод.

Переключатель «Движения Maya» вызывает прежний владелец состояния в
`CompanionHeader`: отдельной копии состояния, persistence, таймера или
настройки уведомлений нет. Существующий shortcut в меню и экран «О Maya»
используют тот же `moving`. Системное уменьшение движения имеет приоритет.
Пользователь явно видит, что настройка действует только в этом сеансе.

Закрытие через Escape/крестик возвращает фокус к видимой кнопке меню,
поскольку сам drawer уже закрыт. Native dialog делает фон неактивным;
Tab/Shift+Tab остаются внутри листа. Открытие/изменение движения/закрытие
не вызывают API. Рабочий раздел, черновик и переписка сохраняются.
Ответ об истечении входа удаляет открытый лист и отображаемые данные вместе
со всем signed-in carrier.

## Уведомления: фактическая граница

Единого runtime-порта для prototype toggle «Уведомления» в текущем carrier нет.
Существующие backend owners имеют другую область и разные контракты:

- `maya-saas-backend/src/package5-wave1/governed-settings.controller.ts`:
  отдельные personal staff preferences через canonical cutover, authenticated
  actor, idempotency и server policy.
- `maya-saas-backend/src/action-engine/client-preferences.contract.ts`:
  точные категории client notifications, quiet hours и отдельная capability.
- `maya-chat-shell/src/routes/registry.ts` содержит закрытый route
  `shell.notifications`; наличие route не предоставляет toggle writer.

Поэтому здесь статическая строка «Управление уведомлениями пока недоступно здесь».
Нет ложного switch со значением «включено» или «выключено», обещания доставки,
подмены consent и изменения настроек клиента/сотрудника. Эта работа не закрывает
продуктовую интеграцию notification preferences. Для неё нужен отдельный точный
mapping к существующему owner; отсутствие такого mapping не блокирует локальное
оформление остальных настроек.

## Сопоставление с макетом

Источник: `Maya_full_design_package/screens/11-settings.png`, settings branch
в `prototype/src/Prototype.tsx`, связанные styles. Hashes сохранены в manifest.
Белый нижний лист, handle, radius 22, профиль, разделители, движение и workspace
перенесены. Вместо demo «Стас / Владелец / Мужская эстетика» — текущий display.
Уведомления без неподключённого toggle. Объяснение контроля ограничено записью,
переносом и отменой; нет общего обещания о разрешённых автоматических сообщениях.
Добавлен явный крестик с целью 44×44, сохранены native modal/focus semantics.

Используются существующая палитра и системный шрифт. Мелкий muted текст
`#65696f` на белом имеет контраст 5.52:1 вместо 4.12:1 у reference `#737e8c`.
Конечные CSS-иконки не создают новых внешних ресурсов; dependencies и allowlists
не расширялись. Увеличение текста до 200% и длинные имена прокручиваются/переносятся.
Максимальная ширина 560 px, геометрия — существующие visible-viewport variables.

## Свежая проверка committed candidate

11 команд выполнены заново: `2026-10-14T07:12:35Z` → `2026-10-14T07:16:03Z`.
Candidate чист и неизменен на входе/выходе. [Архив](evidence/maya-companion-settings-20261014/README.md).

| Поверхность | Результат |
| --- | --- |
| Полный runtime | 828 PASS / 7 SKIP / 0 FAIL |
| Полный carrier | 194 PASS / 0 FAIL |
| Emitted chat browser | 35 PASS |
| Emitted navigation + settings browser | 206 PASS (36 новых проверок) |
| Synthetic voice browser | 56 PASS |
| Browser total | 297 PASS |
| Release packaging tests | 18 PASS |
| Runtime/carrier architectural ratchets | PASS |
| Runtime reproducibility | PASS |
| PWA/Capacitor payload | PASS, 8 файлов, только разрешённая endpoint/CSP substitution |

Browser proofs используют emitted React/runtime, искусственный HTTP на loopback
и отдельный Chrome profile. Настоящие база/аккаунты/keys/microphone/providers не
использовались; 0 external requests, unexpected API, JS и CSP errors.
Проверены 320/393/427/1280 px, 200% text + 440 px height, длинные display values,
native focus trap, reduced motion, все рабочие разделы, сохранение черновика и
единственный conversation writer. Session-expiry response доставляется, пока
Settings открыт, после фактического прихода запроса в fixture server.

## Разработка и provenance

Сохранены промежуточные результаты отдельно от итоговых:

- Первый build отверг `strong` вне закрытого набора тегов. Разметка заменена
  допустимым styled `span`; сам gate не менялся.
- dev01: 203 PASS на промежуточной dirty source.
- dev02: ошибка размещения нового блока теста до объявления `settings`.
  Исправлен только test ordering.
- dev03: тест проверял fixture `feedPending` до прихода запроса, хотя UI
  уже показывал loading. Добавлено ожидание фактического synthetic HTTP request
  с прежним 8-second test budget, без изменения runtime или увеличения timeout.
- dev04: 206 PASS; затем product commit и полностью свежий final01 выше.

Исторические/dev receipts не заменяют final01. Полный backend, CI и mutation
corpus не запускались заново: product diff ограничен presentation; это scoped
local acceptance, не release certification. Source diff: четыре carrier source
files и два существующих test files. Backend/runtime/identity/booking/Action
Engine/schema/AR-1/profile contracts не изменены.

Документация добавлена последующим отдельным commit, без изменения tested bytes.
Production/retained salon DB/Keychain/grants/migrations/push/merge/deploy/OTP/
YCLIENTS/платная модель/установка iPhone: не выполнялись.
