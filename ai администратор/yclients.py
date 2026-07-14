import json
import os
import time
import logging
import requests
from datetime import datetime, timedelta
from config import YCLIENTS_BASE_URL, YCLIENTS_PARTNER_TOKEN, YCLIENTS_USER_TOKEN, YCLIENTS_COMPANY_ID, YCLIENTS_CASH_ACCOUNT_ID, YCLIENTS_CASHLESS_ACCOUNT_ID, ACTIVE_MASTER_IDS

logger = logging.getLogger("yclients")

SCHEDULE_FILE = os.path.join(os.path.dirname(__file__), "schedule.json")


def get_schedule_from_file(master_name: str, days_ahead: int = 14) -> list[dict]:
    """
    Читает график мастера из schedule.json (формат weekly + overrides).
    Возвращает рабочие дни на ближайшие days_ahead дней.
    Поиск по имени — полному или частичному (регистр не важен).
    """
    RU_DAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]

    try:
        with open(SCHEDULE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        masters = data.get("masters", {})
        name_lower = master_name.lower().strip()

        # Ищем мастера по имени (частичное совпадение)
        found_key = None
        for key in masters:
            if name_lower in key.lower() or key.lower() in name_lower:
                found_key = key
                break

        if not found_key:
            return [{"error": f"Мастер '{master_name}' не найден в графике"}]

        master_data = masters[found_key]
        weekly   = master_data.get("weekly", {})
        overrides = master_data.get("overrides", {})  # {"2026-06-01": null | "10:00-18:00"}

        today  = datetime.now().date()
        result = []

        for i in range(days_ahead):
            day = today + timedelta(days=i)
            date_str = day.strftime("%Y-%m-%d")
            weekday  = RU_DAYS[day.weekday()]

            # Разовое исключение имеет приоритет над еженедельным шаблоном
            if date_str in overrides:
                hours = overrides[date_str]
            else:
                hours = weekly.get(weekday)

            if not hours:
                continue  # выходной

            if i == 0:
                label = "Сегодня"
            elif i == 1:
                label = "Завтра"
            else:
                label = day.strftime("%d.%m")

            result.append({
                "date": date_str,
                "label": f"{label} ({weekday})",
                "hours": hours,
            })

        if not result:
            return [{"message": f"У {found_key} нет рабочих дней в ближайшие {days_ahead} дней"}]
        return result

    except FileNotFoundError:
        return [{"error": "Файл расписания не найден. Добавь schedule.json"}]
    except Exception as e:
        return [{"error": str(e)}]


def get_day_hours(master_name: str, date_obj) -> str | None:
    """
    Возвращает часы работы мастера на конкретную дату ('10:00-21:00')
    или None, если выходной либо мастер не найден.
    date_obj — объект datetime.date.
    """
    RU_DAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
    try:
        with open(SCHEDULE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        masters = data.get("masters", {})
        name_lower = master_name.lower().strip()
        found_key = None
        for key in masters:
            if name_lower in key.lower() or key.lower() in name_lower:
                found_key = key
                break
        if not found_key:
            return None

        master_data = masters[found_key]
        overrides = master_data.get("overrides", {})
        date_str = date_obj.strftime("%Y-%m-%d")
        if date_str in overrides:
            return overrides[date_str]

        weekly = master_data.get("weekly", {})
        return weekly.get(RU_DAYS[date_obj.weekday()])
    except Exception:
        return None

# Кэш: {ключ: (данные, время_записи)}
_cache: dict = {}
CACHE_TTL = 1800  # 30 минут

# Отдельный короткий кэш для графика мастеров (меняется реже минут, но чаще,
# чем общий справочник; и сюда НЕ кладём ошибки — иначе сбой залипнет на TTL).
_sched_cache: dict = {}
SCHED_TTL = 300  # 5 минут

# Короткий кэш записей мастера на конкретный день: нужен для защитной сверки
# свободных слотов с реальными record'ами YClients.
_day_records_cache: dict = {}
DAY_RECORDS_TTL = 60  # 1 минута


def _cached(key: str, fn, *args, **kwargs):
    """Возвращает данные из кэша или запрашивает заново."""
    if key in _cache:
        data, ts = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
    result = fn(*args, **kwargs)
    _cache[key] = (result, time.time())
    return result


def _digits10(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    return digits[-10:] if len(digits) >= 10 else digits


def _clean_avatar(url: str) -> str:
    """Отсекаем generic-плейсхолдеры YClients (силуэт без фото), чтобы в журнале
    показывать букву-инициал, а не одинаковые серые силуэты. Реальное фото —
    возвращаем как есть (полный CDN-URL)."""
    u = (url or "").strip()
    if not u:
        return ""
    low = u.lower()
    if low.startswith("//"):
        u = "https:" + u
        low = u.lower()
    # типовые дефолтные аватары YClients
    if any(s in low for s in ("no-master", "nomaster", "no_avatar", "noavatar",
                              "default", "/general/", "placeholder", "anonymous")):
        return ""
    if not low.startswith("http"):
        return ""
    return u


class YClientsAPI:
    def __init__(self, company_id=None, user_token=None, partner_token=None,
                 cash_account_id=None, cashless_account_id=None, base_url=None):
        # Без аргументов — боевой салон из config (поведение 1:1, ничего не ломаем).
        # С аргументами — креды конкретного салона (мультитенант: company_id + user_token
        # салона; partner-токен платформенный). Все 11 мест `YClientsAPI()` остаются как есть.
        self.base_url = base_url or YCLIENTS_BASE_URL
        self.company_id = company_id or YCLIENTS_COMPANY_ID
        self.user_token = user_token or YCLIENTS_USER_TOKEN
        self.partner_token = partner_token or YCLIENTS_PARTNER_TOKEN
        self.cash_account_id = cash_account_id if cash_account_id is not None else YCLIENTS_CASH_ACCOUNT_ID
        self.cashless_account_id = cashless_account_id if cashless_account_id is not None else YCLIENTS_CASHLESS_ACCOUNT_ID
        self.headers = {
            "Authorization": f"Bearer {self.partner_token}, User {self.user_token}",
            "Accept": "application/vnd.yclients.v2+json",
            "Content-Type": "application/json",
        }

    def _get(self, endpoint: str, params: dict = None) -> dict:
        url = f"{self.base_url}/{endpoint}"
        resp = requests.get(url, headers=self.headers, params=params, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def _post(self, endpoint: str, data: dict) -> dict:
        url = f"{self.base_url}/{endpoint}"
        resp = requests.post(url, headers=self.headers, json=data, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def _put(self, endpoint: str, data: dict) -> dict:
        url = f"{self.base_url}/{endpoint}"
        resp = requests.put(url, headers=self.headers, json=data, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def _delete(self, endpoint: str) -> dict:
        url = f"{self.base_url}/{endpoint}"
        resp = requests.delete(url, headers=self.headers, timeout=10)
        resp.raise_for_status()
        # 204 No Content — успех без тела ответа
        if resp.status_code == 204 or not resp.text.strip():
            return {"success": True}
        return resp.json()

    # ─── Мастера ────────────────────────────────────────────────────────────

    def get_masters(self) -> list[dict]:
        """Возвращает список мастеров компании (с кэшем 30 мин)."""
        return _cached("masters", self._fetch_masters)

    def _fetch_masters(self) -> list[dict]:
        try:
            data = self._get(f"company/{self.company_id}/staff")
            masters = []
            for m in data.get("data", []):
                if m["id"] in ACTIVE_MASTER_IDS:
                    masters.append({
                        "id": m["id"],
                        "name": m.get("name", ""),
                        "specialization": m.get("specialization", ""),
                        # аватар мастера из YClients (полный URL CDN). Пустой default
                        # отсекаем, чтобы в журнале не показывать generic-силуэт.
                        "avatar": _clean_avatar(m.get("avatar_big") or m.get("avatar") or ""),
                    })
            return masters
        except Exception as e:
            return [{"error": str(e)}]

    # ─── Реальный график работы (из YClients) ──────────────────────────────

    def get_staff_schedule(
        self, staff_id: int, date_from: str, date_to: str
    ) -> list[dict]:
        """
        Реальный график мастера из YClients (учёт отпусков, замен, изменений).
        Эндпоинт: schedule/{company}/{staff}/{from}/{to}.
        Возвращает [{date, is_working, slots:[{from,to}]}, ...].
        Успешный ответ кэшируется на SCHED_TTL; ошибки НЕ кэшируются.
        """
        key = "sched:%s:%s:%s" % (staff_id, date_from, date_to)
        now = time.time()
        hit = _sched_cache.get(key)
        if hit and now - hit[1] < SCHED_TTL:
            return hit[0]
        try:
            data = self._get(
                f"schedule/{self.company_id}/{staff_id}/{date_from}/{date_to}"
            )
            rows = data.get("data", []) or []
            _sched_cache[key] = (rows, now)   # кэшируем только успешный ответ
            return rows
        except Exception as e:
            return [{"error": str(e)}]   # ошибку наверх, но в кэш НЕ кладём

    def who_works_on(self, date_str: str) -> dict:
        """
        Кто из мастеров работает в конкретный день. Тянет реальный график
        каждого активного мастера из YClients.
        Возвращает {date, working:[{name,hours}], off:[name], ...}.
        """
        working, off = [], []
        for m in self.get_masters():
            if not isinstance(m, dict) or "id" not in m:
                continue
            sid = m["id"]
            name = m.get("name", "")
            rows = self.get_staff_schedule(sid, date_str, date_str)
            row = rows[0] if rows and isinstance(rows[0], dict) else {}
            if row.get("is_working") and row.get("slots"):
                s = row["slots"][0]
                hours = f"{s.get('from','')}-{s.get('to','')}"
                # Если несколько интервалов — склеим
                if len(row["slots"]) > 1:
                    hours = ", ".join(
                        f"{x.get('from','')}-{x.get('to','')}" for x in row["slots"]
                    )
                working.append({"name": name, "hours": hours})
            else:
                off.append(name)
        return {
            "date": date_str,
            "working": working,
            "off": off,
            "working_count": len(working),
        }

    def get_working_masters(self, date_str: str) -> list[dict]:
        """Все активные мастера с признаком работы в конкретный день и рабочими
        часами по РЕАЛЬНОМУ графику YClients (учёт отпусков/замен).
        Возвращает [{id, name, is_working, schedule_unknown, work_start, work_end,
        work_slots}] в исходном порядке. Запросы графика идут параллельно.

        ⚠️ Сбой запроса графика (429/таймаут/5xx) НЕ выдаёт мастера за выходного:
        ставим schedule_unknown=True (мастер всё равно показывается, но как «график
        неизвестен», а не «выходной») — иначе работающий мастер мог бы исчезнуть."""
        masters = [m for m in self.get_masters()
                   if isinstance(m, dict) and m.get("id")]

        def _hm(v):
            return (v or "")[:5]   # '10:00:00' → '10:00'

        def _one(m):
            sid = m["id"]
            rows = self.get_staff_schedule(sid, date_str, date_str)
            first = rows[0] if rows and isinstance(rows[0], dict) else {}
            if first.get("error"):
                rows = self.get_staff_schedule(sid, date_str, date_str)   # 1 ретрай
                first = rows[0] if rows and isinstance(rows[0], dict) else {}
            sched_err = bool(first.get("error"))
            if sched_err:
                logger.warning("schedule fetch failed for staff %s on %s: %s",
                               sid, date_str, first.get("error"))
            slots = first.get("slots") or []
            is_working = bool(first.get("is_working") and slots)
            work_slots = ([{"from": _hm(s.get("from")), "to": _hm(s.get("to"))}
                           for s in slots] if is_working else [])
            return {
                "id": sid,
                "name": m.get("name", ""),
                "avatar": m.get("avatar", ""),
                "is_working": is_working,
                "schedule_unknown": sched_err,
                "work_start": (_hm(slots[0].get("from")) if is_working else ""),
                "work_end": (_hm(slots[-1].get("to")) if is_working else ""),
                "work_slots": work_slots,
            }

        if not masters:
            return []
        try:
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=min(8, len(masters))) as ex:
                return list(ex.map(_one, masters))   # ex.map сохраняет порядок
        except Exception:
            return [_one(m) for m in masters]

    def get_master_schedule_api(
        self, staff_id: int, days_ahead: int = 14
    ) -> list[dict]:
        """
        График мастера на N дней вперёд из РЕАЛЬНОГО YClients-расписания.
        Замена старого get_master_schedule (который считал по слотам) и
        файлового get_schedule_from_file (статика).
        """
        RU = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
        today = datetime.now().date()
        date_from = today.strftime("%Y-%m-%d")
        date_to = (today + timedelta(days=days_ahead - 1)).strftime("%Y-%m-%d")
        rows = self.get_staff_schedule(staff_id, date_from, date_to)
        if rows and isinstance(rows[0], dict) and rows[0].get("error"):
            return rows
        out = []
        for row in rows:
            if not row.get("is_working") or not row.get("slots"):
                continue
            try:
                d = datetime.strptime(row["date"][:10], "%Y-%m-%d").date()
            except Exception:
                continue
            delta = (d - today).days
            if delta == 0:
                label = "Сегодня"
            elif delta == 1:
                label = "Завтра"
            else:
                label = d.strftime("%d.%m")
            s = row["slots"][0]
            out.append({
                "date": row["date"][:10],
                "label": f"{label} ({RU[d.weekday()]})",
                "hours": f"{s.get('from','')}-{s.get('to','')}",
            })
        if not out:
            return [{"message": "Нет рабочих дней в ближайшее время"}]
        return out

    # ─── Услуги ─────────────────────────────────────────────────────────────

    def get_services(self, staff_id: int = None) -> list[dict]:
        """Возвращает услуги мастера с ценами (с кэшем 30 мин)."""
        key = f"services_{staff_id or 'all'}"
        return _cached(key, self._fetch_services, staff_id)

    def _fetch_services(self, staff_id: int = None) -> list[dict]:
        try:
            params = {"staff_id": staff_id} if staff_id else {}
            data = self._get(f"book_services/{self.company_id}", params=params)
            services = []
            for s in data.get("data", {}).get("services", []):
                services.append({
                    "id": s["id"],
                    "title": s.get("title", ""),
                    "price_min": s.get("price_min", 0),
                    "price_max": s.get("price_max", 0),
                    # Реальная длительность в секундах лежит в seance_length
                    # (поле duration у YClients часто пустое)
                    "duration": s.get("duration") or s.get("seance_length", 0),
                    "comment": s.get("comment", ""),
                })
            return services
        except Exception as e:
            return [{"error": str(e)}]

    def _get_day_records_cached(self, staff_id: int, date: str) -> list[dict]:
        """Короткий кэш реальных записей мастера на день.

        Нужен как вторая линия обороны: если YClients book_times внезапно
        вернул занятый слот свободным, мы всё равно уберём его по фактическим
        record'ам этого мастера.
        """
        key = f"day_records:{self.company_id}:{staff_id}:{date}"
        now = time.time()
        hit = _day_records_cache.get(key)
        if hit and now - hit[1] < DAY_RECORDS_TTL:
            return hit[0]
        rows = self.get_records_for_master(staff_id, date, date) or []
        rows = rows if isinstance(rows, list) else []
        _day_records_cache[key] = (rows, now)
        return rows

    def _filter_slots_with_real_records(
        self, staff_id: int, date: str, slots: list[dict]
    ) -> list[dict]:
        """Вычищает из book_times слоты, которые пересекаются с реальными
        записями мастера на этот день.

        В норме book_times уже должен отдавать только свободные окна. Но если
        между эндпоинтами YClients случился рассинхрон, лучше убрать спорный
        слот у нас, чем пообещать его клиенту и упасть на финальном создании.
        """
        if not slots:
            return slots

        try:
            records = self._get_day_records_cached(staff_id, date)
        except Exception as e:
            logger.warning(
                "slot cross-check failed for staff %s on %s: %s",
                staff_id,
                date,
                e,
            )
            return slots

        intervals = []
        for rec in records:
            if not isinstance(rec, dict) or rec.get("deleted"):
                continue
            dt_raw = str(rec.get("datetime") or rec.get("date") or "").strip()
            if not dt_raw:
                continue
            try:
                start_dt = datetime.fromisoformat(dt_raw.replace("Z", "+00:00"))
            except Exception:
                continue
            try:
                length_sec = int(rec.get("length") or rec.get("seance_length") or 0)
            except (TypeError, ValueError):
                length_sec = 0
            if length_sec <= 0:
                length_sec = 3600
            intervals.append((start_dt, start_dt + timedelta(seconds=length_sec)))

        if not intervals:
            return slots

        filtered = []
        removed = []
        for slot in slots:
            if not isinstance(slot, dict):
                continue
            dt_raw = str(slot.get("datetime") or "").strip()
            if not dt_raw:
                time_raw = str(slot.get("time") or "").strip()
                if not time_raw:
                    filtered.append(slot)
                    continue
                dt_raw = f"{date}T{time_raw}:00"
            try:
                slot_start = datetime.fromisoformat(dt_raw.replace("Z", "+00:00"))
            except Exception:
                filtered.append(slot)
                continue
            try:
                slot_len = int(slot.get("seance_length") or 0)
            except (TypeError, ValueError):
                slot_len = 0
            if slot_len <= 0:
                slot_len = 3600
            slot_end = slot_start + timedelta(seconds=slot_len)
            busy = any(slot_start < rec_end and rec_start < slot_end
                       for rec_start, rec_end in intervals)
            if busy:
                removed.append((slot.get("time") or dt_raw)[:5])
            else:
                filtered.append(slot)

        if removed:
            logger.warning(
                "filtered %s busy slot(s) for staff %s on %s via records cross-check: %s",
                len(removed),
                staff_id,
                date,
                ", ".join(removed[:8]),
            )
        return filtered

    # ─── Свободные слоты ────────────────────────────────────────────────────

    def get_available_slots(
        self, staff_id: int, date: str, service_ids: list[int] = None
    ) -> list[dict]:
        """
        Возвращает свободные слоты.
        date — строка вида 'YYYY-MM-DD'
        service_ids — список ID услуг. Если передан, YClients учитывает
        суммарное время комплекса и не вернёт слоты, которые не успеют
        завершиться до закрытия мастера.
        """
        try:
            params = {"date": date}
            if service_ids:
                params["service_ids[]"] = service_ids
            data = self._get(
                f"book_times/{self.company_id}/{staff_id}/{date}", params=params
            )
            slots = []
            for s in data.get("data", []):
                slots.append({
                    "time": s.get("time", ""),
                    "datetime": s.get("datetime", ""),
                    "seance_length": s.get("seance_length", 0),
                })
            return self._filter_slots_with_real_records(staff_id, date, slots)
        except Exception as e:
            return [{"error": str(e)}]

    # ─── Ближайшие слоты ────────────────────────────────────────────────────

    def find_nearest_slots(
        self, staff_id: int, service_ids: list[int] = None, days_ahead: int = 7
    ) -> list[dict]:
        """
        Ищет ближайшие свободные слоты на ближайшие days_ahead дней.
        Возвращает первые найденные дни со слотами.
        service_ids — список ID услуг для учёта суммарного времени комплекса.
        """
        try:
            results = []
            today = datetime.now()
            for i in range(days_ahead):
                date = (today + timedelta(days=i)).strftime("%Y-%m-%d")
                slots = self.get_available_slots(staff_id, date, service_ids)
                if slots and not slots[0].get("error"):
                    day_label = ["Сегодня", "Завтра"][i] if i < 2 else \
                        (today + timedelta(days=i)).strftime("%d.%m (%A)") \
                        .replace("Monday","пн").replace("Tuesday","вт") \
                        .replace("Wednesday","ср").replace("Thursday","чт") \
                        .replace("Friday","пт").replace("Saturday","сб") \
                        .replace("Sunday","вс")
                    results.append({
                        "date": date,
                        "label": day_label,
                        # Возвращаем ВСЕ свободные слоты дня, без среза —
                        # клиенту важно видеть и вечерние окна, не только утренние.
                        "slots": [s["time"] for s in slots if s.get("time")],
                    })
                    if len(results) >= 3:
                        break
            return results if results else [{"message": "Свободных окон на ближайшие 7 дней нет"}]
        except Exception as e:
            return [{"error": str(e)}]

    # ─── График работы мастера ──────────────────────────────────────────────

    def get_master_schedule(self, staff_id: int, days_ahead: int = 14) -> list[dict]:
        """
        Возвращает рабочие дни мастера на ближайшие days_ahead дней.
        Определяется по наличию свободных слотов.
        """
        try:
            RU_DAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
            today = datetime.now()
            working_days = []

            for i in range(days_ahead):
                date = today + timedelta(days=i)
                date_str = date.strftime("%Y-%m-%d")
                slots = self.get_available_slots(staff_id, date_str)

                if slots and not slots[0].get("error") and len(slots) > 0:
                    times = [s["time"][:5] for s in slots if s.get("time")]
                    if not times:
                        continue
                    if i == 0:
                        day_label = "Сегодня"
                    elif i == 1:
                        day_label = "Завтра"
                    else:
                        day_label = date.strftime("%d.%m")
                    weekday = RU_DAYS[date.weekday()]
                    working_days.append({
                        "date": date_str,
                        "label": f"{day_label} ({weekday})",
                        "start": times[0],
                        "end": times[-1],
                    })

            return working_days if working_days else [
                {"message": "Нет свободного времени на ближайшие 2 недели"}
            ]
        except Exception as e:
            return [{"error": str(e)}]

    # ─── Создание записи ────────────────────────────────────────────────────

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        """Приводит телефон к формату +7XXXXXXXXXX."""
        digits = "".join(filter(str.isdigit, phone))
        if len(digits) == 11 and digits.startswith("8"):
            digits = "7" + digits[1:]
        if len(digits) == 10:
            digits = "7" + digits
        return "+" + digits if not digits.startswith("+") else digits

    @staticmethod
    def _booking_error_code(message: str, status_code: int | None = None) -> str:
        low = (message or "").lower()
        if status_code in (429,) or (status_code is not None and status_code >= 500):
            return "yclients_unavailable"
        if any(x in low for x in ("busy", "занят", "недоступ", "not available", "slot", "seance")):
            return "slot_taken"
        if any(x in low for x in ("phone", "телефон")):
            return "bad_phone"
        if any(x in low for x in ("name", "имя", "fullname")):
            return "bad_name"
        if any(x in low for x in ("service", "услуг")):
            return "bad_service"
        if any(x in low for x in ("staff", "master", "мастер")):
            return "bad_staff"
        return "booking_failed"

    def create_booking(
        self,
        staff_id: int,
        service_ids: list[int],
        datetime_str: str,
        client_name: str,
        client_phone: str,
        client_comment: str = "",
        notify_by_sms: int = 3,
    ) -> dict:
        """
        Создаёт запись клиента на одну или несколько услуг.
        datetime_str — ISO формат, например '2026-06-01T14:00:00'
        notify_by_sms — за сколько ЧАСОВ до визита YClients шлёт SMS/WhatsApp-напоминание
                        (0 = не слать). Берётся из персональных настроек клиента.
        """
        try:
            client_phone = self._normalize_phone(client_phone)
            try:
                notify_by_sms = max(0, min(48, int(notify_by_sms)))
            except (TypeError, ValueError):
                notify_by_sms = 3
            payload = {
                "phone": client_phone,
                "fullname": client_name,
                "email": "",
                "comment": client_comment,
                "type": "mobile",
                "notify_by_sms": notify_by_sms,
                "notify_by_email": 0,
                "appointments": [
                    {
                        "id": 1,
                        "services": service_ids,
                        "staff_id": staff_id,
                        "datetime": datetime_str,
                    }
                ],
            }
            url = f"{self.base_url}/book_record/{self.company_id}"
            resp = requests.post(url, headers=self.headers, json=payload, timeout=(5, 20))
            try:
                data = resp.json()
            except ValueError:
                data = {}
            if data.get("success"):
                records = data.get("data", [])
                if records:
                    record = records[0]
                    return {
                        "success": True,
                        "record_id": record.get("record_id"),  # реальный ID, не индекс
                        "datetime": datetime_str,
                        "client": client_name,
                        "phone": client_phone,
                    }
            msg = (
                data.get("meta", {}).get("message")
                or data.get("message")
                or data.get("error")
                or ("YClients отклонил запись" if resp.status_code >= 400 else "Ошибка")
            )
            return {
                "success": False,
                "error": msg,
                "code": self._booking_error_code(msg, resp.status_code),
                "http_status": resp.status_code,
            }
        except requests.Timeout:
            return {
                "success": False,
                "error": "YClients timeout",
                "code": "yclients_unavailable",
            }
        except requests.RequestException as e:
            return {
                "success": False,
                "error": str(e),
                "code": "yclients_unavailable",
            }
        except Exception as e:
            return {"success": False, "error": str(e), "code": "booking_failed"}

    def create_record_admin(
        self,
        staff_id: int,
        service_ids: list[int],
        datetime_str: str,
        client_name: str,
        client_phone: str,
        seance_length: int = 0,
        comment: str = "",
    ) -> dict:
        """АДМИНСКОЕ создание записи: POST records/{company}. В отличие от
        create_booking (эндпоинт book_record — клиентский, проверяет онлайн-график
        и ОТКЛОНЯЕТ нерабочее время / выходного мастера, 422), этот путь позволяет
        владельцу поставить запись на ЛЮБОЙ день/время — как в самом календаре
        YClients. save_if_busy=False: занятый слот не перезаписываем (YClients
        вернёт 409 → отдаём «время занято»)."""
        try:
            phone = self._normalize_phone(client_phone)
            payload = {
                "staff_id": staff_id,
                "services": [{"id": sid, "amount": 1} for sid in service_ids],
                "client": {"phone": phone, "name": client_name},
                "datetime": datetime_str,
                "seance_length": int(seance_length) if seance_length else 3600,
                "save_if_busy": False,
                "send_sms": False,
                "comment": comment,
            }
            data = self._post(f"records/{self.company_id}", payload)
            rec = data.get("data")
            rid = None
            if isinstance(rec, list) and rec:
                rid = rec[0].get("id") or rec[0].get("record_id")
            elif isinstance(rec, dict):
                rid = rec.get("id") or rec.get("record_id")
            if data.get("success") and rid:
                return {"success": True, "record_id": rid, "datetime": datetime_str,
                        "client": client_name, "phone": phone}
            return {"success": False,
                    "error": data.get("meta", {}).get("message") or "YClients отклонил запись."}
        except Exception as e:
            msg = str(e)
            busy = "409" in msg
            return {"success": False,
                    "error": ("Выбранное время уже занято." if busy
                              else "Не удалось создать запись."),
                    "detail": msg}

    # ─── Записи клиента ─────────────────────────────────────────────────────

    def get_client_bookings(
        self, client_phone: str,
        days_back: int = 730, days_ahead: int = 90,
    ) -> list[dict]:
        """
        Возвращает записи клиента в окне [сегодня - days_back ... сегодня + days_ahead].

        По умолчанию смотрит 2 года назад и 3 месяца вперёд — чтобы получить
        и историю (для апсейла/лояльности/цикл-напоминания), и предстоящие.
        """
        try:
            start_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
            end_date = (datetime.now() + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
            target = _digits10(client_phone)

            def _append_booking(bookings: list[dict], record: dict):
                client = record.get("client") or {}
                staff = record.get("staff") or {}
                raw_services = record.get("services") or []
                bookings.append({
                    "id": record.get("id"),            # для loyalty (record_id)
                    "record_id": record.get("id"),
                    "date": record.get("date") or record.get("datetime", ""),
                    "datetime": record.get("datetime", ""),
                    "services": raw_services,          # list[dict] — не строки!
                    "service_titles": [s.get("title", "") for s in raw_services if isinstance(s, dict)],
                    "staff": staff,                    # для freed_slot
                    "master": staff.get("name", ""),
                    "client_name": client.get("name", ""),
                    "client_id": client.get("id"),
                    "attendance": record.get("attendance", 0),
                    "status": record.get("attendance", 0),
                })

            bookings = []
            seen = set()
            exact = self.find_client_by_phone(client_phone)

            # Главный путь: ищем точную карточку клиента и грузим записи по client_id.
            # Так история не ломается из-за мусорного имени в карточке или формата
            # телефона в общем списке records.
            if exact and exact.get("id"):
                count = 200
                page = 1
                while page <= 25:
                    data = self._get(
                        f"records/{self.company_id}",
                        {
                            "client_id": int(exact["id"]),
                            "start_date": start_date,
                            "end_date": end_date,
                            "count": count,
                            "page": page,
                        },
                    )
                    batch = data.get("data") or []
                    if not batch:
                        break
                    new_rows = 0
                    for r in batch:
                        try:
                            rid = r.get("id")
                            if rid in seen:
                                continue
                            seen.add(rid)
                            _append_booking(bookings, r)
                            new_rows += 1
                        except Exception:
                            continue
                    if len(batch) < count or new_rows == 0:
                        break
                    page += 1

            # Fallback: если точную карточку не нашли, оставляем старый путь по
            # телефону, чтобы не потерять совместимость на нестандартных данных.
            if not bookings:
                data = self._get(
                    f"records/{self.company_id}",
                    {
                        "start_date": start_date,
                        "end_date": end_date,
                        "count": 500,
                    },
                )
                for r in data.get("data", []):
                    try:
                        client = r.get("client") or {}
                        if _digits10(client.get("phone", "")) != target:
                            continue
                        _append_booking(bookings, r)
                    except Exception:
                        continue
            return bookings if bookings else [{"message": "Записей не найдено"}]
        except Exception as e:
            return [{"error": str(e)}]

    # ─── Обновление записи (добавление услуг) ───────────────────────────────

    def update_booking(self, record_id: int, service_ids: list[int]) -> dict:
        """Обновляет запись — заменяет список услуг на переданный."""
        try:
            # Получаем текущую запись
            data = self._get(f"record/{self.company_id}/{record_id}")
            rec = data.get("data", {})
            if not rec:
                return {"success": False, "error": "Запись не найдена"}

            client = rec.get("client", {})
            payload = {
                "staff_id": rec["staff"]["id"],
                "datetime": rec["datetime"],
                "seance_length": rec.get("seance_length", 3600),
                "save_if_busy": False,
                "send_sms": False,
                "client": {
                    "id": client.get("id"),
                    "phone": client.get("phone", ""),
                    "name": client.get("name", ""),
                },
                "services": [{"id": sid, "amount": 1} for sid in service_ids],
                "attendance": rec.get("attendance", 0),
                "comment": rec.get("comment", ""),
            }
            upd = self._put(f"record/{self.company_id}/{record_id}", payload)
            if upd.get("success") or upd.get("data"):
                services = [s["title"] for s in upd.get("data", {}).get("services", [])]
                return {"success": True, "record_id": record_id, "services": services}
            return {"success": False, "error": upd.get("meta", {}).get("message", "Ошибка")}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def set_record_attendance(self, record_id: int, attendance: int) -> dict:
        """Ставит статус визита (attendance): 1 пришёл, -1 не пришёл, 0 ожидание,
        2 подтвердил. Неразрушающий PUT record/{company}/{id} (остальные поля
        сохраняются)."""
        try:
            data = self._get(f"record/{self.company_id}/{record_id}")
            rec = data.get("data", {})
            if not rec:
                return {"success": False, "error": "Запись не найдена"}
            client = rec.get("client") or {}
            staff = rec.get("staff") or {}
            svc_ids = [s.get("id") for s in (rec.get("services") or [])
                       if isinstance(s, dict) and s.get("id")]
            payload = {
                "staff_id": staff.get("id"),
                "datetime": rec.get("datetime"),
                "seance_length": rec.get("seance_length", 3600),
                "save_if_busy": True,
                "send_sms": False,
                "client": {
                    "id": client.get("id"),
                    "phone": client.get("phone", ""),
                    "name": client.get("name", ""),
                },
                "services": [{"id": sid, "amount": 1} for sid in svc_ids],
                "attendance": int(attendance),
                "comment": rec.get("comment", ""),
            }
            upd = self._put(f"record/{self.company_id}/{record_id}", payload)
            if upd.get("success") or upd.get("data"):
                return {"success": True, "record_id": record_id, "attendance": int(attendance)}
            return {"success": False, "error": upd.get("meta", {}).get("message") or "Не удалось обновить статус"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ─── Перенос записи ─────────────────────────────────────────────────────

    def reschedule_booking(
        self,
        record_id: int,
        new_datetime_str: str,
        service_ids: list[int] | None = None,
        staff_id: int | None = None,
    ) -> dict:
        """
        Переносит запись на новое время (и при необходимости — к другому мастеру / с
        другим набором услуг) НЕРАЗРУШАЮЩИМ обновлением: PUT record/{company}/{id}.

        Почему PUT, а не delete+create:
        - record_id сохраняется (это та же запись);
        - слот НЕ освобождается → НЕ летит webhook record.delete, поэтому мастеру не
          уходит ложное «запись отменена», не возвращаются баллы и не рассылается
          «слот освободился» другим клиентам. Летит ровно один record.update →
          корректное уведомление «перенесена»;
        - если новое время недоступно, YClients просто отклоняет PUT, а исходная
          запись остаётся нетронутой — потеря записи невозможна (раньше delete шёл
          ПЕРВЫМ, и при сбое пересоздания запись пропадала навсегда).
        """
        try:
            # 1. Текущая запись — нужны клиент, длительность и услуги по умолчанию.
            data = self._get(f"record/{self.company_id}/{record_id}")
            rec = data.get("data", {})
            if not rec:
                return {"success": False, "error": "Запись не найдена"}

            client = rec.get("client") or {}
            staff  = rec.get("staff") or {}
            old_dt = rec.get("datetime", "")
            old_svc_ids = [s.get("id") for s in (rec.get("services") or [])
                           if isinstance(s, dict) and s.get("id")]
            final_svc_ids  = service_ids if service_ids is not None else old_svc_ids
            final_staff_id = staff_id if staff_id else staff.get("id")

            # 2. Обновляем запись НА МЕСТЕ (id не меняется).
            payload = {
                "staff_id":      final_staff_id,
                "datetime":      new_datetime_str,
                "seance_length": rec.get("seance_length", 3600),
                "save_if_busy":  False,   # занятое время не перезаписываем
                "send_sms":      False,
                "client": {
                    "id":    client.get("id"),
                    "phone": client.get("phone", ""),
                    "name":  client.get("name", ""),
                },
                "services":   [{"id": sid, "amount": 1} for sid in final_svc_ids],
                "attendance": rec.get("attendance", 0),
                "comment":    rec.get("comment", ""),
            }
            upd = self._put(f"record/{self.company_id}/{record_id}", payload)
            if upd.get("success") or upd.get("data"):
                return {
                    "success":      True,
                    "record_id":    record_id,        # запись та же — PUT не меняет id
                    "old_datetime": old_dt,
                    "new_datetime": new_datetime_str,
                    "client":       client.get("name", ""),
                    "phone":        client.get("phone", ""),
                }
            return {"success": False,
                    "error": upd.get("meta", {}).get("message") or "Новое время недоступно"}

        except Exception as e:
            # PUT отклонён (например, слот занят / вне графика) — исходная запись НЕ
            # изменена и НЕ удалена, восстанавливать нечего.
            return {"success": False,
                    "error": "Не удалось перенести — возможно, выбранное время недоступно.",
                    "detail": str(e)}

    # ─── Тайминг напоминания на записи (по настройке клиента) ───────────────

    def set_record_notify_by_sms(self, record_id: int, hours: int) -> dict:
        """
        Неразрушающе выставляет на существующей записи `notify_by_sms` — за сколько
        ЧАСОВ до визита YClients шлёт напоминание (0 = не напоминать вовсе).
        Меняет ТОЛЬКО это поле, сохраняя время/мастера/услуги/посещаемость/коммент
        тем же НЕРАЗРУШАЮЩИМ PUT record/{company}/{id}, что и перенос.

        Зачем: клиент в приложении («Настройки → Напоминание перед визитом») сам
        выбирает, получать ли напоминание и за сколько. Для записей, созданных
        ЧЕРЕЗ наше приложение, это уже задаётся в create_booking. Этот метод
        дотягивает выбор клиента до ЛЮБОЙ его записи — в т.ч. созданной админом,
        по телефону или через онлайн-виджет YClients.

        Идемпотентно: если на записи уже стоит нужное значение — PUT не делаем
        (не плодим лишних record.update-вебхуков).
        """
        try:
            try:
                hours = max(0, min(48, int(hours)))
            except (TypeError, ValueError):
                hours = 3

            data = self._get(f"record/{self.company_id}/{record_id}")
            rec = data.get("data", {})
            if not rec:
                return {"success": False, "error": "Запись не найдена"}

            cur = rec.get("notify_by_sms")
            if cur is not None:
                try:
                    if int(cur) == hours:
                        return {"success": True, "record_id": record_id,
                                "notify_by_sms": hours, "noop": True}
                except (TypeError, ValueError):
                    pass

            client = rec.get("client") or {}
            staff  = rec.get("staff") or {}
            svc_ids = [s.get("id") for s in (rec.get("services") or [])
                       if isinstance(s, dict) and s.get("id")]

            payload = {
                "staff_id":      staff.get("id"),
                "datetime":      rec.get("datetime", ""),   # время НЕ меняем
                "seance_length": rec.get("seance_length", 3600),
                "save_if_busy":  True,    # это собственный слот записи — не «занят»
                "send_sms":      False,
                "notify_by_sms": hours,
                "client": {
                    "id":    client.get("id"),
                    "phone": client.get("phone", ""),
                    "name":  client.get("name", ""),
                },
                "services":   [{"id": sid, "amount": 1} for sid in svc_ids],
                "attendance": rec.get("attendance", 0),
                "comment":    rec.get("comment", ""),
            }
            upd = self._put(f"record/{self.company_id}/{record_id}", payload)
            if upd.get("success") or upd.get("data"):
                return {"success": True, "record_id": record_id, "notify_by_sms": hours}
            return {"success": False,
                    "error": upd.get("meta", {}).get("message") or "PUT отклонён"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ─── Отмена записи ──────────────────────────────────────────────────────

    def cancel_booking(self, record_id: int) -> dict:
        """Отменяет запись по ID."""
        try:
            data = self._delete(f"record/{self.company_id}/{record_id}")
            if data.get("success"):
                return {"success": True, "record_id": record_id}
            return {"success": False, "error": data.get("meta", {}).get("message", "Ошибка")}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ─── Записи мастера + история клиента (для уведомлений мастерам) ────────

    def list_all_clients(self, page_size: int = 200) -> list[dict]:
        """
        Возвращает ВСЕХ клиентов салона из YClients постранично.
        Поля: id, name, phone, visits_count, sold_amount (LTV в ₽), last_visit_date.

        Используется в /migrate_help — найти топ-клиентов, которых пока нет
        у нас в боте, чтобы целенаправленно их переводить.
        """
        all_items: list[dict] = []
        page = 1
        while True:
            try:
                data = self._post(
                    f"company/{self.company_id}/clients/search",
                    {
                        "fields": [
                            "id", "name", "phone", "visits_count",
                            "sold_amount", "last_visit_date",
                        ],
                        "filters": [],
                        "page": page,
                        "page_size": page_size,
                    },
                )
            except Exception as e:
                print(f"YClients list_all_clients page={page} error: {e}")
                break
            items = data.get("data") or []
            if not items:
                break
            all_items.extend(items)
            if len(items) < page_size:
                break
            page += 1
            # Защита от бесконечного цикла на странных ответах
            if page > 200:
                break
        return all_items

    def search_clients(self, query: str, limit: int = 8) -> list[dict]:
        """Поиск клиентов по части телефона/имени (quick_search YClients) — для
        подсказок при ручной записи. Возвращает [{id, name, phone}].
        Пустой/короткий запрос НЕ ищем: иначе YClients вернёт случайных клиентов
        (та же утечка ПД, что чинили в кабинете)."""
        q = (query or "").strip()
        digits = "".join(ch for ch in q if ch.isdigit())
        if len(digits) < 4 and len(q) < 3:
            return []
        try:
            data = self._post(
                f"company/{self.company_id}/clients/search",
                {
                    "fields": ["id", "name", "phone"],
                    "filters": [{"type": "quick_search", "state": {"value": q}}],
                    "page": 1,
                    "page_size": max(1, min(int(limit) if limit else 8, 20)),
                },
            )
        except Exception as e:
            print(f"YClients search_clients error: {e}")
            return []
        out = []
        for c in (data.get("data") or []):
            if isinstance(c, dict) and c.get("phone"):
                out.append({"id": c.get("id"), "name": c.get("name") or "", "phone": c.get("phone")})
            if len(out) >= int(limit or 8):
                break
        return out

    def find_client_by_phone(self, phone: str) -> dict | None:
        """Ищет точную карточку клиента в YClients по последним 10 цифрам телефона."""
        want = _digits10(phone)
        if len(want) < 10:
            return None
        for row in self.search_clients(phone, limit=8) or []:
            if _digits10(row.get("phone") or "") == want:
                return row
        return None

    def get_client_loyalty_cards(self, client_id: int) -> list[dict]:
        """Возвращает карты лояльности клиента с актуальными балансами."""
        data = self._get(f"loyalty/client_cards/{int(client_id)}")
        cards = data.get("data") if isinstance(data, dict) else None
        if isinstance(cards, dict):
            cards = [cards]
        return [card for card in (cards or []) if isinstance(card, dict)]

    def get_records_for_master(
        self, staff_id: int, start_date: str, end_date: str, max_pages: int = 25
    ) -> list[dict]:
        """
        Все записи конкретного мастера в диапазоне дат (с пагинацией и дедупликацией).
        РАНЬШЕ был жёсткий count=200 без страниц — за 90 дней у активного мастера
        записи обрезались, и выручка/визиты в аналитике занижались. Теперь листаем
        все страницы, как в get_company_records.
        """
        out = []
        seen = set()
        page = 1
        count = 200
        try:
            while page <= max_pages:
                data = self._get(
                    f"records/{self.company_id}",
                    {
                        "staff_id": staff_id,
                        "start_date": start_date,
                        "end_date": end_date,
                        "count": count,
                        "page": page,
                    },
                )
                batch = data.get("data", []) or []
                if not batch:
                    break
                new = 0
                for r in batch:
                    rid = r.get("id") if isinstance(r, dict) else None
                    if rid is None:
                        out.append(r); new += 1
                    elif rid not in seen:
                        seen.add(rid); out.append(r); new += 1
                if len(batch) < count or new == 0:
                    break
                page += 1
        except Exception as e:
            print(f"YClients get_records_for_master error: {e}")
        return out

    # ─── Чаевые (ЮMoney-отчёт YClients) ──────────────────────────────────────
    def _iso_to_ddmmyyyy(self, iso: str) -> str:
        try:
            # Отрезаем время: понимает и "2026-06-05", и "2026-06-05T00:00:00", и "... 00:00:00"
            d = str(iso).replace("T", " ").split(" ")[0]
            p = d.split("-")
            if len(p) == 3:
                return f"{p[2]}.{p[1]}.{p[0]}"
        except Exception:
            pass
        return iso

    def get_tips_raw(self, from_ddmmyyyy: str, to_ddmmyyyy: str) -> dict:
        """Сырой отчёт чаевых. ВАЖНО: хост yclients.com (НЕ api.yclients.com!), путь
        companies/ (мн.ч.), даты в формате DD.MM.YYYY. Токен — наш обычный."""
        url = f"https://yclients.com/api/v1/companies/{self.company_id}/tips/history"
        try:
            resp = requests.get(url, headers=self.headers,
                                params={"from": from_ddmmyyyy, "to": to_ddmmyyyy}, timeout=15)
            resp.raise_for_status()
            return (resp.json() or {}).get("data") or {}
        except Exception as e:
            print(f"YClients get_tips_raw error: {e}")
            return {}

    def tips_by_master(self, from_iso: str = None, to_iso: str = None) -> list[dict]:
        """Чаевые по мастерам за период (даты ISO YYYY-MM-DD; без дат — всё время).
        Формат как database.tips_totals_by_master: [{master_id, master_name, master_slug, cnt, total}]."""
        f = self._iso_to_ddmmyyyy(from_iso) if from_iso else "01.01.2020"
        # `to` в YClients — исключительная граница (берутся чаевые < to). Панель уже
        # передаёт to_iso = конец периода + 1 день, поэтому просто конвертируем без сдвига.
        t = self._iso_to_ddmmyyyy(to_iso) if to_iso else "31.12.2099"
        data = self.get_tips_raw(f, t)
        agg = {}
        for it in (data.get("tips") or []):
            if not isinstance(it, dict):
                continue
            mt = it.get("master_tips") or {}
            staff = it.get("staff") or {}
            mid = mt.get("master_id") or staff.get("id")
            if mid is None:
                continue
            amt = mt.get("tips_amount")
            if amt is None:
                amt = (it.get("invoice") or {}).get("sum") or 0
            try:
                amt = int(amt)
            except (TypeError, ValueError):
                amt = 0
            mid = int(mid)
            if mid not in agg:
                agg[mid] = {"master_id": mid, "master_name": staff.get("name", ""),
                            "master_slug": "", "cnt": 0, "total": 0}
            agg[mid]["cnt"] += 1
            agg[mid]["total"] += amt
        return sorted(agg.values(), key=lambda x: -x["total"])

    def tips_for_master(self, master_id, from_iso: str = None, to_iso: str = None) -> dict:
        """Чаевые конкретного мастера за период. Формат: {count, total}."""
        try:
            mid = int(master_id)
        except (TypeError, ValueError):
            return {"count": 0, "total": 0}
        for m in self.tips_by_master(from_iso, to_iso):
            if m["master_id"] == mid:
                return {"count": m["cnt"], "total": m["total"]}
        return {"count": 0, "total": 0}

    def get_company_records(self, start_date: str, end_date: str, max_pages: int = 25) -> list[dict]:
        """Все записи компании за период (с пагинацией и дедупликацией) — для салонной аналитики."""
        out = []
        seen = set()
        page = 1
        count = 200
        try:
            while page <= max_pages:
                data = self._get(
                    f"records/{self.company_id}",
                    {"start_date": start_date, "end_date": end_date,
                     "count": count, "page": page},
                )
                batch = data.get("data", []) or []
                if not batch:
                    break
                new = 0
                for r in batch:
                    rid = r.get("id") if isinstance(r, dict) else None
                    if rid is None:
                        out.append(r); new += 1
                    elif rid not in seen:
                        seen.add(rid); out.append(r); new += 1
                if len(batch) < count or new == 0:
                    break
                page += 1
        except Exception as e:
            print(f"YClients get_company_records error: {e}")
        return out

    def get_company_transactions(self, start_date: str, end_date: str, max_pages: int = 40) -> list[dict]:
        """
        Финансовые операции (касса) компании за период — с пагинацией и дедупликацией.
        Это ровно то, из чего складывается «Выручка» в YClients: услуги + товары +
        абонементы + сертификаты. Используется для точной салонной выручки.
        Каждая операция: amount, sold_item_type (service/goods_transaction/
        loyalty_abonement/loyalty_certificate), expense.title, account, record_id…
        """
        out = []
        seen = set()
        page = 1
        count = 200
        try:
            while page <= max_pages:
                data = self._get(
                    f"transactions/{self.company_id}",
                    {"start_date": start_date, "end_date": end_date,
                     "count": count, "page": page},
                )
                batch = (data or {}).get("data") or []
                if not batch:
                    break
                new = 0
                for r in batch:
                    rid = r.get("id") if isinstance(r, dict) else None
                    if rid is None:
                        out.append(r); new += 1
                    elif rid not in seen:
                        seen.add(rid); out.append(r); new += 1
                if len(batch) < count or new == 0:
                    break
                page += 1
        except Exception as e:
            print(f"YClients get_company_transactions error: {e}")
        return out

    def get_client_history(
        self, client_id: int, count: int = 30
    ) -> list[dict]:
        """
        История визитов клиента (только реально пришёл, attendance=1).
        Используется для AI-совета по апсейлу — что клиент брал раньше.
        """
        try:
            data = self._get(
                f"records/{self.company_id}",
                {
                    "client_id": client_id,
                    "attendance": 1,
                    "count": count,
                },
            )
            return data.get("data", []) or []
        except Exception as e:
            print(f"YClients get_client_history error: {e}")
            return []

    def get_client_noshow_count(self, client_id: int) -> int:
        """Число неявок клиента (attendance=-1). Считаем на нашей стороне по
        записям клиента — серверный фильтр attendance на /records не применяется."""
        try:
            data = self._get(
                f"records/{self.company_id}",
                {"client_id": client_id, "count": 500},
            )
            recs = data.get("data") or []
            return sum(1 for r in recs if isinstance(r, dict) and r.get("attendance") == -1)
        except Exception:
            return 0

    def add_services_to_record(self, record_id: int, add_service_ids: list[int]) -> dict:
        """Добавляет услуги к записи (к существующим), не трогая остальное.
        Неразрушающий PUT: текущие услуги сохраняем с их ценой/скидкой, новые
        добавляем по дефолтной цене."""
        try:
            rec = self.get_record(record_id)
            if not rec:
                return {"success": False, "error": "Запись не найдена"}
            client = rec.get("client") or {}
            staff = rec.get("staff") or {}
            # Цены и длительности услуг мастера. YClients ДРОПАЕТ услугу без cost
            # при PUT, а длительность нужна, чтобы продлить визит на новые услуги.
            price_map = {}
            dur_map = {}
            try:
                for s in self.get_services(staff.get("id")):
                    if isinstance(s, dict) and s.get("id"):
                        price_map[s["id"]] = s.get("price_min") or s.get("price_max") or 0
                        try:
                            dur_map[s["id"]] = int(s.get("duration") or 0)
                        except Exception:
                            dur_map[s["id"]] = 0
            except Exception:
                price_map = {}
            services_payload = []
            have = set()
            for s in (rec.get("services") or []):
                sid = s.get("id")
                if sid is None:
                    continue
                have.add(sid)
                services_payload.append({
                    "id": sid,
                    "cost": s.get("cost"),
                    "discount": s.get("discount", 0),
                    "first_cost": s.get("first_cost") or s.get("cost"),
                })
            added_dur = 0   # суммарная длительность реально добавленных услуг (сек)
            for sid in add_service_ids:
                if sid and sid not in have:
                    cost = price_map.get(sid, 0)
                    services_payload.append({"id": sid, "cost": cost, "discount": 0, "first_cost": cost})
                    have.add(sid)
                    added_dur += int(dur_map.get(sid, 0) or 0)
            # Продлеваем визит на длительность добавленных услуг (тайминг растёт).
            try:
                orig_len = int(rec.get("seance_length") or 0)
            except Exception:
                orig_len = 0
            if orig_len <= 0:
                orig_len = 3600
            new_len = orig_len + added_dur
            payload = {
                "staff_id": staff.get("id"),
                "datetime": rec.get("datetime"),
                "seance_length": new_len,
                "save_if_busy": True,
                "send_sms": False,
                "client": {"id": client.get("id"), "phone": client.get("phone", ""),
                           "name": client.get("name", "")},
                "services": services_payload,
                "attendance": rec.get("attendance", 0),
                "comment": rec.get("comment", ""),
            }
            upd = self._put(f"record/{self.company_id}/{record_id}", payload)
            if upd.get("success") or upd.get("data"):
                return {"success": True, "record_id": record_id}
            return {"success": False, "error": upd.get("meta", {}).get("message") or "Не удалось добавить услугу"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def set_record_services(self, record_id: int, service_ids: list[int]) -> dict:
        """Полностью задаёт список услуг визита (добавить / удалить / заменить).
        seance_length пересчитывается = сумме длительностей выбранных услуг
        (тайминг растёт/уменьшается по факту). Цены/скидки уже бывших услуг
        сохраняются, новым ставится дефолтная цена мастера."""
        try:
            ids = []
            for x in (service_ids or []):
                try:
                    ids.append(int(x))
                except Exception:
                    pass
            seen = set()
            ids = [i for i in ids if not (i in seen or seen.add(i))]   # дедуп, порядок
            if not ids:
                return {"success": False, "error": "В визите должна остаться хотя бы одна услуга"}
            rec = self.get_record(record_id)
            if not rec:
                return {"success": False, "error": "Запись не найдена"}
            client = rec.get("client") or {}
            staff = rec.get("staff") or {}
            price_map = {}
            dur_map = {}
            try:
                for s in self.get_services(staff.get("id")):
                    if isinstance(s, dict) and s.get("id"):
                        price_map[s["id"]] = s.get("price_min") or s.get("price_max") or 0
                        try:
                            dur_map[s["id"]] = int(s.get("duration") or 0)
                        except Exception:
                            dur_map[s["id"]] = 0
            except Exception:
                price_map = {}
            existing = {}
            for s in (rec.get("services") or []):
                if isinstance(s, dict) and s.get("id") is not None:
                    existing[s["id"]] = s
            services_payload = []
            total_dur = 0
            for sid in ids:
                old = existing.get(sid)
                if old:
                    services_payload.append({
                        "id": sid,
                        "cost": old.get("cost"),
                        "discount": old.get("discount", 0),
                        "first_cost": old.get("first_cost") or old.get("cost"),
                    })
                else:
                    cost = price_map.get(sid, 0)
                    services_payload.append({"id": sid, "cost": cost, "discount": 0, "first_cost": cost})
                total_dur += int(dur_map.get(sid, 0) or 0)
            if total_dur <= 0:
                try:
                    total_dur = int(rec.get("seance_length") or 0)
                except Exception:
                    total_dur = 0
            if total_dur <= 0:
                total_dur = 3600
            payload = {
                "staff_id": staff.get("id"),
                "datetime": rec.get("datetime"),
                "seance_length": total_dur,
                "save_if_busy": True,
                "send_sms": False,
                "client": {"id": client.get("id"), "phone": client.get("phone", ""),
                           "name": client.get("name", "")},
                "services": services_payload,
                "attendance": rec.get("attendance", 0),
                "comment": rec.get("comment", ""),
            }
            upd = self._put(f"record/{self.company_id}/{record_id}", payload)
            if upd.get("success") or upd.get("data"):
                return {"success": True, "record_id": record_id}
            return {"success": False, "error": upd.get("meta", {}).get("message") or "Не удалось изменить услуги"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def set_record_client_name(
        self,
        record_id: int,
        client_name: str | None = None,
        client_phone: str | None = None,
    ) -> dict:
        """Обновляет имя и/или телефон клиента в записи, сохраняя время,
        мастера, услуги, цены, статус визита и комментарий."""
        name_in = str(client_name or "").strip()
        phone_in = str(client_phone or "").strip()
        if not name_in and not phone_in:
            return {"success": False, "error": "Введите имя или телефон клиента"}
        try:
            rec = self.get_record(record_id)
            if not rec:
                return {"success": False, "error": "Запись не найдена"}
            client = rec.get("client") or {}
            staff = rec.get("staff") or {}
            name = name_in or str(client.get("name") or client.get("display_name") or "Клиент").strip()
            phone = str(client.get("phone") or "").strip()
            if phone_in:
                digits = "".join(ch for ch in phone_in if ch.isdigit())
                if len(digits) == 11 and digits.startswith("8"):
                    digits = "7" + digits[1:]
                if len(digits) == 10:
                    digits = "7" + digits
                if len(digits) != 11 or not digits.startswith("7"):
                    return {"success": False, "error": "Введите телефон в формате +7XXXXXXXXXX"}
                phone = "+" + digits
            services_payload = []
            for s in (rec.get("services") or []):
                if not isinstance(s, dict) or not s.get("id"):
                    continue
                item = {"id": s.get("id"), "amount": s.get("amount") or 1}
                for key in ("cost", "discount", "first_cost", "cost_to_pay", "manual_cost"):
                    if s.get(key) is not None:
                        item[key] = s.get(key)
                services_payload.append(item)
            if not services_payload:
                return {"success": False, "error": "В записи нет услуг"}
            payload = {
                "staff_id": staff.get("id"),
                "datetime": rec.get("datetime"),
                "seance_length": rec.get("seance_length", 3600),
                "save_if_busy": True,
                "send_sms": False,
                "client": {
                    "id": client.get("id"),
                    "phone": phone,
                    "name": name,
                    "surname": client.get("surname"),
                    "email": client.get("email"),
                },
                "services": services_payload,
                "attendance": rec.get("attendance", 0),
                "comment": rec.get("comment", ""),
            }
            upd = self._put(f"record/{self.company_id}/{record_id}", payload)
            if upd.get("success") or upd.get("data"):
                return {"success": True, "record_id": record_id, "client": name, "phone": phone}
            return {"success": False, "error": upd.get("meta", {}).get("message") or "Не удалось сохранить данные клиента"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_goods_catalog(self) -> list[dict]:
        """Каталог товаров салона (для продажи в карточке визита).
        Возвращает [{id, title, cost, amount(остаток), is_abonement, is_certificate}]."""
        try:
            data = self._get(f"goods/{self.company_id}")
            out = []
            for g in (data.get("data") or []):
                if not isinstance(g, dict):
                    continue
                gid = g.get("good_id") or g.get("id")
                if not gid:
                    continue
                amounts = g.get("actual_amounts") or []
                amount = 0
                try:
                    amount = sum(int(a.get("amount") or 0) for a in amounts if isinstance(a, dict))
                except Exception:
                    amount = 0
                out.append({
                    "id": gid,
                    "title": g.get("label") or g.get("title") or "Товар",
                    "cost": g.get("cost") or g.get("actual_cost") or 0,
                    "amount": amount,
                    "is_abonement": bool(g.get("loyalty_abonement_type_id")),
                    "is_certificate": bool(g.get("loyalty_certificate_type")),
                    "category": g.get("category") or "",
                })
            return out
        except Exception as e:
            return [{"error": str(e)}]

    def get_client(self, client_id: int) -> dict | None:
        """
        Полные данные клиента (имя, телефон, ДР, число визитов, сумма).
        В YClients API endpoint в единственном числе: `/client/{company}/{id}`.
        """
        try:
            data = self._get(f"client/{self.company_id}/{client_id}")
            return data.get("data") or None
        except Exception as e:
            # Fallback: некоторые филиалы возвращают данные через list-endpoint с фильтром
            try:
                data = self._get(
                    f"clients/{self.company_id}",
                    {"id": client_id, "count": 1},
                )
                items = data.get("data") or []
                return items[0] if items else None
            except Exception as e2:
                print(f"YClients get_client error: {e} / fallback: {e2}")
                return None

    def get_record(self, record_id: int) -> dict | None:
        """Одна конкретная запись со всеми деталями (клиент, услуги, мастер, время)."""
        try:
            data = self._get(f"record/{self.company_id}/{record_id}")
            return data.get("data") or None
        except Exception as e:
            print(f"YClients get_record error: {e}")
            return None

    def create_finance_transaction(
        self,
        record_id: int,
        amount: int,
        master_id: int,
        client_id: int | None,
        account_id: int,
        comment: str = "",
        visit_id: int | None = None,
        sold_item_id: int | None = None,
    ) -> dict:
        """
        Создаёт финансовую транзакцию (приход в кассу) — это «доход от услуг».

        В YClients у каждого филиала есть категории финансовых операций;
        expense_id=5 — стандартная категория «Оказание услуг» (приходная).
        Дата обязательно в формате "YYYY-MM-DD HH:MM:SS".

        Передаём record_id/visit_id/sold_item_type, чтобы операция могла
        привязаться к визиту. После вызова оплаты всё равно перечитываем запись:
        успехом считаем только реальный paid_full/payment_status/cost_to_pay.
        """
        from datetime import datetime
        try:
            payload = {
                "expense_id": 5,                  # «Оказание услуг» (приход)
                "amount": amount,
                "account_id": account_id,
                "client_id": client_id,
                "master_id": master_id,
                "record_id": record_id,
                "visit_id": visit_id,
                "sold_item_type": "service",
                "sold_item_id": sold_item_id,
                "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "comment": comment or f"Закрытие записи #{record_id} из бота",
            }
            data = self._post(f"finance_transactions/{self.company_id}", payload)
            if data.get("success"):
                return {"success": True, "transaction": data.get("data")}
            return {
                "success": False,
                "error": data.get("meta", {}).get("message", "Ошибка YClients"),
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def mark_record_loyalty_redemption(
        self,
        record_id: int,
        service_title: str,
        points: int,
    ) -> dict:
        """
        Помечает в YClients-записи, что одна из услуг оплачена баллами:
          1) добавляет к comment пометку «🪙 <услуга> оплачено баллами (N б)»
          2) обнуляет cost этой услуги в записи (YClients покажет 0₽ + первоначальную)

        Идемпотентно: если пометка уже есть в comment — не дублирует.
        Если услуга в записи не найдена — добавляет только comment.
        """
        try:
            current = self._get(f"record/{self.company_id}/{record_id}").get("data") or {}
            if not current:
                return {"success": False, "error": "record not found"}

            # 1) обновляем услуги: ищем нужную по title, обнуляем cost,
            # discount ставим 100% (визуально «бесплатно по программе лояльности»).
            services_payload = []
            target_lower = (service_title or "").strip().lower()
            matched = False
            for s in (current.get("services") or []):
                stitle = (s.get("title") or "").strip().lower()
                if stitle == target_lower and not matched:
                    services_payload.append({
                        "id": s.get("id"),
                        "cost": 0,
                        "discount": 100,
                        "first_cost": s.get("first_cost") or s.get("cost"),
                    })
                    matched = True
                else:
                    services_payload.append({
                        "id": s.get("id"),
                        "cost": s.get("cost"),
                        "discount": s.get("discount", 0),
                        "first_cost": s.get("first_cost") or s.get("cost"),
                    })

            # 2) комментарий — идемпотентно
            existing_comment = (current.get("comment") or "").strip()
            note = f"🪙 {service_title} оплачено баллами ({points} б)"
            if note in existing_comment:
                new_comment = existing_comment
            elif existing_comment:
                new_comment = f"{existing_comment} | {note}"
            else:
                new_comment = note

            # 3) клиент в payload — обязательное поле (если есть)
            client = current.get("client") or {}
            client_payload = {
                "phone": client.get("phone", ""),
                "name":  client.get("name",  ""),
                "email": client.get("email", ""),
            } if client.get("phone") else None

            payload = {
                "staff_id":      current.get("staff_id") or (current.get("staff") or {}).get("id"),
                "services":      services_payload,
                "client":        client_payload,
                "datetime":      current.get("datetime"),
                "seance_length": current.get("seance_length"),
                "save_if_busy":  True,
                "send_sms":      False,
                "comment":       new_comment,
                "attendance":    current.get("attendance", 0),
                "paid_full":     current.get("paid_full", 0),
                "confirmed":     current.get("confirmed", 1),
                "sms_before":    current.get("sms_before", 0),
                "sms_now":       current.get("sms_now", 0),
                "email_now":     current.get("email_now", 0),
                "notified":      current.get("notified", 0),
                "master_request": current.get("master_request", 0),
            }
            data = self._put(f"record/{self.company_id}/{record_id}", payload)
            if not data.get("success"):
                return {
                    "success": False,
                    "error": data.get("meta", {}).get("message", "Ошибка YClients"),
                    "matched_service": matched,
                }
            return {"success": True, "matched_service": matched}
        except Exception as e:
            return {"success": False, "error": str(e)}


    def append_record_comment(self, record_id: int, note: str, replace_markers=None) -> dict:
        """Идемпотентно дописывает короткую пометку к comment записи YClients,
        сохраняя услуги/клиента/статусы записи. Если пометка уже есть — не
        дублирует. Используется для «настроения визита» (🔴 тишина / 🔵 общение),
        чтобы барбер видел выбор клиента прямо в своём приложении YClients.

        replace_markers — список взаимоисключающих пометок (оба варианта
        настроения): перед добавлением прежний вариант удаляется, чтобы в
        комментарии остался РОВНО один (иначе при смене выбора получалось бы
        «🔴 … | 🔵 …» — противоречивая подсказка мастеру)."""
        try:
            note = (note or "").strip()
            if not note:
                return {"success": False, "error": "empty note"}
            current = self._get(f"record/{self.company_id}/{record_id}").get("data") or {}
            if not current:
                return {"success": False, "error": "record not found"}

            orig_comment = (current.get("comment") or "").strip()
            existing_comment = orig_comment
            if replace_markers:
                parts = [p.strip() for p in existing_comment.split("|")]
                parts = [p for p in parts if p and p not in replace_markers]
                existing_comment = " | ".join(parts)
            if note in existing_comment:
                new_comment = existing_comment
            else:
                new_comment = f"{existing_comment} | {note}" if existing_comment else note
            if new_comment == orig_comment:
                return {"success": True, "skipped": True}  # ничего не изменилось

            # услуги сохраняем как есть (cost/discount/first_cost), ничего не меняем
            services_payload = [{
                "id": s.get("id"),
                "cost": s.get("cost"),
                "discount": s.get("discount", 0),
                "first_cost": s.get("first_cost") or s.get("cost"),
            } for s in (current.get("services") or [])]

            client = current.get("client") or {}
            client_payload = {
                "phone": client.get("phone", ""),
                "name":  client.get("name",  ""),
                "email": client.get("email", ""),
            } if client.get("phone") else None

            payload = {
                "staff_id":      current.get("staff_id") or (current.get("staff") or {}).get("id"),
                "services":      services_payload,
                "client":        client_payload,
                "datetime":      current.get("datetime"),
                "seance_length": current.get("seance_length"),
                "save_if_busy":  True,
                "send_sms":      False,
                "comment":       new_comment,
                "attendance":    current.get("attendance", 0),
                "paid_full":     current.get("paid_full", 0),
                "confirmed":     current.get("confirmed", 1),
                "sms_before":    current.get("sms_before", 0),
                "sms_now":       current.get("sms_now", 0),
                "email_now":     current.get("email_now", 0),
                "notified":      current.get("notified", 0),
                "master_request": current.get("master_request", 0),
            }
            data = self._put(f"record/{self.company_id}/{record_id}", payload)
            if not data.get("success"):
                return {"success": False, "error": data.get("meta", {}).get("message", "Ошибка YClients")}
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}


    def set_record_paid(
        self, record_id: int, paid_full: bool = True, payment_method: str = "cash"
    ) -> dict:
        """
        Помечает запись оплаченной с указанным способом (cash / card).

        Делает проверяемое закрытие:
          1. PUT /record — выставляет attendance=1, paid_full/payment_status и
             обнуляет cost_to_pay у услуг.
          2. Если запись после PUT всё ещё не оплачена, пробует создать
             привязанную к record_id/visit_id кассовую операцию.
          3. Успех возвращает только когда повторное чтение записи показывает
             paid_full/payment_status или нулевой остаток к оплате.
        """
        try:
            current = self.get_record(record_id)
            if not current:
                return {"success": False, "error": f"Запись {record_id} не найдена"}

            def is_paid_record(rec: dict | None) -> bool:
                if not rec:
                    return False
                if rec.get("paid_full"):
                    return True
                try:
                    if int(rec.get("payment_status") or 0) > 0:
                        return True
                except Exception:
                    pass
                svcs = [s for s in (rec.get("services") or []) if isinstance(s, dict)]
                if not svcs:
                    return False
                total = sum(int(s.get("cost") or 0) for s in svcs)
                left = sum(int(s.get("cost_to_pay") or 0) for s in svcs)
                return total > 0 and left <= 0

            if paid_full and is_paid_record(current):
                return {"success": True, "record_id": record_id, "already_paid": True}

            # Сводим клиента к виду, который ждёт API на запись (id или phone+name)
            client = current.get("client") or {}
            client_payload = {
                "id": client.get("id"),
                "name": client.get("name"),
                "surname": client.get("surname"),
                "phone": client.get("phone"),
                "email": client.get("email"),
            }
            # Сервисы — id + cost + discount достаточно
            services_payload = []
            for s in (current.get("services") or []):
                item = {
                    "id": s.get("id"),
                    "amount": s.get("amount") or 1,
                    "cost": s.get("cost"),
                    "discount": s.get("discount", 0),
                    "first_cost": s.get("first_cost") or s.get("cost"),
                }
                if s.get("manual_cost") is not None:
                    item["manual_cost"] = s.get("manual_cost")
                if paid_full:
                    item["cost_to_pay"] = 0
                elif s.get("cost_to_pay") is not None:
                    item["cost_to_pay"] = s.get("cost_to_pay")
                services_payload.append(item)

            existing_comment = (current.get("comment") or "").strip()
            paid_note = f"Закрыто из бота: {payment_method}"
            # Идемпотентно: если такая пометка уже есть, не дублируем
            if paid_note in existing_comment:
                new_comment = existing_comment
            elif existing_comment:
                new_comment = f"{existing_comment} | {paid_note}"
            else:
                new_comment = paid_note

            total = sum(int(s.get("cost") or 0) for s in services_payload)
            account_id = (
                self.cash_account_id
                if payment_method == "cash"
                else self.cashless_account_id
            )
            tx_comment = f"Оплата записи #{record_id}: {payment_method}"
            payload = {
                "staff_id":      current.get("staff_id") or (current.get("staff") or {}).get("id"),
                "services":      services_payload,
                "client":        client_payload,
                "datetime":      current.get("datetime"),
                "seance_length": current.get("seance_length"),
                "save_if_busy":  True,
                "send_sms":      False,
                "comment":       new_comment,
                # attendance: 1 — клиент пришёл, визит состоялся. Это и есть
                # «закрыть запись» с точки зрения мастера.
                "attendance":    1 if paid_full else current.get("attendance", 0),
                "paid_full":     1 if paid_full else 0,  # может остаться 0,
                "payment_status": 1 if paid_full else current.get("payment_status", 0),
                "visit_id":      current.get("visit_id"),
                "confirmed":     current.get("confirmed", 1),
                "sms_before":    current.get("sms_before", 0),
                "sms_now":       current.get("sms_now", 0),
                "email_now":     current.get("email_now", 0),
                "notified":      current.get("notified", 0),
                "master_request": current.get("master_request", 0),
            }

            try:
                data = self._put(f"record/{self.company_id}/{record_id}", payload)
            except Exception:
                fallback_payload = dict(payload)
                fallback_payload.pop("payment_status", None)
                fallback_payload.pop("visit_id", None)
                try:
                    data = self._put(f"record/{self.company_id}/{record_id}", fallback_payload)
                except Exception:
                    fallback_payload = dict(fallback_payload)
                    fallback_payload["services"] = [
                        {k: v for k, v in s.items() if k != "cost_to_pay"}
                        for s in fallback_payload.get("services", [])
                        if isinstance(s, dict)
                    ]
                    data = self._put(f"record/{self.company_id}/{record_id}", fallback_payload)
            if not data.get("success"):
                return {
                    "success": False,
                    "error": data.get("meta", {}).get("message", "Ошибка YClients"),
                }

            after = self.get_record(record_id)
            tx_result = {"success": True, "skipped": True, "reason": "record_put"}
            if paid_full and not is_paid_record(after) and total > 0:
                tx_exists = False
                try:
                    start = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
                    end = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
                    for tx in self.get_company_transactions(start, end, max_pages=5):
                        if not isinstance(tx, dict):
                            continue
                        if tx_comment in str(tx.get("comment") or "") and int(tx.get("record_id") or 0) == int(record_id):
                            tx_exists = True
                            tx_result = {"success": True, "already_exists": True, "transaction": tx}
                            break
                except Exception:
                    tx_exists = False
                if not tx_exists:
                    first_service_id = None
                    for s in services_payload:
                        if s.get("id"):
                            first_service_id = s.get("id")
                            break
                    tx_result = self.create_finance_transaction(
                        record_id=record_id,
                        amount=total,
                        master_id=current.get("staff_id") or (current.get("staff") or {}).get("id"),
                        client_id=(current.get("client") or {}).get("id"),
                        account_id=account_id,
                        comment=tx_comment,
                        visit_id=current.get("visit_id"),
                        sold_item_id=first_service_id,
                    )
                if not tx_result.get("success"):
                    return {
                        "success": False,
                        "error": tx_result.get("error") or "Кассовая операция не создана.",
                    }
                after = self.get_record(record_id)

            if paid_full and not is_paid_record(after):
                return {
                    "success": False,
                    "error": "YClients принял запрос, но запись осталась неоплаченной.",
                    "transaction": tx_result,
                }

            return {
                "success": True,
                "record_id": record_id,
                "amount": total,
                "payment_method": payment_method,
                "record": after or data.get("data"),
                "transaction": tx_result,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
