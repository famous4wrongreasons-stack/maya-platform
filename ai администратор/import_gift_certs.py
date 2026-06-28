#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Одноразовый импорт предпечатных («на предъявителя») подарочных сертификатов
из codes.csv в боевую таблицу gift_certificates.

ЗАПУСКАТЬ НА VPS БОТА, из папки бота (рядом с database.py):
    cd ~/barbershop-bot
    cp barbershop.db barbershop.db.bak-$(date +%Y%m%d_%H%M)      # бэкап БД!
    python3 import_gift_certs.py codes.csv                        # сухой прогон: --dry
    python3 import_gift_certs.py codes.csv --dry                  # показать, ничего не писать

Поведение:
  - payment_status = 'paid'  → коды погашаемы сразу (решение владельца).
  - expires_at = сегодня + 365 дней (срок действия 1 год).
  - recipient_phone пустой (сертификат на предъявителя).
  - Идемпотентно: код, который уже есть в базе, ПРОПУСКАЕТСЯ (повторный запуск безопасен).
  - Использует database.save_gift_certificate() — ту же функцию, что и покупка
    сертификата в приложении, поэтому колонки и шифрование ПД корректны.
"""
import csv
import sys
from datetime import datetime, timedelta

import database  # модуль бота; запускать из папки бота на VPS

VALID_DAYS = 365
CSV_PATH = next((a for a in sys.argv[1:] if not a.startswith("--")), "codes.csv")
DRY = "--dry" in sys.argv

expires_at = (datetime.now() + timedelta(days=VALID_DAYS)).isoformat(timespec="seconds")

rows = list(csv.DictReader(open(CSV_PATH, encoding="utf-8-sig")))
print(f"CSV: {CSV_PATH} | строк: {len(rows)} | expires_at = {expires_at} | DRY={DRY}")

added = skipped = errors = 0
for r in rows:
    code = (r.get("Код") or "").strip().upper()
    try:
        amount = int(r.get("Номинал"))
    except (TypeError, ValueError):
        print(f"  ПРОПУСК (битый номинал): {r}")
        errors += 1
        continue
    if not code:
        errors += 1
        continue
    try:
        if database.get_gift_certificate(code):
            skipped += 1
            continue
        if not DRY:
            database.save_gift_certificate(
                code=code,
                amount=amount,
                recipient_phone="",      # на предъявителя
                expires_at=expires_at,
                payment_status="paid",   # погашаем сразу
            )
        added += 1
    except Exception as e:
        errors += 1
        print(f"  ОШИБКА {code}: {e}")

print(f"\nИТОГ: добавлено {added} | пропущено (уже было) {skipped} | ошибок {errors} | всего {len(rows)}")

# Контрольная проверка: первый код виден и готов к гашению
if rows:
    s = (rows[0].get("Код") or "").strip().upper()
    c = database.get_gift_certificate(s)
    if c:
        print(f"Проверка {s}: amount={c.get('amount')} "
              f"payment_status={c.get('payment_status')} "
              f"used_at={c.get('used_at')} expires_at={(c.get('expires_at') or '')[:10]}")
    else:
        print(f"Проверка {s}: НЕ НАЙДЕН (если был DRY — это нормально)")
