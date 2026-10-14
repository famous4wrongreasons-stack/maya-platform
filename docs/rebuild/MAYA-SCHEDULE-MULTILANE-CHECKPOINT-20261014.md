# Расписание с чередующимися мастерами — 2026-10-14

Проверенный code candidate: `9208d779df7f8c0d94f696e2011db66c43bfadee`.
Ветка: `codex/maya-local-crm-setup-20261010`. Исходный HEAD: `2e1d45490a9ba27db5a869ab6623b0469b5a5e1c`.
Локальная разработка после C9; не C10 и не новая release certification.

## Что исправлено

Настоящий journal выдаёт записи по времени. Renderer собирал все записи каждого
мастера в одну группу. Для A → B → A → C получалось A → A → B → C; это расходилось
с запечатанным порядком. Существующая проверка правильно отказывала structured
представлению, и карточка превращалась в prose.

На test-only `2588b9e6bb113ba32f9fd1e456e3564ff0943dfa` это воспроизведено через
AppModule + HTTP + PostgreSQL + emitted runtime/React: initial mode = prose при
четырёх записях трёх мастеров. Red unit baseline: 3 FAIL / 4 PASS.

Renderer теперь объединяет только соседние записи одного мастера. При возвращении
к тому же мастеру повторяется его исходная серверная подпись. Идентификаторы и
порядок записей, controls, названия, время, masked labels и владельцы действий
сохраняются. Запечатанный порядок не переписывается; проверка равенства не ослаблена.

- Lane определяется точным ID, не подписью. Одинаковые подписи не сливают мастеров;
  порядок объявления lanes не сортирует записи.
- Неизвестный lane, дублирующий ID, несовпадение reading_order, неверный H7 и
  TEXT_ONLY сохраняют отказ от structured. UI не исправляет серверную неоднозначность.
- Пустые объявленные lanes сохраняются как подписи после групп записей, в порядке
  объявления; они не создают ни записей, ни «свободных окон». Если все lanes пусты,
  их прежний порядок сохраняется.
- Source envelope не мутируется. Standalone controls остаются у прежнего механизма.
  Backend product code, React presentation semantics/CSS, schema, Client Identity,
  Action Engine, entitlement/release profiles и HANDOFF в этом unit не изменены.

## Свежие проверки на committed SHA

| Поверхность | Результат |
| --- | --- |
| Полный runtime | 846 PASS / 7 SKIP / 0 FAIL |
| Полный carrier | 196 PASS / 0 FAIL |
| Actual backend HTTP/PG → runtime/React | 4 PASS / 0 FAIL |
| Chrome: chat / navigation / voice / schedule | 35 / 207 / 56 / 50 PASS; всего 348 |
| NS-1 parent → detail → parent | 16 PASS |
| Packaging | 18 PASS; PWA/Capacitor parity — 8 files PASS |
| Runtime/carrier builds, types, architectural ratchets, reproducibility | PASS |
| Backend и widgets-live types, scoped fixture lint | PASS |
| Мутация старой группировки | KILLED: 3 FAIL; baseline/restored по 7 PASS |

Все итоговые прогоны начаты на clean `9208d779`; итоговый worktree и isolated clone
остались clean. Документация добавлена отдельным commit после этих проверок.
Это не полный backend suite, не Platform CI, не полный release mutation corpus и
не пересертификация всей Maya. Числа относятся к выполненным локальным поверхностям.

Actual source проверяет пустой журнал, четыре записи одного мастера, четыре записи
трёх мастеров A/B/A/C и прежний synthetic personal create/reschedule/cancel. В двух
заполненных сценариях initial и detail structured; время/timezone, названия и refs
точные, private note и чужая услуга отсутствуют. Journal не меняет Appointment
строки, не создаёт action executions и не расширяет tenant_owner до клиента.

Отдельный Chrome proof использует существующую synthetic SCHEDULE fixture с
чередованием A/B/A. DOM/Tab порядок совпадает с sealed reading_order в карточке,
detail и после возврата; PROGRESS закрывается, Escape возвращает фокус, timeline не
дублируется. Подмена principal и отказ сервера остаются отказами. Проверены 320/393/
1280px, увеличенный текст и 44px targets. Chrome proof не выдаётся за настоящий
браузер поверх AppModule, а synthetic subtitle — за новое backend emission evidence.

Мутация в отдельном clone возвращает прежний SCHEDULE block. Три положительных
теста снова падают именно на prose, а после восстановления проходят. Остальная
рабочая ветка не менялась. Предыдущие red receipts сохранены с provenance.

## Осталось

Закрыта actual-source проверка чередующихся мастеров из предыдущего checkpoint.
Агрегированные «свободные окна» без выбранной услуги остаются отдельным продуктовым
вопросом: journal `gaps: []` не является availability. Действующий личный выбор
услуги/мастера/дня использует каноническую availability и не изменён.

Реальный пользовательский проход, device acceptance и новый общий release admission
этим unit не выполнены. Остальные незакрытые части дизайн-пакета перечислены в
[SOURCE-MAP](evidence/maya-companion-design-20261013/SOURCE-MAP.md) с историей supersession.

Production, сохранённая база салона, Keychain, реальные модель/OTP/SMS/YCLIENTS,
grants/deploy, iPhone, push/merge: **0**. Новых миграций нет; существующие применены
только в новых искусственных proof DB. Обе временные базы остановлены.

[Архив проверок и hashes](evidence/maya-schedule-multilane-20261014/README.md).
CERTIFIED != DEPLOYED. Этот checkpoint подтверждает перечисленные локальные проверки.
