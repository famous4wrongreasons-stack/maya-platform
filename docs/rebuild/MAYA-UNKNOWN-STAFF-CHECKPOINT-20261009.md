# MAYA — неизвестный мастер до выбора услуги

Пользовательский дефект исправлен: при явно указанном неизвестном или неоднозначном
мастере MAYA уточняет мастера до чтения услуг и создания SERVICE_SELECTOR.
Для доступного мастера прежний выбор услуги сохранён. Недоступный, malformed или
stale каталог получает объяснение недоступности источника, а не утверждение об
отсутствии мастера.

`bindBookingStaff` переиспользует существующие правила точного текущего каталога и
request-local name references. AiCore вызывает его после tenant/branch/source
проверок. Новый источник, схема, authority, mutation или orchestrator не добавлены.
Подтверждённое имя сохраняется только как preference и повторно связывается при
следующем запросе. Неоднозначный alias не становится выбранным сотрудником.

## Проверка

- 44 component tests сценариев записи PASS; ещё 20 catalog binder tests PASS.
  Включены failed/stale/malformed source, unknown employee, ambiguity, сохранение
  допустимого выбора и смена branch source. Types, narrow ESLint и diff-check PASS.
- Actual local HTTP/PG: **5/5 PASS**, включая прежние STOP и personal read проверки.
  Текущий мастер: staff/services READ и одна SERVICE_SELECTOR. Реальный ID мастера
  другого synthetic tenant: только current-tenant staff READ, ноль emissions,
  appointments и action executions. Обе реплики прошли authenticated CLIENT route.
- Все runtime/probe source hashes неизменны; временный PG остановлен, pid отсутствует.
  Вызовов upstream/provider нет. Это synthetic scripted proof, не real-model или
  live YCLIENTS acceptance.

Evidence: [manifest](evidence/maya-unknown-staff-20261009/manifest.json),
[actual responses](evidence/maya-unknown-staff-20261009/target-http-r1/actual-responses.json),
[HTTP manifest](evidence/maya-unknown-staff-20261009/target-http-r1/manifest.json).
18 файлов / 279091 bytes; manifest SHA-256:
`77938e40cce586ba832dcee8eefd1320a2d48d7ead4f1f4c7c701afd1765cd22`.

Runtime proof привязан к base `67bb7c63a138908227e260ed774917ea74731747` и
сохранённому selected runtime/probe diff + шести source hashes. Это не утверждение
о whole-working-tree hash: два component spec файла представлены отдельными
результатами тестов и кодом checkpoint.

Независимое review: qualified no blocker. Подтверждены source validation, suppressed
staff READ, отказ до service selector и actual HTTP counts. Outage, ambiguity и
retained next-turn подтверждены component tests/source review, не отдельными HTTP
сценариями. Рабочий сайт, frozen9/handoff и исходные 81 ответа не изменялись.

Полный 48-dialog suite после этого исправления ещё не запускался. Последний общий
результат остаётся **45 pass / 17 semantic_fail / 10 unsupported / 9 insufficient**;
новый целевой PASS не подменяет общий score. C10 и полная MAYA не объявлены готовыми.
