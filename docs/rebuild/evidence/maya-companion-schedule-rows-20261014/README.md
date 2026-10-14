# Дневное расписание — scoped local evidence

См. [checkpoint](../../MAYA-COMPANION-SCHEDULE-ROWS-CHECKPOINT-20261014.md).

- `summary.json`, `runner.py`, `logs/`: свежие scoped checks на exact committed candidate.
- `source/RESULTS.json`: безопасные наблюдения actual HTTP/PG/runtime/React probe.
- `source/manifest.json`, `source/runner.mjs`: изоляция, команды, test-only migrations,
  прекращение кластера и hashes. Exit 1 целевой time-label mutation — ожидаемый отказ.
- `mutations/`: baseline → intentional broken renderer → restored baseline.
- `browsers/`: synthetic HTTP над текущими emitted PWA bytes, API allowlist.
- `screenshots/`: только искусственные данные и representative reflow.
- `development/`: прежние сбои сохранены; не заменяют final evidence.
- `MANIFEST.json`: original/archive hashes, reference package, omitted raw artifacts.
- `SCAN.json`: проверка новых code/docs/receipts, не аудит всей истории Git.

Отсутствие имени услуги во внутреннем источнике и отсутствие aggregate free-window
source не скрыты. Реальных provider calls, private keys, клиентских выгрузок и raw
DB dumps в архиве нет. Release certificate не выдавался.
