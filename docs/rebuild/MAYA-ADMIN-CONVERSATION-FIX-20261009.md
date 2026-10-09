# Исправление ложного отказа обычному разговору администратора

**Три известные блокировки устранены локально: все 13 ходов B прошли HTTP 201
и дали 13 canned model outputs. На обычном разговоре инструменты не исполнялись,
CRM не читалась, роль ADMINISTRATOR не менялась.**

Проверенный код: `82ea84c46c4a535aaba8aa4c549f7a0eb074dcfa`.
Зафиксированная branch: `codex/maya-admin-routing-candidate-20261009`.
Frozen A остаётся `0d90de11710e7212286a7e74755c8a12b55d116b`;
прежний B `a80e6c4d5218704b29d2b25bd75b1bacb419c053` сохранён как историческая точка.
Рабочая branch — `codex/maya-admin-conversation-fix-20261009` в отдельном worktree.

## Причина и минимальное исправление

1. Coarse router находил `рост` внутри слова «простыми», поэтому приветствие
   и благодарность ошибочно становились `business_analytics`.
2. Одиночное слово `прогноз` тоже означало аналитику, даже в просьбе
   «Не подмяй факты прогнозом» без предмета финансового запроса.
3. `AiCoreService.groundingRequirement` затем корректно закрывал доступ к ошибочно
   выбранной финансовой теме: роли/тарифу не выдан analytics tool. Отказ происходил
   до `model.decide`, так что semantic planner не мог исправить классификацию.

В runtime изменены только две regex в существующем `MayaBrainRouterService`:
у «рост» добавлены кириллические границы слова/падежи; bare forecast cue больше
не определяет финансовую тему. Выручка, прибыль, загрузка и записи остаются
явными темами. Неуточнённый прогноз доходит до существующего semantic planner,
который проверяет те же текущие роли и доступные инструменты.

AiCore grounding, CI, role taxonomy и tool policy не менялись. Отсутствие
validated non-data plan по-прежнему не снимает требование источника. Положительные
unit tests используют действительные CI class-A plans для greeting/free-form/thanks;
ответы в них scripted. Подмены роли или выдачи analytics entitlement fixture нет.

## Проверки и evidence

- 342/342 tests, четыре suites: brain router, AiCore, conversation intelligence,
  tool policy. TypeScript widgets-live и ESLint четырёх файлов — PASS.
- Исходные failing tests сохранены. Промежуточные negatives скорректированы под
  действующего владельца: taxonomy допускает ADMIN forecast intent, но требуемый
  tool отсутствует; CLIENT получает permission denied. Принудительный вызов
  недоступного tool в обоих случаях отвергается с `ai_model_tool_not_allowed`
  до исполнения. Это не изменение прав ради прохождения теста.
- Все 13 B HTTP-turns сохранены с actual preceding replies. Corpus 6/13, его
  пользовательские реплики и dataset hash не изменены. У трёх general Admin turns
  теперь по одному model output, `grounding=not_required`, `tools_used=[]`,
  `sourceReads=[]`, `action=null`. Вход модели сохраняет ADMINISTRATOR и прежний
  policy tool set без analytics. Сохранённый server semantic context и privacy
  filter истории не изменены.
- Отдельно от corpus выполнены четыре финансовых negative HTTP-запроса:
  простое объяснение выручки, запрет подменять факты прогнозом + вопрос о выручке,
  прогноз выручки и рост прибыли. Все получили понятный отказ до модели и без
  источников. Прямой **валидный** `analytics.business.query` получил HTTP 403;
  запрос без аутентификации — 401. Недоступное расписание и forged forecast tool
  дополнительно проверены unit tests.
- Все 13 business hashes неизменны, business writes и forbidden effects пусты.
  Это измерения после synthetic fixture setup; данные источников проверялись
  отдельным preflight, не выдаются за conversational domain traversal.
- Шесть owned process groups и broker отсутствуют по прямой OS-проверке;
  PG остановлен, postmaster pidfile отсутствует. Max request 93 540 < 98 304 bytes.
  Резерв $1.49982624 — synthetic bookkeeping, не расход.

HTTP source manifest SHA256:
`bfce2d4909bec6d2934388a2c91f8e918d6e6cee1bf56d1b051ceb94301822e7`.
Сохранены [полный HTTP report](evidence/admin-conversation-fix-20261009/dry-http/http-report.json),
[negative controls](evidence/admin-conversation-fix-20261009/dry-http/fixture-preflight.json),
[тесты и границы](evidence/admin-conversation-fix-20261009/validation-summary.json),
[OS cleanup](evidence/admin-conversation-fix-20261009/maya-admin-routing-cleanup-20261009.json).
Независимый review подтвердил 2446 source bindings, неизменность текущих прав,
историю и outputs всех 13 ходов, negative controls и границы вывода.
[Archive manifest](evidence/admin-conversation-fix-20261009/manifest.json):
37 файлов / 1 206 873 bytes, SHA256
`f7f52e1529cbac8a411af195292f83df921abb1da438161a31c5d8f71d052a0c`.

Известный локальный дефект трёх реплик из
[предыдущего checkpoint](MAYA-FOLLOWUP-B-EXECUTABLE-CHECKPOINT-20261009.md) закрыт.
Для будущего B нужен exact candidate `82ea84c46c4a535aaba8aa4c549f7a0eb074dcfa`,
а не прежний B. Лимиты существующего профиля 24 attempts / $4 / 20 минут не менялись.

Это проверка маршрута и ограничений на synthetic transport, не real-model language,
YCLIENTS, booking/C9, React, restart или C10 acceptance. Произвольный финансовый текст
реальной модели этими тестами не квалифицирован. Платный прогон не разрешён и
не предлагался: внешних вызовов, permit, claim и key prompts — 0. Рабочий сайт,
production и фоновые триггеры не затронуты.
