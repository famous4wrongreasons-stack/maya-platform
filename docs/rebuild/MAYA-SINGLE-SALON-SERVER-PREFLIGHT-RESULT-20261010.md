# Read-only серверный preflight: первый SSH attempt и разрешённая проверка маршрута

**Текущая привязка tenant/branch/company и metadata backend не получены.** Первичная попытка по существующему Beget-маршруту завершилась SSH exit 255 за 8.028 секунды после успешной авторизации на промежуточном Beget. Целевая SSH-авторизация не наблюдалась; collector и подготовленный SQL не исполнялись. Повтора этого metadata-запроса или смены маршрута не было. После уточнения разрешённого scope отдельно выполнена ограниченная проверка Beget → известный backend: **TCP connect к `89.169.160.55:22` завершился `TimeoutError` за 8.006 секунды**. Подробности ниже.

## Точный scope и время

Разрешение владельца: `Sentinel_dee4f07ef0e081919c571ebea8f4e987`, **10.10.2026 09:49:14 UTC**, на вопрос `Sentinel_70ef609ce7b081919f4ec67cdefdd5ae` в 09:48:30 UTC. Исходный подготовленный source: `6226282e5b1240c9ed9db082909a7eb395d51dc5`.

- Начало: **2026-10-10 09:52:58.854295 UTC**.
- Завершение: **2026-10-10 09:53:06.882919 UTC**.
- Длительность: **8.028 секунды**, exit **255**.
- Одна логическая попытка маршрута, `ConnectionAttempts=1` и `ConnectTimeout=8` на каждом из двух SSH hops; общий deadline 45 секунд не понадобился.
- Маршрут: существующий `mocine3388@prime.beget.com` stdio forwarding → `botadmin@api.mayaos.ru`, прежние identity references. `StrictHostKeyChecking=yes`, `UpdateHostKeys=no`, `BatchMode=yes`; новые host keys не принимались, security settings не менялись.

[Точный transport receipt](evidence/maya-single-salon-server-preflight-20261010/attempt.json), [команда без key bytes](evidence/maya-single-salon-server-preflight-20261010/command.json), [machine-readable результат](evidence/maya-single-salon-server-preflight-20261010/result.json), [hash inventory](evidence/maya-single-salon-server-preflight-20261010/artifact-hashes.json).

## Подтверждённые transport facts и предел диагноза

| Наблюдение | Результат |
| --- | --- |
| SSH-аутентификация на Beget | Подтверждена |
| `channel 0: open confirm` для forwarding | Не наблюдался |
| SSH remote protocol banners | Один — нет отдельно наблюдаемого второго banner целевого backend |
| Аутентификация на `api.mayaos.ru` | Не наблюдалась |
| Raw timeout marker / явный отказ host key / явный auth refusal | true (не квалифицирован) / false / false |
| Collector stdout | 0 bytes, structured metadata отсутствуют |
| SQL / доступ к БД | Не выполнялись |

Это отделяет успешный первый hop от неполученного доступа к backend. **Причину между stdio forwarding, маршрутом/firewall и состоянием target sshd данная попытка не различает.** Отсутствие распознанного channel marker не доказывает отдельный запрет forwarding. Это также не доказательство остановки приложения или недоступности HTTP сайта. **Точный timeout не доказан:** regex `timed out|timeout` также совпадает с `ConnectTimeout=8` в диагностике ProxyCommand. Длительность согласуется с этим лимитом, но сохранённый boolean не различает параметр команды и terminal error. Raw `attempt.json` оставлен неизменным. Raw `-vv` вывод не сохранён: в receipt остались только конечные безопасные phase markers и byte counts. Автоматическая approval review разрешила запуск; этот STOP вызван transport outcome, а не отказом approval.

## Current против historical

Текущих tenant/integration/branch строк, статуса сервиса, release SHA и source revision нет. Поэтому single-salon path сейчас **не подтверждён живым runtime**.

Исторический кандидат из 05.10 остаётся только кандидатом: tenant `cmsuavtar0003bjyrfngxsne6`, integration `cmsuavtcq0007bjyrpr1z68yi`, company `503759`, branch `cmsuavtaz0005bjyr8nyrxdat`, timezone `Europe/Moscow`. Ни active/external статус, ни явная `maya.crm-branch-binding/1` связь, ни уведомления не перенесены из истории в current facts.

Локальный single-company contract и [план одного салона](MAYA-SINGLE-SALON-PILOT-PREFLIGHT-20261010.md) остаются применимыми. Multi-company решение по-прежнему не является условием одиночного пилота. Blocker сейчас конкретный: **Beget → `89.169.160.55:22`: TCP connection не устанавливается в пределах 8 секунд; актуальные metadata backend недоступны этим маршрутом**. Причина внутри этой сетевой границы не установлена.

## Самая короткая следующая проверка

Оператор с уже работающей серверной сессией или management console выполняет ту же [whitelist SQL-проекцию](evidence/maya-single-salon-server-preflight-20261010/mapping.sql) в READ ONLY транзакции и возвращает её с идентификатором/версией runtime. Альтернатива — сообщить уже работающий прямой маршрут к этому же backend без credentials. В проверенных operational sources такой маршрут не установлен; исторический `111.88.148.206` из `AGENTS.md` относится к другому target и не использован как fallback. Новый маршрут, credentials, deploy и сетевые настройки не создавались.

Prepared collector не импортирует приложение, не читает `.env`, credential values, `/proc/*/environ`, raw settings или PII. Он ограничен known service metadata, release reference/Git SHA и одной SELECT проекцией `Tenant`/`CrmIntegration`/`Branch`; DB-путь — только существующий noninteractive Unix peer доступ, без парольных файлов, с `default_transaction_read_only`, statement/lock timeout и ROLLBACK. **Исполняемость DB-пути этим запуском не проверена**, поскольку target SSH не достигнут.

Реальных provider/model calls, booking, сообщений, изменений файлов/БД/config на сервере, перезапусков, deploy и действий с рабочим сайтом — ноль. Сохранены только локальные proof artifacts. Новый feature/runtime/test не добавлялся.


## Разрешённое уточнение: Beget → известный backend, 09:59 UTC

Parent уточнил: прежнее ограничение «одна попытка» исключает бесконечные повторы, но не требует нового approval для разрешённой read-only диагностики существующего маршрута. Выполнена одна новая короткая SSH-сессия на том же Beget (предыдущая уже завершилась), без повторного запуска backend collector/SQL. Вызов разрешён автоматической проверкой; approval rejection отсутствует.

- Локальный интервал: **09:59:30.267844–09:59:42.225275 UTC**, 11.957 секунды, SSH exit **0**.
- Beget authentication подтверждена; remote hostname `prime.beget.ru`.
- DNS `api.mayaos.ru` на Beget вернул только `89.169.160.55`.
- Ровно один TCP connect к этому адресу, порт **22**: `TimeoutError`, **8.006 секунды**, `tcpConnected=false`. Другие hosts/ports не проверялись; target authentication не предпринималась.
- `ip -j route get 89.169.160.55` не исполнился (`PermissionError`). Route table не получена; sudo/другого способа чтения не использовано.
- Конкретная недоступная граница: **Beget → backend TCP/22**. Это не доказывает firewall, остановку sshd/backend или недоступность рабочего HTTP сайта.
- `StrictHostKeyChecking=yes`, `UpdateHostKeys=no`, `ConnectionAttempts=1`, общий deadline 30 секунд. Только существующая identity reference; ключи/секреты не читались collector и не копировались.
- Прямой attempt условно разрешался при наличии ранее документированного маршрута с тем же target/account/hostkey. `deploy/vps/deploy.sh` документирует Beget; [прежний operational checkpoint](MAYA-REAL-MODEL-NEXT-ACTION-20261008.md#ssh-и-минимальные-недостающие-сведения) не подтверждает прямой маршрут. Другой адрес из `AGENTS.md` не подставлялся.

[Receipt](evidence/maya-beget-route-readonly-20261010/attempt.json), [наблюдение на Beget](evidence/maya-beget-route-readonly-20261010/route-observation.json), [точная команда](evidence/maya-beget-route-readonly-20261010/command.json), [qualification и минимальный следующий шаг](evidence/maya-beget-route-readonly-20261010/qualification.json), [hash inventory](evidence/maya-beget-route-readonly-20261010/artifact-hashes.json). Raw artifacts первой попытки сохранены без изменений; её широкий timeout marker остаётся неквалифицированным и не заменён результатом второго наблюдения. Локальные и remote timestamps записаны отдельно; длительности измерены monotonic clock.

Проверены syntax локальных collectors и совпадение архивных bytes/hashes. Это documentation/transport checkpoint: новый продуктовый код, тесты приложения, real YCLIENTS/model acceptance и полный MAYA/C10 acceptance не заявляются. Следующих network attempts не запланировано.


## Открытая владельцем консоль: обнаружение браузера после 11:00 UTC

Владелец подтвердил «открыл» в **11:00:06 UTC**, `Sentinel_434a52c9919481918d145e6bafc0da0c`, для исполнения того же разрешённого read-only запроса через существующую серверную консоль. SSH-маршрут не повторялся.

По metadata открытого Chrome найдены `console.yandex.cloud` (window1/tab1) и `cp.beget.com` (window1/tab4, active). **Точный backend host/account и авторизованная terminal session не установлены.** Наличие панели хостинга не выдано за вход на `89.169.160.55`. Terminal не содержит открытых вкладок. Нерелевантные вкладки не включены в evidence.

Обе попытки whitelist DOM-проекции вернули встроенный отказ Chrome: **«Выполнение JavaScript через AppleScript отключено»**. Содержимое страниц не получено, наличие парольного prompt неизвестно. Это техническая настройка браузерной автоматизации, а не отказ SSH/backend или automatic approval review. Настройку не меняли и другой способ извлечения страницы не применяли. Скриншотов, чтения credentials/ключей/PII, серверных команд, SQL, provider calls и изменений — ноль.

Минимальный следующий шаг для этого способа управления: владелец включает в Chrome **Вид → Разработчикам → Разрешить JavaScript из событий Apple**. После этого сначала проверяется точный target/account открытой консоли; при password prompt вход остаётся владельцу. Повторное разрешение на уже согласованный read-only server scope не требуется. [Sanitized discovery receipt](evidence/maya-open-console-20261010/discovery.json) и [hash](evidence/maya-open-console-20261010/artifact-hashes.json).
