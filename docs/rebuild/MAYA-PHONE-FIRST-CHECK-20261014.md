# MAYA: путь до первой проверки на iPhone — 14 октября 2026

Проверенный исходный candidate: `1df1079a1d210cc4d176894c75b67585fb138348`.
Ветка: `codex/maya-local-crm-setup-20261010`.
Это локальная подготовка установки, не release certification, установка или
разрешение внешних действий. Product source в этом проходе не менялся.

## Что уже проверено сейчас

| Проверка | Результат и граница |
| --- | --- |
| Xcode | 26.6 (17F113), установлен и выбран |
| Телефон | Подключённый iPhone 17 Pro Max paired/available; Developer Mode enabled. Только чтение метаданных |
| Предусловия Debug signing | Есть действующая development identity и exact-bundle provisioning profile, включающий подключённый телефон и совпадающий сертификат. Profile действует до 2026-10-20 10:07:58 UTC. Само подписание не выполнялось |
| Каноническая упаковка | React AChat → PWA/Capacitor → generated native resources: PASS, 8 файлов и допустимая подстановка endpoint |
| iOS Simulator | Unsigned Debug build PASS; фактический App.app проверен |
| Архитектура iPhone | Unsigned Debug iphoneos build PASS; фактический App.app проверен |
| Отдельный development target | Сборка с зарезервированным `https://maya-phone-proof.invalid:3443/api` PASS; этот host не запрашивался и не является работающим сервером |
| Запрет ошибочной упаковки | Development bytes без точного setting, с другим endpoint и в Release — REFUSED; exact Debug — PASS |
| Packaging tests | 18 PASS / 0 FAIL |
| Текущий mutation inventory | 545 declarations / 47 batteries / 68 scheduled jobs; dry-run PASS, не выполненные mutations и не release admission |

Сборки выполнялись в отдельном временном clone исходного SHA. Canonical source
и финальный clone оставались clean на проверенном checkpoint. Backend/runtime
семантика, права, schema, UI и release contract не менялись. В исходной ветке
добавляется только этот evidence packet и исправляется устаревшее описание signing.

## Ближайшая цель и порядок

Следующий путь — довести существующий Companion до первого полезного прогона
на телефоне. Недостающие возможности прототипа (Feed Save, новые категории,
task undo, generic media, будущие агенты и C10) не добавляются как условие
первой установки. Это не отменяет их отдельную будущую разработку.

1. **Подготовить отдельный HTTPS test endpoint, доступный телефону.**
   В текущих проверенных файлах нет назначенного и квалифицированного endpoint
   для этой цели. `127.0.0.1` на телефоне не означает Mac. Существующий backend
   для локальных проверок слушает loopback. Нужен точно выбранный адрес и
   одобренный способ его подключения к изолированной среде. Доверие TLS, обычная
   авторизация, `capacitor://localhost` и отказ чужому tenant проверяются на этой
   среде. Не добавлять ATS/TLS bypass, spoofed production origin или runtime switch.
   Не выставлять сохранённую базу салона наружу без отдельного разрешения.
2. **Собрать Debug для этого точного endpoint и подписать.**
   Повторить sync/verify-native/verify-app с одним и тем же development URL,
   проверить точный SHA и текущий provisioning. Пока собраны unsigned artifacts;
   валидные metadata подписи не равны подписанному устанавливаемому приложению.
   Сейчас bundle ID — `ru.mayaos.app`; установка может заменить прежнюю Maya.
3. **После отдельного разрешения установить и пройти первый device smoke.**
   Запуск, вход в согласованную тестовую среду, пять разделов, клавиатура, safe
   areas, нижние окна, возврат из фона и закрытие сессии. Успех Chrome не заменяет
   iOS WebView/keyboard/microphone proof. Для локального Debug существующая
   документация предусматривает обычный вход в изолированный backend; Telegram
   callback на новом host не объявляется работающим без отдельной проверки.
4. **Реальные ответы и запись — отдельная граница.**
   Обращения к модели и чтение салона требуют действующего ограниченного допуска;
   прежние истёкшие окна не продлеваются хранением ключей. Запись/перенос/отмена
   требуют свежего exact-candidate certificate/profile, platform-operator session
   и signing, штатного AR-1 staging admission, разрешённого snapshot при его
   использовании и отдельного согласия на точные provider effects/notifications.
   Не делать grant через SQL, plan/trial или права tenant_owner.

## Срок и точная граница оценки

После готовности тестового endpoint и подписанной сборки планируется **один
сеанс 30–60 минут** на установку и короткий первый smoke. Это инженерная оценка,
не измеренная приёмка и не срок до полной сертификации или реального booking.
Срок подготовки endpoint и исправления ещё не обнаруженных device defects пока
не измерен. Называть сейчас гарантированную дату первой рабочей записи нельзя.

Сам перенос текущего интерфейса в native package больше не является неизвестным:
две архитектуры и строгая проверка App.app прошли. Оставшиеся главные зависимости
первого полезного запуска — доступный изолированный сервер, действующий доступ к
нужным данным/модели, фактическое signing/install и device acceptance.

## Release state: не повышен этим проходом

`CERTIFICATE: NOT_ISSUED` для этого candidate. Полный актуальный CI, complete
mutation corpus и применимые FBE2E не запускались здесь. Исторический полный
Platform CI на `a6d9c12d` и предыдущие scoped UI receipts не заменяют их.
Dry-run лишь проверяет разрешимость объявлений, anchors и killers.
HANDOFF остаётся STOP; AR-1 и fail-closed admission не менялись.

## Что потребуется от владельца

- Разрешение на конкретно подготовленное подключение тестового HTTPS endpoint,
  если оно меняет сеть/публикацию сервиса. В этом проходе ничего не публиковалось.
- Разрешение на замену установленной Maya тестовой сборкой и установку на
  подключённый разблокированный iPhone. При запросе macOS/iPhone подтвердить
  системный доступ самостоятельно; пароль/ключи в чат не нужны.
- Обычный вход в согласованную среду. Для живой модели/салона — один общий
  ограниченный допуск на весь заранее подготовленный сценарий, а не на каждую кнопку.
- Для реальных booking effects — отдельное AR-1/операционное разрешение после
  свежей квалификации. Ввод YCLIENTS/DeepSeek ключей заново не планируется: их
  прежний локальный helper уже существует; ключи в этом проходе не читались.

Подпись/профиль сейчас присутствуют. Новая Apple identity, private signing key,
Client binding или повторный импорт не создавались и не требуются только для
этой проверки упаковки. Наличие Debug profile не доказывает Release capabilities.

## Не скрытый сбой первого подготовительного запуска

Первый clone собрал и проверил оба App.app, но финальный clean-check обнаружил
untracked `maya-carrier-react/node_modules`: harness dependency symlink не
покрывался directory-only ignore. Product tracked diff был пуст. Исправлено только
правило исключения двух известных dependency symlinks в локальном `.git/info/exclude`
нового clone. Весь packaging run повторён с нуля; финальный clone clean.
Первый FAIL и точная причина сохранены отдельно, не названы дефектом приложения.

[Свежие результаты и hashes](evidence/maya-phone-preflight-20261014/README.md).
Production, migration, grant, real OTP/YCLIENTS/model, установка/запуск на iPhone,
новые ключи, push/merge: **0**. Чтение публичных signing/device metadata выполнено;
секреты, сертификаты с private keys и raw device identifiers в archive не включены.
