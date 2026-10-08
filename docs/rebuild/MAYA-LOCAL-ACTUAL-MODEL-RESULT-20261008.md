# Первый локальный actual-model прогон Майи

**DeepSeek подключён и ответил на три запроса; разговорный прогон остановлен
локальным ограничением размера четвёртого запроса. Качественная приёмка не пройдена.**

Tested candidate: `5cc0b7178ccdbf3d6cdb50be5de3f3cd7a43dbf5`.
Runtime implementation: `01f5f9238719a1f30bf32f7256d840b4333ebc5b`.
Manifest: `3388afc329e037bd5885bb6fb2194a6148ff9f116be992dd6bcb2ae7d7de6072`.
Run ID: `75f01f49-ec6d-4ef1-bf71-283681b278bc`.

[Evidence manifest](evidence/local-actual-model-20261008/manifest.json),
[terminal outcome и cleanup](evidence/local-actual-model-20261008/terminal-outcome.json),
[реальные ответы приложения](evidence/local-actual-model-20261008/runner/actual-http-turns.jsonl),
[ответы и usage DeepSeek](evidence/local-actual-model-20261008/broker/model-responses.jsonl).

## Что выполнено

Владелец разрешил один запуск до $2 / 12 provider requests / 10 минут
(`Sentinel_6165ce8c24948191be7d5f8dd0bc242e`) и подтвердил готовность на Mac
(`Sentinel_6542aa252c588191a18eb3336e874871`). Создан один permit с окном
23:31:22.361–23:41:22.361 UTC, один claim. Ключ введён владельцем вручную в
скрытый Terminal брокера, агент не читал TTY/clipboard/ключ. Повторных permit,
runner, ввода или сброса ledger не было.

Endpoint: `POST https://api.deepseek.com/chat/completions`, модель
`deepseek-v4-pro`, non-thinking, non-streaming. Fresh synthetic PG,
реальный application HTTP, native serializer, существующий bounded broker.
Все внешние model requests получили HTTP 200; сетевых запросов в CRM было 0.

## Фактический разговор

| Ход | Фактический результат приложения |
| --- | --- |
| Client: «Есть время к Артёму завтра на мужскую стрижку?» | HTTP 201, «Выберите подходящее время. Затем проверьте детали и подтвердите запись.» Выполнены catalog/availability READ, источник `safe_fallback`. |
| Client: «Запиши меня на 17:00» | HTTP 201, та же подсказка. Модель выдала `booking.create_own`, но action отсутствует, pending approvals пусты, только READ work. Подготовка записи и подтверждения не доказана. |
| Owner: общий обзор за сегодня + окна после отмен + следующий шаг | HTTP 201, явное уточнение о допустимости ограниченного опубликованного обзора. Финансовая/Occupancy recommendation ещё не создана. |
| Owner: «Да, такой ограниченный обзор» | HTTP 503. Тело следующего model request — **99 820 байт**, лимит — **98 304**. `candidate_body_limit` сработал локально; четвёртого provider request не было. |
| Administrator: private-data refusal | Не достигнут; после ошибки replay остановлен. |

Итого: 4 HTTP хода из 5 запланированных, 4 обращения к model method/serializer,
**3 фактических запроса и 3 ответа провайдера**, 2 начатых диалога из 3.
Метка `modelCoverage=ACTUAL_MODEL_OUTPUT_UNGRADED` в исходном HTTP report
присвоена и заблокированному четвёртому ходу; это неточная метка, а не четвёртый
ответ модели. Raw evidence сохранено без исправления задним числом.

HTTP replay сохранил предыдущие реальные ответы. При этом `modelObservations`
показывает `historyRoles: [user,user]` на follow-up ходах: перенос assistant
history в model context требует отдельного разбора. Полнота истории этим
checkpoint не объявляется подтверждённой.

## Расход и границы

Provider usage: 49 674 input tokens (48 394 cache-miss, 1 280 cache-hit),
1 017 output tokens. Reserved budget в ledger — **$0.33911196**; это резерв,
не счёт провайдера. По опубликованным тарифам и returned usage расчёт составляет
**$0.03398186 off-peak**, либо $0.06796372 по верхнему peak тарифу. Вызовы шли
в 23:33 UTC, вне опубликованных peak окон. Баланс и итоговое списание аккаунта
не запрашивались. [Официальные тарифы](https://api-docs.deepseek.com/quick_start/pricing/)
проверены в 23:02:42 UTC; snapshot observation находится в evidence.

У всех четырёх наблюдённых HTTP ходов business hash неизменен, business writes
пусты; forbidden effects пусты. Synthetic C7 preflight использовал конечные
поддельные GET через native YCLIENTS adapter, без CRM network. Это не проверка
живых филиалов и не бизнес-запись.

## Остановка и дальнейшая работа

Runner завершился с exit 1, отправил `/finish`, broker остановлен с причиной
`explicit_finish`. Broker PID отсутствует, Unix socket отсутствует, своя PG
остановлена, postmaster.pid отсутствует, все 6 owned process groups отсутствуют.
Источник не менялся в ходе прогона. Permit и spent claim сохранены; повтор запрещён.
Ключ программно не сохранялся в файлы/Keychain/env и не передавался runner;
процесс broker завершён. Самостоятельный повторный платный запуск не разрешён.

Следующие безопасные действия — локальный разбор и исправление:

1. Сократить модельный контекст/каталог инструментов и проверить границы размера,
   сохранив фиксированный предел 98 304 байт и исходный бюджет.
2. Исправить потерю продолжения booking: реальный запрос на 17:00 должен доходить
   до нужного подтверждаемого предложения, а не повторять подсказку availability.
3. Проверить перенос реальных assistant replies и prior plan в модельный контекст.
4. Исправить метку provider coverage для отказа до network.

Новый actual-model прогон потребует отдельного разрешения; оставшийся лимит
этого закрытого запуска не переносится. Рабочий сайт, production, live YCLIENTS,
телефон, notifications и background autonomy не затронуты.
