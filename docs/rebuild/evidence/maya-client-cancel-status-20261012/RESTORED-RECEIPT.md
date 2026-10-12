# Проверка сохранённого результата отмены после перезапуска

Дата: 2026-10-12. Ветка: `codex/maya-local-crm-setup-20261010`.
Code/test candidate: `83ecf5c555817d4eb3be796ba11637bacd220891`.
Application sources byte-identical to `13daeeeb`; финальный delta — только
ожидание compositor frames и проверка видимости результата в browser harness.
Статус: локальный synthetic integration checkpoint, **не release certification**.

## Что исправлено

На предыдущем `ee002988` сквозной тест сохранил исходную cancellation action в
UNKNOWN, перезапустил backend и PostgreSQL, но текущий React восстановил только
текст результата. Кнопки «Проверить результат» не было. Исторический FAIL сохранён
в `react-restart-checkpoint.json`; его не переписываем.

`59d6e46c` сохраняет у восстановленной server-authored строки только locator и
точные witnesses ответа: widget, tenant, principal hash, turn, parent и уже
известный action receipt reference. Старые envelope/token/control не ingested,
новая booking authority не создаётся. Кнопка вызывает существующий explicit
`booking_receipt` resolve и тот же статусный owner; backend в этом проходе не менялся.

- Никакого повторного COMMIT, изменения Client/tenant roles или нового writer.
- Backend повторяет текущую проверку Client/link/source/release authority.
- Runtime сверяет точные response witnesses, отказывает чужому/неоднозначному
  результату, не заменяет известный receipt reference и не превращает потерю
  ответа в успех либо разрешение повторной отмены.
- Одновременные нажатия дают один запрос. Sign-out, privacy erasure, display cap
  и dispose освобождают binding, отменяют запрос и запрещают позднюю публикацию.
- Canonical outcome dedupe сохраняется; текст сообщения не является identity.
- React и совместимый DOM-host получают только локальный item id и состояние.
  Одна существующая кнопка выделена в общий компонент, без нового визуального
  дизайна. `13daeeeb` сохраняет её прежний font stack вне WidgetCard.
- Browser probe выбирает кнопку у конкретного неопределённого результата, а не
  последнюю кнопку на странице. Его HTTP assertion по-прежнему требует exact
  cancellation widget id; test text не становится runtime authority.

## Проверки

| Поверхность | Свежий результат |
| --- | --- |
| Runtime complete suite на указанном candidate | 763 PASS / 7 SKIP / 0 FAIL |
| React carrier complete suite | 164 PASS / 0 FAIL |
| Restored receipt targeted runtime/DOM tests | 30 PASS / 0 FAIL |
| Targeted counterfactuals | green baseline 30; 11/11 killed; restored 30 PASS |
| Actual React → HTTP/AppModule → PostgreSQL + restart | 2/2 Jest stages, 12/12 browser checkpoints PASS |

Новый regression test до исправления падал именно на отсутствии восстановленной
кнопки. При выполнении mutation programme сначала обнаружены и сохранены
недостаток test dependency в изолированной копии и redundant guard, скрытый
проверкой conversation owner. Исправления `dc51ba8c` и `f8794d81` относятся к
harness/tests. Итоговый полный targeted corpus запускался заново на финальном SHA;
import errors, timeout и нецелевые failures не считаются убитыми мутациями.

Полный backend suite, глобальный release mutation corpus и AR-1 release admission
в этом локальном runtime unit не выполнялись. Более ранние backend 585/585 и
6/6 mutations остаются историческими receipts, не выдаются за новый полный CI.
Ранее раскрытые четыре scripts-typecheck TS2339 этим изменением не исправлялись.

## Границы

Только одноразовая изолированная PostgreSQL и искусственные identities/provider.
Реальные ключи из Keychain не читались. Реальные provider/model calls, OTP,
YCLIENTS effects, production migration/deploy/grant и установка iPhone: **0**.
Синтетическая миграция disposable test database не является production migration.

Реальный YCLIENTS и пользовательская приёмка остаются отдельной проверкой с
действующим разрешением. Сохранение ключей само по себе не продлевает бюджет,
доступ к реальным данным или право на внешний booking effect.

## Итог сквозного прогона

В отдельной базе synthetic native provider сохраняет одну отмену и теряет ответ.
Maya оставляет исходную action в UNKNOWN. Реальный restart PostgreSQL и новый
backend process сохраняют ту же action, executionAttemptCount=1 и исходные
Client/target/source evidence. React восстанавливает текст и отдельную кнопку.

1. Passive restore: 0 provider detail reads, никаких mutation POST/DELETE.
2. Первая явная проверка при недоступном источнике: один GET, UNKNOWN сохранён.
3. Следующая проверка: второй GET подтверждает отмену; **та же** action становится
   SUCCEEDED, mirror — canceled, единственная исходная ACCEPTED receipt получает
   reference этой action; AChat показывает «Запись отменена.».
4. Повторный completed read: результат тот же, новых provider GET/DELETE нет.
5. Чужой tenant locator не раскрывает исходный widget и не вызывает provider.
6. Отзыв verified Client link после restore: HTTP 403, нейтральная недоступность
   проверки; 0 provider reads, исходная UNKNOWN не превращается в успех.

В каждом сценарии provider ledger содержит ровно один DELETE. После restart
DELETE=0; `/widgets/intent`=0; `/ai/chat`=0. Оба Chrome и локальные web servers
завершились; изолированная PostgreSQL остановлена. Tracked source hashes и SHA
оставались неизменными весь прогон. Перед снимком harness переводит вкладку на передний план, ждёт два кадра и
проверяет единственную строку отмены внутри viewport. Это закрывает разрыв между
ранее проверенным DOM и слишком ранним screenshot, не меняя продукт.
Runtime и React builds прошли свои blocking
source/type/allowlist gates перед браузером.

- [Итог и state observations](restored-receipt-summary.json).
- [11 counterfactuals + green baseline/restored](restored-receipt-counterfactuals.json).
- [Пути, размеры и SHA256 raw receipts/screenshots](restored-receipt-raw-manifest.json).

Этот checkpoint закрывает ранее открытый restart UI/status-read барьер отмены.
Дальнейшая локальная/живая приёмка AChat и полный release programme им не заменены.
