# Собственная запись: понятное подтверждение переноса и отмены

12 октября 2026. Ветка `codex/maya-local-crm-setup-20261010`.
Product commit: `8bd701e5d0c7e81ebcb09548b97542017ff4c324`.
Последний executable checkpoint: `cd15a31a7e24773c1d7119315397a132a75ec6a2`.

**LOCAL SYNTHETIC PASS. Не release certification и не живая приёмка YCLIENTS.**
Последующие executable изменения затронули только подготовку и assertions двух
старых proofs. Backend product, runtime и React bytes после `8bd701e5` неизменны.

## Наблюдение и исправление

На исходном `06bc12e3` полный текущий React-сценарий прошёл создание, перенос,
отмену и повторный вход, но карточки переноса/отмены показывали внутренние ID
услуги/мастера и UTC ISO вместо понятных названий и времени салона. Это дефект
представления серверного подтверждения, а не отсутствие всей booking-функции.
Два новых первоначальных regression tests падали на старом adapter именно по
этим полям; raw before-результат сохранён в manifest.

Существующий backend preview теперь получает названия через canonical personal
appointment reader. Точная строка сверяется с уже разрешённой записью: tenant,
appointment, branch, source, CRM identity, staff/service IDs, даты и revision.
После ожидаемого чтения названий повторно проверяются действующие Client/link,
источник и снимок записи через существующий read-only owner. Исключение даёт
обычный REFUSED. Авторитетом остаются серверные handles и существующий Action
Engine; названия не дают прав и не заменяют identity.

Время форматируется в canonical timezone; у переноса видны прежнее и новое
время. ISO instants сохраняются без изменения. Отсутствие каталога даёт честное
«Название услуги недоступно» / «Имя мастера недоступно», без показа ID как имени.
При смене услуги/мастера старое название не приписывается новому выбору.
React, визуальный дизайн, provider mutations, цены, роли и схемы не изменены.

## Свежие проверки

| Поверхность | Результат | Candidate / граница |
| --- | --- | --- |
| Scoped backend, 10 suites | 183 PASS / 0 FAIL | Product bytes `8bd701e5` |
| Целевые mutations | 6/6 killed; baseline/restored 30/30 PASS | `8bd701e5`, disposable source copy; crash/timeout не считаются PASS |
| Actual React → HTTP/AppModule → PG, создание → перенос → отмена → повторный вход | 11 checkpoints PASS | `8bd701e5`, synthetic internal calendar и scripted planner |
| Native YCLIENTS adapter, HTTP/PG cancellation | 21/21 PASS | `cd15a31a`, только finite synthetic transport |
| Native create/reschedule, настоящий restart backend/PG | 2 stages, 6 checkpoints PASS | `69b1b987`, provider ответы искусственные; внешний транспорт закрыт |
| История через ordinary full trial, без прямых entitlement overrides | 18/18 PASS | `462c08bf`, actual React/HTTP/PG, scripted model |
| History proof/privacy guards | 8/8 PASS | Текущие executable bytes |
| Backend/widgets-live types, scoped lint | PASS | Журналы и hashes в manifest |
| Widget Contract / K3 architectural check | PASS / 10 из 10 PASS | Глобальные защитные правила не ослаблены |

В browser-сценарии одна Appointment сохраняет identity: 17:00 → 17:30 → canceled.
Ровно три соответствующих ActionExecution, каждый SUCCEEDED с одной execution
attempt; повторный вход не создаёт новую запись. Проверены реальные тексты обеих
карточек с именами и местным временем. Это internal-calendar proof; внешний native
adapter отдельно проверен на синтетических ответах, включая lost reply и restart.

## Устаревшие proofs и сохранённые неудачные попытки

- K3 сначала дал 9/10: старый history harness напрямую создавал пять обычных
  entitlement overrides. Он не включал `widgets.runtime`, но нарушал правило
  единственного writer. Overrides удалены, обычный full trial проверен через
  production resolver; entitlement rows = 0, runtime disabled. Checker не изменён.
- Старый cancel-source proof не передавал обязательный CRM `expectedVersion`:
  21 setup failures до booking. Setup теперь читает текущую версию обычным HTTP
  status и передаёт CAS при connect/activate.
- Смена уже импортированного company/branch теперь канонически запрещена
  (`crm_import_scope_migration_unsupported`). Proof проверяет этот отказ, а затем
  отдельно в своей disposable DB внедряет out-of-band drift для проверки fence.
  Он не объявляет такую смену разрешённой product operation.
- С `0149f668` неизвестный результат отмены уступает управление после одного
  inconclusive read. Два следующих явных bounded HTTP receipt reads доводят
  существующий лимит до MANUAL_REQUIRED; один DELETE, без повторного dispatch.
  Старое ожидание трёх автоматических чтений исправлено, потолок не увеличен.
- При обновлении harness выявлены и исправлены nullable initial connection,
  неверное имя relation в тесте и отсутствующий bounded `thread_page`. Эти
  failed receipts также сохранены. Финальная матрица 21/21 запущена полностью.

## Что остаётся

1. Повторная живая проверка «история → последний визит» после `880b4653` ещё
   открыта: scripted модель не доказывает выбор реального DeepSeek. Использовать
   сохранённые ключи можно только в новом разрешённом окне; повторять настройку
   CRM, Telegram binding или импорт не требуется.
2. Реальный create → reschedule → cancel в YCLIENTS и приёмка владельцем требуют
   отдельного явного разрешения. Синтетические PASS не заменяют эту проверку.
3. Полный release programme, текущая mobile/voice приёмка, messenger delivery,
   остальные owner/staff/agent workflows и C10 этим unit не закрыты.

Реальные ключи, сохранённая owner DB и production не использовались. Реальные
model/provider calls, OTP/SMS/messages, YCLIENTS effects и iPhone operations: 0.
Миграции выполнялись только при создании одноразовых тестовых PG. Все созданные
этими proofs серверы остановлены. Полный backend CI и release mutation corpus
не запускались; scoped результаты не выдаются за новый полный сертификат.

- [Проверенные aggregates и фактические candidates](summary.json)
- [Шесть counterfactuals, green baseline/restored](targeted-mutations.json)
- [Raw receipts: локальные пути, размеры и SHA256, включая failures](raw-manifest.json)
