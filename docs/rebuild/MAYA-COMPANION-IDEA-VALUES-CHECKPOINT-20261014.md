# Companion «Идеи»: значения и пояснения — 2026-10-14

Code candidate: `e8aa7e484433ef591f7b0389159ce83f3ec0f766`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `247c4c34d82574c4873b0dfb71ef81a060d74a55` (metadata evidence;
previous tested product `e9cd4ad2d7da61288e2026222835437b32ebd29c`).

## Что стало доступно

Список и подробности «Идей» в существующем React AChat теперь показывают
поддерживаемые значения C8, а не только дату и основание расчёта. Значения
читаются из того же server-owned сохранённого результата. Новый compute,
сетевой endpoint, writer или финансовая/клиентская политика не добавлены.

| Серверное основание | Что показываем | Что это не означает |
| --- | --- | --- |
| observed_attended_count | Число подтверждённых посещений | Все визиты вне указанного периода/охвата |
| confirmed_cash | Подтверждённые поступления | Прибыль или сумму после возвратов |
| confirmed_refunds | Подтверждённые возвраты | Поступления/прибыль |
| confirmed_cash_net_linked_refunds | Поступления минус связанные возвраты | Вычет всех расходов/прибыль |
| booked_value | Стоимость записей | Уже полученную оплату |
| provider_reported_gross | Сумму по данным источника | Подтверждённые деньги, прибыль или ценность клиента |
| c8.dormancy/* | Буквальный boolean: условие выполнено/не выполнено | Вероятность возвращения или согласие на сообщения |
| c8.scenario/booked_appointment | Условную стоимость существующей записи и horizonEnd | Полученную оплату, ожидаемый доход или причинный прирост |

Результат правила показывается только для VERIFIED client result. Сам порог
правила в этом unit не показан и не придуман: UI явно сообщает об этом. Рейтинг,
численный прогноз, неизвестные правила и версии не получают числового отображения.
Неполнота и qualification видны в списке и подробностях. Даты явно указаны в UTC;
исходный часовой пояс расчёта показан отдельно, календарная логика не пересчитывается.

## Проверяемая проекция

`maya-chat-shell/src/net/ideas.ts` сохраняет только конечный typed `IdeaFinding`.
Для значения обязательны current+available, COMPLETE/PARTIAL, квалификация,
известные kind/rule/version, одно значение, согласованные key/type/basis/unit/currency.
Сценарий дополнительно требует appointment и точный валидный horizonEnd после asOf.

- Integral strings ограничены 240 символами. Нет Number/float, округления,
  обрезки отрицательных значений, parseInt, нуля по умолчанию или агрегации разных валют.
- RUB отображается точным разбиением строки копеек на рубли, в соответствии с
  существующей Measurement minor-unit семантикой. Другие трёхбуквенные валюты
  сохраняют исходную целую величину и явную подпись «минимальных денежных единиц»;
  валютный exponent или конвертация для них не угадываются.
- Missing/invalid/unsupported/unavailable отличаются от нулевого результата.
  Некорректное значение не скрывает доступные метаданные и не превращается в число.
- Subject IDs, контакты, ranking members, исходные values/refs, policy/model IDs,
  rule parameters и предложенные intents не копируются в отображаемое значение.
- Server current/access reread, exact id+revision+digest selection, local expiry,
  session/close cancellation, bounded first-page disclosure и manual refresh
  сохранены из предыдущего checkpoint. Push-инвалидация не заявляется.
- Серверные tenant/principal/branch/finance checks остаются владельцами доступа;
  новый source proof отдельно проверяет отказ financial reader при общем доступе.

Backend product-код, Prisma/schema/migrations, AR-1, Client Identity, booking,
Action Engine, widget contracts/HANDOFF и writer разговора не менялись.
В backend изменён только `src/valuation/c8.companion-list.spec.ts`: фактический
`c8ComputeDeterministic` → `C8ReadService.list` → shipped runtime projector,
с искусственной persistence, policy и viewer, без providers/БД/compute endpoint.

## Свежие проверки

[Архив](evidence/maya-companion-idea-values-20261014/README.md) содержит все 17
итоговых команд на чистом неизменном committed SHA выше:

- Runtime: 816 PASS / 7 SKIP / 0 FAIL.
- Carrier: 182 PASS / 0 FAIL.
- Backend sources + полный набор C8 specs: 309 PASS / 22 suites.
- Scoped mutations: 58/58 killed, green baseline каждого набора; из них Ideas 25.
- Emitted browser proofs: 203 PASS, включая Ideas 56; отказ/expiry, значения,
  частичные данные, exact reread, фокус, Escape, черновик и прокрутка.
- Архитектурные runtime/carrier ratchets: PASS. Packaging tests: 18 PASS.
- Runtime reproducibility и PWA/Capacitor parity: PASS, 8 файлов payload,
  только разрешённая endpoint substitution.

Скриншоты final payload проверены: список 320px, сценарий 393px, сумма 1280px;
предварительно проверена сумма 320px. Reference lock — предоставленный владельцем
`Maya_full_design_package/screens/03-ideas.png`; существующие меню/Companion style
сохранены. Макет action-plan не стал источником полномочий.

Это scoped local checkpoint, **не новая release certification**. Семь SKIP не
считаются PASS. Не запускались полный backend/Platform CI, весь release mutation
corpus, native Xcode signing/install или реальная приёмка салона/провайдера/модели.

## Что остаётся отдельно

Готовые рекомендации, ранжированные списки клиентов, отображение параметров правил,
автоматическое выполнение планов и source-to-task mapping этим unit не закрыты.
C8 opportunity по-прежнему `inform_only`/`read_valuation_result`, без action intent;
AgentTask нельзя подменять личным A23 OperationalWorkItem. Следующий проход может
развивать чтение уже определённых параметров или другие источники Companion;
новые действия требуют своего существующего canonical owner/contract.

Production и сохранённая база салона не затрагивались. Keychain, модель, YCLIENTS,
SMS/OTP не использовались. Grants, миграции, deploy, push/merge и установка на iPhone
не выполнялись. C10 не начинался. Документы после проверок — отдельный commit;
код остаётся byte-identical протестированному SHA.
