# MAYA — подтверждённое чтение графика сотрудника через HTTP и C9

Отдельная проверка текущего chat прошла на runtime
`23a01139574202d8d39e9baee89c5375fdf8a7ba`: явный вопрос владельца → actual
planner validator → один C9 → текущий CRM source → ответ с филиалом, датой,
часовым поясом и сохранёнными READ receipts. Product code остаётся
`4e79cee63be047c461c7f56d1d7b3ff6c3e76935`; последующие изменения до этого
checkpoint относятся к proof harness.

Это локальное развитие привязки сотрудника и филиала. Модель scripted,
нативный YCLIENTS transport конечный и синтетический. Реальные provider/model,
A17 activation, browser, production и полная готовность MAYA/C10 не приняты.

## Что выполнено

Parent выделил serial slot для отдельного временного PostgreSQL и настоящего
AppModule HTTP. Auth guards, C9, AiToolRuntime, CRM owner и native adapter не
подменены. Fixture явно задаёт company→branch и StaffProviderLink; филиал имеет
Pacific/Kiritimati, tenant — Pacific/Honolulu. Дата строится в подтверждённом
поясе филиала. Подставленные моделью staff ID и дата 1999 года не используются.

Финальный R3: **2/2 Jest stages PASS**, между ними новый процесс приложения и
перезапуск PostgreSQL. **12 chat checkpoints: 9 HTTP 201, 2 HTTP 403, 1 HTTP 401**.
Два точных исходных вопроса («Кстати, Артём завтра работает?» и аналогичный про
Елену) получили source-qualified график. Отдельно подтверждены:

- неоднозначное имя — уточнение без чтения графика; полное имя — точный результат;
- другой/чужой филиал — blocked без provider READ; ограниченный филиалом actor — 403;
- чужой tenant не читает C9 run, его история пуста;
- повтор до и после рестарта сохраняет **тот же C9 run, work/execution refs и
  input/result hashes**, полный run/work graph не меняется, provider не перечитывается;
- decoded история восстанавливается из текущего владельца разговора;
- suspension membership внутри roster READ — 403 без schedule READ; следующий
  запрос — 401 без model/provider;
- изменение revision интеграции при том же request key — blocked без старого
  графика и без нового provider READ.

Зафиксированы 11 scripted planner calls и 5 synthetic native GET (из них три
schedule). Business snapshot одинаков до/после; recorder не увидел записей в
проверяемые business/action/notification families. Никакого business action или
outbound transport не разрешено. Это наблюдаемый периметр, не доказательство
отсутствия всех возможных side effects во всей системе.

При отзыве доступа фактический код — `conversation_principal_unavailable`:
HTTP подтверждает canonical current authority, но не изолирует конкретный новый
runtime guard. Source drift меняет `updatedAt`; смена компании этим не проверена.

## Evidence и воспроизводимость

[Архив](evidence/maya-employee-schedule-http-20261009/archive-manifest.json)
содержит 47 файлов плюс manifest; их суммарный размер 803337 bytes без manifest.
SHA256 archive manifest:
`526943810854719833ead0c025971e9299f9ef78ecd15867bedc8105cd8ff7a1`.
Финальный runner pin — **1840 source files** exact Git runtime; digest:
`75204e99888d67e8b18fb68b4990eebf4de81a08bd280293c3ade2b727fdca3f`.

[Независимый review](evidence/maya-employee-schedule-http-20261009/independent-review.json)
подтвердил source hashes, receipts, replay, отказы, decoded history и byte identity
38 raw файлов трёх запусков. Reviewer не писал probe и не запускал сервисы.
Четыре driver tests, финальные scoped TypeScript и ESLint — PASS.

R1 сохранён: fixture прислала выдуманный conversationId, canonical owner отказал
409 до модели/CRM. R2 prepare прошёл; resume упал на сравнении literal newline
с JSON-escaped history. R3 использует выданный сервером conversationId и
сравнивает decoded turn.text; foreign history дополнительно проверяется как
пустая, поэтому прежнее слабое negative comparison не считается доказательством.

Все три owned кластера остановлены: pg_ctl status=3, PID-файлов нет.
Ни одного process-group cleanup claim не сделано. Исходники в каждом запуске
проверены до stages и после cleanup; terminal cancellation не считается PASS.
Private restart receipts не включены в архив. Четыре исходных log файла содержат
пустую строку в конце и дают artifact-only diff warnings; bytes сохранены.
Source/probe diff check чист.

## Что осталось

**Remaining29 не изменён.** Эти два вопроса проверены изолированно с явными
новыми synthetic source facts; исходные полные диалоги не перезапускались и
старые raw результаты не переписаны. Frozen9, handoff и launcher hash совпадают
с прежними pins. Website, production, paid/model/provider gate не затронуты.

Следующая работа — существующий journal READ для одной даты и однозначного
сотрудника с source witness и branch timezone до самого CRM owner. При двух
Сашах отсутствие StaffProviderLink не доказывает другой филиал и не позволяет
выбирать первого. Own appointments остаются у authenticated account → verified
ClientChannelLink → mayaClientId; административный журнал не создаёт Client authority.
