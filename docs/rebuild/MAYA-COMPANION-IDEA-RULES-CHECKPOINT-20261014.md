# Companion «Идеи»: точные параметры правил — 2026-10-14

Code candidate: `dda3d3b77380bb9c08121fd1f42977dbf9761c9f`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `7543f0003c437ff504af4dffdfb343bee688bbce` (evidence for values;
previous tested code `e8aa7e484433ef591f7b0389159ce83f3ec0f766`).

## Что изменилось

В существующем списке «Идей» показан точный интервал текущего правила салона
и включение/исключение границы срока. В подробностях дополнительно объясняются
полнота исходных данных, ограничение набором услуг и семантика времени:

- `day` — истёкшие 24 часа, без подмены календарными днями;
- `calendar_month` — месяцы по местному времени расчёта, с ограничением даты
  последним днём месяца;
- `gt` — строго после интервала; `gte` — включая границу;
- используются только подтверждённые посещения; названия/ID услуг не раскрываются.

Отображается буквальный server-owned результат выполнено/не выполнено.
Экран не вычисляет дедлайн или boolean и не превращает сигнал в прогноз,
рекомендацию либо согласие на сообщение. Формулировки согласованы с существующим
`src/orchestration/c9.lifecycle-presentation.ts`; календарный владелец остаётся C8.

Параметры берутся из существующего `C8ReadService` для того же текущего результата.
Нет нового endpoint, compute, policy writer, значения по умолчанию или второго
источника правила. При отсутствующих/неверных параметрах показывается честное
пояснение об их отсутствии; значения другого результата не подставляются.

## Границы и доказательства

Runtime допускает конечную проекцию только для известной версии VERIFIED client
POLICY_SIGNAL. Проверяются точная структура, положительный целый интервал,
`proven_attendance`, COMPLETE/PARTIAL, согласованный ограниченный service count,
валидный timezone и совпадение с периодом исходного результата. Неизвестные поля,
числовые строки, нулевые/дробные интервалы и подмена timezone не принимаются.

Серверные тесты используют фактический deterministic producer → C8 reader →
shipped runtime projector с искусственными зависимостями. Подмена policy ID,
hash, версии или scope не даёт показать чужие параметры. Отзыв доступа и expiry
во время чтения закрывают результат. Exact id/revision/digest reread, session
invalidation, локальная expiry и ограничения disclosure сохранены.

В backend изменён только `src/valuation/c8.companion-list.spec.ts`, без product
изменений, SQL или миграций. React CSS/design не менялись; компактный список и
подробная карточка используют существующий Companion layout. Booking, Client
Identity, Action Engine, AR-1, HANDOFF и writer разговора не менялись.

## Свежая проверка committed candidate

[Архив](evidence/maya-companion-idea-rules-20261014/README.md) содержит все 17
команд, выполненных на чистом неизменном SHA выше:

| Область | Результат |
| --- | --- |
| Полный runtime | 821 PASS / 7 SKIP / 0 FAIL |
| Полный carrier | 186 PASS / 0 FAIL |
| Scoped backend sources, все C8 specs, C9 lifecycle presentation | 347 PASS / 23 suites |
| Scoped mutations | 69/69 killed, каждый baseline зелёный; Ideas 36 |
| Emitted browser checks | 215 PASS; Ideas 68, остальные поверхности 147 |
| Runtime/carrier architectural ratchets | PASS |
| Packaging tests | 18 PASS |
| Runtime reproducibility, PWA/Capacitor byte parity | PASS, 8 файлов, только разрешённая endpoint substitution |

Final screenshots просмотрены: компактный список 393px, правило дня 320px/1280px,
календарные месяцы 393px. Переносы текста корректны, закрытие и возврат доступны;
прокрутка, фокус, Escape, сохранение черновика и отказ доступа проверены браузером.
Это искусственные данные; внешних запросов в пяти browser suites — 0.

При разработке исправлены две ошибки новых тестов, с сохранением их исходных
отчётов: expiry reader возвращает canonical `c8_result_unavailable`, а не пустой
успех; браузер должен дождаться отказа сервера, прежде чем переключать следующую
fixture, а не принимать временное отсутствие DOM при загрузке за завершённый
отказ. Таймауты не увеличивались, проверки доступа не ослаблялись. Final rerun
после исправлений прошёл полностью; предварительные результаты его не заменяют.

## Статус и дальнейшие границы

Закрыт именно пробел отображения параметров правил из предыдущего checkpoint.
Автоматические рекомендации, ранжирование клиентов, исполнение планов и перенос
Ideas → tasks не реализованы. C8 opportunity остаётся `inform_only` с
`read_valuation_result`, без action intent. AgentTask и A23 OperationalWorkItem
не объединяются. Для новых действий нужен установленный canonical owner.

Это **scoped local checkpoint, не release certification**. Семь SKIP остаются
SKIP. Полный backend/Platform CI, полный release mutation corpus, native Xcode
signing/install и реальная приёмка салона в этот проход не выполнялись.

Production, сохранённая база салона, Keychain, реальные providers/модель не
использовались. Deploy, миграции, grant, OTP/YCLIENTS, push/merge и установка на
iPhone не выполнялись. C10 не начинался. Архив и этот документ коммитятся
отдельно после проверки; product code остаётся byte-identical tested SHA.
