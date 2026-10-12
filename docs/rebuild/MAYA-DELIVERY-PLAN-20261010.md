# План завершения MAYA — 10 октября 2026

**12 октября, понятные подтверждения переноса/отмены — `8bd701e5`: LOCAL PASS.**
Полный actual React → HTTP → PG путь создание → перенос → отмена → повторный
вход прошёл 11 checkpoints: одна запись, три однократных действия. В карточках
теперь названия услуги/мастера и местное время вместо внутренних ID и UTC.
183 scoped tests, 6/6 targeted mutations; native synthetic YCLIENTS cancellation
21/21 на `cd15a31a`, create/reschedule restart — 6 checkpoints на `69b1b987`.
Устаревшие fixtures приведены к действующим CAS/explicit-status контрактам;
K3 10/10, история через обычный trial без прямой выдачи прав — 18/18.
[Свежие результаты, неудачные попытки и границы](evidence/maya-owned-booking-preview-20261012/README.md).
Это локальное развитие после C9: реальный booking и новый release certificate
не получены. Реальные ключи, owner DB и внешние сервисы в этом unit не использовались.

**12 октября, текущий вопрос отделён от сохранённого плана — `880b4653`,
сквозной proof `e267e9ef`: OFFLINE PASS; LIVE REQUALIFICATION OPEN.**
Planner явно получает последнюю безопасную реплику отдельно от прошлой задачи;
уточняет её смысл и период даже при том же инструменте. 189 scoped tests,
7 privacy checks, 4/4 counterfactuals и 17 actual React/HTTP/PG checkpoints PASS.
Лимиты, Client authority и требование подтверждённого посещения сохранены.
Новые ответы модели в этих тестах искусственные: успешный живой «последний визит»
ещё не доказан. Реальных запросов и расходов в этом проходе нет.
[Изменение, неудачные попытки, receipts и границы](evidence/maya-history-current-request-20261012/README.md).

**Ближайший остаток:** один живой повтор диалога после исправления; отдельно
разрешённая реальная приёмка записи → результата → переноса → отмены в YCLIENTS.
Этот цельный путь локально прошёл на тестовом календаре; native adapter/recovery
проверен на искусственных ответах, без внешних business effects. Telegram/личная Client-связь уже
подтверждены локально на `b4e3f3fb`, чтение собственной истории — на `f653516d`.
Повторные setup, привязка и импорт не являются следующим шагом.
C10, полный продукт и текущая release certification не завершены. Исторические
записи ниже сохраняют состояние на дату своего checkpoint.

**12 октября, живая история с сохранёнными ключами — `f653516d`: PARTIAL.**
Оба ключа получены штатным компонентом автоматически. После входа два вопроса
прошли через реальный React/HTTP/backend/DeepSeek в одном разговоре. История:
4 собственные записи, 158 чужих исключены, точное совпадение с canonical
composer PASS. Последний визит: FAIL — модель выбрала `period=past` вместо
`last_visit` и повторила историю. Пустые tool arguments теперь приняты; это
новый semantic mismatch, а не прежний отказ аргументов. Подтверждённых посещений
в сохранённых четырёх строках нет. Два model calls и три catalogue reads;
сеанс штатно остановлен, база сохранена, исходники не менялись. Следующий шаг —
локальная регрессия перехода «история → последний визит», без нового платного
повтора и без ослабления Client/attendance authority.
[Свежая проверка и воспроизведённый дефект](evidence/maya-history-keychain-live-20261012/README.md).

**12 октября, подготовка истории с сохранёнными ключами — `1bdbc549`:**
17 React/HTTP/PG checkpoints и 9 проверок пути credential helper → broker →
runtime PASS; 32 unit checks PASS. Исправлен только расчёт окна в synthetic
proof, product code и лимиты доступа неизменны. Проверены подпись компонента и
pins сохранённой базы без чтения реальных ключей. Следующий живой запуск не
потребует ввода ключей; два вопроса о личной истории требуют нового общего
допуска на истёкший платный/read-only сеанс.
[Доказательства, failed attempts и точный следующий шаг](evidence/maya-history-keychain-preflight-20261012/README.md).

**12 октября, доступ к завершённой записи/переносу — `fd7e4c4c`:**
два воспроизведённых отказа закрыты повторной проверкой Client/widget authority
после чтения сохранённого результата. 293 scoped tests, 3/3 counterfactuals и
actual HTTP/PG restart (6 checkpoints) PASS; отзыв Client во время чтения даёт
403, прежний action сохраняется, новый перенос не отправляется. Старая ошибка
типов reschedule fixture закрыта; build/scripts/widgets-live types PASS.
Только synthetic provider и отдельная PG, без реальных ключей/данных/эффектов.
[Свежие доказательства, failed attempts и пределы](evidence/maya-completed-receipt-authority-20261012/README.md).

**12 октября, restart-проверка результата отмены закрыта — `83ecf5c5`:**
после перезапуска backend/PostgreSQL React восстанавливает явную кнопку проверки
исходной receipt, не возвращая COMMIT. 12/12 browser checkpoints: UNKNOWN →
SUCCEEDED, один исходный provider DELETE, provider-free completed reread,
чужой tenant без disclosure и revoked Client link → 403. Runtime 763 PASS / 7 SKIP,
carrier 164 PASS, 11/11 targeted mutations, green baseline/restored 30/30.
Только synthetic provider и отдельная тестовая база; реальные ключи/данные салона
не использовались. Это локальный integration checkpoint, не release certification.
[Контракт, свежие receipts и границы](evidence/maya-client-cancel-status-20261012/RESTORED-RECEIPT.md).
Запись о restart-барьере ниже сохранена как историческое before-evidence.


**12 октября, локальное хранение ключей — `90891802`:** исправлена штатная
вставка ⌘V в защищённом окне; 24/24 native tests PASS. Владелец сам сохранил
партнёрский токен YCLIENTS и DeepSeek. Подтверждены UI success, наличие двух
точных записей и ACL компонента; значения агент не читал, внешних запросов нет.
Хранение не продлевает допуски живых проверок.
[Evidence](evidence/maya-local-keychain-integration-20261012/paste-enrollment/summary.json).

**12 октября, фактический restart-барьер отмены — `ee002988`:** текущий React →
HTTP → PostgreSQL подтвердил исходную отмену с потерянным ответом; test provider
сохранил ровно одну отмену, Maya сохранила UNKNOWN. После нового backend process
и реального restart PG исходные action/evidence сохранились, повторных DELETE нет.
Но восстановленный AChat показывает только текст результата без «Проверить
результат»: `restoreBookingOutcomes` не создаёт доступного status-read control.
Это реальный разрыв сквозного восстановления, не зелёный FBE2E. Последующие
pending/confirmed/revoked UI-шаги не достигнуты; runtime/product здесь не меняли.
Оба принадлежащих тесту процесса/Chrome и отдельная PG остановлены.
[Checkpoint и точный отказ](evidence/maya-client-cancel-status-20261012/react-restart-checkpoint.json).

**12 октября, проверка исходного результата отмены — `0149f668`:**
исправлен backend разрыв explicit receipt read для собственной отмены. Проверка
переиспользует исходный Action Engine result/reconciliation без нового dispatch,
с текущей verified Client authority и source witness. 585/585 scoped offline
тестов, 6/6 counterfactuals, build types/scoped lint PASS; scripts types имеют
четыре ранее известные ошибки. HTTP/PG/browser и реальный provider recovery этим
проходом не проверены. Это local development checkpoint, не release certificate.
[Результат, контракт и ограничения](evidence/maya-client-cancel-status-20261012/README.md).


**11 октября, web return исправлен и проверен на `6ca9a5ed`:** Telegram открывается
в отдельном окне, исходный AChat сохраняет ожидаемый вход в памяти; callback
проверяется и очищается до штатного `/complete`. Runtime 723 PASS / 7 SKIP,
carrier 157 PASS, 10/10 targeted mutations, 29 synthetic browser checkpoints,
18 packaging checks и PWA/Capacitor equivalence PASS. Реальный provider/Safari/iOS
и private-history launch ещё не квалифицированы. Старые записи ниже — история,
а не открытый повтор уже исправленного дефекта.
[Evidence](evidence/maya-telegram-web-return-20261011/README.md).
Получен новый дизайн владельца, целостность 113 файлов подтверждена;
[сверка с текущими владельцами данных и маршрутами](MAYA-DESIGN-PACKAGE-INTAKE-20261011.md)
не означает внедрение или смену source authority.

**11 октября, Telegram web preflight на `0c4ae3b8`:** имя платформенного бота
уже установлено из canonical docs — `@mayaos_login_bot`; повторный запрос
владельцу не нужен. Node/VM execution текущего compose + callback воспроизводит
потерю memory-only pending state при смене страницы (`callback_unsolicited`);
тот же callback в исходном instance проходит. Это локальный diagnostic,
не browser acceptance; отдельные 58 runtime net tests зелёные. Product code,
настройки бота и production не менялись. До живого входа требуется исправить и
проверить web roundtrip без ослабления state/privacy checks.
[Preflight, source hashes и границы](MAYA-PERSONAL-CHAT-ACCEPTANCE-20261011.md#уточнение-telegram-preflight-после-0c4ae3b8).

**11 октября, единый HTTP-сценарий Telegram → история → AChat — `a53c6546`:**
79/79 проверок на отдельной PostgreSQL (60 initial/card/history/chat + 19
successor), включая три последовательные реплики CLIENT и владельца в личном
контексте, один сохранённый диалог, отсутствие private model continuation,
отзыв доступа и отказ от чужого conversation ID. Product code не изменён.
[Сценарий и точные условия живой приёмки](MAYA-PERSONAL-CHAT-ACCEPTANCE-20261011.md).
Живой запуск ещё не готов: действующий локальный режим допускает только публичные
вопросы, Telegram configuration и отдельный private-read режим не квалифицированы.
Старые статусы ниже сохраняют историю; их нельзя читать как отмену новых receipts.

**Последний локальный code/test checkpoint — `178b3cc3` (product `437cda66`):**
AChat получил ответы о последних сохранённых записях и последнем подтверждённом
посещении через существующую Client authority и настройку истории салона.
Проверена цепочка Telegram → штатная сверка CRM → своя карточка/история, включая
два tenant, consent, отзыв сессии и неполный источник. 800 unit/architecture,
72 HTTP/PG, 10/10 targeted mutations; types/lint PASS. Это synthetic local
checkpoint, не новая release certification, не реальные private CRM reads и не
приёмка установленного приложения. Полная удалённая история при входе не
импортируется; уведомления в мессенджеры остаются отдельным пакетом.
[Точный контракт, проверки и ограничения](MAYA-PERSONAL-HISTORY-20261011.md).

**11 октября, начальная привязка — `8f6d9fa5`:** добавлена начальная
привязка по свежему подтверждённому Telegram-номеру к одной текущей CRM-карточке
салона. На чистом committed candidate: 223 unit/architecture + 64 HTTP/PG,
8/8 целевых мутаций; типы/lint PASS. Вход нового человека, отдельный personal
context владельца, чтение только своей сохранённой истории, отказ при дублях,
подменах и отозванной связи проверены синтетически. Новых миграций нет; реальная
Telegram/CRM-приёмка, полная загрузка удалённой истории и уведомления не выполнены.
[Контракт и receipts](MAYA-FIRST-CLIENT-LINK-REMAINDER-20261007.md).

**Текущее обновление 11 октября:** реальный локальный AChat на `6d46f7b2` ответил
на все три согласованных вопроса об услугах/ценах, мастерах, адресе/часах; вход
после перезапуска состоялся. На `d2b0cd72` улучшен общий тон; на `c9e012e7`
исправлено сохранение дня/времени в уточнениях переноса и убрана канцелярская
формулировка этого ответа. Fresh local scripted checks: 433 units, 15 HTTP/PG,
5/5 targeted mutations. Это разные явно названные доказательства: новая живая
модель и реальные booking effects не проверялись. [Текущий checkpoint](MAYA-CONVERSATION-FOLLOWUPS-20261011.md).

**Уточнение и продолжение 11 октября:** основной первый клиентский вход — Telegram
с явно подтверждённым номером → одна однозначная карточка выбранного салона →
начальная проверенная Maya-привязка. Новый backend-путь использует существующих
владельцев OAuth, CRM identity, ClientChannelLink и приватных чтений; SMS не
требуется. Отозванные связи он не восстанавливает. Готовые сценарии проверяются
пакетом без ручного участия владельца на каждой реплике. [Текущий контракт и
границы](MAYA-FIRST-CLIENT-LINK-REMAINDER-20261007.md). Ниже сохранена история прежних
отказов и checkpoints. Никакие результаты этой локальной разработки не заменяют
реальную приёмку Telegram/карточки/истории и не продлевают старое разрешение на
платные модели или реальные CRM-чтения.

**11 октября, реальное сохранение + активация/import подтверждены на `bfc83242`:** current React показал активное подключение; connect и activate вернули HTTP 201. Та же owner БД содержит одну active integration, три SUCCEEDED A17 execution и 6 Staff/provider links/access (`pending_contact`). Данные пережили DB restart и network-closed AppModule restart (health/readiness 200, штатная остановка, provider calls 0). Услуги прочитаны в preview; полного локального каталога этот импорт не создаёт. Owner login/UI после app restart и booking ещё не проверены. Ручные остановки сохранили `runtime_summary_missing`; это отмечено отдельно, без подмены receipt. [Точный checkpoint и границы](MAYA-LOCAL-YCLIENTS-ACTIVATION-20261011.md). Старые отказы ниже — история прежних источников; повторно сохранять или активировать подключение не требуется. Production и внешние business effects не выполнялись.

**11 октября, точная несовместимость установлена:** реальный management staff ответ содержит только `meta.count`, численно равный длине массива; остальные source/shape/company проверки прошли. Добавлен допуск этого варианта только для прежнего точного unfiltered v2 management source, без синтеза total и без ослабления pagination/identity checks. 151 тест и 8 мутаций PASS. На момент исправления: 0 integrations / 0 A17; реальное сохранение после правки ещё не проверено. [Причина и доказательства](MAYA-YCLIENTS-TEAM-COUNT-FIELD-20261011.md).

**11 октября, повтор на `f3aceca9` снова отклонён:** staff HTTP 200, `total_count` отсутствует, но точное дополнительное условие отказа collection branch не записано. Предыдущая правка не закрыла реальный отказ. Read-only БД: 0 integrations / 0 A17. Добавлена полная закрытая диагностика структуры/источника; правила допуска byte-identical, 148 тестов и 7 прежних мутаций PASS. Реальное сохранение и точная причина дополнительного отказа остаются неподтверждёнными. [Факты и следующий шаг](MAYA-YCLIENTS-TEAM-SOURCE-DIAGNOSTIC-20261011.md).

**11 октября, фактическая причина staff refusal установлена:** `meta.total_count` отсутствует; поддержка числовой строки реальную проблему не устранила. Сохранения нет: 0 integrations / 0 A17, исходная операция `NOT_OBSERVED`. Добавлен узкий допуск пустой metadata только для точного unfiltered management collection по актуальному контракту YCLIENTS, с v2/HTTP 200, обязательной company каждого сотрудника, уникальными ID и без признаков пагинации. 126 synthetic проверок и 7 мутаций PASS; реальное сохранение ещё не выполнено. [Контракт, доказательства и ограничения](MAYA-YCLIENTS-TEAM-COLLECTION-COMPATIBILITY-20261011.md).

**11 октября, staff refusal уточнён:** единственный отказ — тип `meta.total_count`; остальные проверки команды прошли. Реального сохранения нет (0 integrations / 0 A17). Добавлена строгая совместимость целого числа с его десятичной строкой и закрытая диагностика фактического типа; отсутствие/противоречие количества по-прежнему блокирует импорт. Реальный тип прошлого ответа не сохранён. [Доказательства и пределы вывода](MAYA-YCLIENTS-TEAM-COUNT-COMPATIBILITY-20261011.md).

**11 октября, новая реальная попытка:** пользовательский токен позволил получить компанию, услуги и сведения о салоне; ответ сотрудников HTTP 200 отклонён локальным guard. Connect не сохранён: read-only owner БД подтверждает 0 integrations / 0 A17. Точная причина внутри проверки сотрудников пока UNKNOWN. Добавлена только закрытая диагностика, сам validator не изменён. [Факты, доказательства и следующий шаг](MAYA-LOCAL-YCLIENTS-TEAM-DIAGNOSTIC-20261011.md).

**11 октября: подготовлен локальный вход YCLIENTS по логину и паролю.** Владелец подтвердил, что ранее вводил партнёрский токен вместо пользовательского. Новый путь проверен на synthetic provider + отдельной PostgreSQL и в React; реальный успешный вход/сохранение ещё не подтверждены. Та же owner БД и ключи сохранены. Полная сертификация не объявляется: отдельно воспроизведены прежние 9 backend и 1 runtime test failures. [Контракт, доказательства и ручной шаг](MAYA-LOCAL-YCLIENTS-USER-LOGIN-20261011.md).

**Исправления подключения проверены 10 октября на `b46e3d09748d6e38549fcaeb3cb0565077f77345`.** Отдельная synthetic HTTP/Auth/AE/PostgreSQL матрица прошла **20/20** сценариев; текущий React — **15 checkpoints, 9 парольных входов и 3 точных отказа**, затем отдельный backend/process и PG restart. Исправлены потеря выбранной компании после первых 200 записей, влияние неправильного title другой компании и ошибочная классификация malformed selected payload как отсутствующей компании. Закрытая диагностика теперь сохраняет только разрешённый canonical error code; форма объясняет блокировку активации до сохранения подключения. [Исходники, результаты и границы](evidence/maya-yc-pre-ae400-reproduction-20261010/summary.json). Все provider ответы в новых проверках синтетические; реальные YCLIENTS/model calls — 0, owner DB и рабочий сайт не затрагивались.

**Реальное подключение владельца пока не сохранено.** В закрытом сеансе 20:09–20:24 UTC два connect POST вернули HTTP 400 после companies GET 200, recovery — `NOT_OBSERVED`; read-only проверка той же БД в 20:25 подтвердила 0 integrations и 0 A17 executions. Известны pre-AE стадия отказа и отсутствие сохранения, но исходный canonical код, provider payload и точная причина остаются UNKNOWN. Найденные synthetic дефекты нельзя приписывать этому сеансу. БД/ключи сохранены, приложение и PG остановлены. [Owner evidence](evidence/maya-owner-yc-connect400-20261010/summary.json). Новый ввод ключей или owner window не запрашивались; следующий реальный запуск требует готовности владельца и актуального ограниченного handoff. Real YCLIENTS acceptance и завершение MAYA/C10 не выданы.

**Сравнение с прежним работавшим путём завершено:** mandatory `companies?my=1` появился 31.07, Authorization не менялся; прежний серверный active integration и новый local tenant — разные состояния. Октябрьская смена endpoint не подтверждена. Недостающий исходный `error.code` не сохранён, новую форму ради него не повторяем. [Точный differential и пределы вывода](MAYA-YCLIENTS-CONNECTION-DIFFERENTIAL-20261010.md).

**Текущий save/status proof завершён:** на `d4cc4bd7e0d182ba656c42ee84517c1c50d37ae1` текущий React через точный local read-profile и HTTP/PostgreSQL прошёл 13 checkpoints, 7 парольных входов, два отказных UI-сценария и отдельный process/PG restart. Same-ID recovery не создаёт дублей; stale/foreign/revoked доступ закрыт. Исправлены явный вход/загрузка филиалов, безопасные объяснения отказа и лишнее восстановление chat history в setup. 42 diagnostics, 123 headless, 10 compose/entry checks, types/lint PASS; counts частично пересекаются. Два failed attempts сохранены, собственные PG/Chrome остановлены. [Evidence и ограничения](evidence/maya-yc-current-save-20261010/summary.json). Только synthetic native GET и test grants; реальная привязка ещё не выполнена, историческая owner-причина UNKNOWN. Следующий шаг — готовность владельца к повторному открытию той же БД и явному чтению исходной операции, без нового UUID или автоматического ввода ключа.

**Владелец зарегистрирован и вошёл в MAYA:** ручная регистрация на `03875b23523a578fad13ec0e8f7035dcd4e5a66b` создала один бизнес, филиал и owner. Окно штатно остановлено; та же БД и существующие ключи сохранены. CRM integrations **0**: регистрация не означает привязку YCLIENTS. [Owner evidence](evidence/maya-owner-registration-20261010/summary.json), [актуальный handoff](MAYA-LOCAL-REGISTRATION-HANDOFF-20261010.md).

**Занятое короткое имя исправлено:** опубликованный `9aab0db141e3b624be0f81c745b8fa68caf06b01` возвращает точный pre-commit `409/trial_signup_slug_taken` и разрешает явную правку с новым согласием. 45 backend tests, 91 synthetic browser checks и независимое source review PASS. На `c2079dd5b20de32995c8baa0a293547391cd5d33` текущий React → HTTP → PostgreSQL прошёл 9 checkpoints/5 парольных входов: два синтетических бизнеса, lost-reply recovery без дубля, новый 409 и 17 пустых таблиц эффектов. Первый отказ browser startup сохранён отдельно. Same-DB launcher прошёл 28 targeted tests, source review и actual restart qualification на отдельной синтетической БД: те же ключи, owner/branch/password/session/refresh records и PostgreSQL system identity; direct/relay health 200 и auth 403; штатная остановка. [Evidence с сохранёнными отказами запуска](evidence/maya-same-db-read-resume-20261010/summary.json). Diagnostic health-only не квалифицирует повторный вход или реальные чтения YCLIENTS. Переход исходника owner runtime 03875 к candidate c2079 отдельно сохранил все 117 canonical Prisma/schema/migration файлов. Позднее сохранённая owner БД была открыта на f259208e: вход и загрузка филиала наблюдались, но после явной попытки сохранения integration/A17 executions отсутствуют; причина UNKNOWN. Окно штатно завершено, полный synthetic save/status proof теперь завершён; повторный ввод ожидает новой готовности владельца. [Owner attempt и cleanup](evidence/maya-owner-yc-save-20261010/historical-trace.json). Исторический generic500 ниже относится к прежнему source. Рабочий сайт не изменён; full MAYA/C10 и real-provider acceptance не объявлены.

## Результат для владельца

**Цель — полная масштабная MAYA на общей multi-tenant codebase; салон владельца — первый пилот той же системы.** Кампании, четыре домена агентов, ограниченный C10 и последующая квалификация 1000+ салонов остаются в плане. Последнее указание владельца 10.10, 12:53 UTC: «продолжай работать над масштабной версией и выдай мне план действий а то я уже потерялся»; в 12:54 он подтвердил работу по плану и вынес дизайн в другой чат. Это заменяет промежуточный выбор выпуска только для одного салона.

Первый пилот позволяет проверить полезные функции раньше массового подключения, разнообразия конфигураций и нагрузки на 1000 салонов. Он почти не сокращает разработку ещё отсутствующих функций. Используем ту же codebase и tenant-aware архитектуру; не создаём отдельную версию с жёстко заданными company/branch, ослабленными правами или вторым orchestrator.

**Оценка всей функциональной поставки пока NOT_ESTIMABLE.** Независимая оценка известного интеграционного пакета — **12–24 инженерных дня**, но это не весь остаток MAYA и не обещание даты выпуска. Неизвестный объём API-операций, campaign delivery/measurement, customer knowledge и политики C10 нельзя честно включить в этот диапазон. Прежний ориентир «6–12 недель» отозван как неподтверждённый; эта оценка к нему не подгонялась.

Первый полезный сквозной путь — чат с реальными чтениями и подтверждёнными create/move/cancel — промежуточный результат внутри полного выпуска. Его готовность не объявляет завершёнными кампании, C10 или всю MAYA. Работа идёт в следующем порядке:

1. Собрать текущий кандидат: нормальный вход, бизнес/филиал, подключение YCLIENTS.
2. На первом салоне проверить реальные чтения, запись/перенос/отмену и подтверждённое изменение цены/графика.
3. Проверить полезный многошаговый диалог с настоящей моделью.
4. Закончить Admin/знания, аналитику, Lifecycle/кампании и оставшиеся согласованные API-операции YCLIENTS.
5. Довести совместную работу агентов и конкретные ограниченные C10 workflows.
6. Проверить текущий телефонный carrier/voice, восстановление, privacy и эксплуатацию.
7. Подключить второй независимый tenant и измерить нагрузку/изоляцию вплоть до выбранного envelope 1000 салонов.
8. Выпустить проверенный кандидат после отдельного допуска к целевой среде.

Независимые функциональные задачи выполняются параллельно; этот порядок показывает зависимости пользовательского результата, а не запрет начать пункт 4 до первого реального запуска. Дизайн ведётся в другом чате; здесь только необходимое функциональное соединение существующих интерфейсов.

| Цель | Что требуется | Что можно делать позже |
| --- | --- | --- |
| Первый полезный путь в приложении | Нормальный вход и права, одна проверенная company↔branch, текущие факты, диалог, собственная запись/перенос/отмена, честный результат и восстановление | Остальные функции продолжаются до полного первого выпуска |
| Полная функциональность на первом салоне | Все включённые ниже группы, реальные роли/источники/модель, кампании и конкретно ограниченный автопилот, эксплуатация и восстановление одного салона | Массовый rollout проверяется следующим этапом; функции не урезаются |
| **Масштабная MAYA — выбранная общая цель** | Те же функции плюс независимый второй tenant, разнообразие конфигураций, измеренная нагрузка/квоты/очереди и эксплуатация выбранной инфраструктуры | Срок устанавливается после измерений, а не умножением числа салонов |

Уже в первом пилоте обязательны foreign-tenant отказ, текущая авторизация, защита персональных данных, идемпотентность и восстановление. Порядок реальных установок не отменяет локальные проверки изоляции.

## Основание и уже завершённое исправление

План сводит [карту завершения](MAYA-FINAL-COMPLETION-MAP.md), [карту согласованных доменов](MAYA-APPROVED-DOMAINS-REMAINING-GAP-MAP-20261007.md), [остаток реализации](MAYA-IMPLEMENTATION-REMAINDER-20261008.md) и [YCLIENTS-first scope](../product/README.md). Более новые checkpoints в карте имеют приоритет над историческими строками. Это план работ по существующим владельцам, без новой системы сертификации.

Последний фактически проверенный normal-onboarding runtime: `11e16cd111af6fa571ed2b638fb2dac06acd31d1`; setup-read startup checkpoint — `3480485443f9301666bdd70015f9da1bbcc44328`, ветка `codex/maya-local-crm-setup-20261010`. Полная база текущего follow-up: **`77d41ef56254972d6ae849d497046ea02ac2487c`**.

[Подключение филиала и восстановление](MAYA-A17-SAME-ID-RECOVERY-HANDOFF-20261010.md) готовы локально: после потери запроса до регистрации пользователь явно повторяет ввод/согласие с прежним UUID; первая зарегистрированная версия материала сохраняет приоритет. Потеря ответа после выполнения восстанавливается чтением исходной операции. Нет автоматического нового действия или второго подключения.

Доказательства: 78 backend, 38 frontend/net/URL, 5 driver и 6 launcher tests; фактический HTTP/current React proof с 298 + 97 assertions и перезапуском Node/PostgreSQL; отдельный фактический запуск формы, штатного auth и atomic import на synthetic native YCLIENTS. [Архив](evidence/maya-a17-same-id-recovery-20261010/summary.json) сохраняет источники, ограничения и независимые reviews. Все собственные процессы этого запуска остановлены; новая owner demo не открыта.

Отдельный [native YCLIENTS setup-read профиль](MAYA-LOCAL-YCLIENTS-ONE-TIME-HANDOFF-20261010.md) реализован: private TTY partner input, существующая React форма/user-token encryption, семь GET templates, обязательная полная команда ≤50, отдельные install и activation/import. **37/37 tests и actual synthetic startup PASS**: свежая PostgreSQL, обычный AppModule, текущий React, health/refusals, cleanup и 0 provider calls/refusals; [evidence](evidence/maya-yclients-startup-diagnostics-20261010/summary.json). После failed owner handoff добавлены безопасные этапы и первый код отказа; старые причина/input acceptance/external dispatch остаются UNKNOWN, DB/keys сохранены. Новый ввод не запрошен. Следующий шаг — готовность владельца к уже разрешённому ограниченному setup, затем реальная привязка компании к филиалу. Новый synthetic proof не является real YC/A17/full MAYA/C10 acceptance. Рабочий сайт, production, дизайн и телефон не менялись.

**Следующий функциональный разрыв уже закрыт локально:** на `4aec1a470a3b66766af3e20d867ef1fd9f2627ef` текущий React получил «Создать бизнес» через существующие standard trial APIs и обычный вход по паролю. Создаются бизнес/первый филиал/владелец; CRM подключается отдельно. При неопределённом ответе форма предлагает парольный вход и не создаёт бизнес повторно. Исправлены гонки старого входа с новой регистрацией и cleanup формы с успешной сессией; токены не передаются presentation. **117 focused synthetic/SSR tests, shell build, React guards/types/build PASS**, финальные 6 SSR повторены после исправления формы записи стилей. Независимый review и 13 точных source bindings сохранены в [evidence](evidence/maya-standard-onboarding-20261010/summary.json). Начальные SSR/compile failures сохранены. Actual normal onboarding HTTP/PG/current React теперь PASS на двух синтетических бизнесах: 8 initial + 2 restart checkpoints, реальная потеря signup ответа после commit, 7 password logins, те же owner/branch IDs и отсутствие дублей. [Evidence](evidence/maya-normal-onboarding-actual-20261010/summary.json). Mac runtime metadata blocker исправлен; 10 pure tests, builds и scoped ESLint PASS. Все собственные процессы остановлены. Real source/profile admission и widgets.runtime остаются открыты; это не завершение этапа A целиком.

## Состояние 12 групп поставки

Это 12 групп для планирования, не новый нормативный реестр агентов. «Реализовано», «соединено», «проверено» и «принято на реальном салоне» — разные состояния. Во всех строках полная реальная приёмка **NOT_ISSUED**. Наличие 163 `certified:false` не означает 163 дефекта; unmapped API operation тоже не означает отсутствующую реализацию.

| № / группа | Реализовано | Соединено в текущем приложении | Проверено и предел | Реальная приёмка | Точный остаток |
| --- | --- | --- | --- | --- | --- |
| 1. Естественный диалог и продолжение задач | Semantic selection, уточнения, исправления, возврат к теме, bounded history; явная текущая реплика | Текущий React → chat → сохранённый контекст и разрешённые source READ | Публичные ответы и личная история подтверждены живыми checkpoint; последний визит на f653516d FAIL. Исправленная передача контекста: 189 scoped/17 HTTP-PG PASS, модель scripted | NOT_ISSUED | Живая повторная проверка история → последний визит и репрезентативный multi-turn цикл по ролям. Не заменять понимание перечнем точных фраз |
| 2. Один C9 и согласованный результат агентов | Runs/revisions/evidence, reviews/continuations, explicit Occupancy/Lifecycle/BI и Admin capabilities | READ bridge и конечный compound дают один ответ; не все capability READ вызывают отдельный agent reasoning | Локальные HTTP/React/restart; конечная композиция, не любые процессы | NOT_ISSUED | Замкнуть конкретные многодоменные задачи через существующий C9; проверить реальное планирование и единый ответ. Не строить agent v2/second orchestrator |
| 3. YCLIENTS, филиал и API-управление | Одна company↔branch, native readers, отдельные mutations, A17 atomic import и same-ID recovery | Текущая opt-in setup form, выбранные chat verticals | Synthetic native + HTTP/React/restart; real save/activate/import и DB persistence подтверждены 11.10 на bfc83242 | NOT_ISSUED | Real setup закрыт в bounded local profile; обычный app login/read после restart и chat/source acceptance остаются. Operation inventory → adapter/owner/chat/outcome. Создание/редактирование услуг, связей услуга–мастер и карточек сотрудников покрыты не полностью. Один салон не делает их готовыми |
| 4. Client identity, личные данные и запись | Verified A18 context, own/Admin create/move/cancel через AE, source fences и UNKNOWN | Текущий React и existing Admin owners | Реальный локальный Telegram login/initial Client binding b4e3f3fb; своя история f653516d. Booking/recovery/revocation остаются synthetic HTTP/PG | NOT_ISSUED | Полный реальный booking/move/cancel outcome и последующий Client lifecycle. Старые импортированные записи могут не иметь canonical origin для переноса. Initial binding уже подтверждён, повторять его не требуется |
| 5. Maya Admin: консультация и знания салона | Public salon/catalog/staff facts, A22 staff-only guidance | Собственный чат MAYA; полного roundtrip нового внешнего inbound нет | Локальные роли, источники и privacy refusals | NOT_ISSUED | Customer-visible knowledge contract и его связь с existing owner; полезная реальная консультация. Внутренние правила нельзя объявить публичной политикой |
| 6. Owner analytics, C7/C8 | Published C7, bounded finance/expenses/reviews, qualified C8 и объяснение | Выбранные owner вопросы, периоды и compound | Локальные source/revision/restart proofs, не полнота финансов салона | NOT_ISSUED | Проверить реальные периоды, полноту выручки/расходов/прибыли и source mapping, корректность объяснений. Недоступные cash/profit и причинность не выдумывать; disabled численные модели не включать без квалификации |
| 7. Occupancy после отмен | Existing C5 Opportunity + current availability → C9 → сохранённая версия предложения | Явный запрос в текущем чате, limited варианты и evidence | Synthetic native HTTP/React/restart; occupied/expired/stale/incomplete/revoked/foreign outcomes | NOT_ISSUED | Наблюдаемая реальная отмена и текущее окно, полезный ответ модели. Фоновая инициатива относится к №11; никаких списков клиентов/скидок/вероятностей по умолчанию |
| 8. Lifecycle, аудитории и кампании | Qualified C8 suggestions; B35 immutable audience, approval и delivery kernel | Рекомендации подключены; полный chat→campaign→measurement путь не завершён | Локальные delivery/retry/restart/UNKNOWN; реальных отправок нет | NOT_ISSUED | Конкретный campaign ingress, аудитория/consent/content/route/cost confirmation, выбранная существующая доставка, outcome и измерение. Delivered не означает conversion. Кампании остаются в полном функциональном пакете |
| 9. Работа сотрудников | Own schedule/journal, dossier, задачи/team owners, отдельные schedule actions | Выбранные READ/approval пути; own tasks читают A23 | Локальные day/timezone/role/continuation proofs, не весь рабочий день | NOT_ISSUED | Составить непрерывный staff workflow, довести нужные task/effect связки и права. Для confirmed schedule решить точный SETTINGS_DRAFT profile вопрос; backend сам по себе не открывает карточку |
| 10. Лояльность, сертификаты, абонементы, referrals/reviews | Существующие канонические owners и отдельные чтения/действия | Частичное chat-покрытие | Исторические owner proofs + отдельные новые bounded READ | NOT_ISSUED | По каждой нужной операции соединить source→role→review→AE→outcome в текущем приложении. Не переписывать готовые owners и не выдавать legacy balance за факт YCLIENTS |
| 11. Ограниченный C10 | Explicit L0/L1/L2, C5 L2.5 shadow и durable C9 foundations | Явные запросы; автономного initiator нет | Explicit proofs не доказывают C10 | NOT_ISSUED | Зафиксировать tenant×domain×action, trigger/principal, лимиты, отзыв/stop и escalation; затем existing-owner admission/dedupe/restart/shadow outcome, далее отдельные реальные workflow. Пока только узкий proposed Occupancy envelope, не весь автопилот |
| 12. Доставка приложения, privacy, onboarding и эксплуатация | React/headless/widgets/history erasure, tenant/auth/entitlements, iOS packaging | Standard onboarding и password login теперь связаны в carrier; многие desktop пути и Debug API override существуют | Onboarding: synthetic/SSR/build; остальные локальные browser/restart/isolation и исторический install отдельны; текущая phone UI не принята | NOT_ISSUED | Normal profile/grant и actual onboarding qualification, current-candidate reachability, mobile/voice/reconnect/privacy, backup/restore одного салона. Затем реальный второй tenant, конфигурации и measured 1000-salon envelope |

Архитектурная граница остаётся из [C9 preflight](CYCLE-09-PREFLIGHT-AND-SCOPE.md): четыре домена — Admin, Lifecycle, Occupancy, BI. Источники фактов — CRM/C7/C8 и их канонические владельцы; mutations — только существующий AE. Presentation и рекомендация не авторизуют действие. Кампании используют B35/CD, а не пятого автономного агента.

## Порядок работ и критерии результата

| Этап | Конкретная работа | Зависимость / проверяемый выход |
| --- | --- | --- |
| A. Обычное локальное приложение | Normal AppModule/DB/secret profile и carrier onboarding проверены actual локально на синтетических аккаунтах; owner/branch уже созданы; реальное локальное CRM подключение активировано и импорт подтверждён. Для полного chat/action acceptance нужны обычный login после restart и существующий корректный widget-release grant для candidate/profile | Source-bound текущие frontend/backend, обычный вход/выбор филиала. Trial имеет crm.integration/ai.owner, но не widgets.runtime. Setup form и полная widget chat/action готовность проверяются отдельно |
| B. Один реальный источник | Приватный ввод YC credentials после допуска; exact company↔branch; отдельные install и activation/import подтверждения; current catalog/staff/availability | Факты и версии читаются из этой компании, source change/отзыв закрывают доступ. Credentials не попадают в модель, transcript или evidence |
| C. Первый полезный сквозной путь | Общий/предметный диалог → факты → verified Client create/move/cancel → confirm → outcome; исправления/reload/UNKNOWN; для owner — базовые доступные факты | Наблюдаемые реальные результаты текущего кандидата. Собственный тестовый Client и конечные разрешённые действия; без silent notifications. Это промежуточный результат, не полный выпуск |
| D. Полный функциональный пакет | Остаток №2–11: публичные знания, YCLIENTS management, staff/price/schedule, loyalty, BI, Occupancy/Lifecycle, campaigns и scoped C10 | Конечные операции каждого домена работают через текущий чат/источник/owner. Ни одно отсутствие API/прав/факта не скрыто общей фразой «готово». Независимые owners реализуются параллельно A–C |
| E. Полная функциональная проверка на первом салоне | Согласованный набор реальных рабочих диалогов по ролям и всем включённым функциям; mobile/voice где включены; восстановление/отзыв/privacy; backup/restore и наблюдение одного салона | Пользователь может пройти целые рабочие задачи. Реальные model/source/action evidence отделены от synthetic. Доставка на выбранный адрес/устройство допускается отдельно; работающий сайт не является обязательной площадкой |
| F. Платформенное расширение | Второй tenant штатным onboarding; различия компании/ролей/timezone/данных; измеренные очереди/квоты/нагрузка и восстановление на выбранной инфраструктуре | Собственные результаты второго tenant и измеренный envelope. Только после них можно говорить о поддержанной нагрузке; сохранённые tenant fences обязательны уже A–E |

Критическая цепь первого полезного пути: **normal profile/onboarding/entitlements → подтверждённый real source и verified Client → текущий chat/model/confirmed actions → проверенный outcome → выбранный reachable carrier**. Для телефона нужен доверенный доступный HTTPS; локальный браузер не требует телефона и может проверяться раньше.

Полный функциональный пакет дополнительно ждёт самый длинный из путей D, особенно API management, campaigns и C10; масштабный выпуск также требует F. Ни реальный setup, ни быстрый успешный booking не закрывают эту часть автоматически.

### Незавершённые функции и соединительные задачи

1. **YCLIENTS operation coverage.** В [сохранённом inventory](evidence/maya-development-integration-20261006/yclients-api-inventory/operations.json) 304 documented operations. Исторические «4 evidence-mapped / 300 unmapped» — состояние привязки доказательств, не подсчёт отсутствующего кода. Для каждой операции сопоставить product disposition, API/права, native adapter, existing owner, chat intent, подтверждение, outcome и фактически выполненный proof. Первым делом закрыть services CRUD/bindings и staff lifecycle в согласованном объёме, отдельно от уже существующих prices/schedule. Не строить arbitrary HTTP tool. Архив не доказывает сегодняшние права конкретного YC приложения: они проверяются при реальном подключении.
2. **Знания и Client.** Выделить public customer facts из existing A22 staff guidance без второго knowledge store. Для первой привязки Client нужен точный approved trust contract; готовый verified путь продолжается независимо. Consent register/export остаётся отдельным отсутствующим owner path, а существующее удаление истории не выдаётся за полный export.
3. **Staff, prices, schedule и соседние домены.** Соединить имеющиеся readers/effects с текущим диалогом и review. Price clarification/confirmed PATCH уже имеет локальный proof; это не service CRUD. Schedule backend готов в своей части, но closed profile требует решения о способе редактирования. Для tasks/loyalty/certificates перечислять конечные операции, а не создавать модули заново.
4. **BI/Lifecycle/Occupancy.** Довести реальные источники, доступные периоды, явные пределы и композицию. Окно после отмены и опубликованный отчёт уже дают один сохранённый ответ; нельзя обещать произвольный сегодняшний полный обзор по исторической ревизии. Недостаток данных для ranking/calibration не лечится выдуманными числами.
5. **Кампании.** Соединить разрешённую C8 аудиторию с existing B35 ingress; показать адресатную область, текст, канал, стоимость/лимиты и confirm; наблюдать delivery/reconcile и отдельно outcome. Существующие inbox/Telegram/push/APNS возможности не доказывают выбранный действующий канал или клиентское согласие. Входящие новые каналы отложены; исходящие кампании не отменены. До выбора маршрута/политики невозможно оценить недостающую реализацию целиком.
6. **C10.** [Proposed Occupancy shadow](MAYA-C10-SCOPED-SHADOW-DECISION-BRIEF-20261007.md) описывает первый конечный workflow, не всю автономность. Нужны machine admission в existing C9, точная source/task revision, dedupe, current policy/отзыв и bounded stop. Нельзя обновлять expiring user event от имени scheduler. Пока конкретный contract не принят, продолжать explicit-request работу; ни новый timer, ни объявление disabled-by-default не заменяют отсутствующее основание. Следующие автономные workflow оцениваются каждый по выбранному действию; L3/L4 автоматически не разрешены.

## Оценка усилий и её пределы

Инженерный день — один сосредоточенный день работы инженера, знакомого с этой codebase. Это не длительность CI/LLM ответа и не обещание календарной даты. Оценка сделана на checkpoint `ad224bfd`, до последующего локального соединения onboarding; эта частичная реализация не обнуляет оставшиеся normal-profile/grant/real-qualification работы пакета. Диапазоны предполагают повторное использование существующих owners, отсутствие архитектурного fork, доступ к согласованным источникам, одну текущую ветку интеграции и конечные сценарии. Не предполагаются новые schema/retention решения без точного согласованного delta.

| Пакет | Оценка усилий | Уверенность / включено и исключено |
| --- | --- | --- |
| Normal profile + UI к existing onboarding API + существующие entitlements | **3–6 инженерных дней на исходный пакет** | Умеренная: API был готов, UI после оценки соединён локально. Normal profile/grant и actual qualification остаются. Работа с существующим grant включена технически; ожидание платформенных полномочий/certificate отдельно |
| Соединить известные conversation/read/booking/staff/confirmed-write пути в последовательный опыт | **5–10 инженерных дней** | Умеренная/низкая: переиспользуем готовые bounded paths. Только имеющиеся операции, без полного нового API CRUD, public knowledge contract или универсальных compound задач |
| Первый конечный real-model + real-CRM цикл этих путей, recovery и refusals | **4–8 инженерных дней** | Ниже: подготовка/исполнение/разбор одного цикла. Неизвестные исправления по его результатам не включены; доступ/согласованные действия предоставлены до цикла |
| **Известный пакет выше** | **12–24 инженерных дня** | Сумма трёх неперекрывающихся пакетов; замещает более раннюю узкую оценку 7–14, а не добавляется к ней. Не полный функциональный выпуск |
| Все оставшиеся included YCLIENTS операции, public knowledge/consent, полный loyalty/staff coverage, broad agent composition | **NOT_ESTIMABLE сейчас** | Не закрыта конечная operation→source→role→outcome карта. После её привязки оценивать недописанные функции и соединение отдельно, не «по дню на API» |
| Campaigns + реальные measurement; scoped C10 и последующие agreed workflows | **NOT_ESTIMABLE сейчас** | Не определены точные delivery/consent/measurement и autonomous principal/action envelopes. Первая shadow policy не равна всему автопилоту |
| Полная функциональная приёмка первого салона, voice/mobile и устранение обнаруженных дефектов | **NOT_ESTIMABLE сейчас** | Зависит от полного набора операций, достигнутого качества и выбранной delivery environment. Не исключено из цели из-за отсутствия оценки |
| Первый ограниченный цикл нагрузки после выбора инфраструктуры/envelope | **5–10 инженерных дней** | Низкая/умеренная: подготовка, прогон, измерение/анализ. Не включает неизвестную оптимизацию, second-tenant rollout или окончательную квалификацию 1000 салонов |

Это независимая source-based оценка review, не измеренная скорость будущей команды. Диапазоны не суммируются в срок «вся MAYA»: несколько обязательных пакетов пока неоценимы. Добавление агентов/инженеров не делит критический путь линейно.

Что именно ускоряет первый салон: полезный пилот можно получить до подключения второго tenant, широкой вариативности данных/настроек и большого load cycle. Эти работы остаются в выбранной масштабной цели. Даже известные 5–10 дней первого нагрузочного цикла нельзя назвать полной экономией календарного времени: часть может идти параллельно, а устранение узких мест ещё неизвестно. Нельзя обещать «вдвое быстрее» или объявить все функции готовыми только потому, что tenant один.

### Внешние ожидания — отдельная шкала

| Условие | Что требуется | Что может продолжаться без него |
| --- | --- | --- |
| Реальный YC источник | Приватные partner/user credentials, exact company/branch и права; конечный scope provider-read/local-import | Normal profile, UI, existing API mapping, локальные fixes. Presence-only проверка показала отсутствие ключей только в текущем shell/worktree; это не поиск по хранилищам владельца |
| Widget runtime | Existing platform-owner validate/grant для точного build/profile/certificate | Прямой A17 setup не требует widgets.runtime; права нельзя выдать fixture/SQL |
| Verified Client | Уже подтверждённый собственный Client либо approved initial-only proof | Public READ, owner/staff и already verified paths |
| Настоящая модель | Отдельно допущенный конечный run и приватный ключ/бюджет | Source owners, локальная механика и планирование сценариев. Исторические 5 replies с safe_fallback/ungraded не являются общей языковой приёмкой |
| Реальные actions/campaigns/C10 | Точный разрешённый эффект/получатели/consent/route, scoped autonomy policy | Explicit recommendations, previews и безопасная локальная разработка |
| Телефон / доступный runtime | Проверенный target, reachable trusted HTTPS и согласованная упаковка/установка | Текущий браузер и backend локально. Debug override уже есть; установленное production-target приложение не считается изолированным тестом |
| Точные product/schema choices | Initial Client, schedule editor, при необходимости multi-company и три PublicBooking FK — только относящиеся к затронутому пути | Независимые операции. Multi-company не блокирует одну company; PublicBooking FK не повод останавливать все локальные чтения |

Сроков ответа владельца/оператора/provider здесь нет: они не известны. SSH/hosting остаются на паузе; доступ к существующему серверу не обязательное условие локального пилота. Новых внешних действий, чтения секретов, provider/model calls, деплоя или установки этот план не разрешает.

## Параллельная работа и ближайший рабочий пакет

Параллельно допустимы: normal onboarding/UI; сопоставление и реализация отдельных native API операций; public knowledge/Client contract work; campaigns/C10 после их точных решений; подготовка реальных диалогов/источников. Изменения одного владельца и общей source schema согласуются до интеграции; pricing/notification isolation и другие соседние ветки не перезаписываются. Новая design-ветка ведётся отдельно: неизвестные/чужие изменения не редактируются; перед будущей интеграцией нужна явная сверка её контрактов с функциональной веткой.

Последовательно идут: фиксация общего кандидата → согласованный HTTP/PG слот на этом Mac → real setup → реальные confirmed effects → итоговая приёмка. Один источник/approval не переносится на другой candidate автоматически. Тяжёлые aggregate/load runs согласуются с parent, чтобы не мешать параллельным lanes.

Ближайший пакет разработки:

1. Normal onboarding, парольное восстановление и same-DB restart фактически проверены с текущим React и обычным AppModule на двух синтетических бизнесах. [Actual evidence](evidence/maya-normal-onboarding-actual-20261010/summary.json); прежний memory-lint blocker закрыт scoped PASS.
2. Отдельный real-YC-read профиль прошёл actual synthetic startup с текущими AppModule/PG/React; диагностические stages/codes сохраняют отказ без секретов. [Scope, приватный ввод и retention](MAYA-LOCAL-YCLIENTS-ONE-TIME-HANDOFF-20261010.md) остаются ограниченными. Перед новым реальным prompt согласовать готовность владельца, не повторяя уже данное разрешение на тот же setup. Старые failures сохранены. Real provider/company/branch setup квалифицирован на bfc83242 в ограниченном local setup scope; весь чат/booking этим не квалифицирован. Следующий запуск — status-first, без повторного install/activate.
3. В существующем API inventory выделить операции первого полного выпуска, явно отметить deferred/excluded и для included привязать current code/owner/недостающее. Это рабочий список реализации, не новый аудит.
4. Существующий verified Client уже получен через Telegram (`b4e3f3fb`), свой history READ подтверждён (`f653516d`). Локальная передача текущего вопроса исправлена (`880b4653`), 17 React/HTTP/PG checks прошли (`e267e9ef`). Следующий реальный цикл — повторная проверка history → last_visit без setup/import, затем отдельно разрешённый create/move/cancel. Scripted model не заменяет живую смысловую приёмку.
5. Продолжать конечные функции №2–11; после инвентаря и первого real цикла заменить NOT_ESTIMABLE оценками конкретных исправлений. Показывать владельцу полезные результаты по мере готовности, не ждать финальной сертификации всей платформы.

## Масштабирование после первого пилота

Используем [существующий proposed load envelope](MAYA-REMAINING-READINESS-DECISIONS.md), не придумываем новый SLA. Ступени 1→10→100→1000 synthetic tenants; предложенные данные на tenant: 2 филиала, 10 сотрудников, 20 услуг, 1000 клиентов, 3000 записей. Пример 10% active × 2 sessions / 10s даёт 20 RPS на 1000 — это инженерная гипотеза, не наблюдаемое поведение салонов.

Первый цикл должен измерить offered/achieved throughput, p95/p99, ошибки, pool/locks/CPU/RSS/event loop, очереди/UNKNOWN, noisy-neighbor isolation, restart и backup/restore. Исторические ориентиры 30 min при 20 RPS, 5 min burst 100 RPS, soak 20 RPS на 2 часа, а также non-model READ p95 ≤500 ms / p99 ≤2 s — предложения для выбранной инфраструктуры, не обещание мощности текущего Mac или production. Существующие B35 limits не обходятся ради графика.

Отдельно нужны реальные provider quotas/latency и model cost; synthetic load их не доказывает. Одно успешно работающее приложение и отрицательные foreign-tenant tests не являются ни вторым реальным onboarding, ни квалификацией 1000 салонов.

## Границы согласованной поставки

- **Включены:** собственный MAYA chat/app, YCLIENTS-first согласованные операции, Admin/Occupancy/Lifecycle/BI, booking, staff work, owner analytics, loyalty/certificates/subscriptions/referrals/reviews, кампании и scoped C10. Voice/mobile остаются квалификацией существующих включённых поверхностей; телефония отдельно не добавляется.
- **Отдельная работа:** визуальный дизайн ведётся владельцем в другом чате; этот lane не выполняет redesign. Warehouse/photo/OCR пакет отложен. Сделанный код сохраняется; полный склад/закупки/поставщики не становятся новой целью.
- **Исключены либо ранее отложены:** телефония/автозвонки, самостоятельный content-generation module, универсальная бухгалтерия/payroll/fiscalization, другие CRM и новые внешние inbound messaging интеграции.
- **Неоднозначность каналов явная:** отсрочка нового Telegram/WhatsApp/MAX inbound не отменяет согласованную campaign функцию. Точный существующий outbound маршрут, получатели и consent надо выбрать; без этого delivery не объявляется готовой.
- **Website/real booking другой задачи не затрагиваются.** Существующие ограничения source/identity/retention/authority сохраняются. Любая новая схема, retention или autonomy decision останавливает только зависимое изменение до точного решения.

Ни полная функциональность первого салона, ни масштабная MAYA ещё не приняты. Этот документ сохраняет выбранную цель, завершённые локальные результаты и следующий исполнимый порядок работ; он не выдаёт C10 completion из contracts или synthetic proof. Реальное локальное подключение салона уже подтверждено на `bfc83242`, три публичных ответа AChat — на `6d46f7b2`; повторять install/activate ради этой проверки не требуется. Telegram/private-history режим уже квалифицирован и применён локально: реальная Client-связь и чтение своей истории подтверждены. Текущий ближайший шаг — живой повтор исправленного перехода история → последний визит, затем непрерывный booking/move/cancel сценарий. Новая локальная правка и сохранённые ключи не продлевают истёкшие допуски внешних проверок. Автопилот C10, полный продукт и новая release certification остаются незавершёнными.

