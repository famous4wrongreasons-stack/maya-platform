# CLAUDE_AI_PERSONAS_RESULTS

Дата: 2026-07-18  
Статус: выполнено

## Реализация

- В `AiCoreModelInput` добавлена обязательная персона `director | admin`.
- Персона определяется только по серверной membership-роли:
  `CLIENT`/`CUSTOMER` → `admin`, остальные роли → `director`.
- Для DeepSeek и OpenAI системная инструкция собирается в порядке:
  неизменённый `CORE_INSTRUCTIONS`, затем тон-слой выбранной персоны.
- Safe-режим, строгий JSON-контракт, валидатор решений, авторизация,
  tenant resolution, guards, схема БД и фронт не менялись.
- Сырой `execute_readonly_query` не добавлялся.

## Проверки

- `npm run typecheck` — успешно.
- ESLint изменённых файлов — успешно.
- Целевые тесты AI Core — 18/18 успешно.
- Полный backend Jest — 76 suites, 400/400 tests успешно.
- Тестами подтверждены обе персоны и порядок «ядро безопасности → персона»
  для DeepSeek и OpenAI.
