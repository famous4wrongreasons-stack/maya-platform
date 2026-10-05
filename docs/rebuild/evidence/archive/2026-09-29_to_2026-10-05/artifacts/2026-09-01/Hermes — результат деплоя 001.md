<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 536faa475f85547f34fc840f2361fe4069129ab300380199814d351d339fedda -->

# Hermes — результат деплоя 001

Дата: 1 сентября 2026 года

Статус: успешно развёрнут и проверен.

Deployment ID: `hermes-001-20260901-134620`

## Изменено

- добавлен 301-редирект `www.malesthetic.pro` → соответствующий путь `malesthetic.pro`;
- исправлены canonical и `og:url` у `/booking/`, `/shop/` и трёх юридических страниц;
- `/shop/checkout/` удалён из `Disallow`, при этом `noindex, nofollow` сохранён.

Всего изменено 7 файлов. `/app`, Maya OS, PHP, webhook, главная страница, контент, дизайн, цены и данные клиентов не затрагивались.

## Проверка

- главная страница: HTTP 200, контрольная сумма не изменилась;
- `www` → canonical host: HTTP 301, затем 200;
- кириллический домен → canonical host: HTTP 301;
- 5 исправленных страниц: HTTP 200, собственные canonical и `og:url`;
- checkout: `noindex, nofollow` сохранён;
- robots.txt: правило checkout удалено, Sitemap сохранён;
- sitemap.xml: HTTP 200, 6 URL;
- production-хеши совпадают с подготовленным пакетом;
- rollback не потребовался.

## Восстановление

Backup до изменений:

`/home/m/mocine3388/muzhskayaestetika.rf/backups/hermes-001-20260901-134620/files.before.tar.gz`

Контрольные суммы до изменений:

`/home/m/mocine3388/muzhskayaestetika.rf/backups/hermes-001-20260901-134620/sha256.before.txt`
