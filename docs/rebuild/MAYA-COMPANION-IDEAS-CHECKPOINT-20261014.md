# Companion «Идеи» — локальный checkpoint, 2026-10-14

Code candidate: `e9cd4ad2d7da61288e2026222835437b32ebd29c`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `f9d183fb` (task-actions evidence; tested product predecessor `88fa811644b59211d484a47816e44b604e4f1387`).

## Что подключено

Меню настоящего React AChat открывает «Идеи». Это первый ограниченный слой:
просмотр основания, даты, полноты, квалификации и доступности сохранённых C8
расчётов. Он не объявляется готовым генератором рекомендаций или планов.
Числовые значения, имена, контакты и участники рейтингов пока не представлены.
Пустая страница, неполный список, отказ доступа и ошибка ответа различаются.

- Единственный новый сетевой путь: существующий authenticated GET
  `/analytics/valuations`, без caller query/body/tenant, compute или POST.
- Ответ проверяется как `c8.valuation.list/1` + `c8.valuation.read/1`.
  UI сохраняет только выбранные метаданные, не копирует raw values, subject IDs,
  ranking members, intent, evidence refs, policy IDs или model IDs.
- Вход в карточку перечитывает тот же bounded list с текущими полномочиями.
  Сопоставление требует exact result ID + revision + snapshot hash. Подменённый
  либо исчезнувший из текущей страницы результат не открывается вместо выбранного.
- Проверяется не более первых 25 результатов; фильтрация актуальности/доступа
  может сократить страницу до нуля. Pagination cursor только сигнализирует
  неполноту; пагинация и полный архив не реализованы и не заявляются.
- Изменение current/available отображается после свежего чтения. Expiry убирает
  карточку и открытые подробности локально, без продления срока или фонового запроса.
  Отзыв полномочий на сервере проверяется при следующем чтении; мгновенная push-
  инвалидация уже показанных read-only данных не заявляется.
- Закрытие, замена сессии, выход и dispose отменяют чтение и исключают поздний ответ.
  Повтор только по явному нажатию, с соблюдением Retry-After; фонового polling нет.
- Возврат сохраняет черновик и прокрутку чата; подробности открываются сверху,
  возврат к списку восстанавливает его прокрутку. Escape и фокус проверены.

## Владельцы и неизменные границы

Backend product-код не менялся. Добавлен только source test:
`maya-saas-backend/src/valuation/c8.companion-list.spec.ts`.
Реальные C8 reader/explanation проверяются с искусственной persistence/viewer;
отдельный тест передаёт их фактический ответ в shipped runtime projector.
Это не реальная база и не live авторизация салона.

Текущие C8 controller JWT/tenant/role guards и reader scope/finance/branch checks
остаются владельцами доступа. Открытие workspace не является grant. WidgetRoute,
registry, HANDOFF STOP, AR-1, booking, Client Identity, Action Engine и writer
разговора не изменены. Pure runtime владеет lifecycle и projection; React отображает
его состояние. Финансовая и клиентская политика не вычисляются фронтендом.

Canonical `c8AssertOpportunityBranch` допускает для этих результатов только
`inform_only` / `read_valuation_result`, без proposedActionIntent. Opportunity
lifecycle явно запрещает persist AgentTask для inform-only. AgentTask и личный
A23 OperationalWorkItem не взаимозаменяемы. Поэтому отсутствуют кнопки отправки,
исполнения плана, автоматической задачи или обсуждения данных с моделью.

## Дизайн и продолжение

Reference lock: владелец предоставил `Maya_full_design_package/screens/03-ideas.png`.
Сохранены белое полотно Companion, существующие tokens/type, компактные строки
с иконкой, небольшие метки разделов и CTA чтения. Текст и действия заменены на
подтверждённые текущим source contract. Текущий menu navigation сохранён; второй
неподключённый tab bar не создавался. На 320/393/427/1280 px проверен реальный
emitted payload. Скриншоты только искусственных данных.

Следующий самостоятельный unit — конкретное содержательное представление
поддерживаемых C8 результатов с точной семантикой показателей. Source-to-plan
или plan-to-A23 потребуют установленного server-owned source/intent/receipt
контракта; имя шаблона growth_plan и prototype copy не являются им. Это не C10,
не новая автономная политика и не разрешение на сообщения клиентам.

## Проверки

См. `evidence/maya-companion-ideas-20261014/README.md`, `summary.json` и `MANIFEST.json`.
Все успешные итоговые receipts относятся к чистому committed SHA выше. Документы
после них сохраняются отдельным commit, без изменения кода.

Первый общий прогон на том же SHA остановлен: C8 consumer architecture test не
нашёл `rg` в scrubbed PATH (ENOENT). Сохранены исходные receipt/log. В повторе
добавлена директория установленного `rg` в окружение; исходники, assertions и
бюджеты времени не изменены. Исторические результаты не заменяют повторный прогон.

NOT DEPLOYED. Не обращались к production, сохранённой базе салона, Keychain,
модели, YCLIENTS, SMS/OTP. Миграции/grants не выполнялись, iPhone не изменён,
push/merge не выполнялись. Это scoped local checkpoint, не новая release certification.
