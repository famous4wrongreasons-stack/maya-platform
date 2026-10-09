# MAYA — журнал выбранного сотрудника через текущий филиал CRM

В `84eedcb65820ebe063ca14cd5a8217e53187dcb3` подключён узкий полезный маршрут:
явный вопрос о записях одного сотрудника за один день → existing validated
`operations.journal_day` → current catalog/source → existing
`operations.journal.read` через один C9 → связный ответ с датой, филиалом,
часовым поясом и оговоркой о неполноте. **19 suites / 875 tests PASS**, scoped
TypeScript, production TypeScript, narrow ESLint и source diff check — PASS.
Независимый source/evidence review: новых blockers нет.

Это продолжение [HTTP checkpoint расписания](MAYA-EMPLOYEE-SCHEDULE-HTTP-CHECKPOINT-20261009.md).
Новый journal код проверен локальными компонентными тестами; предыдущий HTTP
runtime `23a01139` этим не переписывается. Новый combined journal HTTP/PG не запускался.

## Реализованная граница

- AiCore принимает только точный singleton journal task либо catalog→journal
  dependency. Сотрудник выбирается из текущего каталога, дата — из semantic period
  в подтверждённом branch timezone. Model staff ID/date не становятся источником.
  Отсутствующий catalog prerequisite даёт blocked до CRM/runtime.
- Тот же закрытый server source witness проходит existing runtime hash/current
  authority checks, handler, Analytics.getDayOperations, AppointmentPeriodReader
  и CrmService.getJournal. Перед/после awaited source/provider/cache проверяются
  текущее членство, feature policy, staff link, branch revision и captured adapter.
- Analytics остаётся единственным владельцем дневного среза и attendance. Его
  branch-local bounds проверены также для DST; provider-qualified staff ID
  берётся из witness. Period reader не превращает чужие staff rows в пустой ответ.
- Ответ использует только существующую PII-free проекцию журнала: время, услуга,
  статус CRM. Он явно сообщает неполноту и ограничивает отображение 12 строками;
  не выводит собственные totals, присутствие, прибыль или свободные окна.
- `completed` означает «отмечена завершённой в CRM», поскольку provider может
  присвоить этот статус одной оплатой. Это не утверждение о факте посещения.
- Native journal теперь требует реальный массив records и отказывает при потере
  выбранных записей без id/staff до нормализации. Existing requireProgress защищает
  повторяющиеся полные страницы. Корректный пустой массив остаётся полным.

Никаких новых tool schemas, ролей, Client permissions, CRM mutations, AE routes,
background initiators или второй orchestration системы. Существующая source scope
metadata расширена ровно на ещё один existing READ. Реальный provider/model не
вызывался; semantic JSON и provider transport в тестах явно synthetic.

Own appointments сохранили своего владельца: authenticated account → current
verified ClientChannelLink → Appointment.mayaClientId. Этот путь проверен
регрессией; journal не служит fallback и не создаёт права по имени или телефону.

## Evidence

[Архив и hashes](evidence/maya-employee-journal-owner-wiring-20261009/archive-manifest.json),
[16 source/spec files](evidence/maya-employee-journal-owner-wiring-20261009/source-files.json),
[независимый review](evidence/maya-employee-journal-owner-wiring-20261009/independent-review.json).
Финальный Jest report SHA256:
`b88311ef31e89f9bf2b025ca853e3277d99cfa0fd69fa002a2ee3ff9e226ae76`.

875 — итоговый набор, **не сумма** предыдущих прогонов. Он включает native decoder,
actual planner validator, handler/runtime, CRM/period/analytics owners, existing
journal consolidation, schedule, own-appointments, C9 и architecture boundary.
Все 19 suites выполнены, skips нет. Component/runtime/CRM doubles не доказывают
actual PostgreSQL journal receipts, restart или natural-language selection.

R1 сохранён: 84 PASS / 1 FAIL из-за неверного ожидания `attendance.arrived=null`
в raw Analytics. Канон сохраняет raw 0 при `measured_incomplete`; исправленный
тест проверяет этот state и точную incomplete reason. Публичный handler по-прежнему
маскирует непроверенное значение в null, presenter его не публикует.

Начальный scoped typecheck также показал ошибки новых test doubles (исправлены)
и существующие Jest generic ошибки большого legacy adapter spec. Новые native
проверки вынесены в отдельный spec; старый файл восстановлен byte-identical и
продолжает входить в финальные 875 tests. Все восемь изменённых/новых specs проходят
scoped tsc. Последняя правка после Jest — только ESLint перенос строки теста.
Исходные failed type/lint logs сохранены; whitespace raw logs не нормализуется.
Только два исходных lint log дают artifact-only blank-at-EOF diff warnings;
source/spec и checkpoint prose diff чисты.

## Что это не закрывает

**Remaining29 неизменён.** Original `mt-ambiguous_entity_resolution-15` имеет двух
Саш, но его frozen fixture не содержит достаточных company→branch/StaffProviderLink
фактов. Отсутствие связи у второго кандидата не является доказательством другого
филиала. Новый маршрут даёт пользу для однозначного сотрудника; исходные два turn
не объявлены PASS и raw full48 не пересчитан.

Следующий отдельный gate — новый journal HTTP/auth/C9/PG proof с явными synthetic
source facts, сохранёнными receipts, restart и текущей authority. Он требует
согласованного parent serial slot; выделенный здесь HTTP gate относился к расписанию
и уже завершён с cleanup. Дополнительный тяжёлый запуск не выполнялся.
Live YCLIENTS/model, browser/device, A17 activation и full-dialogue acceptance
остаются отдельными проверками. Native tightening затрагивает также unscoped
malformed/repeating-page journal responses; это намеренный отказ от ложной полноты,
не universal validation всех полей CRM.

Frozen9/handoff и рабочий сайт не изменены, push/merge/deploy не выполнялись.
MAYA/C10 overall остаются NOT_ISSUED; фоновой автономии этот checkpoint не разрешает.
