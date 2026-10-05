# Android Native APK Plan

## Цель

Собрать отдельное Android-приложение для MAYA / Мужская Эстетика не как TWA/PWA-обёртку, а как нормальный native shell на Capacitor, чтобы:

- не было адресной строки;
- не было зависимости от TWA fallback на Samsung;
- нижняя навигация и safe area работали предсказуемо;
- APK можно было выкладывать на сайт для прямого скачивания;
- при необходимости позже выпускать и AAB для Google Play.

## Что есть сейчас

- Web/PWA source: `/Users/stanislavmosin/Desktop/сайт и приложение/сайт и приложение/app.html`
- iOS Capacitor shell: `/Users/stanislavmosin/Desktop/maya-ios`
- iOS web mirror: `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`
- Текущий Android APK — TWA, а не отдельный Capacitor Android shell.

## Рекомендуемый путь

Не делать новый Android-проект с нуля отдельно от текущей iOS-обёртки, а расширить существующий Capacitor repo:

- repo: `/Users/stanislavmosin/Desktop/maya-ios`
- добавить в него платформу Android;
- использовать тот же `www/index.html`, что и для iOS;
- собирать Android APK/AAB из этого же репозитория.

Это самый короткий и управляемый путь.

## Что нужно подготовить

### 1. На Mac

- Android Studio
- Android SDK
- Android Platform Tools
- установленный Node/npm

### 2. Для подписи релизной сборки

- Android keystore
- alias
- пароль keystore
- пароль alias

Без keystore можно собрать debug APK для тестов, но не нормальный release APK.

### 3. Для тестирования

- Android-телефон по USB
- включённый `Developer mode`
- включённый `USB debugging`

## Этап 1. Подготовить репозиторий

Рабочая папка:

```bash
cd /Users/stanislavmosin/Desktop/maya-ios
```

Проверить, что сейчас в проекте нет Android platform:

```bash
find . -maxdepth 2 -type d -name android
```

Сейчас в проекте Android-папки нет, значит добавляем платформу.

## Этап 2. Добавить Android в текущий Capacitor проект

Установить Android platform package:

```bash
npm install @capacitor/android
```

Добавить платформу:

```bash
npx cap add android
```

После этого появится папка:

```text
/Users/stanislavmosin/Desktop/maya-ios/android
```

## Этап 3. Синхронизировать web-часть

Так как Android shell должен использовать тот же UI, что и iOS, перед каждой Android сборкой нужно обновлять web-слой.

Минимальный цикл:

1. правим боевой web source:
   `/Users/stanislavmosin/Desktop/сайт и приложение/сайт и приложение/app.html`
2. переносим нужную версию в:
   `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`
3. синхронизируем платформу:

```bash
cd /Users/stanislavmosin/Desktop/maya-ios
npx cap sync android
```

## Этап 4. Проверить конфиг Capacitor

Текущий файл:

`/Users/stanislavmosin/Desktop/maya-ios/capacitor.config.json`

Сейчас там уже есть:

- `appId: pro.malesthetic.app`
- `appName: Мужская Эстетика`
- `webDir: www`

Это хорошая база.

Проверить после добавления Android:

- Android использует локальный `www`
- нет режима TWA
- нет запуска через внешний браузер

## Этап 5. Открыть Android Studio

Открыть Android-проект:

```bash
cd /Users/stanislavmosin/Desktop/maya-ios
npx cap open android
```

Если команда не откроет IDE автоматически, открыть вручную папку:

```text
/Users/stanislavmosin/Desktop/maya-ios/android
```

## Этап 6. Настроить Android shell

В Android Studio нужно проверить:

### Обязательно

- package name
- app name
- app icon
- splash
- internet permission
- deep links / auth callbacks, если используются

### Проверить поведение

- приложение открывается без адресной строки;
- нет внешнего browser UI;
- нижняя навигация не уходит под экран;
- layout корректен на Samsung.

## Этап 7. Собрать debug APK для первого теста

Первый проход лучше делать как debug-сборку.

В Android Studio:

- `Build`
- `Build APK(s)`

или через Gradle:

```bash
cd /Users/stanislavmosin/Desktop/maya-ios/android
./gradlew assembleDebug
```

Обычно APK будет лежать примерно здесь:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Этап 8. Поставить на Samsung и проверить

Установить APK на устройство и проверить:

- открывается ли без адресной строки;
- видно ли нижнее меню;
- не ломается ли safe area;
- работает ли Telegram login;
- работает ли VK login;
- работают ли чат, видео, запись, аудио;
- не отваливается ли голосовой помощник MAYA;
- корректно ли работает тёмная и светлая тема.

## Этап 9. Подготовить release signing

Для нормальной публикуемой Android-сборки нужен keystore.

Если keystore ещё нет:

```bash
keytool -genkeypair \
  -v \
  -keystore maya-release.keystore \
  -alias maya \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Потом:

- сохранить keystore в безопасном месте;
- отдельно сохранить alias и оба пароля;
- не терять этот файл, иначе обновления приложения станут проблемой.

## Этап 10. Собрать release APK

После настройки signing config:

```bash
cd /Users/stanislavmosin/Desktop/maya-ios/android
./gradlew assembleRelease
```

Итоговый файл обычно:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Если нужен Google Play:

```bash
./gradlew bundleRelease
```

Это даст `.aab`.

## Этап 11. Выложить APK на сайт

После сборки release APK можно положить его на сайт как обычный файл.

Примерная схема:

- загрузить APK в папку сайта;
- добавить кнопку `Скачать для Android`;
- дать прямую ссылку на файл.

Примерно так:

```text
https://malesthetic.pro/downloads/maya-android.apk
```

## Этап 12. Обновления в будущем

После перехода на native Android shell релизный цикл будет таким:

1. меняем web UI / логику;
2. обновляем `www/index.html`;
3. `npx cap sync android`;
4. собираем новый APK;
5. загружаем APK на сайт;
6. пользователи скачивают новую версию.

## Важное архитектурное решение

Есть два варианта Android-обёртки:

### Вариант A. Локальный bundled web inside app

Плюсы:

- максимально похоже на native app;
- нет адресной строки;
- меньше зависимость от браузера;
- стабильнее на Samsung.

Минусы:

- для UI-обновлений чаще нужна новая APK-сборка.

### Вариант B. Native shell + remote web URL

Плюсы:

- можно обновлять web-часть без новой APK.

Минусы:

- больше тонких мест с auth, media, кэшированием, поведением webview;
- сложнее добиваться предсказуемости.

Для MAYA рекомендован **Вариант A**.

## Что я рекомендую делать дальше

### Шаг 1

На существующем repo `/Users/stanislavmosin/Desktop/maya-ios`:

```bash
npm install @capacitor/android
npx cap add android
```

### Шаг 2

Собрать первый debug APK и проверить его на Samsung Антона.

### Шаг 3

Если debug APK ведёт себя хорошо, настроить signing и собрать release APK.

### Шаг 4

Выложить release APK на сайт отдельной ссылкой для Android.

## Что нужно от владельца проекта

- Android Studio на Mac
- решение, где хранить keystore
- Android-телефон для USB теста
- подтверждение, что идём через существующий repo `maya-ios`, а не заводим новый `maya-android`

## Итог

Да, задача реальная и нормальная.

Нужно не чинить дальше TWA, а сделать отдельную Android-платформу на Capacitor в уже существующем мобильном repo. После этого:

- Android перестанет зависеть от TWA fallback;
- приложение будет выглядеть нативно;
- APK можно будет выкладывать на сайт и раздавать напрямую.
