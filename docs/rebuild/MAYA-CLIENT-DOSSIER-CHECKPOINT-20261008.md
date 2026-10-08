# MAYA — уточнение клиента до чтения досье

Runtime: `6996a22cfd8b4a25f245bb61344560c6de902b27`, исходный parent `e30f4e01b54cf3f33fff98e34d7c8e9f8d097152`; первый runtime commit `fbf47a6ba2cff883e3cbcac1bc0a906afdaba831`. Изолированная ветка `codex/maya-development-integration-20261006`. Development checkpoint, `NOT_ISSUED`; не завершение всей MAYA/C10 и не разрешение release.

## Полезное изменение

При нескольких совпадениях MAYA просит уточнить клиента **до** чтения истории, лояльности и recency. Раньше handler выбирал `matches[0]`, читал его факты и лишь в конце предупреждал, что использовал первое совпадение. Два RED-теста через настоящий handler воспроизвели дефект. Теперь неоднозначный ответ не содержит кандидатов, имён, IDs, чисел или фактов любого из них.

Следующий явный уточнённый запрос выполняет новый READ для единственного найденного клиента. Существующий `AiCore → C9 TOOL_READ(clients.dossier.read) → CRM/domain owners` возвращает один серверный ответ с source grounding. Досье не уходит во второй model turn; старый assistant reply также исключён из модельного контекста. Сохранение ответа использует текущий encrypted timeline, а не новый store или conversation owner.

Старая cached first-match receipt с `matches_count > 1`, stale source и найденная карточка без exact match count блокируются до раскрытия фактов. Не найденный клиент и недоступный domain-port поиск остаются разными исходами. Ответ никогда не создаёт action.

## Privacy и выбор клиента

`clientDossierSelection` — единый серверный владелец исходной поисковой строки и private text span. Перед моделью скрывается весь клиентский фрагмент: полное имя, неизвестная фамилия, lowercase, телефон/последние четыре цифры и длинный explicit capture с допустимым номером. Query для CRM берётся из исходного user turn на сервере, а не из предложенной моделью строки.

Явные клиентские формы используют этот owner; generic «расскажи про/о» считается клиентским запросом только с marker клиент/гость или именем, распознаваемым уже существующим словарём. Общие темы вроде погоды и тайм-менеджмента не получают dossier hint/preset. Если модель сама выбрала dossier без серверного query, MAYA просит уточнение и не вызывает CRM. Слишком длинное имя без допустимого телефона скрывается целиком и не становится guessed query. Для незнакомого имени нужна явная клиентская формулировка. **Это не универсальное распознавание ПД во всём свободном тексте.**

Изменения: [handler](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts), [AiCore и query owner](../../maya-saas-backend/src/ai-tools/ai-core.service.ts), [tool contract](../../maya-saas-backend/src/ai-tools/ai-tool.catalog.ts), [HTTP fixture](../../maya-saas-backend/test/widgets-live/client-dossier.probe-spec.ts), [current React probe](../../maya-carrier-react/test/client-dossier-browser-probe.mjs). Direct registered tool API и его права не расширены; schema/retention/AE не менялись.

## Проверки

| Проверка | Результат и граница |
| --- | --- |
| Исходный ambiguity defect | 2 RED на baseline `e30f4e01`; выбор первого клиента воспроизведён через handler |
| Privacy defects | Исходная проверка поймала фамилию после «Досье клиента»; независимый review затем обнаружил short-phone/alternate-form и long-capture ветки. RED и промежуточные попытки сохранены; обе review-находки закрыты |
| Финальные unit | **433/433, 5 suites PASS**, включая handler/AiCore/routing/registry/policy. Query/history masking, explicit refinement, старые receipts, stale/incomplete identity, general topics и model-invented query refusal |
| Browser request guard | **5/5 PASS**, finite local auth/history/chat; mutations и внешние маршруты запрещены |
| Static/architecture | Backend/live-fixture/contract TypeScript, scoped lint, K3 PASS. Contract checker: 31 PASS и 4 ранее отложенных checks |
| Actual HTTP/PG/current React | **1 scenario, 6 checkpoints PASS**; 4 settled C9 READ receipts/completed runs, 4 scripted selections; отдельные Client 403 и foreign-tenant HTTP checks |
| Side effects | Финальный READ proof: business snapshot неизменен, recorder без business writes; ActionExecution 0, provider fetch 0, real model 0, outbound 0, unexpected [] |
| Isolation | Fresh loopback PG; Node heap 3072 MiB, один worker; PG buffers64/work4/connections30. Все owned groups closed/absent, exit 0; PG остановлен, source/harness hashes неизменны. |

Основной HTTP/browser сценарий: «Сколько визитов у 7346» даёт ambiguity без history/loyalty/recency; «Расскажи про иван петров» передаёт в CRM точную исходную строку вместо scripted model placeholder «клиент» и читает только выбранную synthetic карточку. Затем not-found, unavailable, reload/re-login и suspended membership → 401. На reload проверяется сохранение **точного успешного досье**, а не только последнего сообщения об ошибке. После reload/revocation счётчики C9/model/source не растут.

Перед UI настоящая HTTP policy отклоняет Client role с 403 `ai_tool_forbidden` до handler/source. Владелец другого tenant с тем же query обращается только к своему отдельному пустому synthetic domain source; downstream reads собственного tenant не запускаются. Эта проверка доказывает principal routing и реальные auth/policy guards, **не** native provider/A17 company isolation.

[Artifact manifest](evidence/maya-development-integration-20261006/client-dossier-20261008/artifact-manifest.json), [финальный HTTP report](evidence/maya-development-integration-20261006/client-dossier-20261008/browser-attempt2/client-dossier-observations.json), [source-bound run](evidence/maya-development-integration-20261006/client-dossier-20261008/browser-attempt2/manifest.json), [independent review](evidence/maya-development-integration-20261006/client-dossier-20261008/independent-review.md). Первый browser run прошёл на промежуточном `fbf47a6b`, но не принимается вместо финального run после privacy review.

## Пределы и следующий блокер

CRM search/history и отсутствие loyalty — конечный **synthetic domain-port seam**; recency owner вызывается реально с supplied synthetic history. Реально исполняются локальные HTTP/auth/C9/Prisma/PostgreSQL/current React. Выбор модели scripted. Native YCLIENTS не вызывается и не принимается; реальная языковая приёмка не заявляется. Reload/re-login не равен process/PG restart; отдельного restart в этом срезе нет. Полный aggregate повторно не запускался.

Существующий native YCLIENTS search сейчас превращает upstream error в `[]`, поэтому проверка unavailable доказывает только domain-port outcome. Это отдельный остаток adapter, не закрытый текущим fixture. Также существующий formatter fallback spend из ограниченной истории ещё нуждается в точном названии source scope; в proof выбран full CRM card spend. Не заявляется полная приёмка всех фактов/операций досье.

Просмотрены реальные screenshots unique/reload/revoked: правильное досье видно после уточнения и после reload, отзыв доступа возвращает экран входа. Первый ambiguous PNG частично не отрисовал текст ответа, хотя DOM/HTTP assertion прошёл; этот ответ виден в последующих unique/reload кадрах. Это функциональное подтверждение, не design/visual acceptance. Папка `output/playwright` — историческое имя; используется Chrome CDP.

Для нескольких компаний YCLIENTS подготовлен [один конкретный schema delta](MAYA-YCLIENTS-MULTI-COMPANY-SCHEMA-DELTA-20261008.md): один A17 credential owner и общий disconnect, source-qualified identities и основания доступа. Текущий sync второй компании может отозвать staff access первой; массив settings без migration не исправляет это. Непроверенные legacy links нельзя присваивать текущей company. **Миграция и multi-company runtime не выполнялись до решения по этому delta**; одиночная привязка сохранена.

Рабочий сайт, real booking, production, outbound, SSH, phone и deployment не затронуты; push/merge не выполнялись. Background C10 и новые полномочия не добавлялись. [Остаток согласованной реализации](MAYA-IMPLEMENTATION-REMAINDER-20261008.md) остаётся отдельным списком.
