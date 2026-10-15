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


## Свежий проход на committed candidate

Проверен именно `cfea53a8fc745bb43e025d2556d37bdf9d5d0781` в чистой
изолированной копии. Последующий documentation-only commit сохраняет receipts;
он не переименовывает проверенный SHA и не выдаёт сертификат.

| Поверхность | Свежий результат |
| --- | --- |
| Backend full | 9 988 PASS, 732 suites, 0 FAIL / SKIP |
| Platform CI | Все четыре job воспроизведены локально на macOS; это не GitHub-hosted receipt |
| Widget Contract | Blocking types/check PASS; строгие admission refusals входят в полную backend suite |
| Widgets Live | 710 PASS, 60 suites, 0 FAIL / SKIP |
| HTTP/BIN | 21/21 PASS |
| Release binary | 5/5 PASS, 4 suites; новый и старый production contract на искусственной БД |
| Local staging HTTP/BIN | 19/19 PASS; legacy AR-1 отдельно 36/36 PASS |
| Runtime Node 22 и Node 24 | На каждой версии 846 PASS, 7 SKIP, 0 FAIL; пропуски не считаются PASS |
| React carrier | 200/200 PASS |
| Release packaging | 18/18 PASS; PWA/Capacitor byte equivalence с разрешённой заменой endpoint |
| Platform bootstrap | 20 unit + 7 HTTP/PG/compiled PASS, искусственный оператор |
| Schema | Clean + idempotent replay PASS на новых одноразовых БД; новых migrations нет |
| iOS | Unsigned simulator и device app собраны и проверены, без подписания/установки |
| Mutation declarations | 555 declarations / 48 batteries валидны; полный corpus ещё не исполнен |

Legacy Python 3.11: 618 PASS, 0 FAIL; внешняя сеть при тестах
закрыта проверенным sandbox. Сравнение исходного и нового profile-контрактов
отдельно подтвердило неизменность старого manifest/digest и registry digest.
Точный результат и размеры/хеши локальных receipts:
[RESULT.json](RESULT.json), [FINAL-ARTIFACTS.json](FINAL-ARTIFACTS.json).
Все созданные этим проходом PostgreSQL остановлены; исходники при проверках
не менялись.

Сборка симулятора имеет канонический endpoint `https://mayaos.ru/api`.
Это проверка упаковки, а не обращение к production. Отдельно собран и проверен
unsigned device payload для `https://phone-test.mayaos.ru/api` на этом же SHA.
Он не подписан и не установлен; сборка не обновляет тестовый сервер.

### Почему сертификат ещё не выдан

Строгий verifier принял происхождение 31 предложенного claim: 155 различных ID,
0 нарушений формата/provenance. Это не оценка всех 165 обязанностей. По восьми
общим требованиям из раздела выше пока нет полной scoped qualification; две
HANDOFF-обязанности остаются глобальными STOP. Новый профиль требует доказать
недоступность исключённых price/goods подветвей и все оставшиеся применимые
обязанности. Нельзя превратить эти восемь строк целиком в U или использовать
искусственный `firstPhoneCertificate` как результат сертификации.

Следующий разрешённый локальный этап: строгие source/subbranch proofs, полный
555-mutant corpus, применимый FBE2E и final admission. 10 новых FP mutations
прошли до commit только диагностически; шесть свежих phone-catalog mutations
тоже не заменяют полный corpus. Ни прежний сертификат, ни этот набор зелёных
проверок не перенесены автоматически на новый профиль.

`CERTIFIED_FOR_PROFILE: NO`; `READY_FOR_RELEASE_AUTHORIZATION: NO`.
Beget, production, настоящая база салона, grants, OTP/YCLIENTS/model calls и
установка на телефон этим проходом не затронуты. Оставшиеся реальные полномочия,
ограниченная модельная приёмка и обновление стенда перечислены в RESULT.json;
новое подтверждение Telegram само по себе не устраняет эти release-условия.
