# Maya Companion — создание и завершение личных задач

Дата checkpoint: 2026-10-13. Ветка: `codex/maya-local-crm-setup-20261010`.
Проверенный кандидат кода: `88fa811644b59211d484a47816e44b604e4f1387`.
Предыдущий checkpoint: `344fa6cd864599d15eafbf04d9d5a270e2e3b588`.
Это локальная разработка дизайна после C9, не C10 и не сертификация релиза.

## Что работает в новом интерфейсе

- Форма «Новая задача»: название до 160 символов, описание до 4000, назначение
  только текущему пользователю, без срока (`dueAt: null`). Пустые поля не отправляются.
- Кнопка завершения только у открытой задачи с действующей объявленной Inbox-связью.
  UI выбирает строку, runtime извлекает соответствующий server-returned `task_id`;
  `work_item_id` никогда не подставляется вместо Inbox locator.
- Единичная отправка; новая команда блокируется, пока исход первой не установлен.
  Потерянный/некорректный ответ, 409/429/5xx оставляют неопределённый результат.
  Повтор запускается только вручную с теми же body и idempotency identity.
- Успех принимается по структурно проверенному A23 receipt (класс, execution,
  target/generation, отсутствие provider effects); для завершения target совпадает
  с выбранной задачей. Затем список читается снова. Оптимистической галочки нет.
- Неудача проекции уведомления не отменяет уже сохранённую задачу и показывается отдельно.
- Pending/unknown operation живёт в памяти текущего runtime при закрытии/возврате
  экрана. Смена сессии/dispose очищает контекст, поздний ответ не принимается.
  После reload нет durable client command recovery: UI явно просит не обновлять
  страницу до подтверждения. Автоматического повторного POST после reload нет.
- Native dialog: фокус первого поля, Escape/возврат фокуса, ширина 320–1280,
  мобильная нижняя форма на всю ширину, сохранение черновика разговора.

## Владельцы и совместимость

Существующие `GET /operational-work`, `POST /operational-work/create` и
`POST /operational-work/complete` остаются под JWT/tenant/role guards,
`Package5Wave1CanonicalCutoverService`, A23 / Action Engine и Inbox projection.

Единственное backend product изменение — additive read metadata:
`action_contract: maya.operational-work.actions/1` и `can_create`, вычисленный из
тех же management roles, что применены к create route. Это подсказка интерфейсу,
не grant и не замена проверкам POST. Роли, write owners, persistence, migration,
Action Engine, Client Identity и booking не изменены.

Без нового metadata старый backend по-прежнему даёт только read-only экран.
Перечень сетевых путей расширен ровно двумя типизированными A23 POST; произвольные
URL, Inbox legacy writes, caller tenant/role/context не добавлены. Widgets registry,
HANDOFF STOP, entitlement/profile и conversation writer не изменены.

Название ограничено реальным executor (`workCreateRequest`, 160), хотя прежний
HTTP parser допускает 300. Историческое чтение заголовков до 300 сохранено.
Серверные операции по-прежнему проверяют актуальные полномочия независимо от UI.

## Проверки и честные границы

На чистом committed `88fa811644b59211d484a47816e44b604e4f1387` заново выполнены:
797 runtime PASS / 7 SKIP; 176 carrier PASS; 80 scoped backend/source PASS;
33/33 scoped mutations killed с зелёными baseline; build ratchets PASS;
147 браузерных проверок PASS; 18 packaging tests PASS;
web/Capacitor parity и воспроизводимость runtime PASS.

Это искусственные HTTP/browser fixtures и отдельные Nest/unit tests с mocked
persistence. Живой сценарий создания в базе салона и полный release programme
не выполнялись. Семь SKIP — не PASS. Сертификат предыдущего релиза не наследуется.

Источники дизайна: `04-tasks.png`, `14-new-task.png` предоставленного пакета.
Реальные title/body поля соответствуют текущему A23; срок, назначение другому
человеку, undo/reopen и план из «Идей» не изображаются работающими.

[Свежие receipts, hashes, screenshots](evidence/maya-companion-task-actions-20261013/README.md).
[Ревизия источников «Идей» и следующий участок](evidence/maya-companion-task-actions-20261013/IDEAS-SOURCE-REVIEW.md).

Production, база салона, Keychain, реальные провайдеры/модель, grants, миграции,
SMS/OTP/YCLIENTS и iPhone не затрагивались. Push/merge не выполнялись.
