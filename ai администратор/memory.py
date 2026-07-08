"""
Постоянная память бота между сессиями.

Хранит историю переписки (без персональных данных) и формирует
обезличенный контекст о клиенте для AI-модели.

Персональные данные (имя, телефон) здесь НЕ хранятся — они в database.py.
История переписки тоже не содержит ПД: сообщения с телефоном/email чистятся
анонимайзером, а имя/телефон собираются вне AI-диалога.
"""
import json
import os

import database
from yclients import YClientsAPI

CONVERSATIONS_FILE = os.path.join(os.path.dirname(__file__), "conversations.json")
_YC = None


def _yc() -> YClientsAPI:
    global _YC
    if _YC is None:
        _YC = YClientsAPI()
    return _YC


def normalize_history_visit(visit: dict) -> dict:
    """Приводит визит клиента к единому формату кеша."""
    if not isinstance(visit, dict):
        return {
            "date": None,
            "services": [],
            "staff": {"id": None, "name": ""},
            "master_id": None,
            "master": "",
            "service": "",
        }

    staff = visit.get("staff") or {}
    if not isinstance(staff, dict):
        staff = {}

    master_id = visit.get("master_id")
    if master_id is None:
        master_id = staff.get("id")
    try:
        master_id = int(master_id) if master_id is not None else None
    except (TypeError, ValueError):
        master_id = None

    master_name = (
        (visit.get("master") or "").strip()
        or (staff.get("name") or "").strip()
    )

    services = []
    for item in (visit.get("services") or []):
        if not isinstance(item, dict):
            continue
        title = (item.get("title") or "").strip()
        if not title:
            continue
        services.append({
            "title": title,
            "cost": item.get("cost") or item.get("price") or 0,
        })

    direct_service = (visit.get("service") or "").strip()
    if not services and direct_service:
        services = [{"title": direct_service, "cost": 0}]

    service_text = direct_service or ", ".join(
        s["title"] for s in services if s.get("title")
    )

    return {
        "date": visit.get("date") or visit.get("datetime"),
        "services": services,
        "staff": {"id": master_id, "name": master_name},
        "master_id": master_id,
        "master": master_name,
        "service": service_text,
    }


def normalize_history(history: list | None) -> list[dict]:
    """Нормализует список визитов к единому формату кеша."""
    return [normalize_history_visit(visit) for visit in (history or [])]


def digits10(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    return digits[-10:] if len(digits) >= 10 else digits


def find_exact_client_by_phone(phone: str, yc: YClientsAPI | None = None) -> dict | None:
    """Ищет точную карточку клиента в YClients по последним 10 цифрам телефона."""
    want = digits10(phone)
    if len(want) < 10:
        return None
    yc = yc or _yc()
    for row in yc.search_clients(phone, limit=8) or []:
        if digits10(row.get("phone") or "") == want:
            return row
    return None


def warm_client_history_cache_for_phone(
    client_id: int,
    phone: str,
    yc: YClientsAPI | None = None,
    force: bool = False,
    limit: int = 20,
) -> dict:
    """Прогревает кеш истории клиента из YClients и возвращает диагностический результат."""
    out = {
        "ok": False,
        "source": "",
        "history": [],
        "visits": 0,
        "exact_found": None,
        "reason": "",
        "yclients_id": None,
    }
    if not client_id:
        out["reason"] = "missing_client_id"
        return out
    if not phone:
        out["reason"] = "missing_phone"
        return out

    cached = normalize_history(database.get_client_history_cached(client_id))
    if cached and not force:
        out.update({
            "ok": True,
            "source": "cache",
            "history": cached,
            "visits": len(cached),
        })
        return out

    exact = find_exact_client_by_phone(phone, yc=yc)
    out["exact_found"] = bool(exact)
    if not exact or not exact.get("id"):
        out["reason"] = "exact_client_not_found"
        return out

    yc = yc or _yc()
    history = normalize_history(yc.get_client_history(int(exact["id"]), limit) or [])
    database.set_client_history_cache(client_id, history)
    out.update({
        "ok": True,
        "source": "yclients",
        "history": history,
        "visits": len(history),
        "reason": "ok",
        "yclients_id": exact["id"],
    })
    return out


def _has_client_context(text: str) -> bool:
    return (
        "этот пользователь также бывает клиентом салона" in (text or "")
        or "этот клиент уже стригся у нас раньше" in (text or "")
    )


def audit_dual_role_client_context(
    yc: YClientsAPI | None = None,
    repair: bool = True,
    limit: int = 20,
) -> dict:
    """Проверяет dual-role аккаунты (мастер + клиент) и при необходимости прогревает кеш."""
    yc = yc or _yc()
    result = {
        "scanned_masters": 0,
        "dual_role": 0,
        "healthy": 0,
        "repaired": [],
        "issues": [],
    }

    for master in database.list_masters():
        chat_id = master.get("telegram_chat_id")
        if not chat_id:
            continue
        result["scanned_masters"] += 1

        client = database.get_client(int(chat_id))
        if not client:
            continue
        result["dual_role"] += 1

        client_id = client.get("id")
        phone = client.get("phone") or ""
        name = (master.get("full_name") or client.get("name") or f"chat {chat_id}").strip()

        cached = normalize_history(database.get_client_history_cached(client_id))
        context = build_context(int(chat_id))
        has_context = _has_client_context(context)
        last_booking = database.get_last_booking(int(chat_id))
        if (cached or last_booking) and has_context:
            result["healthy"] += 1
            continue

        warmed = None
        if repair and client_id and phone and (not cached or not has_context):
            warmed = warm_client_history_cache_for_phone(
                client_id,
                phone,
                yc=yc,
                force=not bool(cached),
                limit=limit,
            )
            cached = warmed.get("history") or cached
            context = build_context(int(chat_id))
            has_context = _has_client_context(context)
            last_booking = database.get_last_booking(int(chat_id))
            if warmed.get("source") == "yclients" and (cached or last_booking) and has_context:
                result["healthy"] += 1
                result["repaired"].append({
                    "chat_id": int(chat_id),
                    "name": name,
                    "visits": len(cached or []),
                    "yclients_id": warmed.get("yclients_id"),
                })
                continue

        if (cached or last_booking) and has_context:
            result["healthy"] += 1
            continue

        issue = {
            "chat_id": int(chat_id),
            "name": name,
            "severity": "warn",
            "reason": "",
            "detail": "",
        }
        if cached and not has_context:
            issue.update({
                "severity": "fail",
                "reason": "context_missing_with_history",
                "detail": f"Есть клиентская история ({len(cached)} виз.), но контекст для мастера не собирается",
            })
        elif last_booking and not has_context:
            issue.update({
                "severity": "fail",
                "reason": "context_missing_with_booking",
                "detail": "Есть локальная история записей, но клиентский контекст пуст",
            })
        else:
            exact_found = warmed.get("exact_found") if isinstance(warmed, dict) else None
            if exact_found is None:
                exact_found = bool(find_exact_client_by_phone(phone, yc=yc))
            if exact_found is False:
                exact_found = False
            # Истории визитов пока нет, либо телефон/точная YClients-карта ещё не
            # собраны — это не авария. Guard тревожит только когда контекст ДОЛЖЕН
            # быть, но не собирается.
            result["healthy"] += 1
            continue
        result["issues"].append(issue)
    return result


def _history_master_name(visit: dict) -> str:
    """Имя мастера из старого и нового форматов кеша истории."""
    if not isinstance(visit, dict):
        return ""
    return (
        (visit.get("master") or "").strip()
        or ((visit.get("staff") or {}).get("name") or "").strip()
    )


def _history_service_text(visit: dict) -> str:
    """Текст услуг визита из старого и нового форматов кеша истории."""
    if not isinstance(visit, dict):
        return ""
    direct = (visit.get("service") or "").strip()
    if direct:
        return direct
    titles = [
        (s.get("title") or "").strip()
        for s in (visit.get("services") or [])
        if isinstance(s, dict) and (s.get("title") or "").strip()
    ]
    return ", ".join(titles)


def _usual_master_from_history(history) -> dict | None:
    """«Обычный мастер» из YClients-истории визитов (как в кабинете): самый частый
    среди ДЕЙСТВУЮЩИХ мастеров; при равенстве — самый недавний. history — список
    визитов (новые первыми), каждый с master_id/master. Реплика _usual_master из
    webhook_server (вынесено сюда, чтобы не тянуть circular import)."""
    if not history:
        return None
    try:
        from config import ACTIVE_MASTER_IDS
        active = {int(x) for x in ACTIVE_MASTER_IDS}
    except Exception:
        active = None
    counts, names, ids, first_idx = {}, {}, {}, {}
    for idx, h in enumerate(normalize_history(history)):
        mid = h.get("master_id")
        name = _history_master_name(h)
        if not mid and not name:
            continue
        if active is not None and mid and mid not in active:
            continue
        key = f"id:{mid}" if mid else f"name:{name.lower()}"
        counts[key] = counts.get(key, 0) + 1
        if key not in names:
            names[key] = name
            ids[key] = mid
            first_idx[key] = idx
    if not counts:
        return None
    best = max(counts, key=lambda m: (counts[m], -first_idx[m]))
    return {"id": ids.get(best), "name": names.get(best, "")}


def build_context(user_id: int) -> str:
    """
    Обезличенный контекст о клиенте для AI.
    НЕ содержит имя, телефон и идентификаторы — только услугу/мастера прошлого
    визита и запомненные привычки (без ПД), чтобы MAYA узнавала вернувшегося
    и общалась персонально.
    """
    # Сотрудник тоже может писать как клиент. Для него ниже даём НЕ продающий,
    # а нейтральный фактологический контекст — чтобы MAYA знала его «как обычно»,
    # но не путала рабочий режим с записью на стрижку.
    try:
        is_staff = bool(database.is_admin(int(user_id))
                        or database.get_master_by_chat_id(int(user_id)))
    except Exception:
        is_staff = False

    lines = []
    # Источник истории: СНАЧАЛА кэш YClients-визитов (как в кабинете — реальные
    # стрижки в салоне), ПОТОМ локальная таблица bookings (только записи через бота).
    # Раньше брали только bookings → MAYA была слепа к реальной истории салона и не
    # знала «обычного мастера» даже у залогиненного клиента с баллами.
    visited = False
    usual = None
    usual_services = None   # «как обычно» — услуги из самого недавнего визита к обычному мастеру
    last_service = None
    try:
        _cl = database.get_client(int(user_id))
        _cid = _cl.get("id") if _cl else None
        _hist = normalize_history(database.get_client_history_cached(_cid)) if _cid else None
        if _hist:
            visited = True
            usual = _usual_master_from_history(_hist)
            _uid = usual.get("id") if usual else None
            for h in _hist:
                if not isinstance(h, dict):
                    continue
                service_text = _history_service_text(h)
                if last_service is None and service_text:
                    last_service = service_text
                if usual_services is None and _uid and h.get("master_id") == _uid and service_text:
                    usual_services = service_text
                if usual_services is None and not _uid and usual and _history_master_name(h) == usual.get("name") and service_text:
                    usual_services = service_text
            if usual_services is None:
                usual_services = last_service
    except Exception:
        pass
    if not visited:
        last = database.get_last_booking(user_id)
        if last:
            visited = True
            if last.get("master"):
                usual = {"name": last["master"]}
            last_service = last.get("service")
            usual_services = last_service
    if visited:
        if is_staff:
            lines.append(
                "Контекст: этот пользователь также бывает клиентом салона. "
                "Используй это только если он спрашивает о себе как о клиенте "
                "или хочет записаться; в рабочих вопросах игнорируй."
            )
            if usual and usual.get("name"):
                lines.append(
                    f"Как клиент он обычно ходит к {usual['name']}"
                    + (f" на «{usual_services}»" if usual_services else "")
                    + ". Если он спрашивает «к кому обычно хожу», "
                    "«запиши меня как обычно» или про свои личные предпочтения — "
                    "опирайся на этот факт."
                )
            elif last_service:
                lines.append(
                    f"Как клиент раньше он чаще брал услуги: {last_service}. "
                    "Используй это только для его собственных клиентских вопросов."
                )
        else:
            lines.append("Контекст: этот клиент уже стригся у нас раньше.")
            if usual and usual.get("name"):
                offer = f"Записать как обычно — к {usual['name']}"
                if usual_services:
                    offer += f" на «{usual_services}»"
                offer += "? Останется выбрать только дату и время."
                lines.append(
                    f"Его «как обычно»: мастер {usual['name']}"
                    + (f", услуги «{usual_services}»" if usual_services else "")
                    + f". Когда клиент захочет записаться — СРАЗУ предложи одной фразой: «{offer}» "
                    + "(мастер и услуги уже известны). НЕ переспрашивай мастера/услуги, если он сам не "
                    + "попросит другое, и НЕ проси контакт — клиент уже известен. Если согласится «как "
                    + "обычно» — нужны только дата и время."
                )
            elif last_service:
                lines.append(f"Прошлые услуги: {last_service}. Можешь предложить записать как обычно.")

    # Запомненные привычки/предпочтения (Фаза 3 «консьерж»). Обезличенно.
    try:
        prefs = database.get_client_preferences(user_id)
    except Exception:
        prefs = ""
    if prefs:
        habits = "; ".join(p.strip() for p in prefs.splitlines() if p.strip())
        if habits:
            lines.append(
                "Что мы помним о его привычках (учитывай в общении и при подборе "
                f"услуг/мастера, но НЕ зачитывай дословно): {habits}."
            )

    if not lines:
        return ""
    lines.append("Персональные данные не упоминай.")
    return " ".join(lines)


# ─── История переписки ──────────────────────────────────────────────────

def load_conversations() -> dict:
    """Загружает историю переписок с диска.

    Старый Telegram-бот использует числовые user_id, а PWA хранит отдельные
    контексты поверхностей строковыми ключами, например pwa:staff:<chat_id>.
    """
    try:
        with open(CONVERSATIONS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        conversations = {}
        for k, v in raw.items():
            try:
                conversations[int(k)] = v
            except (TypeError, ValueError):
                conversations[str(k)] = v
        return conversations
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_conversations(conversations: dict):
    """Сохраняет историю переписок на диск (атомарно, через временный файл)."""
    try:
        data = {str(k): v for k, v in conversations.items() if v}
        tmp = CONVERSATIONS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, CONVERSATIONS_FILE)
    except Exception:
        pass
