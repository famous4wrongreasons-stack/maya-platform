# Фото накладной в Companion — 2026-10-14

Проверенный candidate: `bdba69cdf583ac8970cec699a60a0cd6aa33e376`.
Ветка: `codex/maya-local-crm-setup-20261010`.
Исходный HEAD: `32bbed680b6c50319b52e74a0404aaef0f992d2e`.
Product commit: `b3c9ad3fc33960ab2e83296b3d32e376e087269c`.
Final candidate добавляет только исправление ожидания в browser harness.
Локальная разработка после C9; не C10 и не новая release certification.

## Результат

Существующий GoodsPhoto показан в нижнем листе Companion «Добавить в разговор».
Оба прежних входа — кнопка рядом с полем сообщения и пункт меню — вызывают тот же
runtime owner. Aurora сохраняет прежний inline panel. Новый лист не создаёт
собственный черновик, запрос, загрузчик, подтверждение или право на приход товара.

Нативное модальное окно удерживает фокус, делает фон неактивным и прокручивает
длинную форму независимо от чата. Escape и обе кнопки закрытия вызывают существующий
`GoodsPhotoPort.abort()`: временные поля очищаются, незавершённый запрос отменяется,
поздний ответ не возвращает старые строки. Фокус возвращается к открывшей кнопке;
если она исчезла или недоступна, используется чат. Черновик сообщения сохраняется.

Предварительные строки, поиск товара, ручная проверка закупочной цены, ограничение
на один PNG/JPEG/WebP до 2 МиБ, отдельное подтверждение прихода и запрет автоматического
повтора при неизвестном результате остаются у прежних owners. Цены каталога и OCR
не становятся закупочной ценой. Фото не добавляется в постоянное хранилище.

Backend, runtime, schema, API, Client Identity, Action Engine, release/entitlement
semantics и HANDOFF не менялись. Нет новых зависимостей, внешних origins или assets.

## Свежие проверки на committed SHA

| Поверхность | Результат |
| --- | --- |
| Полный runtime | 846 PASS / 7 SKIP / 0 FAIL |
| Полный React carrier | 198 PASS / 0 FAIL |
| Chrome: chat / navigation / voice / schedule / photo | 35 / 207 / 56 / 50 / 38 PASS; всего 386 |
| NS-1 parent → detail → parent | 16 PASS |
| Packaging | 18 PASS; PWA/Capacitor parity — 8 files PASS |
| Builds, types, architectural ratchets, runtime reproducibility | PASS |
| Мутация отмены по Escape | KILLED; baseline и restored по 38 PASS |

Итоговые проверки выполнены на clean final candidate; SHA и чистота сохранены
в конце прогона. Evidence/docs добавлены отдельным commit. Это не полный backend
suite, не Platform CI, не весь release mutation corpus и не iOS device acceptance.
Проверялись web/Capacitor payloads; native Xcode build/sync/install не выполнялись.

Новый браузерный сценарий использует настоящие emitted React/runtime и конечный
набор искусственных HTTP-ответов. Проверены file refusal без отправки, pending/late
response, точная передача ручного proposal, UNKNOWN без повторной отправки,
session expiry, очистка полей, Tab/Shift-Tab, 320/393/427/1280 px, короткий viewport
и увеличенный текст. Настоящие OCR, AppModule, DB, провайдер и документ в этом
сценарии не используются. Это не доказательство качества OCR или успешного
реального прихода товара; новый тест не нажимает бизнес-подтверждение.

Мутация в отдельном clone удаляет `port.abort()` из native `onCancel`.
Сценарий падает на «Escape clears ephemeral picker and returns to actual plus
opener» после 11 проверок; исходник восстановлен, все 38 проверок проходят.
Clone в конце clean; рабочая ветка мутацией не менялась.

## Не скрытые сбои подготовки

- Photo dev01: тест увидел pending UI до получения запроса loopback server.
  В тест добавлено ожидание фактического запроса, без изменения runtime.
- Navigation dev01: ожидался fallback в чат, но существующий menu owner возвращает
  фокус к видимой кнопке меню. Исправлено ожидаемое значение; product не менялся.
- Первый final run на `b3c9ad3f`: schedule дошёл до 48 проверок, затем прочитал
  `pending.res` до получения последнего запроса сервером. Commit `bdba69cd`
  исправляет только зависимость в тесте: ответ отправляется после получения запроса.
  Сохранился существующий предел ожидания 8 секунд. После этого весь локальный
  набор прогнан заново; прежние частичные результаты не заменяют final receipts.

## Дизайн и оставшаяся граница

Визуальный источник — `Maya_full_design_package/screens/19-attachments.png`:
нижний белый лист, handle, скругления, заголовок и затемнённый фон. Поля и действия
берутся из существующего GoodsPhoto, а не из демонстрационных кнопок прототипа.
Скриншоты итоговой сборки просмотрены; контрольные 320/393/1280 px и увеличенный
текст сохранены в evidence.

Закрыт перенос существующего photo flow в Companion sheet. Generic media/file
upload, storage/list lifecycle и демонстрационное «Открыть медиа» не реализованы
этим unit. Другие незакрытые источники/решения перечислены в
[SOURCE-MAP](evidence/maya-companion-design-20261013/SOURCE-MAP.md).

Production, сохранённая база салона, Keychain, реальные модель/OTP/SMS/YCLIENTS,
миграции, grants/deploy, iPhone, push/merge: **0**.

[Архив проверок, screenshots и hashes](evidence/maya-companion-photo-sheet-20261014/README.md).
CERTIFIED != DEPLOYED. Этот checkpoint подтверждает только перечисленные локальные проверки.
