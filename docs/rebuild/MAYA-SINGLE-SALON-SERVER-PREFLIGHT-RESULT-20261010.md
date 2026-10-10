# Read-only серверный preflight: результат одной разрешённой попытки

**Текущая привязка tenant/branch/company и metadata backend не получены.** Единственная попытка по существующему Beget-маршруту завершилась SSH exit 255 за 8.028 секунды после успешной авторизации на промежуточном Beget. Целевая SSH-авторизация не наблюдалась; collector и подготовленный SQL не исполнялись. Повтора или смены маршрута не было.

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

Локальный single-company contract и [план одного салона](MAYA-SINGLE-SALON-PILOT-PREFLIGHT-20261010.md) остаются применимыми. Multi-company решение по-прежнему не является условием одиночного пилота. Blocker сейчас конкретный: **по единственному разрешённому существующему SSH-маршруту не получен доступ к актуальным metadata backend**.

## Самая короткая следующая проверка

Оператор с уже работающей серверной сессией или management console выполняет ту же [whitelist SQL-проекцию](evidence/maya-single-salon-server-preflight-20261010/mapping.sql) в READ ONLY транзакции и возвращает её с идентификатором/версией runtime. Новый SSH маршрут, повтор, credentials, deploy или настройки для этого отчёта не использованы и не предлагаются как обход.

Prepared collector не импортирует приложение, не читает `.env`, credential values, `/proc/*/environ`, raw settings или PII. Он ограничен known service metadata, release reference/Git SHA и одной SELECT проекцией `Tenant`/`CrmIntegration`/`Branch`; DB-путь — только существующий noninteractive Unix peer доступ, без парольных файлов, с `default_transaction_read_only`, statement/lock timeout и ROLLBACK. **Исполняемость DB-пути этим запуском не проверена**, поскольку target SSH не достигнут.

Реальных provider/model calls, booking, сообщений, изменений файлов/БД/config на сервере, перезапусков, deploy и действий с рабочим сайтом — ноль. Сохранены только локальные proof artifacts. Новый feature/runtime/test не добавлялся.
