# Приёмка frontend-пакета MAYA OS

Дата: 2026-07-13. Ветка: `codex/maya-os-trial-chat-fe`. Изменения не вносились в `main` и не деплоились в production.

## Принятый объём

- единый AI-onboarding в каноничном чате MAYA;
- активация 10-дневного trial через swipe без преждевременного учёта бизнеса;
- подтверждение blueprint, контактов, логотипа и способа календаря в одном потоке;
- fail-closed CRM-каталог и feature-readiness;
- subscription fence, выбор тарифа и создание checkout;
- метрика подключённых бизнесов для God Mode;
- byte-identical PWA/iOS web bundle.

## Исправления при приёмке

- checkout приведён к backend DTO: JSON `{planId}` и ответ `confirmation_url`;
- контакты приведены к обязательному DTO: email, имя и нормализованный телефон;
- потерянный draft больше не приводит к циклу одинаковых сообщений: старая активация закрывается, пользователь получает безопасный новый старт;
- universal SaaS fail-closed скрывает модули `planned` и `current_runtime_only`, кроме onboarding-чата;
- универсальная главная очищена от данных конкретного салона и мастера;
- в SaaS-режиме заблокированы скрытые legacy-запросы к `malesthetic.pro`;
- существующий production-режим MAYA сохраняет прежнюю навигацию и возможности.

## Проверки

- inline JavaScript: 22/22 скрипта в PWA и 22/22 в iOS;
- `npx cap sync ios`, затем `www/index.html` идентичен `ios/App/App/public/index.html`;
- browser smoke: trial swipe, onboarding, восстановление, contacts validation, CRM fail-closed, subscription checkout, universal home и current MAYA;
- негативный tenant-smoke: universal guest не запрашивает legacy booking endpoint;
- секреты, CRM-токены и trial-токены не попадают в URL, console или persistent storage.

## Остающиеся границы

Продакшен-платежи, SMS/social provider credentials, live CRM credentials и production deployment требуют действий владельца. Tenant-aware версии staff AI, commerce и video analytics ещё не реализованы и поэтому не показываются как готовые universal-функции.
