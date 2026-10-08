# Переход к реальной модели: конкретный пакет на 2026-10-08

**Актуальный результат: один разрешённый локальный actual-model run выполнен и
закрыт.** [Фактические ответы, остановка и cleanup](MAYA-LOCAL-ACTUAL-MODEL-RESULT-20261008.md):
3 ответа DeepSeek, затем четвёртый запрос отклонён локально по размеру 99 820 >
98 304 байт. Качественная приёмка не пройдена, повторное разрешение отсутствует.
Следующий шаг — локальное исправление context size и booking follow-up, без
нового ключа и без повторного платного запуска.

**Текущий путь — локальный Mac, по решению владельца.**
[Локальный checkpoint и secure handoff](MAYA-LOCAL-MODEL-CHECKPOINT-20261008.md):
явный профиль реализован, 53 targeted tests и types/lint прошли. Этот checkpoint
описывает подготовку до actual-model run. Используется существующий DeepSeek account; ключ
владелец вводит напрямую в память broker через скрытый Terminal prompt после
точного разрешения на ограниченный прогон. SSH не блокирует разработку.

Ниже сохранён **архив раннего серверного плана**. Его SSH-статусы относятся к
указанным моментам, а не к текущему итоговому состоянию диагностики. Этот план
не заменяет локальный next action и не даёт разрешения на новые подключения.

## Архив серверного варианта

**Код broker и локальный bootstrap реализованы; серверный запуск не выполнен.**
Актуальный [profile checkpoint](MAYA-REMOTE-PROFILE-CHECKPOINT-20261008.md)
содержит точные setup/start/cleanup команды, лимиты и оставшиеся prerequisites.
Metadata lookup не означает, что сразу после него можно делать платные вызовы. Код проверен dry
на `746e0ae4e1efda0abf7918cbb63a5fe4d46861b9`; сохранённый checkpoint —
`e9a6d803b7af14da5110938f8db7ef4a8face53e`. В той подготовке внешних соединений,
чтения ключей, платных вызовов и дополнительных HTTP/PG-тестов не было.

## Что предлагается запустить

- Endpoint: `POST https://api.deepseek.com/chat/completions`, модель
  `deepseek-v4-pro` (публично указанная версия `DeepSeek-V4-Pro-0813`).
- Существующий сервер: `api.mayaos.ru` / `89.169.160.55`, login `botadmin`.
  Исторически подтверждены broker `maya-booking-broker` UID 996 и runner
  `maya-booking-proof` UID 997. GID, группы и нынешнее состояние не подтверждены.
- Новый изолированный каталог, например `/srv/maya-core-diagnostic-<runId>/`,
  новые временные процессы broker/runner и свежая synthetic PG. Старые
  `/srv/maya-booking-proof`, units, DB, закрытый permit и ledgers не возобновлять.
  Публичный HTTPS, proxy routes и рабочий сайт менять не требуется.
- Наружу уходит только синтетический диалог, его реальные в рамках этого теста
  предыдущие ответы, redacted synthetic tenant context/tool results, инструкции
  и разрешённые схемы инструментов — в DeepSeek. Реальные CRM/клиенты не нужны.
  Ключ передаётся только broker → DeepSeek в Authorization; на Mac и в runner,
  corpus или evidence он не копируется. Ответы и usage сохраняются локально.

## SSH и минимальные недостающие сведения

Последняя разрешённая попытка **08.10 в 17:50:09 UTC выполнена** после ответа
владельца «разрешаю» в 17:45 UTC. **Exit 255, 8.021 секунды, SSH banner exchange
timeout, stdout 0 байт**. Metadata не получены, выполнение collector на target
не наблюдалось. Дополнительных подключений после этой попытки не было.
[Новый receipt](evidence/maya-development-integration-20261006/metadata-inventory-second-20261008/manifest.json).
Это metadata-only разрешение не включает setup или paid run.

Эта попытка и предыдущая в 08:24 UTC **шли через Beget ProxyCommand**:
`botadmin@api.mayaos.ru` с identity-reference `~/.ssh/yandex_bot`, промежуточный
`mocine3388@prime.beget.com` с `~/.ssh/beget_deploy`. Она закончилась SSH banner
timeout за 8.02 секунды, stdout 0; remote collection не наблюдалась.
[Receipt](evidence/maya-development-integration-20261006/metadata-inventory-authorized-20261008/authorized-attempt-manifest.json).
Повтор того же probe будет повтором этого маршрута, а не проверенным исправлением.
Сообщение владельца о прямом запуске есть, но успешного прямого SSH receipt в
изученных источниках нет. Прямой `botadmin@api.mayaos.ru` без ProxyCommand —
**непроверенный вариант, не выполненный обход**; маршрут следует явно включить
в следующий разрешённый пакет, а не молча менять после timeout/rejection.

Для минимального metadata lookup нужны только:

1. Известный `maya-booking-proof-broker.service`: `User`, `Group`,
   `SupplementaryGroups`, `EnvironmentFiles`, `LoadCredential`, `ActiveState`,
   `SubState`, `MainPID`, `PrivateNetwork`, `IPAddressAllow`, `IPAddressDeny`.
   Не нужны `Environment`, `ExecStart`, config/log/credential contents.
2. Числовые `id -u/-g/-G` двух указанных principals; подтверждённый состав
   выбранной существующей группы. UID нельзя принять за GID. Старый collector
   умеет numeric id, но **не доказывает полный состав группы/ACL**.
3. Только для валидированных явно объявленных credential references и их
   необходимых parent directories: type/UID/GID/mode/link count и numeric ACL
   (`getfacl -n`, если уже доступен), без содержимого. Оператор должен подтвердить,
   что это именно существующий scalar DeepSeek key, его разрешённый reader —
   broker, а runner не может его читать. Presence EnvironmentFile этого не доказывает.
4. Версии/пути уже установленного Node и PG, доступная память и диск в выбранном
   месте. Исторический сервер имел всего 1.96 GiB RAM; нынешняя вместимость
   backend/Jest с heap ceiling 3072 MiB **не установлена**.

Это read-only, без sudo, установки программ или запуска старых units. Если права
не позволяют получить нужные metadata, результат — конкретный missing field;
оператор может предоставить его без значения ключа. Не расширять поиск по диску.
Полный старый collector читает больше (три units/три principals/до 16 paths) и не
должен выдаваться за этот более узкий lookup. Обе выполненные SSH-попытки передавали
старый collector; более узкий lookup не исполнялся. После возвращения Wi-Fi
подтверждено только локальное выполнение. Следующий конкретный диагностический
шаг подготовлен в [profile checkpoint](MAYA-REMOTE-PROFILE-CHECKPOINT-20261008.md),
но новая SSH-попытка не выполнена и не разрешена автоматически.

## Что ещё потребует отдельного remote setup

Необходимы доставка проверенного кода и зависимостей, новый read-only code tree,
private evidence/control directories, socket directory, свежая PG и её миграции.
Нужно запускать новые процессы под существующими UID; например, новыми временными
systemd units с конечным сроком. Это **remote writes/process/service setup**,
возможно с привилегиями для владельцев, GID и network rules; metadata-разрешение
этого не включает. Production units не рестартовать.

Runner/backend должны иметь только свою PG и Unix broker, без произвольного
внешнего egress; broker — доступ только к DeepSeek HTTPS и своему evidence.
Локальный [bootstrap/systemd profile](MAYA-REMOTE-PROFILE-CHECKPOINT-20261008.md)
теперь реализован, но Linux/systemd enforcement ещё не проверен и ничего не
развёрнуто. Broker kernel policy ограничивает адреса; порт 443/TLS hostname
ограничены существующим кодом, отдельный OS port restriction не заявляется.
Проверить текущий ресурсный
запас; не обещать, что Mac/Jest-профиль поместится на историческом 2 GiB сервере.
При несовместимости нужен конкретный облегчённый runtime/setup, не повышение
лимитов и не запуск на production на удачу.

Live code path уже содержит отдельный entry, сохранённый budget kernel,
Unix transport, expiry/revocation/claim и upstream fetch. `runner --run --mode
admitted` ожидает **уже запущенный новый broker**; сам его удалённо не устанавливает.
Кросс-UID доступ и live endpoint не были исполнены. Нет real-model acceptance.

Credential binding выполняется в `core-conversation-admission.mjs`: manifest,
permit и текущий consumer обязаны совпасть по target/reference/owner/reader.
Затем **только broker** в `core-conversation-broker.mjs` после admission открывает
точный scalar-файл с `O_NOFOLLOW|O_NONBLOCK`, проверяет metadata/identity, держит
значение в памяти и перед fetch повторяет admission. Env-file decoder отсутствует.
Если найден только EnvironmentFile или недоступный scalar, потребуется отдельно
разрешённая OS credential projection/доработка binding. Metadata сам по себе это
не исправит; новый ключ автоматически не создаётся и не извлекается.

## Бюджет первого запуска

Заморожены **3 диалога / 5 user turns**, максимум **12 зарезервированных попыток,
$2 и 10 минут permit**, один запрос одновременно, интервал минимум 6 секунд,
30 секунд на попытку, 96 KiB request / 1 MiB response, до 2048 output tokens за
попытку. Суммарно не больше 1,228,800 input-reservation и 24,576 output tokens.
Все model-stage retries проходят тот же ledger и считаются отдельно. При
UNKNOWN/timeout резерв не возвращается, gate закрывается; новый dispatch или
resume закрытого ledger невозможен. Даже отказ после fsync до отправки сохраняет
резерв. Пять полных содержательных ответов заранее не обещаются: лимит может
остановить разговор раньше. Отдельный unbudgeted model/account preflight не входит.

Последняя публичная проверка цены в этой работе — **08.10.2026**:
input cache-miss **$1.32/M**, output **$3.96/M**, без учёта discounts/cache savings,
[официальная таблица](https://api-docs.deepseek.com/quick_start/pricing/).
Верхние token reservations дают **$1.71933696**, внутри $2. Сейчас повторного
обращения к документации не было. Permit требует свежего подтверждения цены
не старше 24 часов; account/model entitlement пока неизвестен. Первый допустимый
вызов должен входить в те же 12 попыток, а не расходоваться отдельным пилотом.

## Расширенный корпус: подготовлен, не включён в этот запуск

[12 диалогов / 24 хода](../../maya-saas-backend/datasets/conversation-intelligence/core-followup-frozen-20261008.json),
SHA256 `926578b841249c06d8e63ae117c6e651aefca7e39565b3e2fb73bf086cbb817c`.
Все реплики из существующего dev corpus/proof; gold assistant не скопирован,
новых сгенерированных rows нет. [Freeze](evidence/maya-development-integration-20261006/core-followup-freeze-20261008/freeze.json)
подтверждает 24 turn hashes, 13 source files/Git blobs и независимую сверку
14 source-case hashes/selectors на `e9a6d803`. Исторический source pin сохранён.

| Приоритет | Сценарий | Ходов | Подготовка fixture |
| --- | --- | ---: | --- |
| 1 | carry-over даты и мастера | 3 | Точные Елена/Никита, услуга и finite availability |
| 2 | замена мастера и времени | 2 | Существующий booking recipe, preflight 19:30 |
| 3 | опечатка и неоднозначный период | 1 | Явный admin case, не подменять вопрос отчётом |
| 4 | смена темы и возврат | 3 | Schedule + branch preference; root-cause не считать готовым |
| 5 | общий обзор + окна + предложение | 1 | Существующие C7/Opportunity/C9 recipes |
| 6 | общение и опечатки | 3 | Finite admin case; проверить естественный ответ |

Это первые шесть случаев / 13 ходов для следующей диагностической стадии.
Остальные шесть сохраняют create/text-confirmation, move/stop, cancel, ambiguous
staff, foreign tenant и revoked authority. Chat→move/cancel и branch/root-cause
остаются неподтверждёнными, negative variants нельзя заменить `ordinary`.
Нужны конечные per-case fixture bindings и отдельный executable batch; текущие
3/5/12/$2 не расширены. UNKNOWN/restart — отдельные существующие механические
контроли. Никакого дополнительного дорогого local mock цикла не запускалось.
