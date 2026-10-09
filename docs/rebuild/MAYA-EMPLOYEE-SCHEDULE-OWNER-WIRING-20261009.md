# MAYA — график выбранного сотрудника через текущий CRM source

Реализована полезная связь: валидированный запрос графика сотрудника → существующий
C9 catalog READ → однозначный сотрудник текущего каталога → существующая CRM-связь
компании, филиала и StaffProviderLink → существующий READ графика → один ответ с
датой, филиалом и его часовым поясом. Модель не выбирает provider ID или дату вместо
этой проверки. Новая схема, роли, разрешения и бизнес-действия не добавлены.

Это development checkpoint с локальными компонентными проверками. **Новый HTTP/PG
прогон ещё не выполнен; прежние 52 PASS / 14 unsupported / 15 insufficient не
пересчитаны, remaining 29 не уменьшен.** Полная MAYA/C10 и live YCLIENTS не приняты.

## Сначала — точная классификация прежних 13 ошибок

Предыдущий checkpoint: `8c914957ce0da8cacd468afdf01975bb62d397ad`.
[Покейсовая независимая сверка](MAYA-PREVIOUS-13-INDEPENDENT-CLASSIFICATION-20261009.md)
содержит все исходные и новые ответы, их hashes, прежние и новые assertions,
canonical source justification. SHA-256 документа:
`b49424882b819dc3896286b5fd95609b7538bfc61a03b44656bb3809de7cf3f1`.

- Три ограниченных PASS: published PARTIAL BI (`current-bi-ordinary:1`), exact C8
  policy (`current-lifecycle-ordinary:1`), own READ с сохранением пожелания переноса
  (`mt-cancel_pending_action-15:1`). Последний не переносит запись и не проверяет
  availability. BI имеет раскрытый вклад runtime + исправление fixture + oracle.
- Четыре finance (`mt-finance_follow_up-7/10`, turns 1/3): нужные периоды действительно
  прочитаны, но текущий C7 producer безусловно создаёт confirmed_cash/refunds/profit
  как NOT_MEASURED. Это незавершённая функция источника; недостаточная fixture и
  узкий oracle gap — отдельные причины, не замена продуктовой задачи.
- Четыре retention (`mt-retention_drill_down-0/15`, turns 2/3): условия сохранены,
  нужные cohort/regularity/priority этим path не реализованы. READ не наблюдался.
- Два journal (`mt-ambiguous_entity_resolution-15`, turns 1/2): scripted intent
  исправлен, но 0 READ / 0 work. Связь с существующим owner остаётся продуктовой
  задачей; отсутствие staff-to-branch в fixture не объясняет всё.

Отдельный reviewer, не писавший прежний код, evaluator или документ, подтвердил все
26 ответов/hashes, 13 переходов, неизменность остальных 68 статусов и эти границы.
Первый автор аудита раскрывает собственное участие в прежнем reschedule helper;
его вывод не используется как единственная независимая приёмка этого helper.

## Что изменено в текущем коде

`employee-schedule-read.ts` принимает только существующий валидированный
`schedule.get_team` с employee preference, отдельно либо после точного зависимого
`employees.list_public`. Он не распознаёт новую цель и не выдаёт полномочий.
Дата берётся из semantic preference в timezone проверенного филиала; singleton
tenant, имя филиала и роль пользователя сами по себе source mapping не создают.

Два READ проходят через existing `AiCore.executeChatTool` → C9 conversation READ.
Оба имеют отдельные idempotency keys и конечный source scope, привязанный к текущей
CRM revision. График требует точного StaffProviderLink и принадлежности сотрудника
к выбранному филиалу. Произвольные model staff_id/date не используются. Ambiguous
имя не выбирает первую строку; unresolved branch без значения не заменяется
настроенным филиалом. Opaque name/branch mention разрешается только текущей картой
request-local references. Нет hardcoded pilot IDs, второго model completion,
нового orchestrator или цикла поиска.

Runtime копирует и проверяет закрытый server-only witness для ровно двух tools,
включает его в existing read input hash и проверяет source до/после awaited work,
cache replay и widget awaits. Handler передаёт existing StaffScheduleSource в CRM
reader, который уже проверяет company/branch/staff/adapter. Returned staff/date,
slots и timezone должны совпасть. В scoped slots остаются только from/to.

Текущий membership ID, tenant, user, role, branch и active membership/user/tenant
проверяются повторно. Existing policy остаётся владельцем features/capability.
Foreign/revoked principal возвращает Forbidden, а не «нет данных». Поздний отказ
C9 finish не глотается для нового ответа; INCOMPLETE/STOPPED не дают verified reply.
Новый presentation не создаёт REPORT_CARD или mutation action. Replay явно назван
сохранённым результатом: текущий metadata witness не доказывает новый provider GET.

Own appointments остаются у существующего verified Client owner. Их source trace
включён в регрессию; чужой journal/roster не используется как собственные записи.
Unscoped legacy team READ этой конечной привязкой не переопределён.

## Проверки и независимое review

Основной набор: 554 tests / 8 suites PASS. Включены новый binder/presenter, actual
planner JSON parser + CI validator + AiCore, runtime/handler, own appointment trace,
existing CRM staff-source fences и C9 conversation READ. Provider/runtime doubles
в компонентных тестах явно помечены; это не actual HTTP или реальное качество LLM.

Production TypeScript, scoped TypeScript четырёх spec и dependencies, narrow ESLint
и source/spec diff check — PASS; результаты сохранены в evidence. Ошибки первых запусков
не удаляются: wrong test spy boundary, wrong captured pre-restored plan, слишком
широкий ConflictException sanitizer в новом finite catch, test spy receiver, tmp
typeRoots, недостающие поля test actor и generic-типы старых Jest/receipt fixtures.
В shared receipt fixture изменена только типизация существующей generic обёртки.

Независимое source review выявило и закрыло: unresolved branch substitution,
лишние post-runtime metadata awaits, поздний C9 denial и несогласованный slots cap.
Реальная проверка current membership добавлена после обнаружения, что existing
policy hook сам по себе не перечитывает membership. Review не выдаёт HTTP, restart,
native CRM или model acceptance.

## Следующая проверка и оставшиеся связи

Целевые строки remaining 29: `followup-owner-topic-switch:2` и
`mt-topic_switch_and_return-17:2`. Оба запроса спрашивают график выбранного
сотрудника. Новый owner wiring проверен компонентно; их HTTP verdict остаётся
insufficient_evidence до отдельного actual traversal. Это не новый PASS счётчик.

**Отсутствующая fixture:** старый full48 source builder сохраняет branchBinding
только для occupancy; manager schedule cases не создают StaffProviderLink к филиалу.
Он не может стать positive proof этого owner path просто от нового текста ответа.
Старые raw остаются неизменными. Для отдельной новой positive fixture нужно явно
задать existing company→branch binding и current staff link; отрицательные варианты
без них должны сохраниться.

**Отсутствующие product data:** при неточной/отозванной CRM binding, отсутствующем
StaffProviderLink или неоднозначном сотруднике новый путь честно останавливается.
Заполненные текущие owner records позволяют работать с одной доказанной компанией
и филиалом без решения о будущих multi-company. Связи не выводятся из названий.

**Capability не реализована этим изменением:** неоднозначный journal после выбора
филиала, employee-specific service/price, branch public profile, retention cohort,
cash/refunds/profit и прочие строки remaining 29. Pricing lane остаётся отдельной.
График смен не доказывает свободные окна или возможность выполнить услугу.

Следующий конкретный gate: serial local synthetic HTTP/PG на новом code checkpoint:
actual parser → C9 two persisted READs → exact bound owner source, повтор запроса,
смена revision, ambiguity, missing mapping, branch/tenant mismatch и revocation;
нулевые business mutations/outbound и полная очистка owned processes. Для тяжёлого
HTTP/PG slot требуется координация parent согласно исходному делегированию. Эта
волна не запускает его без координации и не объявляет прежние score новым runtime.

Website, frozen9, union handoff, provider/model/Keychain/prompt, production,
HTTPS/phone, push/merge не изменялись и не запускались.

## Сохранённый код и evidence

Code commit: `4e79cee63be047c461c7f56d1d7b3ff6c3e76935` на
`codex/maya-offline48-semantics-20261009`, отдельный worktree
`/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics`.

[Manifest](evidence/maya-employee-schedule-owner-wiring-20261009/manifest.json):
31 file / 1,230,696 bytes; SHA-256
`96c98d13c475866ab8c000c893d59db26a05aa864d0e1af1339943d897110dc4`.
Сохранены RED/PASS logs, финальные type/lint результаты, квалификация независимого
review и hashes всех 11 изменённых source/spec files против code commit.
Все 100 entries предыдущего owner-periods evidence повторно проверены неизменными.
Frozen9 остаётся `b74d62851de075a48f2c10bf5da48524c8ca0e47`, handoff —
`3faa0c4f8934c8c67a8fc564936c3f8070ce8a67`.

Raw logs сохранены побайтно: два первых ESLint failure logs содержат исходную
пустую строку в конце, поэтому aggregate diff check сообщает только эти artifact
whitespace warnings. Product/source/spec diff проверен отдельно и чист.
