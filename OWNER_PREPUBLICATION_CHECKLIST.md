# OWNER_PREPUBLICATION_CHECKLIST

Это только те действия, которые невозможно безопасно выполнить вместо владельца
аккаунтов. Секреты не отправлять в чат, GitHub, Markdown или frontend bundle.

## До закрытого staging-теста

- Выбрать staging API/app host, настроить DNS и TLS.
- Добавить существующий DeepSeek API key в server secret store. Один общий ключ
  допустим; новый ключ не нужен, если текущий имеет лимит и может быть отозван.
- Настроить отдельные лимиты/alerts на AI provider account.
- Создать test credentials YClients/Altegio с минимальными правами для одного
  canary-бизнеса. Не использовать основной токен для destructive тестов.
- Создать Telegram и Яндекс OAuth приложения и внести точные staging callback
  URL, которые выдаст deployment config.
- Подключить тестовый SMTP и SMS provider для кодов входа.
- Подключить YooKassa sandbox shop и webhook URL.

## Почта MAYA OS

Желаемый display name можно сделать `MAYA OS`, а local part `no-reply`.
Адрес `no-reply@maya.os` будет доставлять письма только если домен `maya.os`
реально зарегистрирован и принадлежит вам. Если такой домен недоступен, нужен
ваш существующий домен, например `MAYA OS <no-reply@malesthetic.pro>`, либо новый
реально зарегистрированный домен MAYA OS.

Для выбранного домена обязательны:

- SPF;
- DKIM;
- DMARC;
- SMTP/API credentials в server secret store;
- проверка доставки кода на Gmail, Yandex Mail и Mail.ru;
- корректный reply/support address, даже если sender называется `no-reply`.

## До TestFlight / закрытой публикации

- Подтвердить Apple Developer signing, bundle IDs, associated domains и universal
  links.
- Заполнить Privacy Policy, пользовательское соглашение, политику 152-ФЗ и
  Apple privacy questionnaire с юристом.
- Подготовить support email, реквизиты продавца, тарифы и правила возврата.
- Утвердить App Store правило: native icon всегда MAYA; логотип бизнеса меняется
  только у tenant PWA и внутри разрешённых white-label зон.
- Назначить 1-3 тестовых бизнеса и тестовых пользователей для ролей client,
  owner, staff.

## Перед production cutover

- Подтвердить результаты общей acceptance matrix после frontend-пакета Клода.
- Выбрать один canary tenant для live booking и включить его серверным флагом.
- Зафиксировать backup, migration window, rollback owner и контакт на инцидент.
- Проверить реальные Telegram/Yandex/email/SMS callback и webhook delivery.
- Проверить YooKassa реальным минимальным платежом и возвратом в разрешённом
  тестовом/боевом режиме.
- Явно одобрить production deployment. До этого шага production остаётся без
  изменений.
