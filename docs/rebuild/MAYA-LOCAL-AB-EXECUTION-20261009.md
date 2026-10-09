# Один локальный A+B запуск

Общий запуск подготовлен и проверен на synthetic transport. Код harness:
`99b22b750fa498836d0a0249889538744ecdbb76`.
Frozen A — `0d90de11710e7212286a7e74755c8a12b55d116b`, исправленный B —
`82ea84c46c4a535aaba8aa4c549f7a0eb074dcfa`; их исходники не менялись.

Основание исполнения: явное «Разрешаю» владельца 2026-10-09 06:13:55 UTC,
`Sentinel_519ee1e68e1c8191adeb5359313624ca`, и готовность к вводу на Mac
06:52:50 UTC, `Sentinel_d2a6cafc3134819195f4399d228c0daf`.
Разрешены только 9 synthetic диалогов / 18 реплик: A ≤$2/12 запросов/10 минут,
B ≤$4/24/20 минут; вместе ≤$6/36/30 минут. Старые grants не используются.

`core-local-ab.mjs` последовательно вызывает существующие broker и frozen runners.
Одно TTY-чтение после A claim хранит ключ в одном process closure. B переиспользует
этот closure после собственного нового claim; ключ не передаётся через argv,
environment, файл, IPC или runner. Отмена необратимо закрывает credential helper.
JavaScript не обещает физического стирания уже выделенной памяти.

Существующие stage admission и budget сохранены. Дополнительный общий журнал
с фиксированными суммарными пределами резервирует расход с fsync перед fetch,
не возвращает резерв при отказе/UNKNOWN и запрещает повторный запуск. Общий срок
начинается до ввода и включает переход; B ограничен оставшимся общим временем.
Минимальный интервал 6 секунд действует также между этапами.

B permit создаётся только после чистого A: все ходы, корректный usage каждого
ответа, runner exit, полный broker drain, отсутствие записанных process groups
и остановка owned PG. Ошибка, неполный usage, истечение срока, неизвестная очистка
или отмена исключают B. Stop joinable; временные signal listeners снимаются.
При принудительной смерти runner fallback ограничен сохранёнными owned ресурсами;
неполный report остаётся cleanup-unconfirmed. Нативный forced-PG fallback проверен
подставными операциями, не реальной аварией PG.

107 проверок PASS: 4 сквозных synthetic launcher, 13 server/CLI, 10 budget,
56 usage/completion, 16 credential, 8 cleanup. Сквозной proof использует реальные
source/admission/claim/budget/Unix-broker проверки с подставными TTY, runner, fetch
и часами; его permits истекли в 2000 году. Это не real-model/app/PG acceptance.
Независимый static review — qualified PASS; найденные ранние source/layout и
cleanup ограничения исправлены до сквозного PASS.

[Evidence](evidence/local-ab-readiness-20261009/validation-summary.json),
[сквозной лог](evidence/local-ab-readiness-20261009/maya-ab-integration-v1-20261009.log).
Manifest SHA256: `a43e9d946b5f9cd69c33fbb0cc8eded8d90ee5a2f3de56fe0cfd7cd007c537d9`.
Для резервирования проверены официальные peak cache-miss ставки DeepSeek
[$1.32 input / $3.96 output за миллион токенов](https://api-docs.deepseek.com/quick_start/pricing/)
на 07:07:01 UTC. Резерв не является подтверждённым списанием.

До этого checkpoint реальные вводы ключа, действующие paid permits и запросы
провайдеру отсутствуют. После запуска evidence сохраняется в отдельном fresh
`/private/tmp` root; источник нельзя менять до остановки. Для отмены — Ctrl-C
в выделенном Terminal или TERM только известному PID launcher. Остановка input
сохраняет использованный claim; повторное открытие/сброс журнала не предусмотрены.
Успех модели и завершение Майи будут оцениваться отдельно по фактическим ответам.
