# Первый телефонный сценарий: фиксированный профиль без цены и прихода товара

Owner decision: [APPROVED B](../../MAYA-FIRST-PHONE-SCOPE-DECISION-20261015.md),
2026-10-15. Implementation base: `7f67abfcf437a7f4867f8712a783e64303002d96`,
branch `codex/maya-local-crm-setup-20261010`.

## Контракт

В существующем AR-1 добавлен ровно один серверный профиль:
`closed-input.no-handoff.no-price-goods@1`. Старый `closed-input.no-handoff@1`,
его manifest/digest, исходный реестр и `full165.closed-input` не заменены.
Неизвестный scope закрывается; caller не задаёт исключения. Frontend не оценивает
этот профиль. Новых таблиц, колонок или миграций нет.

Исключены шесть точных price/goods COMMIT/NAVIGATE templates и две TOOL + две AE
операции из решения. Обычное чтение каталога/цен и личная запись сохраняются.
Запрет установлен в Tool Runtime (включая goods receipt-review и старые approvals),
при записи proposal/approval, при AE admission, mint/resolve/intent/detail binding
и непосредственно перед отправкой провайдеру в существующем CRM owner.
Reject старой заявки не создаёт бизнес-эффекта и сохраняет прежние проверки.

Отрицательная проверка scope никогда не предоставляет authority. Отсутствие
entitlement не заменяет существующие проверки бизнес-операций. При наличии нового
scope запрет price/goods сохраняется и после expiry/revoke: отключённый виджет не
должен открыть прямой API. Более широкий доступ требует нового штатного AR-1 grant.

Перед provider dispatch существующая CRM-транзакция берёт shared advisory lock на
тот же tenant key, на котором AR-1 writer берёт exclusive lock. Уже завершённая
смена профиля замечается до dispatch; новый writer ждёт завершения допущенного
эффекта. Shared lock берётся после AE admission, чтобы не создавать вложенный lock
на второй connection за ожидающим writer. Проверены реальная PostgreSQL очередь
блокировок и смена scope сразу после AE dispatch admission. Gate ordering,
identity/confirmation/current source checks и сроки AE lease не ослаблены.

## Порог и доказательства

Все 165 ID сохранены. G6-6/G13-R8 остаются глобальными STOP. Восемь общих ID
G7-FR6d, G11-I4/I5/I6/I10, G13-I1/I2/I9 не превращены в целые U/STOP: в новом
сертификате для них обязателен L-T. Остальные их ветви остаются обязательными.
Для исключённых source-подветвей certificate parser отдельно требует четыре
hash-поля на каждую: decisionDigest, absence, refusal, mechanism. Они связаны
сертификатом и подписью AR-1. Это проверка формата и binding, а не генератор
доказательств и не автоматическая сертификация.

V2 single-operator production и существующий отдельный local staging путь
принимают этот фиксированный профиль. Старый independent-review V1 ограничен
прежним scope. Legacy synthetic V1 без явного profile binding не выдаёт новый
профиль. Platform session/tenant allowlist/CAS/audit/expiry/revoke обязательны.
TENANT_OWNER не становится ни platform operator, ни personal Client.

## Локальная проверка и её границы

Первый диагностический проход на незакоммиченных исходниках:
22/22 HTTP/PostgreSQL, 130/130 сопутствующих unit; затем 10/10 новых FP mutations
AS-DECLARED, ноль mismatches и зелёные исходные controls. Отдельно 245/245 focused
unit на промежуточном исходнике. Эти receipts сохраняют ход разработки, но не
заменяют итоговые final-SHA проверки.

HTTP сценарии включают личную запись с четырьмя production HTTP widgets и одним
искусственным booking, BS-1 и NS-1 source, отказ прямой цены/goods, старой заявки,
replay/concurrent approval, неверных полномочий, stale CAS и отсутствие бизнес-
эффекта при смене scope перед dispatch. Эфемерные подписанты, искусственные
сертификаты и новая одноразовая PostgreSQL используются только в тестах.

`firstPhoneCertificate` — явно искусственная fixture, не выдача сертификата.
`approval-source-boundary.live-spec.ts` не предлагает L/L-T claims: подменённый
модельный ответ или диагностический вызов нельзя выдать за строгую qualification.
Нужна отдельная применимая source/subbranch qualification со строгим collector,
а также весь свежий mutation/CI/FBE2E/packaging/admission на committed candidate.
Полный corpus теперь декларирует 555 mutants; declaration preflight не является
их исполнением. Глобальный audit не повышен; сертификат не выдан.

Изменения не отправлены на Beget и не установлены на iPhone. Реальные grant,
миграции, OTP, модельные запросы, YCLIENTS запись/перенос/отмена не выполнялись.
Последний известный сервер и установленное приложение этим локальным проходом
не изменены. Новое разрешение на их обновление потребуется после qualification.

Дополнительные локальные регрессии до commit: 72/72 HTTP старого и нового профиля,
2/2 production-binary lifecycle, 19/19 local-staging HTTP/BIN и 36/36 прежних
AR-1 HTTP/BIN. Обе версии бинарного теста проверяют два отдельных процесса:
grant виден второму, revoke и expiry видны обоим; unsigned command не проходит.
См. `DIAGNOSTIC-ARTIFACTS.json`. Все owned PostgreSQL после проверки остановлены.
