# Локальная проверка Майи на реальной модели: подготовка

Runtime checkpoint: `01f5f9238719a1f30bf32f7256d840b4333ebc5b`.
Результат: явный локальный профиль реализован; 53 целевых теста, проверка типов
widgets-live и lint HTTP probe прошли. Независимый static review — qualified PASS.
Реального ввода ключа, вызова модели или HTTP/PG прогона нового профиля **не было**.

## Полезный результат

Один существующий core HTTP runner теперь принимает `--mode admitted-local`.
Он использует прежние adapter, budget gate, ledger, synthetic fixtures и историю
фактических ответов. Новый manifest mode — `ADMITTED_LOCAL_MODEL_HTTP`, opt-in
обязателен во всех потребителях. Remote default сохраняет разные UID и file
credential. Обычные widgets guards и локальный browser safe-mode не изменены.

Mac preparation создаёт новый приватный runroot `0700`, channel `0700` с UID/GID
владельца и manifest, привязанный к чистому committed source. Socket имеет `0600`.
На проверенном Mac каталог в `/private/tmp` наследует GID 0, поэтому только своему
новому channel preparation явно устанавливает текущие UID/GID. Серверный `02710`
не используется как молчаливый fallback.

Брокер сначала проверяет свежий pinned permit и необратимо занимает одноразовый
claim. Затем владелец вводит существующий ключ в Terminal без отображения символов.
Ввод ограничен 30 секундами и сроком permit; Ctrl-C, Ctrl-D, EOF, SIGTERM, SIGHUP,
истечение срока и отзыв приводят к отказу. Raw mode восстанавливается. Значение
остаётся только в памяти брокера; оно не передаётся через argv, env, IPC или reports.
Runner и приложение получают только локальный transport. После любого отказа
запроса, включая UNKNOWN, брокер прекращает работу; повторное использование claim
невозможно. SIGHUP runner теперь запускает обычную отмену и finally cleanup.

Same UID — доверие процессам владельца, без межпроцессной изоляции как на сервере.
Mutable buffers очищаются; гарантированное стирание JS string не заявляется.
Отзыв проверяется перед dispatch и каждые 100 ms во время TTY-ввода; уже начатый
upstream ограничен прежним timeout и общим deadline. SIGKILL cleanup локального
runner этим checkpoint не доказан.

## Доказательства

[Архив и SHA-256 файлов](evidence/local-model-profile-20261008/manifest.json):

- 21 admission test, 19 fake-TTY tests, 4 local socket tests, 3 source tests,
  6 resource tests: **53/53**, без пропусков. Один настоящий локальный Unix socket,
  без TCP/provider/DB. Sandbox первоначально отказал в listen; разрешённый
  unsandboxed targeted run прошёл.
- Проверка типов `test/tsconfig.widgets-live.json`, lint единственного изменённого
  HTTP probe, syntax checks семи runtime modules — PASS.
- Настоящая команда `core-local-prepare.mjs --prepare` на runtime commit создала
  manifest `9bb3f2fd4f544d35834d9e7035f9c707a117b45ef59de318db9c2f51ab3c64fc`.
  Статус `PREPARED_NOT_AUTHORIZED`, paid/credential admission false.
- Настоящий broker CLI с этим manifest, но без permit, отказал **до** TTY prompt,
  claim и broker artifacts. Это refusal proof, не actual-model acceptance.
- Независимый review закрыл найденный SIGHUP blocker; final addendum подтвердил
  ограниченную смену группы только своего channel.

Архивный manifest — доказательство подготовки runtime commit. Любой новый HEAD,
включая documentation commit, требует новой подготовки перед разрешённым прогоном.
Архивные plan placeholders не являются командами с разрешением на выполнение.

## Один конкретный secure handoff

Использовать существующий оплаченный DeepSeek account владельца. Историческое
пополнение $25 известно со слов владельца; текущий баланс не проверялся. Новая
учётная запись или новый ключ не нужны.

В текущем процессе четыре проверенных provider env names отсутствовали; project
`.env`/`.env.local` отсутствовали. Проверено только наличие `~/.codex/auth.json`
(regular, UID 501, mode 0600), без чтения. Это не подтверждает DeepSeek binding.

После точного разрешения на использование существующего ключа и платный прогон:

1. Выбрать один clean candidate. В backend выполнить только подготовку:
   `node scripts/conversation-qualification/core-local-prepare.mjs --prepare --output /private/tmp/mcl-FRESH_ID`.
   Путь должен быть новым, каноническим и коротким. Никакого permit preparation
   не выпускает. `local-plan.json` содержит точные argv и cwd для двух Terminal.
2. Привязать свежий внешний permit к этому manifest/runId/candidate/UID/GID/socket,
   точному owner approval и актуальной проверке pricing. Текущий конечный профиль:
   `deepseek-v4-pro`, endpoint `https://api.deepseek.com/chat/completions`,
   **3 диалога / 5 ходов / до 12 reservations / до $2 / окно 600 секунд**,
   concurrency 1, attempt timeout 30 секунд. При изменении цены или недоступности
   модели — точный отказ; профиль не расширять автоматически.
3. В Terminal владельца запустить broker argv из плана в backend cwd через
   чистое окружение (`env -i`, только PATH/HOME/TMPDIR/TZ и heap cap 256 MB).
   Заменить только nonsecret permit SHA/approval placeholders. Владелец вводит
   **существующий ключ непосредственно в скрытый TTY prompt брокера**.
   Получатель — этот локальный broker, location — память процесса. Не чат, не
   `.env`, не keyfile, не копирование production secret.
4. После readiness запустить runner argv из того же плана в другом Terminal.
   Он создаёт свою fresh proof PG; heap 3072 MB, Jest 1 worker, PG 64/4 MB,
   30 connections. Для этого тяжёлого HTTP/PG прогона требуется отдельный
   согласованный слот с parent. Показать фактические ответы и source refs;
   проверить бизнес-таблицы и cleanup. Не объявлять качество по факту HTTP 200.

Точное разрешение на credential-use/paid run пока отсутствует. Наличие средств
на аккаунте таким разрешением не считается. До него safe code work продолжается.

## Один candidate: corpus, web и телефон

| Контур | Состояние и следующий шаг |
| --- | --- |
| Core 3/5 | Actual HTTP/history wiring есть; локальный actual-model прогон ещё не выполнен. Это первый ограниченный диагностический запуск. |
| Current-candidate 24/33 | Existing HTTP fixtures используют canned transport. Автоматического real-model переключения нет. |
| Frozen follow-up 12/24 | Dataset есть; конечных fixture bindings ещё нет. Сначала привязать 6 priority cases / 13 ходов, затем отдельное разрешённое расширение бюджета. |
| Полный corpus | Фактические JSONL counts: **13 602** = 11 352 utterances + 1 050 multi-turn + 600 adversarial + 600 contrastive. Старые 13 470 в карте устарели. Evaluator оценивает supplied predictions; gold-copy selftest не проверяет модель. Полного actual-history runner нет. |
| React web | Канонический payload общий. Loopback relay существует; интерактивная привязка backend к этому bounded model profile ещё нужна. `local-api-guard.mjs` остаётся safe-only. |
| Телефон | Debug development API override требует reachable trusted HTTPS. App ID `ru.mayaos.app` не меняется; side-by-side install отсутствует и обычная установка заменит текущую. Устройство/HTTPS сейчас не запускались. |

Существующий loopback web путь из корня repository:

```sh
node maya-carrier-react/tools/release.mjs build
node maya-chat-shell/dev/serve.mjs --root=maya-carrier-react/dist/web --port=8788 --api=http://127.0.0.1:3310/api
```

Эти команды в данном checkpoint не выполнялись. `maya-carrier-react` npm serve
ссылается на отсутствующий `tools/serve.mjs`; приведён существующий explicit relay.
На телефоне `127.0.0.1` ведёт к самому телефону, не к Mac.

Дальнейшая последовательность: actual 3/5 → разобрать каждый ответ/planner/tool
stage и canonical evidence → исправить ошибки → связать priority follow-ups →
тот же backend через React → отдельно подготовленный безопасный phone target.
Ни 3 диалога, ни synthetic corpus не дают общего процента готовности Майи.

Рабочий сайт, deployment, live YCLIENTS/CRM, notifications, production, warehouse,
design и Colima не затронуты. SSH диагностика отложена; сервер не является
предусловием локальной разработки. Это не завершение C10 и не разрешение фоновой
автономии.
