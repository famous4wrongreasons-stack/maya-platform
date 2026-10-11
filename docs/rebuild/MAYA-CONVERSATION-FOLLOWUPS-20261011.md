# MAYA — продолжение разговора и перенос, 11 октября 2026

На `c9e012e7e8b1810b24db29ca890238097ff33d97` короткое уточнение переноса
сохраняет ранее названный день/время. Например: «на пятницу» → «в 20:00» →
«лучше в 19:00» → «а на субботу?» сохраняет последовательно нужные пожелания,
не выбирая за человека запись или доступный слот. Ответ задаёт один следующий
вопрос и ясно отделяет пожелание от выполненного переноса.

Фактический ответ в новом локальном HTTP-прогоне:

> Поняла: пятница, 19:00. Какую запись хотите перенести? Доступность ещё нужно проверить; перенос пока не выполнен.

Это наблюдение на scripted model + synthetic source, не оценка живой модели.
Слова не выбирают маршрут: существующий semantic planner определяет intent,
существующие owners проверяют источники, права, подтверждение и выполнение.

## Что изменилось

- `37114e99`: устранена воспроизведённая потеря `new_date` при коротком ответе
  с `new_time`. Ранее server carry покрывал prepare/find/create, но не этот
  unresolved reschedule. Четыре regressions до исправления упали именно на
  отсутствующей дате.
- Carry ограничен одним неподтверждённым переносом без выбранной записи/нового
  мастера; допустим его существующий prerequisite `own list`. Только текущие
  разрешённые capabilities, ясный follow-up и конечные date/time preferences.
  Appointment identity, новый мастер, source result, receipt и authority не
  переносятся. Новая просьба, другой intent, STOP, неизвестный/недоступный owner,
  низкая уверенность, unresolved значение и невалидный день/время не получают carry.
- После смены локального дня или timezone относительный `new_date` и weekday
  удаляются из retained model context. ISO day остаётся пожеланием; это не
  подтверждение доступности. Нового memory store, issuer или writer нет.
- `c9e012e7`: узкое уточнение переноса стало короче и разговорнее. Один вопрос
  вместо служебного перечня полей; информация об отсутствии результата сохранена.
  Отказы по ролям, недоступности и другие mutation branches не изменены.

## Проверки

[Summary и hashes исходных receipts](evidence/maya-conversation-followups-20261011/summary.json).

| Проверка | Результат и граница |
| --- | --- |
| Unit cohort | 433/433 PASS, 5 suites. Planner, AiCore, formatter, own-read prerequisite |
| Реальные локальные HTTP/auth/C9/PG | 6/6 PASS: контекст переноса, новый login, STOP, own/foreign source, текущая ревокация |
| Existing booking/UNKNOWN cohort | 9/9 PASS: 10-replica catalog conversation, canonical selector → headless carrier → preview/confirm → one synthetic AE create; provider UNKNOWN tests |
| Targeted mutations | 5/5 killed, baseline/restored 381/381 PASS. Потеря carry, перезапись исправления, наследование новой просьбой, carry выбранной записи, устаревший относительный день |
| Types/lint | Widgets-live types и scoped ESLint PASS; backend build types записаны отдельно в summary |
| Source/cleanup | HTTP выполнен на clean committed `c9e012e7`; 2064 source hashes неизменны, собственный PG остановлен, PID-файл отсутствует |

Новый перенос проверяет сохранённый conversation между запросами и свежим login;
это не process/PG restart. В собственном списке его fixture нет визитов: ни один
визит не выбирался автоматически. Создание тестовой записи проверяет отдельный
существующий booking cohort. Реального переноса/отмены этим checkpoint не заявлено.

Повторный HTTP-прогон после изменения текста заново прошёл обе группы на exact
candidate. Предыдущий зелёный прогон и исходный red не подменяют его. Полного
release corpus, браузерной/voice/production приёмки здесь не было.

## Где находится пользовательский путь

Предшествующий реальный локальный сеанс на `6d46f7b2` завершил три ответа AChat:
услуги/цены, мастера, адрес/часы. Было четыре ответа DeepSeek и три публичных
чтения YCLIENTS; owner вошёл после перезапуска. Сеанс штатно остановлен с сохранением
той же базы. [Aggregate outcome](evidence/maya-conversation-followups-20261011/preceding-owner-read-outcome.json)
сохранён без raw user/model payloads и ключей. Это historical executed receipt,
не новый live-прогон на `c9e012e7`, не unrestricted assistant acceptance и не
сверка каждой цены с первоисточником.

Указания владельца для дальнейшей работы: уведомления через мессенджеры; SMS не
делать обязательным условием запуска; обычный тон — доброжелательный и естественный.
Проверять готовые цепочки автоматически, запрашивать участие владельца для
действительно внешнего ввода/допуска, а не каждой тестовой реплики.

Первая Client-привязка без уже проверенного канала остаётся отдельным trust gap.
Старое SMS-предложение не принято как текущий путь. Existing A18 может переносить
доверие с уже verified exact Client channel; один Telegram login, роль владельца
или совпавший телефон такой связи не создают. Новый initial messenger verifier
не реализован и не придуман. Локальная разработка verified-client scenarios от
этого не блокируется.

Дальше: соединить уже существующие own appointment selection → canonical
availability → fresh confirmation → move/cancel outcomes с разговорным продолжением,
сохраняя Client authority. Нынешний carry — только пожелания до выбора записи.
Настоящие binding/booking/уведомления и новая платная модель требуют отдельного
допуска; старое десятиминутное разрешение уже закончено.

Production, owner DB, SMS/OTP, YCLIENTS writes, iPhone и дизайн не менялись.
Полный Maya/C10 release не объявлен. Изменения сохранены локально, push не выполнялся.
