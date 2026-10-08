# Локальный OCR: инвентаризация 8 октября 2026

**Доступный вариант для русского и английского без установки: Apple Vision `VNRecognizeTextRequest`, revision 3, режим `accurate`, языки `ru-RU` и `en-US`.** Поддержка этих языков подтверждена вызовом установленного framework. Распознавание изображения ещё не запускалось; качество OCR и работа нового parser не подтверждены.

| Средство | Установлено / проверено | Граница |
|---|---|---|
| macOS | 26.5.2, build 25F84, arm64 | Локальный Mac |
| Swift | 6.3.3, driver 1.148.6, `/usr/bin/swift` | Xcode выбран: `/Applications/Xcode.app/Contents/Developer` |
| Apple Vision | Framework и SDK присутствуют; supported revisions 1, 2, 3 | `accurate`: 30 языков, включая русский и английский; `fast`: 6 языков, русский отсутствует |
| Tesseract | 5.5.3, `/opt/homebrew/bin/tesseract`, Leptonica 1.87.0 | Установлены только `eng`, `osd`, `snum`; `rus.traineddata` отсутствует. Английский вариант доступен, русский не квалифицирован |
| Python по умолчанию | Homebrew 3.14.6; системный Python 3.9.6 | В default Python не найдены проверенные OCR/PyObjC/Pillow/Torch/ONNX distributions. Частные venv и документы не сканировались |
| Node | 24.15.0 | В backend установлен `sharp` 0.35.4 и `pngjs` 5.0.0; OCR engine packages отсутствуют |
| Дополнительные CLI | `sips`; `pdftotext` 26.04.0 | Не заменяют OCR изображения. `ocrmypdf` и `magick` не найдены в PATH |

Проверка Vision выполнила только `supportedRecognitionLanguages()` для двух режимов; elapsed 3.064 s, timeout 45 s, exit 0, stderr пуст. Создан исключительно небольшой Swift-код запроса метаданных и локальный module cache в этой scratch-папке. `imageInputs=0`, `recognitionRequestsPerformed=0`. Никакие фотографии, OCR fixtures, внешние API, модели или credentials не использовались.

Подтверждения:

- [Машинная инвентаризация](local-inventory.json): пути, версии, ограниченный перечень package checks, размеры и SHA256 установленных Tesseract language files.
- [Ответ Vision](vision-languages.json): полный список языков и revisions.
- [Команда и результат metadata query](vision-language-query.json).
- [Swift source запроса метаданных](vision-language-inventory.swift).

Минимальный следующий локальный pipeline: существующий `sharp` декодирует и нормализует изображение в памяти; небольшой локальный Swift helper принимает PNG bytes через stdin и вызывает Vision `accurate` с явно заданными `ru-RU`, `en-US`; stdout содержит только ограниченный JSON с распознанными текстами, расположением строк и исходной уверенностью OCR. Затем отдельный детерминированный parser выделяет строки таблицы. Неоднозначные числовые поля и смысл цены остаются `null`; engine confidence не является подтверждением корректности, товара или права на приход. `review_required` и `recognition_acceptance: NOT_ACCEPTED` сохраняются. Никакого автоматического поиска, выбора товара или изменения CRM.

Предлагаемые bounds для следующей реализации (сейчас **не реализованы и не проверены**): одно изображение ≤2 MiB согласно текущему upload-контракту; декодирование ≤8 млн пикселей и ≤4096 пикселей на сторону; один OCR child одновременно; timeout 15 s; TERM → KILL через 500 ms только своему child; stdout ≤128 KiB, stderr ≤4 KiB; ≤200 OCR observations по ≤240 символов; ≤20 структурированных строк согласно текущему preview-контракту. Запуск фиксированного исполняемого файла без shell, URL и путей, оригинал только в памяти, никаких временных файлов с изображением. Компиляцию Swift helper следует делать отдельно, не на каждом запросе. Новые границы должны иметь явные отказы, а не скрытое усечение.

Ограничения: Vision поддерживается этим Mac, но текущий backend Dockerfile основан на `node:24-alpine` и OCR туда не добавляет. Локальный Vision proof не доказывает Linux/deployment readiness. Tesseract нельзя использовать для утверждения поддержки русских накладных без установленного русского языка и отдельной проверки. Runtime `GoodsPhotoParser.parse()` пока возвращает `goods_photo_parser_not_configured`; эта инвентаризация ничего в нём не меняет. Многостраничные документы, рукопись, смешанная ориентация/сложные таблицы, качество на реальных документах и калибровка уверенности не проверялись.

Repository не редактировался. Установок, бизнес-вызовов YCLIENTS, платных запросов, gates, PG, app или browser запусков не было.
