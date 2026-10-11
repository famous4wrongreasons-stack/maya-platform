# Telegram → личная история → AChat: подготовка приёмки

**Дополнение 11 октября — единый React/HTTP/PG сценарий на `48cfa9ea`.**
Текущий carrier проходит первый signed synthetic Telegram login, отдельную
каноническую CRM-сверку, три личных ответа и восстановление разговора после
повторного входа для CLIENT и TENANT_OWNER. Фактический web request не содержит
`audience` или Client id. [Новые receipts, ограничения и публичный preflight](evidence/maya-personal-browser-20261011/README.md).
Публичный callback пока byte-identical историческому `1ba86ac4`, а не локальному
исправлению; живая приёмка не выполнена. Ниже сохранён прежний checkpoint.

**Актуализация 11 октября — web lifecycle исправлен на `6ca9a5ed`.**
Свежие runtime 723 PASS / 7 SKIP, carrier 157 PASS, 10/10 targeted mutations,
29 browser checkpoints и 18 packaging checks PASS. Это isolated Chrome с
настоящими React/runtime/callback и синтетическими backend/provider responses.
Реальный Telegram и личная история пока не проверены. Ниже сохранены исходные
HTTP-checkpoint и preflight; новое доказательство не превращает их в живую приёмку.
[Точный checkpoint, receipts и ограничения](evidence/maya-telegram-web-return-20261011/README.md).

Дата: 2026-10-11. Ветка: `codex/maya-local-crm-setup-20261010`.
Test checkpoint: `a53c6546c8b4fa35fdc1fa0d141cc74838d605c6`.
Product source остаётся byte-identical к `f13c0077`; новый commit содержит только
проверки. Это продолжение существующего плана после главы 9, не начало C10,
не новый релиз и не его сертификация.

## Что проверяет единый сценарий

Расширен существующий `telegram-client-binding.live-spec.ts` и используется
прежний `telegram-client-binding-proof.mjs`. Второй login/history writer,
новый backend endpoint или параллельный исполнитель не создавались.

1. Настоящие HTTP OAuth start/complete и проверка подписи synthetic Telegram
   issuer создают сессию и начальную связь с одной synthetic CRM-карточкой.
2. Существующие reconciliation/observation/change owners загружают тестовые
   записи. В том же салоне есть чужая карточка с записью в то же время.
3. Существующий A22 разрешает историю в тестовом салоне. Привязка сама не
   выдаёт consent или права настройки. Для кабинета отдельно вызывается
   существующий consent owner с тестовым явным согласием.
4. Через `/api/ai/chat` последовательно отправляются:
   - «Покажи историю моих визитов»;
   - «Когда я был у вас последний раз?»;
   - «Какие у меня ближайшие записи?».
5. Используются настоящий model serializer/parser, AiCore, C9, tool runtime,
   личный reader и серверный составитель ответа. Только ответ внешней модели
   задан тестом. Это проверка исполнения, не качества живого распознавания речи.
6. Следующие реплики используют тот же server-issued conversation ID. Текущий
   conversation reader возвращает ровно по одному user/assistant turn на шаг.
   История не получает второго писателя. Личные ответы предыдущих ходов не
   передаются внешней модели; tool results там пусты.
7. Повторяется путь CLIENT и TENANT_OWNER с `audience=client`; роль владельца
   не изменяется. Записи не создаются/не переносятся/не отменяются; chat не
   запускает новую CRM-сверку.

Дополнительные HTTP-проверки: выключенная история объясняется явно; после
отзыва Client link следующий личный read закрыт и исторический episode не
изменяется; отзыв сессии запрещает chat и восстановление conversation; чужой
conversation ID запрещён и внутри tenant, и между tenant; caller-selected
Client отклоняется DTO. У чужих участников есть требуемые test feature grants,
поэтому scope refusal не подменён отсутствующей подпиской.

## Фактическая граница доказательств

Источник Telegram и CRM синтетический, HTTP/AppModule/PostgreSQL настоящие.
Свежие результаты и hashes находятся в
`evidence/maya-personal-chat-20261011/summary.json`.
Новые проверки не доказывают браузерный callback, качество живой модели,
полноту реальной истории, delivery в Telegram или новую release certification.

Первый промежуточный запуск: 56 PASS. Следующий: 58 PASS / 2 FAIL — новые тесты
ожидали 403 для чужого conversation ID. Source owner уже определяет этот случай
как `409 conversation_scope_conflict` (`typed-step0.ts`, `timeline.store.ts`).
Исправлено только ожидание теста; следующий запуск: 60 PASS. Неуспешный receipt
сохранён. Первый lint выявил нетипизированные test HTTP bodies; добавлены типы,
правила lint не ослаблялись. Финальный прогон закрепляется отдельно на committed
checkpoint выше и включает прежние successor tests.

## Уточнение Telegram preflight после `0c4ae3b8`

Публичное имя уже есть в canonical source: **`@mayaos_login_bot` (`MAYA OS`)**,
`maya-saas-backend/deploy/platform/README.md`, раздел Shared platform login.
Повторно спрашивать его у владельца не требуется. `@malesthetic_bot` относится
к салону/историческому приложению и не заменяет платформенный login.
Документированные callbacks: `https://mayaos.ru/oauth-callback.html` для web и
`https://mayaos.ru/api/auth/oauth/native/callback` для native. Документ описывает
проверку provider-domain на 2026-09-29; это historical evidence, а не свежая
проверка текущей регистрации, доступности или секретов. Секретные файлы не читались.

На точном `0c4ae3b8143ee0e2b99c98d0462286f504b954a3` воспроизведена
несовместимость web-навигации с memory-only pending state:

1. Настоящий factory-фрагмент React compose вызывает `window.location.assign`
   после сохранения `pendingTelegram` в runtime closure.
2. Настоящий callback-script вызывает `location.replace('/#oauth=telegram…')`.
3. При моделировании нового документа создаётся новый `createNet`; тот же
   callback отклоняется как `callback_unsolicited`, до backend `/complete`.
4. Контроль: тот же callback принимается исходным live instance; replay и чужой
   state по-прежнему отклоняются. Persistent stores не использованы.

Это **Node/VM source-execution probe с явно моделируемой заменой документа**,
не реальный browser/provider roundtrip. [Результат и hashes](evidence/maya-telegram-navigation-20261011/result.json),
[воспроизводимый probe](evidence/maya-telegram-navigation-20261011/probe.mjs),
[manifest](evidence/maya-telegram-navigation-20261011/manifest.json).
Запуск из корня repository: `node docs/rebuild/evidence/maya-telegram-navigation-20261011/probe.mjs .`.
Exit 0 этого diagnostic означает воспроизведение дефекта, **не успешный вход**.
Существующий runtime `test/net.test.mjs` отдельно: **58 PASS / 0 FAIL**; его
same-instance callbacks не квалифицируют замену страницы при web OAuth.

Защита от unsolicited callback правильна и не ослаблялась. Перед живым web-входом
требуется исправить/квалифицировать доставку callback в начавший login контекст,
сохранив current state, single-use, origin/source validation и отсутствие
постоянного хранения credentials. Конкретная реализация в этом preflight не
выбиралась. iOS поведение этим probe не проверено. Local product/runtime/carrier,
бот, provider configuration, production и owner-БД не изменялись.

## Почему прежний реальный сеанс нельзя просто повторить

`local-owner-chat-policy.mjs` разрешает только три публичных вопроса о салоне.
Его инструменты — services/staff/business-hours; OAuth, Client registry и
история в scope не входят. `local-onboarding-profile.mjs` выключает Telegram.
Предыдущие реальные model/provider окна истекли; их receipts не дают новую
авторизацию. Эти ограничения не изменялись.

Фактический initial resolver читает **полный реестр клиентов выбранного салона**
для проверки единственности номера. Native owner использует read-only по смыслу
`POST company/{id}/clients/search` с фиксированным набором полей и пагинацией.
Это не чтение только одной уже выбранной карточки. Нельзя обещать обратное или
добавить произвольный POST в прежний GET-only профиль.

Штатная сверка читает журнал салона за согласованное окно; это не изолированный
provider-запрос только по одному человеку. Реальный допуск должен отдельно
называть эту область данных и локальное сохранение через текущие owners.
Raw provider payload/контакты не должны попадать в чат, Git, receipts или LLM.

## Следующий реальный сценарий — предложен, ещё не разрешён/не запущен

До запроса живого запуска должны быть готовы все перечисленные условия:

| Условие | Текущий статус / действие |
| --- | --- |
| Существующее Telegram Login приложение | `@mayaos_login_bot` найден в canonical deployment docs; `mayaos.ru` и web/native callback известны. Текущая provider configuration и наличие допустимых local credentials не проверены; секреты не запрашиваются в чате |
| Точный callback текущего React AChat | Исправлен на `6ca9a5ed`: исходный документ сохраняется, exact popup возвращается через callback, query/fragment удаляются, state/single-use guards сохранены. 29 synthetic browser checkpoints PASS. Current real provider/domain/COOP, Safari/PWA/iOS не квалифицированы; React и callback должны выпускаться согласованно. Production configuration не менялась |
| Та же сохранённая локальная owner-БД | В этом проходе не запускалась и не читалась. Использовать прежний same-DB owner, сохранить исходный state/keys и проверить mapping перед dispatch |
| Current owner identity/link | Фактическое состояние этой БД UNKNOWN. Если current tip отозван, initial-only login его не восстанавливает; новый successor verifier не предполагается |
| Частный provider scope | Подготовить дополнительный ограниченный режим существующего local launcher: exact tenant/company, exact read templates, лимиты/истечение, отказ от writes/outbound; существующие публичные допуски не расширять молча |
| История и согласие | Пользовательское consent и настройка салона только через текущие owners. Не выставлять их fixture/SQL в реальной owner-БД |
| Окно истории | Предложение: последние 31 календарный день и следующие 7 дней в поясе салона. Это ограниченный срез, не вся история; конкретные даты фиксируются перед запуском |
| Модель | Три вопроса выше одним пакетом; предлагаемые пределы 10 минут / 12 вызовов / $2. Требуется новый явный допуск после подготовки; старый не переиспользуется |
| Effects | YCLIENTS create/move/cancel, SMS/OTP, сообщения, production/grants и установка iPhone остаются закрыты |

Первая живая проверка имеет право остановиться с точным `unlinked`, дубликатом,
неподтверждённым номером или неполным источником. Нельзя исправлять такие случаи
ручным Client id, восстановлением revoked episode или подменой source completeness.
Сначала подготовить и изолированно проверить режим, затем запросить один допуск
на весь конечный сценарий; не начинать отсчёт окна до готовности владельца.

## Дизайн

Получен `Maya_full_design_package` от 11 октября: 113/113 manifest hashes совпали.
Канонический carrier — `maya-carrier-react`, runtime — `maya-chat-shell`.
Сверка пакета не меняет дизайн приложения и не интегрирует неизвестную ветку.
Подключение макетов должно сохранить session/conversation/widget/voice contracts.
Пакет описывает владельца; демонстрационные данные не являются источником прав
или реальных задач/библиотеки. [Карта сопоставления](MAYA-DESIGN-PACKAGE-INTAKE-20261011.md).

LIVE PERSONAL ACCEPTANCE: NOT RUN.
READY FOR LIVE LAUNCH: NO — локальный lifecycle blocker исправлен и synthetic
roundtrip проходит; текущая Telegram configuration и отдельный private-read режим
ещё не квалифицированы; действующего разрешения на private CRM/model нет.
PRODUCT CHANGES: 0 в исходном HTTP-test checkpoint `a53c6546`; web handoff/runtime
и callback artifact изменены в последующем `6ca9a5ed`. Backend auth/Client authority
и owner DB этим последующим проходом не изменялись.
