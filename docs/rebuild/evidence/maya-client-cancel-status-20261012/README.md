# Явная проверка результата своей отмены — 12 октября 2026

**Обновление 12 октября:** следующий [restored-receipt checkpoint](RESTORED-RECEIPT.md)
на `83ecf5c5` закрыл HTTP/PG/browser restart и восстановленную кнопку проверки.
Текст ниже описывает исторический backend-only checkpoint, а не текущие ограничения.

Code/test candidate: `0149f6686665cee358aaa8033178ebef6358732b`.
Base: `14c6ed4489c996de6d2b5bcb2bfe31a873ad767d`.
Branch: `codex/maya-local-crm-setup-20261010`.

Статус: **LOCAL SCOPED OFFLINE CHECKPOINT**. Это не release certification,
не живое подтверждение отмены и не HTTP/PostgreSQL/browser acceptance.

## Пользовательский результат и доказанный разрыв

После неопределённого результата отмены явное «Проверить результат» должно
проверять исходную операцию, а не отправлять отмену ещё раз. В исходном backend
stored-receipt resolver и owner adapter допускали только create/reschedule;
cancel не доходил до владельца проверки. Это воспроизведено до исправления:
реальные WidgetThreadPageService + CommitBookingAdapter с искусственной
сохранённой cancellation receipt не вызвали cancel reader (1 ожидаемый FAIL).

Теперь тот же тест проходит. Исходные widget record, tenant, principal,
confirmation key и action execution сохраняются. Новых endpoint, DTO,
confirmation writer, action execution или provider dispatcher нет.

## Контракт реализации

- Явный locator выбирает только существующую consumed/accepted cancellation
  receipt. Текущие principal, seal, release, erasure и retention проверки сохранены.
- Оригинальный server-stored confirmation key разрешается в фиксированном
  `maya.widgets.booking.commit.v1` scope и точном tenant. Cancel и reschedule
  используют один существующий kernel lookup с раздельно фиксированной capability;
  ключ другой операции не принимается.
- Appointment выбирается из доверенного исходного execution, затем заново
  проверяется активная verified maya_user связь, Client и точная принадлежность
  записи. Actor/member/source проверяются повторно при завершении await.
- Сохраняются оригинальные provider, external id, branch, source revision и
  create-origin witness. Даже completed cancellation требует текущей authority
  и исходного source witness. Completed result не вызывает provider.
- Для UNKNOWN используется только существующий cancel reconciliation handler:
  чтение исходного provider detail, его identity/status и существующий mirror owner.
  Нет dispatch/ingress/новой отмены, в том числе при PROVEN_NOT_EXECUTED → READY.
- Cancellation включена в уже существующий конечный Client status contract:
  после потерянного ответа один inconclusive read возвращает UNKNOWN;
  последующие чтения требуют явной проверки. Общий потолок inconclusive attempts,
  MANUAL_REQUIRED, claim/expiry и защита concurrent caller не ослаблены.
  Non-Client loop остаётся прежним. Это изменение поведения recovery, а не только тестов.
- Проверка результата ранее допущенной отмены разрешена после времени визита.
  Начать новую отмену прошедшей записи по-прежнему нельзя.
- Внутренняя отмена остаётся атомарной; новый recovery reader не создаёт для неё
  внешний источник. Public booking, роли и TENANT_OWNER != CLIENT не менялись.
- Ни React AChat, ни headless carrier runtime, ни UI semantics этим коммитом
  не изменены. Используется уже существующее явное действие проверки receipt.

## Свежие результаты на committed code candidate

| Проверка | Результат |
| --- | --- |
| 37 backend/Action Engine/Client/widget owner suites | **585 PASS / 0 FAIL** |
| Types `tsconfig.build.json` | PASS |
| ESLint всех 12 изменённых TS source/test files | PASS |
| Counterfactual baseline | 127 PASS / 0 FAIL |
| Original previous widget wiring | 1 expected failure; killed |
| Cancel removed from AE status admission | 27 expected failures; killed |
| Cross-capability caller alias accepted | 2 expected failures; killed |
| Completed cancellation source witness bypassed | 3 expected failures; killed |
| Post-result authority reread removed | 1 expected failure; killed |
| Original Client link binding removed | 1 expected failure; killed |
| Restored counterfactual copy | 127 PASS / 0 FAIL |

Counterfactuals выполняются в отдельной копии committed sources; рабочий checkout
не изменяется. Тесты/fixtures и их hashes одинаковы во всех вариантах. Timeout,
runtime error или отсутствие green baseline не считаются kill.

Проверены потеря ответа, отсутствие/подмена исходной операции, чужие tenant,
actor, capability, Client link/Appointment/external id, отзыв доступа, смена
source/adapter, post-read и post-mirror authority, concurrent read, expiry/claim
recovery и отсутствие dispatch. База/источник в этих проверках искусственные;
реальная блокировка PostgreSQL или поведение провайдера ими не сертифицированы.

`tsconfig.scripts.json`: **FAIL**, те же четыре ранее зафиксированные TS2339
в `reschedule-preference-carry.spec.ts` (142/144 appointment, 146/148 new_employee).
Новых diagnostics нет. Общая scripts typecheck не объявляется зелёной.

Промежуточный чрезмерно широкий запуск всех action-engine/crm suites был
остановлен при legacy Python guard-проверках; полного receipt у него нет,
он не используется как доказательство PASS. Свежий итог выше относится ровно к
37 явно перечисленным suites; список и hashes находятся в manifest.

## Evidence и границы

- [Summary](summary.json): candidate, source hashes, точные counts и effects.
- [Counterfactual receipt](counterfactual-proof.json): baseline, mutations, restored.
- [Raw local receipt manifest](receipt-manifest.json): пути/hash/размер исходных receipts.
- В этом проходе: provider/model calls **0**, real DB reads/writes **0**,
  production/OTP/YCLIENTS effects **0**; migration/deploy/grant **0**.
- Prepared Keychain helper не запускался, не перестраивался, не устанавливался.
  SHA256 `7bbe67dc6aed3cad83973eb00bb7e9849c7c93c8df8a21a27c94d121d0385a46`,
  CDHash `d41947ed7ac912609334207875996ffa9d9e0680`, install path отсутствует.
  Owner OS storage approval остаётся отдельным pending шагом.

## Что осталось

1. Сквозной текущий HTTP/PG/browser proof explicit cancel status на сохранённой
   receipt с controlled synthetic provider response loss; этот проход его не заменяет.
2. Живая проверка AChat/last-visit остаётся отдельной, в разрешённом владельцем
   окне и бюджете. Ключи/реальные данные в этом проходе не использовались.
3. Реальная cancel/create/move acceptance и release требуют отдельных действующих
   разрешений; этот локальный checkpoint ничего не деплоит и не активирует.

Это функциональный шаг первого полезного пути из delivery plan. C10, обучение
модели на разговорах, уведомления, дизайн и website здесь не выполнялись.
