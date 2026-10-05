<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: d41cf26777335077cc5053523d6b068ce9d694e67042c96567926c92c1c6c54a -->

# Hermes «Мужская Эстетика» — отчёт о настройке

Дата: 1 сентября 2026 года

Текущий режим после уточнения владельца: `SINGLE_SITE_ONLY`. Профиль работает только для канонического сайта `https://malesthetic.pro`; `мужскаяэстетика.рф` — алиас того же сайта. Внешние площадки разрешено только читать как публичные источники, но нельзя изменять. Maya OS и другие проекты находятся вне области работы.

## Результат

Создан отдельный профиль Hermes `hermesbarber` — AI-маркетолог и Growth-оркестратор сайта «Мужская Эстетика». Он изолирован от основного Hermes и других проектов: у него свои persona, конфигурация, память, сессии, skills и будущие routines.

Главная цель профиля: увеличивать число **новых клиентов, которые фактически пришли на первый визит**.

Стратегия:

- `ORGANIC FIRST`;
- `PAID ADS OFF`;
- `SINGLE_SITE_ONLY`: единственная цель изменений — `https://malesthetic.pro`;
- Yandex Direct оставлен как выключенный planning-only модуль;
- исследования, аудиты, расчёты и локальные черновики разрешены;
- публикации, сообщения, изменения внешних аккаунтов, автоматизации и расходы — только после явного approval владельца.

## Установленное окружение

- Hermes Agent: `0.21.0`, commit `02ecc4be`, статус `Up to date`;
- отдельная команда профиля: `hermesbarber`;
- профиль: `/Users/stanislavmosin/.hermes/profiles/hermesbarber`;
- рабочий проект: `/Users/stanislavmosin/Documents/Codex/2026-09-01/referenced-chatgpt-conversation-this-is-an/work/hermes-barbershop`;
- модель: `gpt-5.5` через существующую OpenAI Codex авторизацию;
- Chromium установлен для публичной веб-разведки;
- web UI собран;
- routines/cron отсутствуют и не запущены;
- фоновый curator skills поставлен на паузу.

## Business brain

В workspace созданы:

- постоянная роль и стиль Hermes;
- проектные правила и приоритет главного KPI;
- профиль бизнеса с явно помеченными неизвестными данными;
- форма сбора фактов у владельца;
- policy внешних и денежных approvals;
- словарь KPI и атрибуции;
- шаблон цепочки `источник → лид → запись → новый клиент → визит → выручка`;
- реестр источников и weekly scorecard;
- правила оригинального экспертного контента без обхода AI-детекторов;
- критерии, когда достаточно skills и когда позже оправдан дочерний агент.

## Активные специализированные skills

1. `barbershop-growth-orchestrator`
2. `barbershop-demand-research`
3. `barbershop-seo-content`
4. `barbershop-technical-seo`
5. `barbershop-attribution-analytics`

Навыки для карт/отзывов, соцсетей, маркетплейсов, партнёрств и Яндекс Директа сохранены в обратимом архиве и не загружаются профилем. Все 10 исходных skills структурно валидны; Hermes видит только 5 активных site-only skills.

## Безопасность

- approval для опасных команд: `manual`;
- cron, one-shot и unattended опасные команды: `deny`;
- редактирование секретов и PII включено;
- Tirith `0.4.0` установлен и работает в режиме fail-closed;
- Computer Use, image/video generation, TTS/STT, cron и delegation отключены на старте;
- внешних аккаунтов и рекламных кабинетов нет;
- Yandex Direct: `enabled: false`, бюджет `0 ₽`;
- `hermes doctor`: все проверки пройдены;
- supply-chain audit Python/Hermes: 0 известных уязвимостей из 111 компонентов;
- Node production audit: 0 уязвимостей;
- полная резервная копия до обновления: `/Users/stanislavmosin/.hermes/backups/pre-update-2026-09-01-010156.zip`.

Maya OS и её проекты не изменялись. Глобальный npm не обновлялся.

## Проверка поведения

Smoke-test подтвердил, что Hermes:

- правильно называет главным KPI новых клиентов с фактическим визитом;
- считает Yandex Direct выключенным;
- не считает публикацию или отправку сообщения разрешённой без явного approval;
- стартует в правильном business workspace;
- называет единственным каноническим сайтом `malesthetic.pro`;
- отказывается менять Яндекс Карты, другие домены и Maya OS;
- пропускает безопасную локальную команду через Tirith без findings.

## Как запустить

Дважды откройте файл `Start Hermes — Мужская Эстетика.command` из папки с результатами. Он запустит отдельный профиль сразу в правильном workspace.

Альтернатива в терминале:

```text
cd /Users/stanislavmosin/Documents/Codex/2026-09-01/referenced-chatgpt-conversation-this-is-an/work/hermes-barbershop
hermesbarber
```

После заполнения данных владельца первая команда:

```text
/barbershop-growth-orchestrator Проведи baseline-аудит malesthetic.pro и предложи три улучшения сайта с наибольшим ожидаемым влиянием на новых фактически пришедших клиентов. Внешние площадки только читай. Ничего не публикуй и не меняй.
```

## Что пока намеренно не включено

- cron/routines — нет фактов, URL и проверенного ручного процесса;
- дочерние агенты — skills достаточно для первого этапа;
- CRM/YCLIENTS интеграция — нужны формат данных и privacy-review;
- любые действия на картах, в соцсетях, каталогах и мессенджерах — вне текущей области;
- Yandex Direct — архивный выключенный модуль, без доступа к кабинету и без расходов;
- Maya OS и другие проекты — вне области и не изменялись.

## Официальные источники

- Обновление Hermes: https://hermes-agent.nousresearch.com/docs/getting-started/updating
- Изолированные profiles: https://hermes-agent.nousresearch.com/docs/user-guide/profiles
- Работа со skills: https://hermes-agent.nousresearch.com/docs/guides/work-with-skills
- Безопасность и approvals: https://hermes-agent.nousresearch.com/docs/user-guide/security
- Репозиторий: https://github.com/NousResearch/hermes-agent
