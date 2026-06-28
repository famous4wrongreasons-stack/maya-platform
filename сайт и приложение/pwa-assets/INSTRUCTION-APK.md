# Как собрать APK для Android через PWABuilder

## Что ты получишь

APK-файл, который ставится на любой Android-телефон через любой браузер. Внутри открывается **версия из `/app/`** (та что с отдельным дизайном приложения), а не главный сайт. Контент обновляется автоматически через service worker.

---

## Шаг 0. Залей подготовленные файлы на Beget

Структура папки:

```
pwa-assets/
├── for-root/      ← кладём в КОРЕНЬ сайта (туда же, где index.html)
├── for-app/       ← кладём в папку /app/ на сервере
├── logo-source.png    (исходный логотип — не загружать)
└── INSTRUCTION-APK.md (эта инструкция)
```

### 📁 `for-root/` → в корень сайта `malesthetic.pro/`

| Файл | Куда |
|------|------|
| `icon-192.png` | `malesthetic.pro/icon-192.png` |
| `icon-512.png` | `malesthetic.pro/icon-512.png` |
| `icon-192-maskable.png` | `malesthetic.pro/icon-192-maskable.png` |
| `icon-512-maskable.png` | `malesthetic.pro/icon-512-maskable.png` |
| `apple-touch-icon.png` | `malesthetic.pro/apple-touch-icon.png` *(перезатрёт)* |
| `manifest.json` | `malesthetic.pro/manifest.json` *(перезатрёт)* |

### 📁 `for-app/` → в папку `/app/` на сервере

| Файл | Куда |
|------|------|
| `icon-192.png` | `malesthetic.pro/app/icon-192.png` *(перезатрёт)* |
| `icon-512.png` | `malesthetic.pro/app/icon-512.png` *(перезатрёт)* |
| `icon-192-maskable.png` | `malesthetic.pro/app/icon-192-maskable.png` |
| `icon-512-maskable.png` | `malesthetic.pro/app/icon-512-maskable.png` |
| `apple-touch-icon.png` | `malesthetic.pro/app/apple-touch-icon.png` *(перезатрёт)* |
| `manifest.json` | `malesthetic.pro/app/manifest.json` *(перезатрёт)* |

### ✅ Проверь что иконки и манифесты открываются:

- https://malesthetic.pro/icon-192.png
- https://malesthetic.pro/manifest.json
- **https://malesthetic.pro/app/icon-192.png** ← важно для APK
- **https://malesthetic.pro/app/manifest.json** ← важно для APK

Если хоть один даёт 404 — APK не соберётся.

---

## Шаг 1. Открой PWABuilder

1. Зайди на **https://www.pwabuilder.com/**
2. В большое поле ввода вбей: **`https://malesthetic.pro/app/`**
   ⚠️ Слэш в конце обязателен. Это URL версии приложения, а не главного сайта.
3. Нажми **Start**

PWABuilder проанализирует и покажет оценку — должна быть зелёная. Если жёлтая/красная — пришли скрин что показывает.

---

## Шаг 2. Сгенерируй Android-пакет

1. Сверху вкладка **Package For Stores**
2. Кликни на блок **Android**
3. Нажми **Generate Package**

**В диалоге настроек:**
- **Package ID**: `pro.malesthetic.twa`
- **App name**: `Мужская Эстетика`
- **Launcher name**: `Мужская Эстетика`
- **App version**: `1.0.0`
- **App version code**: `1`
- **Display mode**: Standalone
- **Notifications**: Off (на старте не нужно)
- **Signing key**: оставь **Create new**

Нажми **Download Package**.

---

## Шаг 3. Распакуй ZIP и залей на Beget

В архиве найдёшь:
- `app-release-signed.apk` ← главный файл (то что юзеры качают)
- `assetlinks.json` ← подтверждение что APK и сайт связаны
- инструкции от PWABuilder

### Залить:

1. **APK** → переименуй `app-release-signed.apk` в `malesthetic.apk` → положи в корень:
   ```
   malesthetic.pro/malesthetic.apk
   ```

2. **assetlinks.json** → положи в специальную папку:
   ```
   malesthetic.pro/.well-known/assetlinks.json
   ```
   Если папки `.well-known` нет — создай. Точка в начале обязательна.

### Проверь:

- https://malesthetic.pro/malesthetic.apk (должен начать качаться)
- https://malesthetic.pro/.well-known/assetlinks.json (должен открыть JSON)

---

## Шаг 4. Скажи мне «готово»

Я тогда:
- Добавлю **детект Samsung Internet** на сайте — он будет автоматически предлагать скачать APK
- Добавлю **проверку версии APK** для уведомлений об обновлениях
- Проверю что всё работает

---

## Дальше: как обновлять

### Контент (HTML/CSS/JS внутри приложения)

**Ничего не делать** — обновляется само через service worker. Заливаешь новый `app.html` на сервер → юзер открывает приложение → видит обновление.

### Иконка / имя / splash APK

Нужно пересобрать через PWABuilder:
1. Подними `App version` (`1.0.1` → `1.0.2`)
2. Подними `App version code` (`2` → `3`)
3. **ТОТ ЖЕ signing key** что и в первый раз (PWABuilder сохраняет в аккаунте)
4. Скачай → залей вместо старого `malesthetic.apk`

### Google Play Store

За $25 разовых можно публиковать. Преимущества:
- Автоматические обновления у юзеров
- Рейтинг и отзывы
- Поиск в Play Store
- Больше доверия

Это потом, не на старте.
