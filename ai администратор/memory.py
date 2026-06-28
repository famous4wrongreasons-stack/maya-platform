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

CONVERSATIONS_FILE = os.path.join(os.path.dirname(__file__), "conversations.json")


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
    counts, names, first_idx = {}, {}, {}
    for idx, h in enumerate(history):
        if not isinstance(h, dict):
            continue
        mid = h.get("master_id")
        if not mid:
            continue
        if active is not None and mid not in active:
            continue
        counts[mid] = counts.get(mid, 0) + 1
        if mid not in names:
            names[mid] = h.get("master") or ""
            first_idx[mid] = idx
    if not counts:
        return None
    best = max(counts, key=lambda m: (counts[m], -first_idx[m]))
    return {"id": best, "name": names.get(best, "")}


def build_context(user_id: int) -> str:
    """
    Обезличенный контекст о клиенте для AI.
    НЕ содержит имя, телефон и идентификаторы — только услугу/мастера прошлого
    визита и запомненные привычки (без ПД), чтобы MAYA узнавала вернувшегося
    и общалась персонально.
    """
    # Сотрудникам/владельцу/основателю НЕ навязываем «клиентский» контекст
    # («предложи записаться к тому же мастеру»): их роль и личность задаются
    # отдельными блоками системного промпта. Иначе MAYA общается с боссом/мастером
    # как с записью на стрижку — это и читается как «она меня не узнаёт».
    try:
        is_staff = bool(database.is_admin(int(user_id))
                        or database.get_master_by_chat_id(int(user_id)))
    except Exception:
        is_staff = False
    if is_staff:
        return ""

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
        _hist = database.get_client_history_cached(_cid) if _cid else None
        if _hist:
            visited = True
            usual = _usual_master_from_history(_hist)
            _uid = usual.get("id") if usual else None
            for h in _hist:
                if not isinstance(h, dict):
                    continue
                if last_service is None and h.get("service"):
                    last_service = h.get("service")
                if usual_services is None and _uid and h.get("master_id") == _uid and h.get("service"):
                    usual_services = h.get("service")
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
    """Загружает историю переписок с диска. Ключи — user_id (int)."""
    try:
        with open(CONVERSATIONS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return {int(k): v for k, v in raw.items()}
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
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
