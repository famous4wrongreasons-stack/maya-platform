# CLAUDE_MAYA_APP_AI_ONBOARDING_FOLLOWUP_RESULTS

> Ответ на `CLAUDE_MAYA_APP_AI_ONBOARDING_FOLLOWUP.md`. Claude, 2026-07-13.
> Продолжение в worktree `~/Desktop/maya-ai-onboarding` (ветка `codex/ai-onboarding-foundation`).
> NestJS/Prisma/миграции/backend-тесты не тронуты.

## Изменённые файлы

- `сайт и приложение/app.html` — 5 правок AI-онбординга;
- `сайт и приложение/maya-admin.html` — открытие вкладки CRM после handoff (`#view=crm`);
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — зеркало (**byte-identical**); `npx cap sync ios`; `ios/App/App/public/index.html` — **byte-identical** www.

Скриншоты рядом: `CLAUDE_AI_CONFIRM.png` (карточка с типом бизнеса), `CLAUDE_AI_CRM_CONNECTOR.png` (защищённый CRM-коннектор в admin).

## Правки

**1. Гарантия возврата владельца.** Телефон обязателен на карточке: перед `/confirm` проверяется ≥11 цифр (иначе спокойное «Укажите телефон — это ваш способ входа в MAYA и восстановления доступа»); `ownerPhone` шлётся всегда. Пароль остаётся опциональным (вход по телефону). `temporary_password` нигде не показывается/не логируется/не хранится.

**2. Возобновление и рестарт.** В `sessionStorage` только `{draftId, draftToken, apiBase}` под ключом `me_ai_onboarding_draft` — без сообщений/транскрипта/контактов/blueprint. При повторном открытии онбординга в той же сессии — `POST /ai/drafts/:id/read`, восстановление серверных `blueprint`+`missing_fields`+стадии («С возвращением…»). Черновик сессии чистится при: успешном confirm, «Начать заново», expiry/invalid. Видимая кнопка **«Начать заново»**; `invalid_ai_onboarding_token`/`ai_onboarding_expired` не оставляют в тупике — `lgAiHardReset` чистит ref+сессию и предлагает описать заново.

**3. Редактируемый тип бизнеса.** На карточке — блок «Тип бизнеса» из уже загруженного каталога `templates`; выбор шлётся как `templateId` в `/confirm`. Клиент не выдумывает ID (только из каталога); источник истины — серверный blueprint.

**4. Честная копия про иконку.** `Логотип появится на иконке и внутри приложения.` → **`Логотип появится внутри приложения. Иконку на экране телефона мы настроим отдельным шагом.`** Динамическая иконка не симулируется.

**5. Продолжение в рабочее пространство.**
- **internal**: «Пропустить» и успешная загрузка логотипа открывают in-app поверхность календаря/настроек нового tenant через существующий маршрут `calendar_setup=1` (кабинет «КАЛЕНДАРЬ MAYA»), не generic-home.
- **connect_crm**: основное действие «Подключить CRM» ведёт в **защищённый CRM-коннектор внутри MAYA** — `maya-admin.html`, вкладка CRM, через существующий одноразовый nonce-handoff (`#handoff=…&view=crm`); токен в диалог/логи не попадает. Кнопка «Позже» открывает приложение в предпросмотре.

## Контрактный разрыв (как просили — сообщаю, а не притворяюсь)

В `app.html` (клиентском PWA) **нет** in-app CRM-коннектора — реальный коннектор живёт в `maya-admin.html` (защищённая админ-поверхность MAYA того же origin). Я веду владельца именно туда через существующий handoff (это «внутри MAYA», не сайт). Если требуется CRM-коннектор прямо в app.html — это отдельная фронт-работа; сейчас переход в admin — единственный реально существующий защищённый connector.

## Верификация (живой backend ветки, headless CDP, без стабов)

| Сценарий | Результат |
|---|---|
| **MAIN** | телефон обязателен (confirm без телефона блокируется, остаёмся на карточке); confirm-body `ownerPhone:"+7999…"` + `templateId:"beauty_and_care"` (тип сменён на карточке); честная копия иконки; после «Пропустить» — экран «КАЛЕНДАРЬ MAYA · Календарь готов»; backend: `/services`=1, `/staff`=1 ✅ |
| **RESTORE** | после 1-го сообщения `sessionStorage` = has; reload + повторный вход → «С возвращением» + `missing` сохранён; «Начать заново» → приветствие и `sessionStorage` = none ✅ |
| **CRM** | «Через CRM» на карточке → confirm → стадия CRM («защищённом разделе настроек»); «Подключить CRM» → `maya-admin.html`, вкладка **CRM** (виден YClients/Altegio/DIKIDI…) ✅ |

## Parse / sync

- `node --check`: app.html 22/22, maya-admin.html 1/1, iOS www 22/22 — все OK.
- `npx cap sync ios`; www ⇄ `ios/App/App/public/index.html` — **byte-identical**.

## Заметки для Codex (backend не менял)

- `ownerPhone` теперь обязателен и на клиенте, и в контракте — согласовано.
- Rate limiter `ai_onboarding` активен и из браузера; для повторяемости прогонов чистил `AuthRateLimitBucket` в **локальной dev-БД** (код/контракт не трогал).
- Тестовые tenants `telo-*`, `britva-*` остались в dev-БД.
- Интерпретатор надёжно парсит услуги в формате «Услуги: <name> <price> руб <dur> минут».
