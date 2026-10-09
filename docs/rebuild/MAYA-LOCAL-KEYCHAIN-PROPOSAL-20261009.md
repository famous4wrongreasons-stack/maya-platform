# MAYA: локальный Keychain для повторных batch

2026-10-09. Только исследование официальной документации и локальных man/SDK headers. Keychain не открывался: не выполнялись поиск записей, чтение, создание, обновление, удаление, export или команды `security`. Проверок с настоящим ключом не было.

## Практический выбор

Для нынешнего owner-managed CLI достаточно одной отдельной записи **generic password в login Keychain данного пользователя**, без iCloud-синхронизации. Предлагаемый новый namespace, не название найденной записи:

- service: `ru.mayaos.dev.local-model.deepseek.v1`;
- account: `local-owner-<uid>` (при настройке подставляется фактический UID владельца локального профиля);
- label: `MAYA — локальные проверки DeepSeek`.

Нельзя использовать production credential, искать похожие записи или подбирать account. Чтение — точный class + service + account + явно выбранный локальный keychain. Эти атрибуты не являются секретом. Service/account входят в ключ generic-password записи; повторное добавление существующей записи должно дать конфликт, а не молчаливую замену. [Apple: generic password](https://developer.apple.com/documentation/security/ksecclassgenericpassword).

Apple рекомендует `SecItem` API. Для CLI минимален существующий file-based login Keychain: у него ACL; data-protection Keychain использует entitlement access groups и для command-line программы требует подходящей подписанной bundle/provisioning упаковки. File-based реализация остаётся доступной, но связанные старые API уже deprecated. Это осознанный небольшой локальный вариант, не новая долговременная платформенная архитектура. Для file-based чтения явно ограничить `kSecMatchSearchList`, записи — `kSecUseKeychain`. [Apple TN3137](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains).

## Однократное сохранение и последующее использование

1. Владелец явно запускает отдельное действие «Сохранить ключ для локальных batch», видит service/account и вводит ключ в скрытое поле/TTY. Ключ поступает в `SecItemAdd` как bytes в памяти. Настройка не запускает модель и не создаёт разрешение на платный run. Поддержанный CLI также умеет запросить пароль интерактивно, если password-опция оставлена последней без значения; это факт man, не выполненная команда. Ни ключ в аргументе, ни shell substitution, ни environment variable не нужны. [Локальный security(1)](/usr/share/man/man1/security.1:424), [Apple: SecItemAdd](https://developer.apple.com/documentation/security/secitemadd(_:_:)).
2. Будущий broker получает только не секретную ссылку на эту запись. Keychain становится явным локальным credential source вместо stdin, без автоматического fallback и без ослабления remote-профиля. Existing admission/permit, source pins, общий бюджет, deadline и cancellation остаются прежними. Сначала их проверка, затем одно точное получение credential; runner ключ не получает.
3. Для текущего Node broker практичен небольшой фиксированный native reader через Security.framework; secret передаётся только в унаследованный приватный pipe к broker, никогда в stdout/stderr, terminal, JSON evidence, env или файл. У helper нет общего интерфейса поиска, произвольного namespace и команды вывода ключа. Это предлагаемая реализация, пока не созданная и не испытанная. Если требование означает отсутствие даже такой внутренней передачи, нужен native in-process bridge или собственный broker executable — это уже другой объём работы.
4. При недоступности/блокировке Keychain — остановка до provider request, без опросного цикла и запроса ключа через agent/tool. Настройка может показать системный диалог согласия; unattended run должен отказывать, если требуется взаимодействие. Для legacy file-based helper существует `SecKeychainSetUserInteractionAllowed(false)`; data-protection-only флаги нельзя считать доказанным подавлением legacy UI. Ограниченный subprocess должен завершаться по abort/deadline. [SDK SecKeychain.h](/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/Security.framework/Headers/SecKeychain.h:634), [SDK SecItem.h](/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/Security.framework/Headers/SecItem.h:1014).

## Что реально означает «только broker»

ACL задаёт доверенные приложения/исполняемые файлы для доступа без подтверждения. У `SecAccessCreate` NULL означает вызывающее приложение; пустой список — ни одного автоматически доверенного приложения. Не использовать доступ для всех приложений, общий `node`, Terminal или `/usr/bin/security` как доверенную идентичность MAYA. [Apple: SecAccessCreate](https://developer.apple.com/documentation/security/secaccesscreate(_:_:_:)), [SDK trusted application](/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/Security.framework/Headers/SecTrustedApplication.h:53).

**Инженерный вывод:** ACL общего Node не различает наши `.mjs` и чужой JS, исполняемый тем же Node. ACL отдельного reader тоже не аутентифицирует его caller: если reader отдаёт ключ вызвавшему его процессу, другой процесс того же владельца сможет попробовать вызвать его. Приватный pipe и 0700 каталог не превращают это в изоляцию от того же UID. Поэтому минимальный вариант честно остаётся **owner-managed local trust**: только broker использует reader по архитектуре, но это не OS-гарантия broker-only. Он устраняет повторный ввод и plaintext-файлы, а не доверие к владельцу Mac.

Если требуется именно OS-идентичность отдельного приложения, нужен самостоятельно подписанный broker с фиксированным кодом запуска либо native endpoint, проверяющий отдельную code identity вызывающего broker; доверие общему Node этим не исправить. Наличие подходящей подписи/provisioning сейчас не исследовалось. У Apple designated requirement определяет идентичность подписанного кода; один путь к `.mjs` такой идентичностью не является. [Apple: Applying Code Requirements](https://developer.apple.com/documentation/security/applying-code-requirements), [Apple: ACL](https://developer.apple.com/documentation/security/access-control-lists).

## Отзыв и проверка перед подключением

Владелец может удалить ровно эту запись либо убрать доверие helper; обновление ключа — отдельное явное действие на том же namespace. Удаление из Keychain не отзывает уже выданный provider key и не стирает копию в памяти работающего broker. Для немедленной остановки сначала существующий cancel/stop и очистка broker reference; для полного отзыва — revoke/rotate на стороне провайдера. Ни Keychain delete, ни permit revocation не заменяют друг друга. API для точного удаления — `SecItemDelete`; публичный namespace не нужно экспортировать вместе с секретом. [Apple: SecItemDelete](https://developer.apple.com/documentation/security/secitemdelete(_:)).

Перед настоящим подключением достаточно локальной проверки с заведомо синтетическим секретом: enroll/duplicate/точное чтение/удаление; locked/denied/changed-helper отказ; cancellation и отсутствие stdout/env/argv/evidence утечек. Это будущая проверка, не выполненный результат. Повторные batch без нового ввода возможны только при доступном Keychain и ранее разрешённом доверенном reader; абсолютное отсутствие системных диалогов после обновления бинарника или изменения ACL не обещается.

Текущие действия ограничились чтением `/usr/share/man/man1/security.1`, публичных SDK headers и официальных страниц Apple. Никаких новых разрешений на paid run этот документ не выдаёт.
