<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 04bfa5a90801fa64c697caf5f27916177477cb685706d522eae66139174a5e35 -->

# Hermes — пакет исправлений 001

Статус: успешно загружен на Beget и проверен 1 сентября 2026 года.

Deployment ID: `hermes-001-20260901-134620`.

## Что исправляет пакет

1. Добавляет 301-редирект `www.malesthetic.pro` → `malesthetic.pro` с сохранением пути.
2. Назначает собственный canonical и `og:url` страницам записи, магазина и трём юридическим страницам.
3. Убирает `/shop/checkout/` из `Disallow`, сохраняя на самой странице `noindex, nofollow`.

## Какие production-файлы затрагиваются

- `.htaccess`;
- `robots.txt`;
- `booking/index.html`;
- `shop/index.html`;
- `personal-data-policy/index.html`;
- `personal-data-consent/index.html`;
- `privacy/index.html`.

## Что гарантированно не затрагивается

- `/app` и Maya OS;
- webhook/PHP и интеграции;
- контент главной, дизайн, цены и услуги;
- аккаунты, CRM и данные клиентов;
- любые другие сайты и площадки.

Перед загрузкой Hermes повторно проверил контрольные суммы production-файлов, создал датированную резервную копию и загрузил только эти семь файлов.

Проверено после загрузки:

- главная отвечает 200 и не изменилась;
- `www` и кириллический домен перенаправляются на тот же путь `malesthetic.pro`;
- пять страниц имеют собственные canonical и `og:url`;
- checkout сохранил `noindex, nofollow`;
- checkout удалён из `Disallow`;
- sitemap отвечает 200 и содержит прежние 6 URL;
- rollback не потребовался.

Backup: `/home/m/mocine3388/muzhskayaestetika.rf/backups/hermes-001-20260901-134620/files.before.tar.gz`.
