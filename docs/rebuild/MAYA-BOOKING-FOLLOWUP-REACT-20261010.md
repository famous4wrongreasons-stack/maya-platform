# Текущий React: подтверждение записи, перенос и отмена

**Одна synthetic запись создана на 17:00, перенесена на 17:30 и отменена через текущий React и канонических владельцев операций. Сохранённые результаты операций восстановлены после перезагрузки и повторного входа.** Исправлена воспроизведённая ошибка: после переноса и отмены интерфейс показывал «Запись подтверждена». Теперь сохранённая квитанция даёт «Запись перенесена» и «Запись отменена».

Исполнявшийся commit: `6ed41427827e5bceee3e98842d5116044d3628c4`, ветка `codex/maya-conversation-continuation-20261009`. Квалификация: **PASS — bounded current React lifecycle / scripted semantics / synthetic internal CRM**. Реальный YCLIENTS, live model lifecycle, весь C10 и готовность всей MAYA не приняты. Рабочий сайт, production, ключи и прежние model permits не использовались.

## Что было проверено

Предыдущий настоящий ответ на «Запиши меня на 17:00» корректно остановился перед исполнением: «Откройте его, чтобы проверить детали и подтвердить запись. Запись ещё не создана». В сохранённом DOM была карточка «Проверьте выбранное время» с вариантом на 17:00. Отсутствие записи на этом этапе — ожидаемое поведение, не дефект create.

Полный старый подписанный envelope не был сохранён. Поэтому новый прогон не объявляется продолжением старой сессии или исполнением старого токена. Он использует свежие локальные строки той же fixture: `bindCandidateSource`, verified Client link, услуга «Мужская стрижка», мастер «Артём», branch setup из `core-conversation-http.probe-spec.ts`. Предпочтения берутся из настоящего conversation state. Только решения модели заданы явно scripted; auth, HTTP, React, widget gates, preview, COMMIT и AE настоящие.

| Шаг через UI | Состояние после шага |
|---|---|
| «Есть время к Артёму завтра на мужскую стрижку?» → «Запиши меня на 17:00» | TIME_SLOT_SELECTOR с одним выбранным временем; 0 Appointment / 0 AE |
| Нажать время 11.10.2026, 17:00 Europe/Moscow | BOOKING_CONFIRMATION, Артём, мужская стрижка, 30 минут, synthetic 1500 RUB; ещё 0 записей |
| «Подтвердить запись» | Одна Appointment, confirmed, 17:00; create SUCCEEDED, одна попытка; «Запись подтверждена» |
| «Покажи мои записи» → «Проверить перенос» | Текущий owner предлагает 17:30; preview не изменяет запись |
| «Подтвердить перенос» | Та же Appointment и Client/service/staff, начало 17:30; reschedule SUCCEEDED, одна попытка; «Запись перенесена» |
| «Покажи мои записи» → строка «Мужская стрижка» | Существующий detail intent строки открывает preview отмены |
| «Подтвердить отмену» | Та же Appointment, canceled; cancel SUCCEEDED, одна попытка; «Запись отменена» |
| Перезагрузка → повторный canonical email login | Восстановлены результаты операций с правильной строкой отмены; новых COMMIT и AE нет |

У текущего carrier credentials находятся в памяти. Повторный вход соблюдает обычный 60-секундный resend limit; тест ждёт 61 секунду, не отключает ограничение и не внедряет токен.

R4: **2 UI-входа, 4 chat POST, 6 widget intent POST, 11 checkpoint**, ровно одна Appointment и три SUCCEEDED AE с `executionAttemptCount=1`. Проверки соединяют конкретный widget ID запроса, текущие видимые controls, domain state и результат операции. Ноль вызовов настоящей модели и внешнего CRM adapter; fetch заблокирован. Это реальные бизнес-изменения только в собственной synthetic БД, не заявление «вообще ноль mutations».

[Browser DOM и клики](evidence/maya-booking-followup-react-20261010/r4/current-react/browser.json), [domain observations](evidence/maya-booking-followup-react-20261010/r4/booking-followup-observations.json), [manifest](evidence/maya-booking-followup-react-20261010/r4/manifest.json), [Jest](evidence/maya-booking-followup-react-20261010/r4/browser-jest.json).

## Изменение и сохранённые неудачные попытки

`WidgetThreadPageService` формирует текст из сохранённого AE COMMIT capability и ровно одной ACCEPTED квитанции с совпадающим `actionReceiptRef`. Enum `CONFIRMED` означает подтверждённую операцию и сохранён. Ввод пользователя, название кнопки, неподтверждённый receipt и CONTROL не выбирают вид операции. Новая схема, retention, полномочия и мутационные владельцы не менялись. Исправление действует на свежую выдачу и историю; старые артефакты не переписаны.

- **R1 / 401ee1e2 — FAIL:** create состоялся, затем probe выбрал старый dismiss из-за одинакового локального `i2`. Исправлен тест: последний видимый control и обязательное совпадение отправленного widget ID с текущим envelope. Runtime это не меняло.
- **R2 / 3d7478b9 — FAIL:** все три операции состоялись, но probe ждал авторизованную историю после reload без повторного входа. DOM доказал отдельный реальный дефект общего текста «Запись подтверждена» для cancel/reschedule.
- **R3 / c007838f — FAIL:** повторный вход получил ожидаемый 429 resend limit; не дошёл до проверки строки после reload. Исправлено ожидание обычного cooldown.
- **R4 / 6ed41427 — PASS:** правильные operation-specific строки проверены сразу после COMMIT и отмена — после повторного входа; история не вызвала новых операций.

Все raw попытки и их статусы сохранены отдельно. Driver после cleanup проверяет исходный HEAD, inventory, bytes и чистоту scoped source; cancellation во время cleanup больше не может закончиться PASS. Scope manifest не включал `prisma.config.ts`: файл дополнительно сопоставлен с exact Git candidate после прогона, его hash сохранён в verification. Непрерывная фиксация этого дополнительного файла не заявляется.

**67 targeted tests PASS**, scoped TypeScript/ESLint и Node syntax checks PASS. Собственные PostgreSQL и Chrome остановлены во всех четырёх попытках. [Проверки и cleanup](evidence/maya-booking-followup-react-20261010/checks/verification.json). Все **52 файла** прежнего real-model evidence проверены по сохранённым hash и неизменны, включая [пять точных ответов](evidence/maya-current-react-real-model-20261010/actual-dialogues.md). Новых платных вызовов нет.

[Независимый read-only review](evidence/maya-booking-followup-react-20261010/independent-review.json): qualified PASS для этого checkpoint. Подтверждены все 2421 source hash по candidate Git и диску, сохранённые состояния/квитанции и неизменность прежнего evidence. [Индекс hash нового архива](evidence/maya-booking-followup-react-20261010/SHA256SUMS.json).

## Что ещё мешает реальному пилоту

Read-only аудит действующего кода обнаружил **source-binding gap отмены**. Personal schedule и Gate 11 перечитывают owned Appointment; COMMIT передаёт appointment ID; cancel owner сохраняет external ID и выбирает текущий adapter. AE policy проверяет tenant, Client, локальную запись и provider, но не company ID / branch revision. При смене active company A → B внутри того же YCLIENTS provider между preview и COMMIT прежний provider-local record ID может попасть в запрос к B. Это подтверждённый анализ цепочки кода, **drift runtime NOT_EXERCISED**. Synthetic internal-calendar PASS этот gap не закрывает.

Точки проверки: [Gate 11](../../maya-saas-backend/src/widgets/owner-ports/noun-resolution.owners.provider.ts), [COMMIT adapter](../../maya-saas-backend/src/widgets/owner-ports/commit-booking.adapter.ts), [cancel owner](../../maya-saas-backend/src/crm/client-appointment-cancel.service.ts), [AE policy](../../maya-saas-backend/src/action-engine/action-engine.policy-resolver.ts), [CRM source и cancel dispatch](../../maya-saas-backend/src/crm/crm.service.ts). Native reschedule уже проверяет origin canonical create и source identity; старый импортированный record ID не равен подходящему origin.

Перед реальными CRM действиями нужны ограниченные следующие шаги:

1. Исправить source fence отмены в существующем владельце, воспроизвести company/branch/source drift локально и доказать отказ до provider DELETE. Отдельно определить обработку UNKNOWN: текущий widget receipt reader поддерживает create/reschedule, но не cancel. При UNKNOWN остановить последовательность без нового ключа операции.
2. Проверить конкретные несекретные метаданные пилота: tenant, active YCLIENTS integration, точная `maya.crm-branch-binding/1` пара company ↔ tenant-owned branch, timezone и source revision. Текущая реализация обслуживает одну явную пару; один company ID не доказывает готовность всех филиалов.
3. Подтвердить одного тестового Client: действующую account session/membership, ровно один verified `maya_user` ClientChannelLink, отсутствие merge/identity hold, роль CLIENT/CUSTOMER для own controls и нужные entitlements. Consent проверить отдельно: channel runtime явно проверяет canonical consent, account create owner такого gate сейчас не содержит. Login и booking confirmation не служат доказательством consent.
4. Проверить каталог, будущие окна и точные service/staff IDs этого источника, цену/currency/duration, live booking configuration и права credentials на read/create/PUT/cancel. Наличие кода не доказывает реальные provider permissions; notification flags не гарантируют отсутствие собственных YCLIENTS automations.
5. После закрытия блокеров и точного разрешения реального действия выполнить один ограниченный create → own reschedule → cancel: свежий preview и отдельное подтверждение на каждом этапе, canonical receipt и неизменная идентичность записи. Этот checkpoint сам по себе такое выполнение не разрешает.

Реальные tenant/company/branch/Client/consent/provider privileges здесь не читались. Нет доступа к secrets, live provider, SSH или production.

Остались также подтверждённые ограничения UI: «АДМИНИСТРАТОР» в заголовке Client fixture; «Нет данных» в selector; preview переноса/отмены показывает внутренние service/staff ID и UTC timestamps; вход в отмену скрыт за строкой услуги. После reload виден текст «Не все ответы сохранены»: восстановление результатов операций не доказывает полноту всей переписки. Operation-specific terminal fix не исправляет эти детали и не объявляет весь UX готовым.
