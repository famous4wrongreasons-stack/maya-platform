# Companion: голосовой лист — 2026-10-14

Tested product candidate: `b34e3513801a55a98489603c60e798453d2f03dd`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `7d2961513842e90ecc5345a2dec959e5561af2bd`.

## Реализованное поведение

Микрофон AChat открывает нижний лист «Поговорить с Maya» по owner design.
Первое настоящее нажатие по-прежнему вызывает существующий `voice.arm`.
Лист отражает ожидание разрешения, запись с длительностью, остановку по лимиту,
кодирование, распознавание и точный отказ runtime. Отдельное настоящее нажатие
«Отправить запись» вызывает существующий `voice.send` с новым GestureProof.
Демонстрационная кнопка и готовый текст прототипа не перенесены в приложение.

`VoiceSheet` — только представление VoiceView и существующего control port.
Новый capture, транспорт, таймер записи или writer не добавлены. Сохраняются
проверки настоящего и однократного жеста на обоих уровнях, PII/input lock,
текущая сессия, минимум 300 ms, ограничение 20 s и единый conversation writer.
После лимита clip остаётся held: он остановлен, но не отправлен. `unavailable`
показывает дословный runtime Cell. Ошибка не превращается в сообщение Maya.

Закрытие листа и Escape вызывают прежний `voice.cancel`. Окончившийся ввод
закрывает лист; idle с ошибкой оставляет её видимой и разрешает только явный
повтор. Поздние permission/decode/transcribe continuations отменённой операции
не создают turn. Фокус возвращается к реальному opener либо к chat lane.
Native dialog блокирует фон, Tab/Shift+Tab остаются внутри доступных кнопок.
Успешная отправка использует тот же writer, что текст; набранный текстовый
черновик не стирается голосовой отправкой.

Backend, runtime, capture/encoder, session, schema, API DTO, grants и release
contract не менялись. Изменено только представление Companion, его test entry,
три SSR-проверки и один синтетический browser suite. Старое Aurora-представление
не получает этот лист. Новых assets, dependency или allowlist расширений нет.

## Reference lock

| Решение | Источник | Реализация |
| --- | --- | --- |
| Белый нижний лист, handle, radius 22, заголовок | owner `screens/18-voice.png`, prototype sheet CSS | Native dialog над настоящим AChat, ширина до 560 px |
| Значок микрофона и синяя основная кнопка | тот же макет | Существующий code-native glyph, без нового внешнего asset |
| Настоящие фазы и явная отправка | текущий VoiceView/VoiceControlPort | Демонстрационный transcript не является ответом приложения |
| Доступный возврат и длинный текст | существующие sheets и App visible viewport | Модальность, Tab, Escape, прокрутка при увеличенном тексте |

## Свежая проверка на committed candidate

Все 21 команды выполнены заново на чистом неизменном candidate выше.
Начало: `2026-10-14T06:12:15Z`; окончание: `2026-10-14T06:17:02Z`.
[Архив](evidence/maya-companion-voice-sheet-20261014/README.md) содержит команды,
полные логи, receipts, hashes и синтетические screenshots.

| Область | Результат |
| --- | --- |
| Полный runtime | 828 PASS / 7 SKIP / 0 FAIL |
| Полный carrier | 194 PASS / 0 FAIL |
| Scoped backend owners / HTTP / C8 / C9 | 355 PASS / 23 suites |
| Existing scoped mutations | 79/79 killed, зелёные baselines |
| Emitted browser checks | 484 PASS; новый voice suite — 56 |
| Runtime/carrier architecture ratchets | PASS |
| Packaging tests | 18 PASS |
| Reproducible runtime / PWA–Capacitor parity | PASS, 8 файлов |
| Scoped backend test lint | PASS |

Новый browser suite запускает actual emitted React/runtime/capture/encoder.
Browser audio APIs заменены конечным test double до загрузки приложения;
исходные функции доступа к микрофону не сохраняются. Реальный микрофон,
модель и провайдер распознавания не используются. HTTP допускает только
loopback fixtures. Секреты, сохранённая база салона и Keychain не открываются.

Проверены: passive render, отказ untrusted arm/send; modal focus и Tab; ширины
320/393/427/1280; 200% текста при высоте 440; Escape; позднее разрешение после
отмены; уход вкладки в фон; настоящий 20-секундный cap runtime без замены часов;
отмена pending decode; слишком короткий decoded clip; отмена transcription;
поздний transcript; not-recognized и provider-unavailable; настоящий WAV encoder
(mono 16k); один пользовательский turn и один ответ; сохранность текстового
черновика; последующая обычная typed отправка через тот же conversationId.

В конце все искусственные tracks и AudioContexts закрыты. Неожиданные API,
внешние запросы и JS/CSP errors — 0. Полные runtime voice tests также заново
проверили V6 input locks, V7 proof/replay, lifecycle и session refusal. Существующие
79 mutations относятся к workspace/tasks/Ideas owners; это не новый voice corpus.
Скриншоты листа просмотрены и сопоставлены с owner reference.

## Development диагностика

Три первых browser receipts не являются final evidence:

1. Large-text probe повторно фокусировал уже активную кнопку после resize.
   Native focus не выполнял новый scroll. Probe исправлен на настоящую
   последовательность Tab от заголовка к кнопке; требование видимости сохранено.
2. Error fixture передавал строку в message вместо canonical `error.code`.
   Runtime правильно показывал generic audio rejection. Fixture приведён к
   текущему wire contract, а продуктовый mapping не менялся.
3. Chat assertion ожидал несуществующий `text`; canonical wire содержит
   `messages[].content`. Assertion проверяет точный последний user message и
   conversationId, не меняя transport или writer.

Четвёртый development run прошёл 56 проверок. Затем реализация и tests
зафиксированы и весь набор запущен заново; final receipts получены на candidate
выше. Ни одна development failure не скрыта и не названа PASS.

## Границы

Это scoped local presentation/integration checkpoint после C9, не C10 и не
full release certification. 7 runtime SKIP не названы PASS. Полный backend,
Platform CI и полный release mutation corpus здесь не запускались.

Физический микрофон, качество реального распознавания, voice-provider latency,
iPhone/native keyboard/safe areas, Xcode signing и установка не проверялись.
Production, база салона, Keychain, внешние providers не использовались. Deploy,
миграции, grant, OTP/YCLIENTS, платная модель, push/merge и установка на телефон
не выполнялись. PWA/Capacitor proof проверяет byte parity с допустимой заменой
endpoint, а не native iOS acceptance. Документация фиксируется отдельно после
прогона без изменения product bytes. Другие source/policy gaps прежней карты
этим визуальным этапом не закрыты.
