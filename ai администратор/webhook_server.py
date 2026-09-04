"""
Webhook-приёмник для уведомлений мастерам о новых записях.

Поток данных:
    YClients → malesthetic.pro/yclients-webhook.php (PHP-прокси на Beget)
            → http://<bot_server>:8080/yclients-webhook (этот модуль)
            → Telegram → мастер

PHP-прокси нужен потому, что YClients требует HTTPS для webhook, а у бот-сервера
в Yandex Cloud нет своего SSL/домена. PHP на Beget уже под HTTPS, форвардит сюда
чистый JSON.

Что делает этот модуль:
    1. Поднимает aiohttp-сервер на порту WEBHOOK_PORT (по умолчанию 8080)
    2. Принимает POST на /yclients-webhook?secret=...
    3. Проверяет секрет (защита от чужих запросов)
    4. Дедуплицирует событие по record_id
    5. Получает детали записи через YClients API
    6. Находит мастера по staff_id из записи
    7. Отправляет мастеру базовое уведомление в Telegram

AI-совет по апсейлу будет добавлен в Этапе 3 (отдельный модуль masters_ai.py).
Кнопки оплаты (Наличные/Карта) — в Этапе 4.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json as _json
import logging
import os
import re
import sqlite3
import time
import uuid
from datetime import datetime, date, timedelta
from typing import Any
from urllib.parse import parse_qsl

from aiohttp import web
from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application

import ai_billing
import anonymizer
import config
import cutmatch
import cycle_reminder
import database
import growth_planner
import lead_alerts
import master_briefing
import masters_ai
import maya_capabilities
import memory
import owner_ai
from privacy_policy import PRIVACY_TEXT
import reputation
import subscriptions
import web_auth
import yukassa_api
import client_record_actions
from chat_widgets import (
    normalize_chat_widget,
    normalize_chat_widget_data,
    widget_for_action,
    widget_from_signal,
)
from business_rules import (
    ANTON_STAFF_ID,
    anton_salary_for_period,
)
from identity_utils import normalize_tg_user, panel_permissions, resolve_panel_role, session_tg_user
from maya_roles import (
    allowed_surfaces_for_panel_role,
    default_brain_profile,
    surface_brain_profiles,
)
from maya_identity import enforce_maya_feminine
from config import WEBHOOK_SECRET, WEBHOOK_PORT, TELEGRAM_TOKEN
from voice_guard import CLARIFY_REPEAT_TEXT, should_clarify_transcript
from yclients import YClientsAPI

logger = logging.getLogger(__name__)

_MAYA_LEGACY_BRIDGE_TOKEN = os.getenv("MAYA_LEGACY_BRIDGE_TOKEN", "").strip()
_MAYA_INBOX_BRIDGE_TOKEN = os.getenv("MAYA_INBOX_BRIDGE_TOKEN", "").strip()

try:
    from config import WEBPUSH_VAPID_PRIVATE_KEY, WEBPUSH_VAPID_CLAIMS
except Exception:
    WEBPUSH_VAPID_PRIVATE_KEY = os.path.join(os.path.dirname(__file__), "vapid_private.pem")
    WEBPUSH_VAPID_CLAIMS = {"sub": "mailto:malehaircut@gmail.com"}

if not WEBPUSH_VAPID_PRIVATE_KEY:
    _local_vapid_key = os.path.join(os.path.dirname(__file__), "vapid_private.pem")
    if os.path.exists(_local_vapid_key):
        WEBPUSH_VAPID_PRIVATE_KEY = _local_vapid_key

# Один экземпляр клиента YClients на всё время жизни сервера
_yc = YClientsAPI()
_VOICE_MASTER_NAMES_CACHE = {"names": (), "ts": 0.0}
_VOICE_SERVICE_TITLES_CACHE = {"titles": (), "ts": 0.0}


def _voice_known_master_names() -> tuple[str, ...]:
    now = time.time()
    names = _VOICE_MASTER_NAMES_CACHE.get("names") or ()
    if names and now - float(_VOICE_MASTER_NAMES_CACHE.get("ts") or 0) < 3600:
        return tuple(names)
    try:
        masters = _yc.get_masters() or []
        names = tuple(m.get("name", "") for m in masters if isinstance(m, dict) and m.get("name"))
    except Exception as e:
        logger.error(f"_voice_known_master_names: {e}")
        names = ()
    _VOICE_MASTER_NAMES_CACHE.update(names=names, ts=now)
    return tuple(names)


def _voice_known_service_titles() -> tuple[str, ...]:
    now = time.time()
    titles = _VOICE_SERVICE_TITLES_CACHE.get("titles") or ()
    if titles and now - float(_VOICE_SERVICE_TITLES_CACHE.get("ts") or 0) < 3600:
        return tuple(titles)
    try:
        services = _yc.get_services() or []
        titles = tuple(
            service.get("title", "")
            for service in services
            if isinstance(service, dict) and service.get("title")
        )
    except Exception as e:
        logger.error(f"_voice_known_service_titles: {e}")
        titles = ()
    _VOICE_SERVICE_TITLES_CACHE.update(titles=titles, ts=now)
    return tuple(titles)

# Номиналы подарочных сертификатов, доступные к покупке в приложении
_CERT_AMOUNTS = (2000, 3000, 5000)

# bot.py внедряет сюда свою _poll_payment при старте (register_payment_poller),
# чтобы покупка сертификата в приложении переиспользовала ту же протестированную
# доставку PDF в Telegram, что и бот, — без дублирования логики.
_poll_payment_fn = None


def register_payment_poller(fn):
    """Внедрение бот-функции опроса платежа/выдачи PDF (вызывается из bot.py)."""
    global _poll_payment_fn
    _poll_payment_fn = fn


# Аналогично — поллер абонементов (опрос платежа ЮKassa + активация подписки +
# уведомление покупателю в Telegram). Внедряется из bot.py при старте.
_poll_sub_payment_fn = None


def register_subscription_poller(fn):
    """Внедрение бот-функции опроса платежа абонемента/активации (из bot.py)."""
    global _poll_sub_payment_fn
    _poll_sub_payment_fn = fn


def _extract_record_event(payload: dict) -> tuple[int | None, str | None]:
    """
    YClients шлёт webhook в разных форматах в зависимости от версии API.
    Извлекаем (record_id, event_type) из payload устойчиво к структуре.

    Известные варианты:
      • {"company_id": ..., "resource": "record", "resource_id": 123,
         "status": "create", "data": {...}}                      ← v2
      • {"event": "record.create", "data": {"id": 123, ...}}     ← v1
      • {"id": 123, "company_id": ...}                           ← plain record
    """
    # Variant 1: resource/status (новый формат)
    if "resource" in payload and "resource_id" in payload:
        if payload.get("resource") != "record":
            return None, None
        status = (payload.get("status") or "").lower()
        rec_id = payload.get("resource_id")
        return (int(rec_id) if rec_id else None), f"record.{status}"

    # Variant 2: event + data
    if "event" in payload:
        event = (payload.get("event") or "").lower()
        if not event.startswith("record."):
            return None, None
        data = payload.get("data") or {}
        rec_id = data.get("id") or data.get("record_id")
        return (int(rec_id) if rec_id else None), event

    # Variant 3: plain record body — считаем что это create
    rec_id = payload.get("id") or payload.get("record_id")
    return (int(rec_id) if rec_id else None), "record.create"


def _format_phone(phone: str | None) -> str:
    """+79991234567 → +7 (999) 123-45-67. Используется для отображения."""
    if not phone:
        return "—"
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) == 11 and digits.startswith(("7", "8")):
        d = digits[1:]
        return f"+7 ({d[0:3]}) {d[3:6]}-{d[6:8]}-{d[8:10]}"
    return phone


def _truncate_name(name: str | None, max_len: int = 30) -> str:
    if not name:
        return "клиент"
    name = name.strip()
    if len(name) <= max_len:
        return name
    # Имя + первая буква фамилии: «Дмитрий П.»
    parts = name.split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1][0]}."
    return name[:max_len - 1] + "…"


def _push_preview_body(text: str, max_len: int = 180) -> str:
    plain = re.sub(r"\s+", " ", _plain_maya_text(text or "")).strip()
    if len(plain) <= max_len:
        return plain
    return plain[: max_len - 1].rstrip() + "…"


def _format_datetime(dt_str: str | None) -> str:
    """'2026-05-26T14:00:00+03:00' → '14:00 (сегодня)' / '14:00 (28.05)'."""
    if not dt_str:
        return "—"
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00").split("+")[0])
        time_part = dt.strftime("%H:%M")
        today = datetime.now().date()
        if dt.date() == today:
            return f"{time_part} (сегодня)"
        return f"{time_part} ({dt.strftime('%d.%m')})"
    except Exception:
        return dt_str


def _build_notification_text(record: dict, advice: str | None = None) -> str:
    """
    Уведомление мастеру. Если передан advice — добавляется блок «AI-совет».
    """
    client = record.get("client") or {}
    services = record.get("services") or []
    when = _format_datetime(record.get("date") or record.get("datetime"))

    client_name = _truncate_name(client.get("name"))
    # В YClients поле называется `visits` (число прошлых посещений),
    # на всякий случай проверяем альтернативные имена.
    client_visits = (
        client.get("visits")
        or client.get("visits_count")
        or client.get("visit_count")
        or 0
    )
    visits_tag = ""
    if client_visits == 0:
        visits_tag = " · 🆕 первый визит"
    elif client_visits >= 5:
        visits_tag = f" · 🔁 постоянник ({client_visits + 1}-й визит)"
    elif client_visits >= 1:
        visits_tag = f" · {client_visits + 1}-й визит"

    service_lines = []
    total = 0
    for s in services:
        title = s.get("title") or "Услуга"
        price = s.get("cost") or s.get("price") or 0
        try:
            total += int(price)
        except (TypeError, ValueError):
            pass
        service_lines.append(f"• {title} — {int(price) if price else '?'} ₽")

    # Телефон клиента из уведомления сознательно убран — защита базы
    # клиентов от утечки на сторону мастера. Сами данные у тебя в YClients,
    # бот же только информирует мастера о факте и истории клиента.
    text = (
        f"💈 *Новая запись — {when}*\n\n"
        f"Клиент: *{client_name}*{visits_tag}\n\n"
        f"Услуги ({total} ₽):\n" + "\n".join(service_lines)
    )
    # Настроение визита (🔴 тишина / 🔵 общение), если клиент уже выбрал пилюлю.
    rid = record.get("id") or record.get("record_id")
    if rid:
        try:
            _m = database.get_visit_mood(int(rid))
            if _m == "red":
                text += "\n\n🔴 *Настроение:* хочет тишины — без лишних разговоров."
            elif _m == "blue":
                text += "\n\n🔵 *Настроение:* настроен пообщаться."
        except Exception:
            pass
    if advice:
        text += f"\n\n🤖 *Совет:* {advice}"
    return text


_TIP_SLUG_TO_STAFF_ID = {
    "stas": 1461615,
    "ilya": 1460233,
    "alexey": 1461618,
    "maxim": 1461621,
    "alexander": 3278920,
}


def _master_staff_id(master: dict | None) -> int | None:
    if not master:
        return None
    for key in ("staff_id", "yclients_staff_id", "id"):
        value = master.get(key)
        if value:
            try:
                return int(value)
            except (TypeError, ValueError):
                pass
    return None


def _master_by_chat_id(chat_id: int) -> dict | None:
    for name in ("get_master_by_telegram_chat_id", "get_master_by_chat_id"):
        fn = getattr(database, name, None)
        if callable(fn):
            try:
                return fn(int(chat_id))
            except Exception as e:
                logger.error(f"{name}({chat_id}): {e}")
    try:
        for master in database.list_masters():
            if int(master.get("telegram_chat_id") or 0) == int(chat_id):
                return master
    except Exception:
        pass
    return None


def _master_by_tip_key(key: Any, master_id: Any = None) -> dict | None:
    staff_id = None
    if master_id:
        try:
            staff_id = int(master_id)
        except (TypeError, ValueError):
            staff_id = None
    if not staff_id:
        staff_id = _TIP_SLUG_TO_STAFF_ID.get(str(key or "").strip().lower())
    if staff_id:
        try:
            return database.get_master_by_staff_id(staff_id)
        except Exception as e:
            logger.error(f"get_master_by_staff_id({staff_id}): {e}")
    return None


def _push_db_path() -> str:
    return os.environ.get(
        "MASTER_PUSH_DB",
        os.path.join(os.path.dirname(__file__), "master_push_subscriptions.sqlite3"),
    )


def _push_db() -> sqlite3.Connection:
    conn = sqlite3.connect(_push_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS master_push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id INTEGER,
            telegram_chat_id INTEGER NOT NULL,
            endpoint TEXT NOT NULL UNIQUE,
            subscription_json TEXT NOT NULL,
            user_agent TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_master_push_staff
        ON master_push_subscriptions(staff_id)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_master_push_chat
        ON master_push_subscriptions(telegram_chat_id)
    """)
    conn.commit()
    return conn


def _save_master_push_subscription_sqlite(
    staff_id: int | None,
    chat_id: int,
    subscription: dict,
    user_agent: str = "",
) -> bool:
    endpoint = subscription.get("endpoint")
    if not endpoint:
        return False
    now_s = datetime.now().isoformat(timespec="seconds")
    with _push_db() as conn:
        conn.execute("""
            INSERT INTO master_push_subscriptions
                (staff_id, telegram_chat_id, endpoint, subscription_json, user_agent, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET
                staff_id=excluded.staff_id,
                telegram_chat_id=excluded.telegram_chat_id,
                subscription_json=excluded.subscription_json,
                user_agent=excluded.user_agent,
                updated_at=excluded.updated_at
        """, (
            staff_id,
            int(chat_id),
            endpoint,
            _json.dumps(subscription, ensure_ascii=False),
            user_agent or "",
            now_s,
            now_s,
        ))
        conn.commit()
    return True


def _list_master_push_subscriptions_sqlite(staff_id: int | None, chat_id: int | None) -> list[dict]:
    where = []
    params = []
    if staff_id:
        where.append("staff_id = ?")
        params.append(int(staff_id))
    if chat_id:
        where.append("telegram_chat_id = ?")
        params.append(int(chat_id))
    if not where:
        return []
    sql = (
        "SELECT subscription_json FROM master_push_subscriptions "
        "WHERE " + " OR ".join(where)
    )
    with _push_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    out = []
    for row in rows:
        try:
            out.append(_json.loads(row["subscription_json"]))
        except Exception:
            pass
    return out


def _delete_master_push_subscription_sqlite(endpoint: str):
    if not endpoint:
        return
    try:
        with _push_db() as conn:
            conn.execute("DELETE FROM master_push_subscriptions WHERE endpoint = ?", (endpoint,))
            conn.commit()
    except Exception as e:
        logger.error(f"push sqlite delete failed: {e}")


def _record_push_body(record: dict) -> str:
    client = record.get("client") or {}
    client_name = _truncate_name(client.get("name"))
    when = _format_datetime(record.get("date") or record.get("datetime"))
    services = [
        (s.get("title") or "Услуга")
        for s in (record.get("services") or [])
        if isinstance(s, dict)
    ]
    if services:
        return f"{when} · {client_name} · {', '.join(services[:2])}"
    return f"{when} · {client_name}"


def _save_master_push_subscription(master: dict, chat_id: int, subscription: dict, user_agent: str = "") -> bool:
    staff_id = _master_staff_id(master)
    for name in ("save_master_push_subscription", "upsert_master_push_subscription", "save_push_subscription"):
        fn = getattr(database, name, None)
        if not callable(fn):
            continue
        try:
            fn(
                staff_id=staff_id,
                telegram_chat_id=int(chat_id),
                subscription=subscription,
                user_agent=user_agent,
            )
            return True
        except TypeError:
            try:
                fn(staff_id, int(chat_id), subscription)
                return True
            except Exception as e:
                logger.error(f"{name}: {e}")
        except Exception as e:
            logger.error(f"{name}: {e}")
    try:
        return _save_master_push_subscription_sqlite(staff_id, int(chat_id), subscription, user_agent)
    except Exception as e:
        logger.error(f"push sqlite save failed: {e}")
        return False


def _push_subscriptions_for_master(master: dict) -> list[dict]:
    staff_id = _master_staff_id(master)
    chat_id = master.get("telegram_chat_id") if master else None
    for name in ("list_master_push_subscriptions", "get_master_push_subscriptions", "list_push_subscriptions_for_master"):
        fn = getattr(database, name, None)
        if not callable(fn):
            continue
        try:
            rows = fn(staff_id=staff_id, telegram_chat_id=chat_id)
        except TypeError:
            try:
                rows = fn(staff_id)
            except Exception as e:
                logger.error(f"{name}: {e}")
                rows = []
        except Exception as e:
            logger.error(f"{name}: {e}")
            rows = []
        if rows:
            return list(rows)
    try:
        return _list_master_push_subscriptions_sqlite(staff_id, chat_id)
    except Exception as e:
        logger.error(f"push sqlite list failed: {e}")
        return []


async def _send_master_push(
    master: dict | None,
    title: str,
    body: str,
    url: str = "/app/?panel=schedule",
    tag: str = "",
    data: dict | None = None,
) -> int:
    if not master or not WEBPUSH_VAPID_PRIVATE_KEY:
        return 0
    rows = _push_subscriptions_for_master(master)
    if not rows:
        return 0
    try:
        from pywebpush import WebPushException, webpush
    except Exception as e:
        logger.error(f"Web Push отключён: установите pywebpush ({e})")
        return 0

    payload = _json.dumps({
        "title": title,
        "body": body,
        "url": url,
        "tag": tag or f"master-{_master_staff_id(master) or 'notice'}",
        **(data or {}),
    }, ensure_ascii=False)

    sent = 0
    for row in rows:
        sub = row
        if isinstance(row, dict):
            sub = row.get("subscription") or row.get("subscription_json") or row
        endpoint = sub.get("endpoint") if isinstance(sub, dict) else ""
        if isinstance(sub, str):
            try:
                sub = _json.loads(sub)
                endpoint = sub.get("endpoint") if isinstance(sub, dict) else endpoint
            except Exception:
                continue
        try:
            await asyncio.to_thread(
                webpush,
                subscription_info=sub,
                data=payload,
                vapid_private_key=WEBPUSH_VAPID_PRIVATE_KEY,
                vapid_claims=WEBPUSH_VAPID_CLAIMS,
            )
            sent += 1
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (403, 404, 410):
                _delete_master_push_subscription_sqlite(endpoint)
                logger.info(f"master push stale subscription removed status={status}")
                continue
            logger.error(f"master push failed: {e}")
        except Exception as e:
            logger.error(f"master push failed: {e}")
    return sent


async def _send_client_push(chat_id, title: str, body: str,
                            url: str = "/app/", tag: str = "",
                            data: dict | None = None,
                            persist_in_chat: bool = False,
                            chat_text: str = "",
                            chat_action: dict | None = None,
                            chat_widget: str | None = None,
                            chat_widget_data: dict | None = None,
                            chat_link=None,
                            chat_mode: str = "client",
                            chat_dedupe_key: str = "") -> int:
    """Push конкретному КЛИЕНТУ (по telegram_chat_id) — напр. предложение оставить чай
    после визита. Подписки клиента лежат в той же таблице (staff_id NULL)."""
    if persist_in_chat and chat_id:
        try:
            text_for_chat = (chat_text or "").strip()
            if not text_for_chat:
                text_for_chat = (f"{title}\n\n{body}" if body else title).strip()
            _store_assistant_message_in_chat(
                int(chat_id),
                text_for_chat,
                mode=chat_mode,
                action=chat_action,
                widget=chat_widget,
                widget_data=chat_widget_data,
                link=chat_link,
                dedupe_key=chat_dedupe_key or tag or "",
            )
        except Exception as e:
            logger.error(f"client push chat mirror {chat_id}: {e}")
    if not chat_id or not WEBPUSH_VAPID_PRIVATE_KEY:
        return 0
    try:
        rows = _list_master_push_subscriptions_sqlite(None, int(chat_id))
    except Exception as e:
        logger.error(f"client push list: {e}")
        return 0
    if not rows:
        return 0
    try:
        from pywebpush import WebPushException, webpush
    except Exception as e:
        logger.error(f"Web Push отключён: {e}")
        return 0
    push_data = dict(data or {})
    widget = normalize_chat_widget(chat_widget)
    push_data.pop("widget_data", None)
    if widget:
        push_data["widget"] = widget
        widget_data = normalize_chat_widget_data(widget, chat_widget_data)
        if widget_data:
            push_data["widget_data"] = widget_data
    payload = _json.dumps({
        "title": title, "body": body, "url": url,
        "tag": tag or f"client-{chat_id}", **push_data,
    }, ensure_ascii=False)
    sent = 0
    for row in rows:
        sub = row.get("subscription") or row.get("subscription_json") or row if isinstance(row, dict) else row
        endpoint = sub.get("endpoint") if isinstance(sub, dict) else ""
        if isinstance(sub, str):
            try:
                sub = _json.loads(sub)
                endpoint = sub.get("endpoint") if isinstance(sub, dict) else endpoint
            except Exception:
                continue
        try:
            await asyncio.to_thread(
                webpush, subscription_info=sub, data=payload,
                vapid_private_key=WEBPUSH_VAPID_PRIVATE_KEY, vapid_claims=WEBPUSH_VAPID_CLAIMS)
            sent += 1
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (403, 404, 410):
                _delete_master_push_subscription_sqlite(endpoint)
                logger.info(f"client push stale subscription removed status={status}")
                continue
            logger.error(f"client push failed: {e}")
        except Exception as e:
            logger.error(f"client push failed: {e}")
    return sent


def _tip_offer_details(record: dict, master_name: str = "") -> tuple[str, int]:
    services = []
    base_amount = 0
    for service in record.get("services") or []:
        if not isinstance(service, dict):
            continue
        title = str(service.get("title") or "").strip()
        if title:
            services.append(title)
        try:
            cost = int(round(float(service.get("cost") or 0)))
        except (TypeError, ValueError, OverflowError):
            cost = 0
        if cost > 0:
            base_amount += cost
    if base_amount <= 0:
        for key in ("cost", "amount", "sum"):
            try:
                candidate = int(round(float(record.get(key) or 0)))
            except (TypeError, ValueError, OverflowError):
                candidate = 0
            if candidate > 0:
                base_amount = candidate
                break

    intro = "Визит завершён"
    if services:
        intro += " — " + ", ".join(services[:4])
    if base_amount > 0:
        intro += f" на {base_amount:,} ₽".replace(",", " ")
    who = str(master_name or "").strip()
    question = (
        f"Ваш мастер — {who}. Поблагодарить чаевыми?"
        if who else "Поблагодарить мастера чаевыми?"
    )
    return f"{intro}. {question}", base_amount


async def _offer_tip_to_client(record: dict, record_id: int) -> None:
    """Визит закрыт → шлём клиенту web-push с кнопкой на страницу чаевых ЕГО мастера
    (если клиент подписан на уведомления). Телефон клиента → наш chat_id → подписка."""
    try:
        client = record.get("client") or {}
        phone = client.get("phone")
        our = database.find_client_by_phone(phone) if phone else None
        cc = (our.get("telegram_chat_id") or our.get("chat_id")) if our else None
        staff = record.get("staff") or {}
        staff_id = record.get("staff_id") or staff.get("id")
        master_name = staff.get("name") or ""
        if not cc or not staff_id:
            return
        chat_text, base_amount = _tip_offer_details(record, master_name)
        widget_data = {
            "master_id": int(staff_id),
            "base_amount": base_amount,
        }
        n = await _send_client_push(
            int(cc),
            title="Спасибо за визит! 💈",
            body=chat_text,
            url=f"/app/?tips={staff_id}",
            tag=f"tip-offer-{record_id}",
            data={"master": str(staff_id)},
            persist_in_chat=True,
            chat_text=chat_text,
            chat_widget="tips",
            chat_widget_data=widget_data,
            chat_link={
                "label": "Оставить чаевые",
                "url": f"https://malesthetic.pro/app/?tips={staff_id}",
            },
            chat_dedupe_key=f"tip-offer:{record_id}",
        )
        if n:
            logger.info(f"tip-offer push клиенту chat={cc} (мастер {staff_id}): отправлено {n}")
    except Exception as e:
        logger.error(f"_offer_tip_to_client {record_id}: {e}")


async def _notify_client_record(record: dict, record_id: int, kind: str) -> None:
    """Пуш КЛИЕНТУ о его записи (kind: create | reschedule | cancel) — если он
    зарегистрирован у нас и подписан на web-push. Транзакционное уведомление
    (не реклама): о новой записи, переносе времени, отмене. Телефон записи →
    наш chat_id → его push-подписка."""
    try:
        client = record.get("client") or {}
        phone = client.get("phone")
        our = database.find_client_by_phone(phone) if phone else None
        cc = (our.get("telegram_chat_id") or our.get("chat_id")) if our else None
        if not cc:
            return
        # Персональная настройка: клиент мог отключить уведомления об изменениях своей записи
        try:
            if not database.get_notify_prefs_by_chat_id(int(cc)).get("record_changes", True):
                return
        except Exception:
            pass
        staff = record.get("staff") or {}
        master = staff.get("name") or ""
        when = _format_datetime(record.get("date") or record.get("datetime"))
        msfx = f" · мастер {master}" if master else ""
        if kind == "create":
            title = "Вы записаны ✅"
            body = (f"{when}{msfx}. " if when else "") + "Ждём вас в «Мужской Эстетике»!"
        elif kind == "reschedule":
            title = "Запись перенесена 🔁"
            body = f"Новое время: {when}{msfx}." if when else "Время вашей записи изменилось."
        elif kind == "cancel":
            title = "Запись отменена ❌"
            body = (f"{when}{msfx}. " if when else "") + "Если это ошибка — запишитесь снова в приложении."
        else:
            return
        n = await _send_client_push(
            int(cc), title=title, body=body,
            url="/app/", tag=f"client-rec-{kind}-{record_id}",
            data={"record_id": record_id, "event": kind},
            persist_in_chat=True,
            chat_text=f"{title}\n\n{body}",
            chat_action={
                "type": "open_cabinet",
                "label": "Мои записи",
                "screen": "cabinet",
            },
            chat_widget="mybookings",
            chat_dedupe_key=f"client-record:{kind}:{record_id}",
        )
        if n:
            logger.info(f"client push ({kind}) chat={cc} record={record_id}: отправлено {n}")
    except Exception as e:
        logger.error(f"_notify_client_record {record_id} {kind}: {e}")


async def _apply_client_reminder_pref(record: dict, record_id: int) -> None:
    """
    Уважает выбор клиента «Напоминание перед визитом» (раздел «Настройки» в
    приложении) для ЛЮБОЙ его записи — не только созданной через наше приложение.

    Наш бот шлёт ТОЛЬКО Telegram; SMS/WhatsApp-напоминание шлёт YClients по полю
    записи `notify_by_sms` (часы до визита, 0 = не напоминать). При записи ЧЕРЕЗ
    приложение мы уже проставляем его в create_booking. Здесь — дотягиваем выбор
    клиента до записей, созданных админом / по телефону / онлайн-виджетом.

    Действуем ТОЛЬКО если клиент сам открывал настройки (has_saved_notify_prefs),
    иначе не трогаем дефолт салона. Меняем неразрушающе и идемпотентно:
      • reminder == False           → 0 (не напоминать);
      • reminder == True            → reminder_hours (за сколько часов).
    """
    try:
        client = record.get("client") or {}
        phone = client.get("phone")
        if not phone:
            return
        our = database.find_client_by_phone(phone)
        if not our or not our.get("id"):
            return
        cid = int(our["id"])
        # Клиент не открывал настройки → оставляем поведение салона как есть.
        if not database.has_saved_notify_prefs(cid):
            return
        prefs = database.get_notify_prefs(cid)
        if prefs.get("reminder") is False:
            target = 0
        else:
            try:
                target = int(prefs.get("reminder_hours", 3) or 0)
            except (TypeError, ValueError):
                target = 3
            if target <= 0:       # напоминание включено, но час не задан — не выключаем
                target = 3
        res = await asyncio.to_thread(_yc.set_record_notify_by_sms, record_id, target)
        if res.get("success"):
            if not res.get("noop"):
                logger.info(
                    f"Webhook: notify_by_sms={target} применён к записи {record_id} "
                    f"по настройке клиента"
                )
        else:
            logger.warning(
                f"Webhook: не удалось применить notify_by_sms к {record_id}: "
                f"{res.get('error')}"
            )
    except Exception as e:
        logger.error(f"_apply_client_reminder_pref {record_id}: {e}")


async def enrich_record_with_client(record: dict) -> dict:
    """
    Догружает полный профиль клиента в record.client. Используется и
    webhook'ом, и командой /today.
    """
    client = record.get("client") or {}
    client_id = client.get("id")
    if not client_id:
        return record
    try:
        full_client = await asyncio.to_thread(_yc.get_client, int(client_id))
        if full_client:
            merged = {**full_client, **{k: v for k, v in client.items() if v}}
            record["client"] = merged
    except Exception as e:
        logger.error(f"enrich_record_with_client {client_id}: {e}")
    return record


async def build_record_card(record: dict) -> tuple[str, str | None]:
    """
    Готовит текст уведомления для записи + AI-совет.
    Если AI лёг, советa нет, в тексте просто не будет блока «🤖 Совет».
    Возвращает (text, advice_text_or_None).
    Используется и cmd_today, и webhook'ом.
    """
    await enrich_record_with_client(record)
    advice = None
    client = record.get("client") or {}
    client_id = client.get("id")
    if client_id:
        try:
            history = await _fetch_client_history(int(client_id))
            advice, _ = await masters_ai.generate_upsell_advice(
                history=history, current_record=record
            )
        except Exception as e:
            logger.error(f"build_record_card: AI failed: {e}")
    return _build_notification_text(record, advice=advice), advice


async def _fetch_client_history(client_id: int) -> list[dict]:
    """
    Возвращает историю визитов клиента, используя кеш (24ч).
    Поход в YClients API делается только если кеш пустой/протух.
    """
    cached = database.get_client_history_cached(client_id)
    if cached is not None:
        return memory.normalize_history(cached)
    history = await asyncio.to_thread(_yc.get_client_history, client_id)
    # Сохраняем урезанную версию — только то, что нужно AI, но в одном
    # каноническом формате для всех потребителей.
    minimal = memory.normalize_history(history[:20])
    database.set_client_history_cache(client_id, minimal)
    return minimal


def _is_gift_cert_record(record: dict) -> bool:
    """
    Запись на «продажу сертификата» — пропускаем уведомление.
    YClients иногда регистрирует продажи сертификатов и абонементов как
    записи в журнале, но это НЕ настоящая запись на услугу — мастеру там
    советовать апсейл бессмысленно.
    """
    keywords = ("сертификат", "абонемент", "gift", "cert")
    for s in (record.get("services") or []):
        title = (s.get("title") or "").lower()
        if any(k in title for k in keywords):
            return True
    # Если у записи вообще нет услуг, либо нет staff — тоже скип
    if not record.get("services"):
        return True
    return False


def _services_signature(record: dict) -> str:
    """Стабильная подпись состава услуг — для сравнения «изменился ли заказ»."""
    titles = sorted(
        (s.get("title") or "").strip().lower()
        for s in (record.get("services") or [])
        if isinstance(s, dict) and s.get("title")
    )
    return "|".join(titles)


def _record_datetime(record: dict) -> str:
    """Нормализованная строка времени записи 'YYYY-MM-DD HH:MM' для сравнения."""
    raw = record.get("datetime") or record.get("date") or ""
    # Приводим к виду без секунд и таймзоны
    s = raw.replace("T", " ").split("+")[0].split(".")[0].strip()
    return s[:16]  # 'YYYY-MM-DD HH:MM'


def _record_attendance(record: dict) -> int | None:
    value = record.get("attendance")
    if value is None:
        value = record.get("visit_attendance")
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError, OverflowError):
        return None


def _visit_just_completed(record: dict, old_state: dict) -> bool:
    return _record_attendance(record) == 1 and _record_attendance(old_state) != 1


def _save_record_state(record: dict, record_id: int):
    """Сохраняет снимок состояния записи в БД (staff/время/услуги/attendance)."""
    try:
        staff = record.get("staff") or {}
        staff_id = staff.get("id") or record.get("staff_id")
        attendance = _record_attendance(record)
        database.upsert_record_state(
            record_id=record_id,
            staff_id=int(staff_id) if staff_id else None,
            datetime_str=_record_datetime(record),
            services_sig=_services_signature(record),
            attendance=attendance,
        )
    except Exception as e:
        logger.error(f"_save_record_state({record_id}): {e}")


def _close_local_booking_intent(record: dict, record_id: int):
    """Закрывает зависший диалог, если запись пришла из внешнего YClients/PWA-пути."""
    try:
        client = record.get("client") or {}
        phone = (
            client.get("phone")
            or client.get("phone_number")
            or client.get("normalized_phone")
            or ""
        )
        local_client = database.find_client_by_phone(str(phone)) if phone else None
        if not local_client or not local_client.get("id"):
            return
        lead_alerts.on_booking_confirmed(int(local_client["id"]))
        logger.info(
            f"Webhook: record {record_id} closed local booking intent "
            f"for client_id={local_client['id']}"
        )
    except Exception as e:
        logger.error(f"Webhook: close local booking intent record {record_id}: {e}")


_ACTION_OUTCOME_UNKNOWN_CODES = frozenset({
    "action_in_progress",
    "bridge_outcome_unknown",
    "legacy_appointment_bridge_response_invalid",
    "legacy_appointment_bridge_status_unavailable",
    "legacy_appointment_bridge_transport_error",
    "outcome_unknown",
})


def _action_outcome_unknown(result: dict | None) -> bool:
    value = result or {}
    return value.get("unknown") is True or str(value.get("code") or "") in _ACTION_OUTCOME_UNKNOWN_CODES


def _action_unknown_payload(result: dict | None, message: str) -> dict:
    value = result or {}
    payload = {
        "success": False,
        "ok": False,
        "accepted": value.get("accepted"),
        "unknown": True,
        "retry_allowed": False,
        "error": "outcome_unknown",
        "code": "outcome_unknown",
        "message": message,
    }
    execution_id = str(value.get("execution_id") or "").strip()
    if execution_id:
        payload["execution_id"] = execution_id
    return payload


def _booking_failure_reply(result: dict) -> str:
    """Короткое понятное объяснение клиенту, почему запись не дошла до YClients."""
    code = (result or {}).get("code") or ""
    if _action_outcome_unknown(result):
        return (
            "Результат записи уточняется. Не отправляйте заявку повторно, "
            "чтобы не создать дубль. Проверьте «Мои записи» через минуту."
        )
    if code == "slot_taken":
        return (
            "Это время уже заняли или оно стало недоступно. "
            "Давайте выберем другой ближайший слот."
        )
    if code == "bad_phone":
        return (
            "Не получилось записать из-за номера телефона. "
            "Проверьте номер в профиле или напишите его заново."
        )
    if code == "bad_name":
        return "Не получилось записать из-за имени. Напишите, пожалуйста, как вас записать."
    if code == "bad_service":
        return "Эта услуга сейчас недоступна для онлайн-записи. Давайте выберем услугу заново."
    if code == "bad_staff":
        return "Этот мастер сейчас недоступен для онлайн-записи. Давайте выберем другого мастера или время."
    if code == "yclients_unavailable":
        return (
            "Сервер записи сейчас отвечает нестабильно, поэтому я не буду повторять заявку, "
            "чтобы случайно не создать дубль. Проверьте «Мои записи» через минуту или напишите мне ещё раз."
        )
    return (
        "Не получилось оформить запись автоматически. "
        "Попробуйте выбрать другое время или напишите мне ещё раз."
    )


async def _process_record_create(app: Application, record_id: int) -> dict:
    """
    Главная бизнес-логика обработки события «новая запись».
    Возвращает dict с результатом для логов.
    """
    # 1. Дедупликация — если событие уже обработано, выходим тихо
    if not database.mark_record_processed(record_id, "record.create"):
        return {"status": "duplicate", "record_id": record_id}

    # 2. Получаем детали записи через YClients API
    record = _yc.get_record(record_id)
    if not record:
        logger.error(f"Webhook: запись {record_id} не найдена в YClients")
        return {"status": "record_not_found", "record_id": record_id}

    # 2.1 Пропускаем продажу сертификатов/абонементов
    if _is_gift_cert_record(record):
        logger.info(f"Webhook: запись {record_id} — сертификат/абонемент, пропускаем")
        return {"status": "skipped_gift_cert", "record_id": record_id}

    # 2.2 Сохраняем снимок состояния — нужен для детекции изменений на update,
    # даже если мастер не привязан (запись может позже к нему переехать).
    _save_record_state(record, record_id)

    # 2.3 Уважаем выбор клиента «Напоминание перед визитом» из настроек приложения.
    # ДО проверки мастера — чтобы сработало для ЛЮБОЙ записи (в т.ч. когда мастер
    # не привязан у нас или запись создана админом/виджетом, а не приложением).
    try:
        await _apply_client_reminder_pref(record, record_id)
    except Exception as e:
        logger.error(f"Webhook: notify-pref к записи {record_id}: {e}")

    # 3. Кто мастер?
    staff = record.get("staff") or {}
    staff_id = staff.get("id") or record.get("staff_id")
    if not staff_id:
        logger.error(f"Webhook: у записи {record_id} нет staff_id")
        return {"status": "no_staff", "record_id": record_id}

    master = database.get_master_by_staff_id(int(staff_id))
    if not master:
        logger.info(f"Webhook: мастер {staff_id} не в системе — пропускаем")
        return {"status": "master_not_bound", "staff_id": staff_id}

    # Telegram-канал есть не у всех: мастер может быть зарегистрирован ТОЛЬКО в
    # приложении (web-push), без запуска бота. Тогда Telegram пропускаем, но
    # пуш в приложение всё равно шлём (это и есть «пуши членам команды»).
    has_tg = bool(master.get("telegram_chat_id"))

    # 4. Mute — про Telegram-уведомления. Замьютивший мастер не получит Telegram,
    # но запись в приложении (web-push) всё равно увидит.
    if has_tg and database.is_master_muted(master["telegram_chat_id"]):
        logger.info(f"Webhook: мастер {staff_id} в mute — Telegram пропускаем (web-push идёт)")
        has_tg = False

    # 5. В record.client от webhook'а только id/имя/телефон — без visits/birth_date.
    # Догружаем полный профиль клиента, чтобы корректно показать «N-й визит»
    # и дать AI его историю предпочтений.
    advice, ai_provider = None, "fallback"
    money_full, money_short = "", ""     # денежная мотивация мастеру (цифры)
    client = record.get("client") or {}
    client_id = client.get("id")
    if client_id:
        try:
            full_client = await asyncio.to_thread(_yc.get_client, int(client_id))
            if full_client:
                # Мерджим — приоритет полному профилю, имя/телефон оставляем
                # как пришло в webhook (на случай если только что обновили в YClients)
                merged = {**full_client, **{k: v for k, v in client.items() if v}}
                record["client"] = merged
                client = merged
        except Exception as e:
            logger.error(f"Webhook: не получили full client {client_id}: {e}")

        try:
            history = await _fetch_client_history(int(client_id))
            advice, ai_provider = await masters_ai.generate_upsell_advice(
                history=history, current_record=record
            )
            logger.info(
                f"Webhook: AI ({ai_provider}) сгенерировал совет "
                f"({len(advice) if advice else 0} символов) для записи {record_id}"
            )
            try:
                money_full, money_short = masters_ai.money_pitch(int(staff_id), history, record)
            except Exception as e:
                logger.error(f"Webhook: money_pitch для записи {record_id}: {e}")
        except Exception as e:
            logger.error(f"Webhook: ошибка получения совета AI: {e}")

    _close_local_booking_intent(record, record_id)

    # 6. Лог в БД — будет нужен для статистики «зашёл / не зашёл совет»
    try:
        initial_services = [
            (s.get("title") or "").strip()
            for s in (record.get("services") or [])
            if isinstance(s, dict) and s.get("title")
        ]
        database.log_ai_advice(
            record_id=record_id,
            client_id=int(client_id) if client_id else None,
            staff_id=int(staff_id),
            ai_provider=ai_provider,
            advice_text=advice,
            initial_services=initial_services,
        )
    except Exception as e:
        logger.error(f"Webhook: не записали в ai_advice_log: {e}")

    # 7. Готовим текст уведомления (с советом, если AI вернул что-то)
    text = _build_notification_text(record, advice=advice)
    # Денежная мотивация мастеру: конкретные цифры (обычно/можешь, в мес, в год).
    if money_full:
        text = f"{text}\n\n{money_full}"

    # Inline-кнопки оплаты: 💵 Наличные / 💳 Карта.
    # callback_data: pay_<method>_<record_id> — record_id даёт идемпотентность.
    keyboard = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("💵 Наличные", callback_data=f"pay_cash_{record_id}"),
            InlineKeyboardButton("💳 Карта",    callback_data=f"pay_card_{record_id}"),
        ]
    ])

    # 8. Telegram мастеру (если запустил бота и не в mute) — в своём try.
    tg_sent = False
    if has_tg:
        try:
            await app.bot.send_message(
                chat_id=master["telegram_chat_id"], text=text,
                parse_mode="Markdown", reply_markup=keyboard,
            )
            tg_sent = True
        except Exception as e:
            logger.error(f"Webhook: Telegram мастеру {staff_id} не ушёл: {e}")

    # 9. Web-push мастеру В ПРИЛОЖЕНИЕ — НЕЗАВИСИМО от Telegram (мастер мог не
    #    запускать бота, или Telegram не ушёл). Включает AI-совет по апселлу.
    try:
        _push_body = _record_push_body(record)
        if advice and isinstance(advice, str) and advice.strip():
            _adv = advice.strip()
            if len(_adv) > 220:
                _adv = _adv[:219].rstrip() + "…"
            _push_body = f"{_push_body}\n💡 {_adv}"
        if money_short:                       # короткая денежная строка в пуш
            _push_body = f"{_push_body}\n{money_short}"
        await _send_master_push(
            master, title="Новая запись", body=_push_body,
            url="/app/?panel=schedule", tag=f"record-create-{record_id}",
            data={"record_id": record_id, "event": "record.create", "advice": (advice or "")},
        )
    except Exception as e:
        logger.error(f"Webhook: web-push мастеру {staff_id} не ушёл: {e}")

    try:
        import maya_inbox_bridge
        tg_ids = []
        if master.get("telegram_chat_id"):
            tg_ids.append(int(master["telegram_chat_id"]))
        await maya_inbox_bridge.publish_inbox_item(
            type="new_appointment",
            title="Новая запись",
            body_text=text.replace("*", ""),
            source_seed=f"record.create|{record_id}",
            telegram_chat_ids=tg_ids or None,
            deep_link="/app/?panel=schedule",
            payload={"record_id": record_id, "staff_id": int(staff_id)},
            # Owners must see this in Maya OS chat even if master's TG
            # is not linked as Nest AuthIdentity.
            fanout_owners=True,
        )
    except Exception as inbox_exc:
        logger.warning(f"Webhook: nest inbox new appointment: {inbox_exc}")

    # 10. Пуш клиенту «вы записаны» — тоже независимо.
    try:
        await _notify_client_record(record, record_id, "create")
    except Exception as e:
        logger.error(f"Webhook: пуш клиенту записи {record_id} не ушёл: {e}")

    logger.info(f"Webhook: запись {record_id} → мастер {master.get('full_name')} "
                f"(telegram={tg_sent}, web-push отправлен)")
    return {
        "status": "sent" if tg_sent else "push_only",
        "record_id": record_id, "staff_id": staff_id, "ai_provider": ai_provider,
    }


async def _process_record_update(app: Application, record_id: int) -> dict:
    """
    Обработка webhook'а record.update.

    YClients шлёт update на ЛЮБОЕ касание записи: перенос времени, смену
    мастера, изменение услуг, а ТАКЖЕ на закрытие оплаты (attendance=1) и
    финансовые операции. Чтобы не спамить мастера, сравниваем свежее
    состояние со снимком в record_state и уведомляем ТОЛЬКО при значимом
    изменении:
      • сменился мастер  → старому «запись ушла», новому «вам передали»
      • сменилось время  → текущему мастеру «запись перенесена»
      • сменились услуги → текущему мастеру «состав услуг изменён»
      • только attendance/финансы → молча обновляем снимок, не шлём
    """
    record = _yc.get_record(record_id)
    if not record:
        logger.info(
            f"Webhook update: запись {record_id} не найдена — "
            f"возможно удалена сразу после изменения"
        )
        return {"status": "record_not_found", "record_id": record_id}

    if _is_gift_cert_record(record):
        return {"status": "skipped_gift_cert", "record_id": record_id}

    # Новое состояние
    staff = record.get("staff") or {}
    new_staff_id_raw = staff.get("id") or record.get("staff_id")
    if not new_staff_id_raw:
        logger.error(f"Webhook update: у записи {record_id} нет staff_id")
        return {"status": "no_staff", "record_id": record_id}
    new_staff_id = int(new_staff_id_raw)
    new_dt = _record_datetime(record)
    new_sig = _services_signature(record)

    # Старое состояние из снимка
    old_state = database.get_record_state(record_id)

    # Всегда обновляем снимок в конце — делаем это через try/finally-стиль:
    # сохраним прямо сейчас новое состояние, чтобы повторные дубль-вебхуки
    # уже видели «ничего не изменилось».
    def _persist():
        _save_record_state(record, record_id)

    # Нет снимка (запись создана до фичи или мимо нас) — не можем понять, что
    # изменилось. Молча фиксируем снимок и выходим, чтобы не слать ложное.
    if not old_state:
        _persist()
        logger.info(
            f"Webhook update: запись {record_id} без снимка — "
            f"зафиксировал состояние, уведомление не шлём"
        )
        return {"status": "snapshot_initialized", "record_id": record_id}

    old_staff_id = old_state.get("staff_id")
    old_dt = old_state.get("datetime")
    old_sig = old_state.get("services_sig")

    transferred = bool(old_staff_id and old_staff_id != new_staff_id)
    time_changed = bool(old_dt and new_dt and old_dt != new_dt)
    services_changed = (old_sig or "") != (new_sig or "")

    if _visit_just_completed(record, old_state):
        try:
            await _offer_tip_to_client(record, record_id)
        except Exception as e:
            logger.error(f"tip-offer trigger {record_id}: {e}")

    # Если значимых изменений нет (только attendance/финансы) — тихо обновляем.
    if not (transferred or time_changed or services_changed):
        _persist()
        return {"status": "no_meaningful_change", "record_id": record_id}

    # Обогащаем клиента для карточки
    client = record.get("client") or {}
    client_id = client.get("id")
    if client_id:
        try:
            full_client = await asyncio.to_thread(_yc.get_client, int(client_id))
            if full_client:
                merged = {**full_client, **{k: v for k, v in client.items() if v}}
                record["client"] = merged
                client = merged
        except Exception as e:
            logger.error(f"Webhook update: full client {client_id}: {e}")

    # AI-совет из кэша (не перегенерируем — экономия)
    prev_advice = database.get_ai_advice_for_record(record_id) or {}
    advice_to_show = prev_advice.get("advice_text")

    new_master = database.get_master_by_staff_id(new_staff_id)
    old_master = (
        database.get_master_by_staff_id(int(old_staff_id))
        if transferred and old_staff_id else None
    )

    results = {
        "status": "updated", "record_id": record_id,
        "transferred": transferred, "time_changed": time_changed,
        "services_changed": services_changed,
        "sent_to_new": False, "sent_to_old": False,
    }

    # Заголовок (Telegram) + заголовок web-push для текущего/нового мастера.
    if transferred:
        header = "📨 *Тебе передали запись от другого мастера*"
        push_title = "Запись передана"
    elif time_changed:
        # Кто перенёс: метку ставит НАШ код. Клиент через бота MAYA → 'client';
        # владелец/мастер (бот-админ или панель) либо правка прямо в YClients →
        # 'staff'/нет метки → «администратором».
        if database.pop_recent_reschedule_actor(record_id) == "client":
            header = "🔁 *Клиент перенёс свою запись сам*"
            push_title = "Клиент перенёс запись"
        else:
            header = "🔁 *Запись перенесена администратором*"
            push_title = "Запись перенесена"
    else:
        header = "✏️ *Изменён состав услуг записи*"
        push_title = "Изменены услуги"

    # ── Уведомление новому/текущему мастеру ────────────────────────────
    if new_master:
        _new_tg = bool(new_master.get("telegram_chat_id"))
        _new_muted = _new_tg and database.is_master_muted(new_master["telegram_chat_id"])
        # Telegram новому мастеру (если есть канал и не в mute) — в своём try
        if _new_tg and not _new_muted:
            try:
                body = _build_notification_text(record, advice=advice_to_show)
                text = f"{header}\n\n{body}"
                # Закрыта по оплате — без кнопок
                if prev_advice.get("button_pressed"):
                    method = prev_advice.get("payment_method") or prev_advice.get("button_pressed")
                    emoji = "💵" if method == "cash" else "💳"
                    label = "наличными" if method == "cash" else "картой"
                    text += f"\n\n✅ {emoji} Закрыто {label}"
                    reply_markup = None
                else:
                    reply_markup = InlineKeyboardMarkup([[
                        InlineKeyboardButton("💵 Наличные", callback_data=f"pay_cash_{record_id}"),
                        InlineKeyboardButton("💳 Карта",    callback_data=f"pay_card_{record_id}"),
                    ]])
                await app.bot.send_message(
                    chat_id=new_master["telegram_chat_id"],
                    text=text, parse_mode="Markdown", reply_markup=reply_markup,
                )
                results["sent_to_new"] = True
            except Exception as e:
                logger.error(f"Webhook update: Telegram мастеру {new_staff_id} не ушёл: {e}")
        elif _new_muted:
            logger.info(f"Webhook update: мастер {new_staff_id} в mute — Telegram пропускаем (web-push идёт)")
        # Web-push новому мастеру В ПРИЛОЖЕНИЕ — независимо от Telegram
        try:
            await _send_master_push(
                new_master,
                title=push_title,
                body=_record_push_body(record),
                url="/app/?panel=schedule",
                tag=f"record-update-{record_id}",
                data={"record_id": record_id, "event": "record.update"},
            )
        except Exception as e:
            logger.error(f"Webhook update: web-push мастеру {new_staff_id} не ушёл: {e}")
        logger.info(f"Webhook update: запись {record_id} → {new_master.get('full_name')} "
                    f"(transfer={transferred}, time={time_changed}, svc={services_changed})")
    else:
        logger.info(f"Webhook update: мастер {new_staff_id} не в системе — пропускаем")

    # ── Nest inbox (Maya OS): перенос / передача / услуги → владельцу + мастерам ──
    # Раньше в inbox уходил только «у старого мастера забрали», и то без fanout
    # владельцу. Отмена — отдельно в delete. Перенос времени вообще не писался.
    try:
        import maya_inbox_bridge
        client_name = _truncate_name((record.get("client") or {}).get("name"))
        when = _format_datetime(record.get("date") or record.get("datetime"))
        tg_ids = []
        if new_master and new_master.get("telegram_chat_id"):
            tg_ids.append(int(new_master["telegram_chat_id"]))
        if transferred and old_master and old_master.get("telegram_chat_id"):
            tg_ids.append(int(old_master["telegram_chat_id"]))
        if transferred:
            inbox_type = "appointment_reassigned"
            inbox_title = "Запись передана другому мастеру"
            old_name = (old_master or {}).get("full_name") or "другому мастеру"
            new_name = (new_master or {}).get("full_name") or "новому мастеру"
            inbox_body = (
                f"{inbox_title}\n\n"
                f"Клиент: {client_name}\n"
                f"Время: {when}\n"
                f"Было: {old_name}\n"
                f"Стало: {new_name}"
            )
            seed = f"record.transfer|{record_id}|{old_staff_id}->{new_staff_id}"
        elif time_changed:
            inbox_type = "appointment_rescheduled"
            inbox_title = push_title
            old_when = _format_datetime(old_dt) if old_dt else "—"
            inbox_body = (
                f"{inbox_title}\n\n"
                f"Клиент: {client_name}\n"
                f"Было: {old_when}\n"
                f"Стало: {when}"
            )
            seed = f"record.reschedule|{record_id}|{old_dt}->{new_dt}"
        else:
            inbox_type = "owner_alert"
            inbox_title = push_title
            inbox_body = (
                f"{inbox_title}\n\n"
                f"Клиент: {client_name}\n"
                f"Время: {when}"
            )
            seed = f"record.services|{record_id}|{new_sig}"
        await maya_inbox_bridge.publish_inbox_item(
            type=inbox_type,
            title=inbox_title,
            body_text=inbox_body,
            source_seed=seed,
            telegram_chat_ids=tg_ids or None,
            deep_link="/app/?panel=schedule",
            payload={
                "record_id": record_id,
                "event": (
                    "record.transfer"
                    if transferred
                    else ("record.reschedule" if time_changed else "record.services")
                ),
                "staff_id": int(new_staff_id) if new_staff_id else None,
                "new_staff_id": int(new_staff_id) if new_staff_id else None,
                "old_staff_id": int(old_staff_id) if (transferred and old_staff_id) else None,
            },
            fanout_owners=True,
        )
    except Exception as inbox_exc:
        logger.warning(f"Webhook: nest inbox record.update: {inbox_exc}")

    # ── Уведомление старому мастеру (только при передаче) ──────────────
    if transferred and old_master:
        client_name = _truncate_name(client.get("name"))
        when = _format_datetime(record.get("date") or record.get("datetime"))
        _old_tg = bool(old_master.get("telegram_chat_id"))
        _old_muted = _old_tg and database.is_master_muted(old_master["telegram_chat_id"])
        # Telegram старому мастеру — best-effort, в своём try
        if _old_tg and not _old_muted:
            try:
                await app.bot.send_message(
                    chat_id=old_master["telegram_chat_id"],
                    text=(
                        f"❌ *Запись передана другому мастеру*\n\n"
                        f"Клиент: {client_name}\n"
                        f"Было время: {when}\n\n"
                        f"_Администратор переназначил эту запись._"
                    ),
                    parse_mode="Markdown",
                )
                results["sent_to_old"] = True
            except Exception as e:
                logger.error(f"Webhook update: Telegram старому мастеру {old_staff_id} не ушёл: {e}")
        elif _old_muted:
            logger.info(f"Webhook update: старый мастер {old_staff_id} в mute — Telegram пропускаем (web-push идёт)")
        # Web-push старому мастеру В ПРИЛОЖЕНИЕ — независимо от Telegram
        try:
            await _send_master_push(
                old_master,
                title="Запись передана другому мастеру",
                body=f"{when} · {client_name}",
                url="/app/?panel=schedule",
                tag=f"record-transfer-old-{record_id}",
                data={"record_id": record_id, "event": "record.transfer"},
            )
        except Exception as e:
            logger.error(f"Webhook update: web-push старому мастеру {old_staff_id} не ушёл: {e}")

    # Пуш клиенту о переносе времени его записи (если зарегистрирован + подписан)
    if time_changed:
        await _notify_client_record(record, record_id, "reschedule")

    # Фиксируем новое состояние (после уведомлений)
    _persist()
    return results


async def _process_record_delete(app: Application, record_id: int, payload: dict) -> dict:
    """
    Обработка отмены записи. Пытаемся вытащить из payload (или из YClients)
    мастера и время освободившегося слота, и предлагаем его кандидатам.
    """
    import freed_slot

    # YClients в webhook delete обычно кладёт снимок удалённой записи в data.
    # Если не нашли — пробуем дёрнуть API (может ещё отдаст), потом сдаёмся.
    data = payload.get("data") or {}
    if not data and "resource_id" in payload:
        # Variant 1: пытаемся получить из API
        try:
            data = _yc.get_record(record_id) or {}
        except Exception as e:
            logger.warning(f"freed_slot: не дотянули запись {record_id}: {e}")
            data = {}

    # staff_id: либо в data.staff.id, либо в data.staff_id
    staff = data.get("staff") or {}
    staff_id = staff.get("id") or data.get("staff_id")
    dt_str = data.get("date") or data.get("datetime")

    if not staff_id or not dt_str:
        logger.info(
            f"freed_slot: для отменённой записи {record_id} нет staff/date "
            f"(staff_id={staff_id}, dt={dt_str}) — пропускаем"
        )
        return {"status": "no_slot_data", "record_id": record_id}

    try:
        # YClients шлёт время с таймзоной типа '+03:00' или 'Z', и иногда с пробелом
        # вместо 'T' ('2026-05-31 15:00:00'). Нормализуем устойчиво.
        clean = dt_str.replace("Z", "+00:00").split("+")[0].split(".")[0].strip()
        clean = clean.replace(" ", "T")
        slot_dt = datetime.strptime(clean[:19], "%Y-%m-%dT%H:%M:%S")
    except Exception as e:
        logger.error(f"freed_slot: не распарсили дату '{dt_str}': {e}")
        slot_dt = None

    # ── Уведомляем мастера, чью запись отменили ────────────────────────
    # Только если запись была В БУДУЩЕМ (отмена прошедшего визита мастеру
    # не интересна) и мастер привязан + не в mute.
    master_notified = False
    try:
        notify = slot_dt is None or slot_dt > datetime.now()
        master = database.get_master_by_staff_id(int(staff_id))
        if notify and master:
            client = data.get("client") or {}
            client_name = _truncate_name(client.get("name")) if client else "клиент"
            when = _format_datetime(dt_str)
            # Кто отменил: метку ставит наш код при КЛИЕНТСКОЙ отмене (бот/MAYA);
            # нет метки (отмена админом/в YClients) → обезличенное «Запись отменена».
            _cancel_by_client = False
            try:
                _cancel_by_client = database.pop_recent_cancel_actor(record_id) == "client"
            except Exception:
                pass
            # «Отменена» — только если отменил клиент. Удаление админом/в YClients —
            # это «Запись удалена» (как в операционке салона).
            _cancel_word = (
                "Запись отменена клиентом"
                if _cancel_by_client
                else "Запись удалена"
            )
            _inbox_type = (
                "appointment_cancelled"
                if _cancel_by_client
                else "appointment_deleted"
            )
            _del_tg = bool(master.get("telegram_chat_id"))
            _del_muted = _del_tg and database.is_master_muted(master["telegram_chat_id"])
            # Telegram (если есть канал и не в mute) — в своём try
            if _del_tg and not _del_muted:
                try:
                    await app.bot.send_message(
                        chat_id=master["telegram_chat_id"],
                        text=(
                            f"❌ *{_cancel_word}*\n\n"
                            f"Клиент: {client_name}\n"
                            f"Было время: {when}\n\n"
                            f"_Слот освободился. Если кто-то ждал — самое время "
                            f"предложить._"
                        ),
                        parse_mode="Markdown",
                    )
                    master_notified = True
                except Exception as e:
                    logger.error(f"Webhook delete: Telegram мастеру {staff_id} не ушёл: {e}")
            elif _del_muted:
                logger.info(f"Webhook delete: мастер {staff_id} в mute — Telegram пропускаем (web-push идёт)")
            # Web-push мастеру В ПРИЛОЖЕНИЕ — независимо от Telegram
            try:
                await _send_master_push(
                    master,
                    title=_cancel_word,
                    body=f"{when} · {client_name}",
                    url="/app/?panel=schedule",
                    tag=f"record-delete-{record_id}",
                    data={"record_id": record_id, "event": "record.delete"},
                )
            except Exception as e:
                logger.error(f"Webhook delete: web-push мастеру {staff_id} не ушёл: {e}")
            try:
                import maya_inbox_bridge
                tg = master.get("telegram_chat_id")
                cancel_body = (
                    f"{_cancel_word}\n\n"
                    f"Клиент: {client_name}\n"
                    f"Было время: {when}\n\n"
                    f"Слот освободился."
                )
                await maya_inbox_bridge.publish_inbox_item(
                    type=_inbox_type,
                    title=_cancel_word,
                    body_text=cancel_body,
                    source_seed=f"record.delete|{record_id}",
                    telegram_chat_ids=[int(tg)] if tg else None,
                    deep_link="/app/?panel=schedule",
                    payload={
                        "record_id": record_id,
                        "event": "record.delete",
                        "staff_id": int(staff_id),
                        "by_client": bool(_cancel_by_client),
                    },
                    fanout_owners=True,
                )
            except Exception as inbox_exc:
                logger.warning(f"Webhook: nest inbox cancel: {inbox_exc}")
            logger.info(f"Webhook delete: отмена записи {record_id} → мастер {master.get('full_name')}")
    except Exception as e:
        logger.error(f"Webhook delete: уведомление мастеру по {record_id}: {e}")

    # Пуш клиенту об отмене его записи (если зарегистрирован + подписан)
    try:
        if isinstance(data, dict) and data.get("client"):
            await _notify_client_record(data, record_id, "cancel")
    except Exception as e:
        logger.error(f"Webhook delete: пуш клиенту по {record_id}: {e}")

    # Чистим снимок состояния — записи больше нет
    try:
        database.delete_record_state(record_id)
    except Exception:
        pass

    # Возврат баллов, если за эту запись списывали баллы лояльности
    try:
        import loyalty
        refund = loyalty.refund_for_cancelled_record(record_id)
        if refund.get("refunded"):
            logger.info(
                f"🪙 loyalty refund по отменённой записи {record_id}: "
                f"+{refund['refunded']} баллов"
            )
    except Exception as e:
        logger.error(f"loyalty refund на отмене записи {record_id}: {e}")

    # Если дату не распарсили — оффер слота другим невозможен, но мастера
    # мы уже уведомили; выходим.
    if slot_dt is None:
        return {
            "status": "master_notified_no_slot",
            "record_id": record_id,
            "master_notified": master_notified,
        }

    freed_result = await freed_slot.offer_freed_slot(app, int(staff_id), slot_dt)
    if isinstance(freed_result, dict):
        freed_result["master_notified"] = master_notified
    return freed_result


def _webhook_secret_ok(request: web.Request) -> bool:
    provided = (
        request.headers.get("X-Webhook-Secret")
        or request.query.get("secret")
        or ""
    )
    return hmac.compare_digest(str(provided), str(WEBHOOK_SECRET))


async def handle_yclients_webhook(request: web.Request) -> web.Response:
    """HTTP-обработчик /yclients-webhook"""
    # Проверка секрета. Header используется внутренним PHP-прокси, чтобы секрет
    # не попадал в access-log как query string; query оставлен для совместимости.
    if not _webhook_secret_ok(request):
        logger.warning(f"Webhook: чужой запрос с {request.remote}")
        return web.json_response({"error": "forbidden"}, status=403)

    # Парсим тело
    try:
        payload = await request.json()
    except Exception as e:
        logger.error(f"Webhook: невалидный JSON: {e}")
        return web.json_response({"error": "bad_json"}, status=400)

    # Извлекаем record_id и тип события
    record_id, event_type = _extract_record_event(payload)
    logger.info("Webhook: event=%s record_id=%s", event_type, record_id)  # без ПД: имя/телефон клиента не логируем

    # 🔴 Теневая копия конверта в Maya OS — ДО любых ранних выходов, потому что
    # именно нераспознанные доставки (треть потока) и надо наконец увидеть.
    # Пересылка ничего не решает и ничего не делает: отказ теневого пути не
    # влияет на боевую обработку ниже.
    try:
        import maya_shadow_bridge

        await maya_shadow_bridge.forward_delivery(
            payload, event_type=event_type, record_id=record_id
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("shadow bridge unavailable: %s", exc)

    if not record_id:
        return web.json_response({"status": "ignored", "reason": "no_record_id"})

    app: Application = request.app["bot_app"]

    # Создание записи — уведомление мастеру
    if event_type in ("record.create", "record_created", "record.created"):
        result = await _process_record_create(app, record_id)
        return web.json_response(result)

    # Изменение записи — мастер должен видеть моментально
    # (перенос времени, смена услуг, передача другому мастеру)
    if event_type in ("record.update", "record.updated", "record_updated"):
        result = await _process_record_update(app, record_id)
        return web.json_response(result)

    # Удаление записи — предложение освободившегося слота другим клиентам
    if event_type in ("record.delete", "record.deleted", "record_deleted"):
        result = await _process_record_delete(app, record_id, payload)
        return web.json_response(result)

    return web.json_response({"status": "ignored", "event_type": event_type})


# ─── Mini App: личный кабинет ─────────────────────────────────────────────
#
# Эндпоинт /api/cabinet/me — отдаёт данные клиента для PWA, открытой как
# Telegram Mini App. Аутентификация — через initData, подписанный токеном
# бота (стандартный механизм Telegram WebApp).

def _verify_telegram_init_data(init_data: str, bot_token: str) -> dict | None:
    """
    Проверяет подпись initData от Telegram WebApp. Возвращает dict с user'ом
    либо None если подпись невалидна. Алгоритм: HMAC-SHA256 от data_check_string
    с ключом = HMAC(b"WebAppData", bot_token).
    """
    if not init_data:
        return None
    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    except Exception:
        return None
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        return None
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(parsed.items())
    )
    secret_key = hmac.new(
        b"WebAppData", bot_token.encode(), hashlib.sha256
    ).digest()
    computed = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(computed, received_hash):
        return None
    # auth_date — защита от replay (24 часа max)
    try:
        auth_date = int(parsed.get("auth_date", "0"))
        if datetime.now().timestamp() - auth_date > 86400:
            return None
    except ValueError:
        return None
    # Парсим user
    user_raw = parsed.get("user")
    if not user_raw:
        return None
    try:
        return _json.loads(user_raw)
    except Exception:
        return None


def _cabinet_response(data: dict, status: int = 200) -> web.Response:
    """JSON-ответ с CORS-заголовками для PWA на malesthetic.pro."""
    resp = web.json_response(data, status=status)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Telegram-InitData, X-Session-Token"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


async def cabinet_options_handler(request: web.Request) -> web.Response:
    """CORS preflight."""
    return _cabinet_response({"ok": True})


def _norm_id(x) -> int | None:
    """Нормализуем id мастера к int (YClients иногда отдаёт строку, иногда число).
    Без этого один и тот же мастер мог считаться двумя разными в _usual_master."""
    if x in (None, ""):
        return None
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def _usual_master(history: list) -> dict | None:
    """«Мне как обычно» — мастер из самого недавнего посещённого визита.

    history отсортирована от новых визитов к старым. Уволившихся
    мастеров пропускаем и берём следующего активного. Это буквальное
    значение клиентского сценария «как в прошлый раз».
    """
    if not history:
        return None
    try:
        from config import ACTIVE_MASTER_IDS
        active = {int(x) for x in ACTIVE_MASTER_IDS}
    except Exception:
        active = None   # если список недоступен — не фильтруем (старое поведение)
    for h in history:
        if not isinstance(h, dict):
            continue
        mid = _norm_id(h.get("master_id"))
        if not mid:
            continue
        if active is not None and mid not in active:
            continue  # мастер уже не работает — пропускаем
        return {"id": mid, "name": h.get("master") or ""}
    return None


def _client_card_name(card: dict | None) -> str:
    """Полное имя клиента из карточки YClients."""
    data = card if isinstance(card, dict) else {}
    full = " ".join(
        str(data.get(key) or "").strip()
        for key in ("name", "surname", "patronymic")
        if str(data.get(key) or "").strip()
    ).strip()
    return full or str(data.get("display_name") or "").strip()


def _client_card_view(card: dict | None, fallback_visits: int) -> dict | None:
    """Сжатый безопасный вид карточки клиента для кабинета."""
    data = card if isinstance(card, dict) else {}
    if not data:
        return None
    return {
        "id": data.get("id"),
        "name": _client_card_name(data),
        "comment": str(data.get("comment") or "").strip(),
        "visits": data.get("visits") if data.get("visits") is not None else fallback_visits,
        "spent": data.get("spent") if data.get("spent") is not None else data.get("paid"),
        "balance": data.get("balance"),
        "discount": data.get("discount"),
        "categories": data.get("categories") or [],
    }


def _load_cabinet_yclients(phone: str) -> dict:
    """Тянет карточку клиента и его записи из YClients синхронно (для to_thread)."""
    phone_digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(phone_digits) < 10:
        return {
            "yc_client_id": None,
            "client_card": None,
            "loyalty_card": None,
            "bookings": [],
        }

    yc_client_id = None
    try:
        for row in _yc.search_clients(phone, limit=8) or []:
            row_digits = "".join(ch for ch in (row.get("phone") or "") if ch.isdigit())
            if row_digits and row_digits[-10:] == phone_digits[-10:]:
                yc_client_id = row.get("id")
                break
    except Exception as e:
        logger.error(f"cabinet yclients search {phone_digits[-4:]}: {e}")
        return {
            "yc_client_id": None,
            "client_card": None,
            "loyalty_card": None,
            "bookings": [],
        }

    if not yc_client_id:
        return {
            "yc_client_id": None,
            "client_card": None,
            "loyalty_card": None,
            "bookings": [],
        }

    client_card = None
    loyalty_card = None
    bookings = []
    try:
        client_card = _yc.get_client(int(yc_client_id)) or None
    except Exception as e:
        logger.error(f"cabinet yclients client {yc_client_id}: {e}")

    try:
        import loyalty as _loy
        loyalty_card = _loy.select_yclients_cashback_card(
            _yc.get_client_loyalty_cards(int(yc_client_id))
        )
    except Exception as e:
        logger.error(f"cabinet yclients loyalty {yc_client_id}: {e}")

    try:
        params = {
            "client_id": int(yc_client_id),
            "count": 200,
            "start_date": (datetime.now() - timedelta(days=1825)).strftime("%Y-%m-%d"),
            "end_date": (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d"),
        }
        data = _yc._get(f"records/{_yc.company_id}", params)
        for row in (data.get("data") or []):
            if isinstance(row, dict):
                bookings.append(row)
    except Exception as e:
        logger.error(f"cabinet yclients records {yc_client_id}: {e}")
        bookings = []

    return {
        "yc_client_id": int(yc_client_id),
        "client_card": client_card,
        "loyalty_card": loyalty_card,
        "bookings": bookings,
    }


async def cabinet_me_handler(request: web.Request) -> web.Response:
    """
    GET /api/cabinet/me
    Заголовок: X-Telegram-InitData: <строка от Telegram WebApp>
    Возвращает данные клиента: имя, баллы, визиты, записи, абонемент, рефералка.
    """
    init_data = request.headers.get("X-Telegram-InitData", "")
    tg_user = _verify_telegram_init_data(init_data, TELEGRAM_TOKEN)
    if not tg_user:
        return _cabinet_response(
            {"error": "invalid_init_data",
             "message": "Подпись Telegram WebApp невалидна или устарела."},
            status=401,
        )
    chat_id = tg_user.get("id")
    if not chat_id:
        return _cabinet_response({"error": "no_user_id"}, status=400)
    return await _build_full_cabinet(int(chat_id), tg_user)


async def internal_loyalty_snapshot_handler(request: web.Request) -> web.Response:
    """Read-only bridge from MAYA OS to the existing loyalty ledger.

    The route deliberately returns no profile or contact data. It is protected
    by a server-only token because the public reverse proxy can also reach this
    aiohttp application.
    """
    supplied_token = request.headers.get("X-Maya-Legacy-Bridge", "").strip()
    if (
        not _MAYA_LEGACY_BRIDGE_TOKEN
        or not supplied_token
        or not hmac.compare_digest(supplied_token, _MAYA_LEGACY_BRIDGE_TOKEN)
    ):
        raise web.HTTPNotFound()

    try:
        body = await request.json()
        telegram_user_id = int(body.get("telegram_user_id", 0))
    except (AttributeError, TypeError, ValueError, _json.JSONDecodeError):
        return web.json_response({"error": "invalid_request"}, status=400)

    if telegram_user_id <= 0:
        return web.json_response({"error": "invalid_request"}, status=400)

    client = database.get_client(telegram_user_id)
    if not client:
        return web.json_response({"found": False})

    return web.json_response({
        "found": True,
        "balance": max(0, int(database.loyalty_balance(int(client["id"])) or 0)),
        "source": "maya_ledger",
    })


async def internal_privacy_telegram_handler(request: web.Request) -> web.Response:
    """Execute the fixed /privacy Telegram response for Action Engine only."""
    supplied_token = request.headers.get("X-Maya-Inbox-Bridge", "").strip()
    if (
        not _MAYA_INBOX_BRIDGE_TOKEN
        or not supplied_token
        or not hmac.compare_digest(supplied_token, _MAYA_INBOX_BRIDGE_TOKEN)
    ):
        raise web.HTTPNotFound()

    try:
        body = await request.json()
        telegram_chat_id = int(body.get("telegram_chat_id", 0))
        source_event_id = str(body.get("source_event_id", "")).strip()
    except (AttributeError, TypeError, ValueError, _json.JSONDecodeError):
        return web.json_response({"error": "invalid_request"}, status=400)

    if telegram_chat_id <= 0 or not source_event_id or len(source_event_id) > 160:
        return web.json_response({"error": "invalid_request"}, status=400)

    bot_app = request.app.get("bot_app")
    bot = getattr(bot_app, "bot", None)
    original = getattr(
        getattr(bot, "__class__", object),
        "_maya_original_send_message_for_chat_mirror",
        None,
    )
    if bot is None or not callable(original):
        return web.json_response({"error": "executor_unavailable"}, status=503)

    sent_message = await original(
        bot,
        chat_id=telegram_chat_id,
        text=PRIVACY_TEXT,
        parse_mode="Markdown",
    )
    message_id = getattr(sent_message, "message_id", None)
    if message_id is None:
        return web.json_response({"error": "provider_reference_missing"}, status=502)
    return web.json_response({"message_id": str(message_id)})


_PACKAGE2_TELEGRAM_MESSAGE_TYPES = frozenset({
    "appointment_reminder",
    "shift_reminder",
    "daily_report",
    "morning_brief",
    "growth_plan",
    "hanging_lead",
    "owner_alert",
    "birthday_alert",
    "review_alert",
})
_PACKAGE2_TELEGRAM_PARSE_MODES = frozenset({"Markdown", "MarkdownV2", "HTML"})


async def internal_package2_telegram_handler(request: web.Request) -> web.Response:
    """Execute one Package 2 Telegram delivery owned by Action Engine."""
    supplied_token = request.headers.get("X-Maya-Inbox-Bridge", "").strip()
    if (
        not _MAYA_INBOX_BRIDGE_TOKEN
        or not supplied_token
        or not hmac.compare_digest(supplied_token, _MAYA_INBOX_BRIDGE_TOKEN)
    ):
        raise web.HTTPNotFound()

    try:
        body = await request.json()
        telegram_chat_id = int(body.get("telegram_chat_id", 0))
        message_type = str(body.get("message_type", "")).strip()
        source_event_id = str(body.get("source_event_id", "")).strip()
        title = str(body.get("title", "")).strip()
        body_text = str(body.get("body_text", "")).strip()
        parse_mode = body.get("parse_mode")
        raw_buttons = body.get("buttons", [])
    except (AttributeError, TypeError, ValueError, _json.JSONDecodeError):
        return web.json_response({"error": "invalid_request"}, status=400)

    if (
        telegram_chat_id <= 0
        or message_type not in _PACKAGE2_TELEGRAM_MESSAGE_TYPES
        or not source_event_id
        or len(source_event_id) > 160
        or not title
        or len(title) > 160
        or not body_text
        or len(body_text) > 4096
    ):
        return web.json_response({"error": "invalid_request"}, status=400)
    if parse_mode is not None and parse_mode not in _PACKAGE2_TELEGRAM_PARSE_MODES:
        return web.json_response({"error": "invalid_parse_mode"}, status=400)
    if not isinstance(raw_buttons, list) or len(raw_buttons) > 4:
        return web.json_response({"error": "invalid_buttons"}, status=400)

    buttons = []
    for raw_button in raw_buttons:
        if not isinstance(raw_button, dict):
            return web.json_response({"error": "invalid_buttons"}, status=400)
        text = str(raw_button.get("text", "")).strip()
        callback_data = str(raw_button.get("callback_data", "")).strip()
        url = str(raw_button.get("url", "")).strip()
        if (
            not text
            or len(text) > 64
            or bool(callback_data) == bool(url)
            or len(callback_data) > 64
            or (url and not re.match(r"^https?://", url, flags=re.IGNORECASE))
        ):
            return web.json_response({"error": "invalid_buttons"}, status=400)
        buttons.append(
            InlineKeyboardButton(
                text,
                callback_data=callback_data or None,
                url=url or None,
            )
        )

    bot_app = request.app.get("bot_app")
    bot = getattr(bot_app, "bot", None)
    original = getattr(
        getattr(bot, "__class__", object),
        "_maya_original_send_message_for_chat_mirror",
        None,
    )
    if bot is None or not callable(original):
        return web.json_response({"error": "executor_unavailable"}, status=503)

    sent_message = await original(
        bot,
        chat_id=telegram_chat_id,
        text=body_text,
        parse_mode=parse_mode,
        reply_markup=InlineKeyboardMarkup([[button] for button in buttons]) if buttons else None,
    )
    message_id = getattr(sent_message, "message_id", None)
    if message_id is None:
        return web.json_response({"error": "provider_reference_missing"}, status=502)
    return web.json_response({"message_id": str(message_id)})


# ════════════════════════════════════════════════════════════════════════════
# Telegram Login Widget (для PWA в браузере, не Mini App)
# Подпись формируется иначе чем у InitData:
#   secret_key = SHA256(bot_token)    (не HMAC как у InitData)
#   data_check_string = sorted "k=v" joined by "\n"
# Документация: https://core.telegram.org/widgets/login#checking-authorization
# ════════════════════════════════════════════════════════════════════════════

def _verify_telegram_login_widget(auth_data: dict, bot_token: str,
                                    max_age: int = 30 * 24 * 3600) -> dict | None:
    """Проверка подписи Login Widget. Возвращает данные юзера если ок."""
    import time as _time

    if not isinstance(auth_data, dict):
        return None
    if not auth_data.get("hash") or not auth_data.get("auth_date"):
        return None

    received_hash = auth_data["hash"]
    try:
        auth_date = int(auth_data["auth_date"])
    except (TypeError, ValueError):
        return None

    if auth_date <= 0 or (_time.time() - auth_date) > max_age:
        return None

    check = {k: v for k, v in auth_data.items() if k != "hash"}
    lines = []
    for k in sorted(check.keys()):
        v = check[k]
        if isinstance(v, bool):
            v = "true" if v else "false"
        lines.append(f"{k}={v}")
    data_check_string = "\n".join(lines)

    secret_key = hashlib.sha256(bot_token.encode()).digest()
    computed = hmac.new(secret_key, data_check_string.encode(),
                        hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed, received_hash):
        return None

    return {
        "id": int(auth_data.get("id", 0)),
        "first_name": auth_data.get("first_name", ""),
        "last_name": auth_data.get("last_name", ""),
        "username": auth_data.get("username", ""),
        "photo_url": auth_data.get("photo_url", ""),
    }


async def cabinet_me_via_login_handler(request: web.Request) -> web.Response:
    """
    POST /api/cabinet/me-via-login
    Body: { "auth_data": { id, first_name, ..., hash, auth_date } }

    Авторизация через Telegram Login Widget (для PWA в браузере, не Mini App).
    Логика fetch'а данных ЛК — копия cabinet_me_handler с подменой источника auth.
    """
    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)

    auth_data = body.get("auth_data") if isinstance(body, dict) else None
    tg_user = _verify_telegram_login_widget(auth_data or {}, TELEGRAM_TOKEN)
    if not tg_user:
        return _cabinet_response(
            {"error": "invalid_login_signature",
             "message": "Подпись Telegram Login невалидна или устарела."},
            status=401,
        )

    chat_id = tg_user.get("id")
    if not chat_id:
        return _cabinet_response({"error": "no_user_id"}, status=400)

    # Дальше — идентичная логика что и в cabinet_me_handler.
    # Чтобы не дублировать ~200 строк — переиспользуем приватный helper.
    return await _build_full_cabinet(int(chat_id), tg_user)


async def _build_full_cabinet(chat_id: int, tg_user: dict) -> web.Response:
    """
    Общая логика построения ответа ЛК — используется и cabinet_me_handler,
    и cabinet_me_via_login_handler. Возвращает ту же структуру что ждёт фронт.
    """
    tg_profile = normalize_tg_user(tg_user)
    client = database.get_client(int(chat_id))
    if not client:
        return _cabinet_response({
            "known": False,
            "tg_user": {
                "first_name": tg_profile.get("first_name", ""),
                "last_name": tg_profile.get("last_name", ""),
                "full_name": tg_profile.get("full_name", ""),
                "username": tg_profile.get("username", ""),
                "photo_url": tg_profile.get("photo_url", ""),
            },
            "message": "Сначала запишись через бот — после первой записи мы будем знать тебя.",
        })

    if not database.has_valid_consent_by_chat_id(int(chat_id)):
        return _cabinet_response({
            "known": False,
            "needs_consent": True,
            "message": (
                "Чтобы открыть личный кабинет, подпишите согласие на обработку "
                "персональных данных. Откройте бот @malesthetic_bot и нажмите /start."
            ),
        }, status=403)

    client_id = client["id"]
    phone = client.get("phone") or ""
    # Телефон известен → идемпотентно начисляем welcome-баллы за прошлые визиты,
    # чтобы баллы были видны сразу после привязки номера (как в cabinet_me_handler).
    if phone:
        try:
            import loyalty as _loy
            await asyncio.to_thread(_loy.lazy_backfill_for_client, client_id, phone)
        except Exception as e:
            logger.error(f"_build_full_cabinet: lazy_backfill {client_id}: {e}")
    # YClients card is imported into the MAYA ledger once. From that moment
    # the ledger is authoritative: otherwise every cabinet refresh would put
    # already-spent points back by overwriting the balance with the old card.
    balance = database.loyalty_balance(client_id)
    loyalty_source = (
        "yclients_import"
        if database.client_has_loyalty_yclients_import(client_id)
        else "maya_ledger"
    )

    bookings = []
    yc_client_id = None
    yc_client_card = None
    phone_digits = "".join(ch for ch in phone if ch.isdigit())
    has_valid_phone = len(phone_digits) >= 10
    if has_valid_phone:
        try:
            yc_payload = await asyncio.to_thread(_load_cabinet_yclients, phone)
            yc_client_id = yc_payload.get("yc_client_id")
            yc_client_card = yc_payload.get("client_card")
            bookings = yc_payload.get("bookings") or []
        except Exception as e:
            logger.error(f"cabinet_via_login: yc bookings err: {e}")
            bookings = []

    today_str = date.today().isoformat()
    upcoming = []
    history = []
    history_cache = []
    visits_total = 0
    visits_last_year = 0
    year_ago = (date.today() - timedelta(days=365)).isoformat()
    last_visit = None

    for b in bookings:
        if not isinstance(b, dict):
            continue
        record_id = b.get("id") or b.get("record_id")
        if not record_id:
            continue
        dt = (b.get("datetime") or b.get("date") or "")[:10]
        attended = b.get("attendance") == 1 or b.get("visit_attendance") == 1
        services = []
        total_cost = 0
        for svc in (b.get("services") or []):
            if isinstance(svc, dict):
                title = str(svc.get("title") or "").strip()
                if not title:
                    continue
                cost = svc.get("cost")
                if cost in (None, ""):
                    cost = svc.get("price")
                try:
                    total_cost += int(float(cost or 0))
                except (TypeError, ValueError):
                    pass
                normalized_service = {"title": title, "cost": cost or 0}
                service_id = svc.get("id", svc.get("service_id"))
                if isinstance(service_id, (str, int)) and str(service_id).strip():
                    normalized_service["id"] = service_id
                services.append(normalized_service)
            elif str(svc or "").strip():
                services.append({"title": str(svc).strip(), "cost": 0})
        service_titles = [svc["title"] for svc in services if svc.get("title")]
        master = b.get("master") or (b.get("staff") or {}).get("name") or ""
        master_id = _norm_id((b.get("staff") or {}).get("id") or b.get("staff_id"))
        item = {
            "record_id": int(record_id),
            "date": b.get("date") or b.get("datetime", ""),
            "services": service_titles,
            "master": master,
            "master_id": master_id,
            "cost": total_cost or None,
        }
        if not attended and dt >= today_str:
            upcoming.append(item)
        elif attended:
            history.append(item)
            history_cache.append(memory.normalize_history_visit({
                "date": b.get("date") or b.get("datetime", ""),
                "services": services,
                "staff": {"id": master_id, "name": master},
                "master_id": master_id,
                "master": master,
            }))
            visits_total += 1
            if dt >= year_ago:
                visits_last_year += 1
            if last_visit is None or dt > last_visit.get("date_short", ""):
                last_visit = {**item, "date_short": dt}

    upcoming.sort(key=lambda x: x["date"])
    history.sort(key=lambda x: x["date"], reverse=True)
    history_cache.sort(key=lambda x: str(x.get("date") or ""), reverse=True)

    if has_valid_phone:
        try:
            database.set_client_history_cache(client_id, history_cache[:30])
        except Exception as e:
            logger.error(f"_build_full_cabinet: cache warm {client_id}: {e}")

    sub = database.get_active_subscription_for_client(client_id)
    sub_info = None
    if sub:
        try:
            import subscriptions as _subs
            plan = _subs.get_plan(sub["plan_code"])
            if plan:
                tier = (sub.get("tier") or "top").lower()
                sub_info = {
                    "title": plan["title"],
                    "tier_label": _subs.TIER_LABELS.get(tier, ""),
                    "used": sub.get("visits_used", 0),
                    "total": sub["visits_included"],
                    "expires_at": sub["expires_at"][:10],
                    "services_included": plan["services_included"],
                }
        except Exception:
            pass

    ref_code, ref_link, ref_stats = None, None, {}
    try:
        import referral as _ref
        ref_code = _ref.get_or_create_ref_code(client_id)
        ref_link = _ref.build_ref_link(ref_code, "malesthetic_bot")
        ref_stats = database.referral_stats_for_client(client_id)
    except Exception as e:
        logger.error(f"cabinet_via_login: ref err: {e}")

    client_card = _client_card_view(yc_client_card, visits_total)
    client_note = (client_card or {}).get("comment") or ""
    client_card_name = (client_card or {}).get("name") or client.get("name") or ""
    full_name = (
        tg_profile.get("full_name")
        or client_card_name
        or tg_profile.get("first_name")
        or ""
    )
    first_name = tg_profile.get("first_name") or (full_name.split() or [""])[0]

    loyalty_details = {
        "balance": balance,
        "source": loyalty_source,
        "care_services": [],
        "affordable_services": [],
        "best_service": None,
        "next_service": None,
        "redemption_rule": "one_care_service_per_visit",
    }
    try:
        import loyalty as _loy

        spend = await asyncio.to_thread(_loy.loyalty_spend_summary, balance)
        loyalty_details.update({
            "care_services": spend.get("care_services") or [],
            "affordable_services": spend.get("affordable_services") or [],
            "best_service": spend.get("best_service"),
            "next_service": spend.get("next_service"),
            "redemption_rule": spend.get("redemption_rule"),
        })
    except Exception as e:
        logger.error(f"_build_full_cabinet: loyalty spend options {client_id}: {e}")

    return _cabinet_response({
        "known": True,
        "has_phone": has_valid_phone,
        "needs_phone": not has_valid_phone,
        "name": first_name,
        "full_name": full_name,
        "phone_tail": phone[-4:] if has_valid_phone else "",
        "booking_phone": phone if has_valid_phone else "",
        "loyalty": loyalty_details,
        "visits": {
            "total": visits_total,
            "last_year": visits_last_year,
            "last_visit": last_visit,
        },
        "yc_client_id": yc_client_id,
        "client_card": client_card,
        "client_note": client_note,
        "usual_master": _usual_master(history),
        "upcoming": upcoming,
        "history": history[:30],
        "subscription": sub_info,
        "referral": {
            "code": ref_code,
            "link": ref_link,
            "invited": ref_stats.get("granted", 0),
            "pending": ref_stats.get("pending", 0),
        },
        "tg_user": {
            "id": tg_profile.get("id"),
            "first_name": tg_profile.get("first_name", ""),
            "last_name": tg_profile.get("last_name", ""),
            "full_name": tg_profile.get("full_name", ""),
            "username": tg_profile.get("username", ""),
            "photo_url": tg_profile.get("photo_url", ""),
        },
    })


# ─────────────────────────────────────────────────────────────────────
# ПАНЕЛЬ УПРАВЛЕНИЯ (ролевой интерфейс в приложении)
# Роли: owner (полный доступ) / manager (аналитика + операционка, без
# управления правами и выгрузки ПД) / master (свои инструменты, +кассир).
# Роль и права определяются ТОЛЬКО на сервере — фронт ничего не решает.
# ─────────────────────────────────────────────────────────────────────

def _panel_resolve_role(tg_id: int) -> dict:
    """Возвращает роль, права и признак привязанного мастера по Telegram-id."""
    managers = set()
    try:
        raw = database.get_setting("panel_manager_ids") or ""
        for x in raw.replace(" ", "").split(","):
            x = x.strip()
            if x.lstrip("-").isdigit():
                managers.add(int(x))
    except Exception:
        managers = set()

    # Привязанный мастер (бывает и у владельца, если он сам стрижёт)
    master_row = None
    try:
        master_row = database.get_master_by_chat_id(int(tg_id))
    except Exception:
        master_row = None
    is_master = bool(master_row)
    staff_id = master_row.get("yclients_staff_id") if master_row else None
    master_name = (master_row.get("full_name") if master_row else "") or ""
    is_cashier = bool(master_row.get("can_redeem")) if master_row else False
    try:
        from config import FOUNDER_IDS as _FIDS
        founders = {int(x) for x in _FIDS}
    except Exception:
        founders = set()
    is_founder = int(tg_id) in founders
    is_admin = bool(database.is_admin(int(tg_id)))

    role = resolve_panel_role(
        tg_id=int(tg_id),
        is_founder=is_founder,
        is_admin=is_admin,
        is_master=is_master,
        manager_ids=managers,
    )

    perms = panel_permissions(role, is_master=is_master, is_cashier=is_cashier)
    return {"role": role, "is_cashier": is_cashier, "is_master": is_master,
            "staff_id": staff_id, "master_name": master_name, "permissions": perms,
            "is_founder": is_founder, "is_admin": is_admin}


def _panel_auth(body: dict, init_data_header: str):
    """tg_user из initData (Mini App) ИЛИ auth_data (Login Widget) ИЛИ веб-сессии
    (вход через ВК/телефон без Telegram: body.session_token → resolve → chat_id).
    Иначе None."""
    if init_data_header:
        u = _verify_telegram_init_data(init_data_header, TELEGRAM_TOKEN)
        if u:
            return u
    auth_data = (body or {}).get("auth_data")
    if auth_data:
        u = _verify_telegram_login_widget(auth_data, TELEGRAM_TOKEN)
        if u:
            return u
    # Веб-сессия (ВК/телефон-вход без VPN): токен → chat_id известного сотрудника.
    tok = (body or {}).get("session_token")
    if tok:
        try:
            return session_tg_user(web_auth.resolve_session(tok))
        except Exception:
            pass
    return None


async def panel_options_handler(request: web.Request) -> web.Response:
    return _cabinet_response({"ok": True})


GIFT_PROMO_PERCENT = 20
GIFT_PROMO_VALID_DAYS = 14


async def _promo_gift_notify(app, chat_id: int, code: str, pct: int, until_str: str = "") -> None:
    """Шлём клиенту промокод в Telegram (+ web-push). Ошибки доставки глотаем —
    код всё равно создан и возвращается фронту для показа прямо в приложении."""
    date_line = ""
    if until_str:
        try:
            d = date.fromisoformat(str(until_str)[:10])
            date_line = f"Действует до {d.strftime('%d.%m.%Y')}.\n"
        except Exception:
            date_line = ""
    text = (
        "🎁 Ваш подарок от «Мужской Эстетики»!\n\n"
        f"Промокод *{code}* — *скидка {pct}%* на первое посещение.\n"
        f"{date_line}\n"
        "Назовите код мастеру при оплате. Хорошей стрижки! 💈"
    )
    try:
        await app["bot_app"].bot.send_message(chat_id=chat_id, text=text, parse_mode="Markdown")
    except Exception as e:
        logger.error(f"promo_gift tg send {chat_id}: {e}")
    try:
        await _send_client_push(chat_id, title=f"Ваш промокод −{pct}% 🎁",
                                body=f"{code} — скидка {pct}% на первое посещение.", url="/app/",
                                tag="promo-gift",
                                persist_in_chat=True,
                                chat_text=(
                                    "🎁 Для вас готов промокод на первое посещение.\n\n"
                                    f"{code} — скидка {pct}%.\n"
                                    + (f"Действует до {until_str[:10]}.\n" if until_str else "")
                                    + "Когда будете готовы, откройте запись в приложении."
                                ),
                                chat_action={
                                    "type": "open_booking",
                                    "label": "Записаться",
                                    "screen": "book",
                                },
                                chat_dedupe_key=f"promo-gift:{code}",
                                )
    except Exception:
        pass


async def promo_gift_handler(request: web.Request) -> web.Response:
    """POST /api/promo_gift — клиент в баннере дошёл до «−20%» и нажал «Записаться».
    Создаём/находим промокод −20% на первое посещение и шлём его клиенту в Telegram
    (+ web-push). Код тот же, что AI проверяет при записи (таблица birthday_promo)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    chat_id = tg_user.get("id") if tg_user else None
    if not chat_id:
        return _cabinet_response({"ok": False, "needs_telegram": True,
                                  "message": "Промокод приходит в Telegram-бот — зайдите через него."})
    chat_id = int(chat_id)
    # Идемпотентность: уже есть активный −20%-код → отдаём его, не плодим и не спамим.
    try:
        existing = database.get_active_birthday_promo(chat_id)
    except Exception:
        existing = None
    if existing and existing.get("code"):
        # Код уже есть — отдаём его (приложение покажет чип из JSON). Telegram повторно
        # НЕ дёргаем: иначе на каждый повторный тап/переоткрытие баннера летит дубль
        # «🎁 Ваш подарок». Доставку клиенту уже обеспечивает чип в приложении.
        return _cabinet_response({"ok": True, "code": existing["code"],
                                  "percent": existing.get("percent") or GIFT_PROMO_PERCENT, "new": False})
    # Новый «подарочный» код
    code = "GIFT-" + database.new_birthday_promo_code().split("-", 1)[-1]
    until = (date.today() + timedelta(days=GIFT_PROMO_VALID_DAYS))
    try:
        client_id = database.get_or_create_client(chat_id)
        database.save_birthday_promo(client_id, code, GIFT_PROMO_PERCENT, date.today().year, until.isoformat())
    except Exception as e:
        logger.error(f"promo_gift save chat={chat_id}: {e}")
        return _cabinet_response({"ok": False, "message": "Не удалось создать промокод."}, status=500)
    await _promo_gift_notify(request.app, chat_id, code, GIFT_PROMO_PERCENT, until.isoformat())
    return _cabinet_response({"ok": True, "code": code, "percent": GIFT_PROMO_PERCENT, "new": True})


async def panel_me_handler(request: web.Request) -> web.Response:
    """POST /api/panel/me — роль + права + имя для админ-панели."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    if not tg_id:
        return _cabinet_response({"error": "no_user_id"}, status=400)
    info = _panel_resolve_role(int(tg_id))
    # 🔎 ДИАГНОСТИКА личности (без ПДн): какой канал входа дал какой chat_id/роль.
    # Помогает поймать «чужой вошёл под именем владельца»: видно, чей токен реально
    # пришёл. tok6 — первые 6 символов токена сессии (не секрет, для сопоставления).
    try:
        _ch = ("initData" if request.headers.get("X-Telegram-InitData")
               else ("auth_data" if (body or {}).get("auth_data")
                     else ("session_token" if (body or {}).get("session_token") else "none")))
        _tok = (body or {}).get("session_token") or ""
        logger.info(
            "[AUTH panel_me] channel=%s tg_id=%s role=%s is_master=%s founder=%s tok6=%s",
            _ch, tg_id, info.get("role"), info.get("is_master"),
            info.get("is_founder"), (_tok[:6] if _tok else "-"),
        )
    except Exception:
        pass
    tg_profile = normalize_tg_user(tg_user)
    _panel_record_seen(int(tg_id), tg_profile.get("first_name", ""))
    # Собственные чаевые мастера (для его панели): сумма и количество
    my_tips = None
    if info.get("is_master"):
        try:
            _m = _master_by_chat_id(int(tg_id))
            _sid = _master_staff_id(_m) if _m else None
            if _sid:
                # Точные суммы из YClients (ЮMoney-отчёт), а не из нашей локальной таблицы
                my_tips = await asyncio.to_thread(_yc.tips_for_master, _sid)
        except Exception:
            my_tips = None
    return _cabinet_response({
        "role": info["role"],
        "is_cashier": info["is_cashier"],
        "is_master": info["is_master"],
        "staff_id": info.get("staff_id"),     # для фото мастера в пилюле имени
        "master_name": info["master_name"],
        "permissions": info["permissions"],
        "is_founder": info.get("is_founder", False),  # доступ к GOD-режиму (только Стас)
        "is_admin": info.get("is_admin", False),
        "name": tg_profile.get("display_name", ""),
        "allowed_surfaces": allowed_surfaces_for_panel_role(
            info.get("role"),
            is_founder=bool(info.get("is_founder")),
            is_master=bool(info.get("is_master")),
        ),
        "brain_profile": default_brain_profile(
            info.get("role"),
            is_founder=bool(info.get("is_founder")),
            is_master=bool(info.get("is_master")),
        ),
        "surface_brain_profiles": surface_brain_profiles(
            info.get("role"),
            is_founder=bool(info.get("is_founder")),
            is_master=bool(info.get("is_master")),
        ),
        "my_tips": my_tips,
    })


def _panel_period(body: dict) -> dict:
    """Период аналитики из тела запроса.
    period: 'week' | 'month' (текущий) | 'prev_month' | '90d'. По умолчанию 'month'.
    Поддерживает старый ключ days (7/30/90) для обратной совместимости.
    Возвращает даты и границы: start/end (YYYY-MM-DD, для YClients, обе включительно),
    from_iso / to_iso (для БД; to_iso — ИСКЛЮЧИТЕЛЬНАЯ верхняя граница, т.е. < to_iso)."""
    period = str((body or {}).get("period") or "").strip()
    if not period:
        try:
            d = int((body or {}).get("days"))
        except Exception:
            d = None
        period = {1: "day", 7: "week", 90: "90d", 365: "year"}.get(d, "month")
    today = date.today()
    if period == "day":
        start, end, label = today, today, "День"
    elif period == "week":
        start, end, label = today - timedelta(days=6), today, "Неделя"
    elif period == "year":
        start, end, label = today.replace(month=1, day=1), today, "Год"
    elif period == "90d":
        start, end, label = today - timedelta(days=89), today, "90 дней"
    elif period == "prev_month":
        end = today.replace(day=1) - timedelta(days=1)   # последнее число прошлого месяца
        start = end.replace(day=1)                        # 1-е число прошлого месяца
        label = "Прошлый месяц"
    else:
        period = "month"
        start, end, label = today.replace(day=1), today, "Текущий месяц"
    return {
        "period": period,
        "label": label,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "from_iso": start.isoformat() + "T00:00:00",
        "to_iso": (end + timedelta(days=1)).isoformat() + "T00:00:00",
    }


# ── Каналы записи (YClients) для аналитики владельца ────────────────────────
# YClients отдаёт у каждой записи record_from + from_url (реферер). 2ГИС/ВК/наш
# сайт приходят ЧЕРЕЗ виджет компании, но реферер выдаёт реальный источник,
# поэтому канал определяем по комбинации record_from и хоста from_url.
def _record_channel(r: dict) -> str:
    rf = (r.get("record_from") or "").strip()
    rf_l = rf.lower()
    online = bool(r.get("online"))
    url = (r.get("from_url") or "").lower()
    host = ""
    if url:
        host = url.split("://", 1)[-1].split("/", 1)[0]

    # точное совпадение домена или его поддомена (НЕ подстрока: иначе my-vk.com→ВК)
    def _host_is(*names) -> bool:
        return any(host == nm or host.endswith("." + nm) for nm in names)

    if "яндекс" in rf_l or "yandex" in rf_l or _host_is("yandex.ru", "ya.ru"):
        return "Яндекс.Карты"
    if "2гис" in rf_l or "2 гис" in rf_l or _host_is("2gis.ru", "2gis.com"):
        return "2ГИС"
    if _host_is("vk.com", "vk.ru", "vk.me") or "vkontakte" in rf_l or "вконтакте" in rf_l:
        return "ВКонтакте"
    if "yplaces" in rf_l:
        return "YCLIENTS (маркетплейс)"
    if _host_is("taplink.cc"):
        return "Соцсети (Taplink)"
    if _host_is("t.me", "telegram.me", "telegram.org") or "telegram" in rf_l:
        return "Telegram"
    if "whatsapp" in rf_l or _host_is("wa.me", "whatsapp.com"):
        return "WhatsApp"
    if "viber" in rf_l:
        return "Viber"
    # наш сайт: malesthetic.* и конкретный наш .рф-домен (мужскаяэстетика.рф в punycode)
    if "malesthetic" in host or _host_is("xn--80aaocmjdk0cclbf8l3a.xn--p1ai"):
        return "Наш сайт / приложение"
    if online or "виджет" in rf_l or "форма компании" in rf_l:
        return "Онлайн-запись (виджет)"
    return "Администратор / офлайн"


_CHANNELS_CACHE: dict = {}   # (start,end) -> (epoch, data); TTL 300с


def _yc_channels_breakdown(start: str, end: str) -> dict:
    """Разбивка записей YClients по каналам за период: всего по каналам + по дням.
    Возвращает {by_channel:{label:count}, total, timeseries:{labels[], series[]}}."""
    import time as _t
    key = (start, end)
    cached = _CHANNELS_CACHE.get(key)
    if cached and (_t.time() - cached[0]) < 300:
        return cached[1]
    try:
        recs = _yc.get_company_records(start, end)
    except Exception as e:
        logger.error(f"channels breakdown: {e}")
        recs = []
    by_channel: dict = {}
    days: dict = {}
    for r in recs:
        if not isinstance(r, dict) or r.get("deleted"):
            continue
        d = (r.get("date") or r.get("datetime") or "")[:10]
        if not d:
            continue
        ch = _record_channel(r)
        by_channel[ch] = by_channel.get(ch, 0) + 1
        dd = days.setdefault(d, {})
        dd[ch] = dd.get(ch, 0) + 1
    labels = sorted(days.keys())
    order = [c for c, _ in sorted(by_channel.items(), key=lambda x: -x[1])]
    series = [{"name": c, "data": [days[d].get(c, 0) for d in labels]} for c in order]
    out = {"by_channel": by_channel, "total": sum(by_channel.values()),
           "timeseries": {"labels": labels, "series": series}}
    # НЕ кэшируем пустой результат — иначе разовый сбой YClients-API «заморозит»
    # нули на 5 минут, даже если API уже починился.
    if by_channel:
        _CHANNELS_CACHE[key] = (_t.time(), out)
    return out


async def panel_dashboard_handler(request: web.Request) -> web.Response:
    """POST /api/panel/dashboard — KPI-дашборд (только owner/manager)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"role": None, "permissions": {}}
    if not info["permissions"].get("dashboard"):
        return _cabinet_response({"error": "forbidden",
                                  "message": "Недостаточно прав."}, status=403)
    pp = _panel_period(body)
    try:
        metrics = database.dashboard_metrics(from_iso=pp["from_iso"], to_iso=pp["to_iso"])
        timeseries = database.dashboard_timeseries(start=pp["start"], end=pp["end"])
    except Exception as e:
        logger.error(f"panel_dashboard error: {e}")
        return _cabinet_response({"error": "server_error",
                                  "message": "Не удалось собрать аналитику."}, status=500)
    # Полный расход (ИИ Claude+OpenAI+fal.ai + серверы) за тот же период.
    spend = None
    try:
        _days = max((date.fromisoformat(str(pp["end"])[:10])
                     - date.fromisoformat(str(pp["start"])[:10])).days + 1, 1)
        spend = ai_billing.build_cost_data(days=_days)
    except Exception as e:
        logger.warning(f"panel_dashboard spend: {e}")
    # Чаевые по каждому мастеру за период (для аналитики владельца)
    tips_by_master = []
    try:
        # Точные суммы из YClients (ЮMoney-отчёт), а не из нашей локальной таблицы
        tips_by_master = await asyncio.to_thread(_yc.tips_by_master, pp["from_iso"], pp["to_iso"])
    except Exception as e:
        logger.warning(f"panel_dashboard tips: {e}")
    # Каналы записи из YClients (Яндекс/2ГИС/ВК/онлайн-запись/…): по дням + всего
    channels = None
    try:
        channels = await asyncio.to_thread(_yc_channels_breakdown, pp["start"], pp["end"])
    except Exception as e:
        logger.warning(f"panel_dashboard channels: {e}")
    growth_plan = None
    try:
        growth_plan = await asyncio.to_thread(
            growth_planner.get_growth_plan,
            role="owner" if info.get("role") == "owner" else "manager",
        )
    except Exception as e:
        logger.warning(f"panel_dashboard growth plan: {e}")
    return _cabinet_response({"role": info["role"], "period": pp["period"],
                              "period_label": pp["label"], "from": pp["start"], "to": pp["end"],
                              "metrics": metrics, "timeseries": timeseries,
                              "spend": spend, "tips_by_master": tips_by_master,
                              "channels": channels, "growth_plan": growth_plan})


async def panel_command_center_handler(request: web.Request) -> web.Response:
    """POST /api/panel/command_center — Owner Command Center v1 (owner-only)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"role": None, "permissions": {}}
    if info.get("role") != "owner":
        return _cabinet_response({
            "error": "forbidden",
            "message": "Owner Command Center доступен только владельцу.",
        }, status=403)
    try:
        payload = await asyncio.to_thread(owner_ai.command_center, include_personal_data=True)
    except Exception as e:
        logger.error(f"panel_command_center error: {e}")
        return _cabinet_response({
            "error": "server_error",
            "message": "Не удалось собрать Owner Command Center.",
        }, status=500)
    return _cabinet_response({"role": info["role"], **payload})


async def panel_plan_target_handler(request: web.Request) -> web.Response:
    """POST /api/panel/plan_target — daily target or strategic growth goal."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"role": None, "permissions": {}}
    if info.get("role") != "owner":
        return _cabinet_response({
            "error": "forbidden",
            "message": "Настройка плана доступна только владельцу.",
        }, status=403)
    if body.get("mode") == "growth" or body.get("growth_target_rub") is not None:
        raw_growth = body.get("growth_target_rub", body.get("target_rub"))
        try:
            growth_target = int(round(float(str(raw_growth).replace(" ", "").replace(",", ".") or 0)))
            workstations = body.get("workstations_count")
            workstations = int(workstations) if workstations not in (None, "") else None
        except Exception:
            return _cabinet_response({
                "error": "bad_request",
                "message": "Цель и количество рабочих мест должны быть числами.",
            }, status=400)
        try:
            result = await asyncio.to_thread(
                growth_planner.set_growth_goal,
                target_rub=growth_target,
                deadline=body.get("deadline"),
                workstations_count=workstations,
                created_by=tg_id,
            )
        except Exception as e:
            logger.error(f"panel growth target error: {e}")
            return _cabinet_response({
                "error": "server_error",
                "message": "Не удалось рассчитать план роста.",
            }, status=500)
        if not result.get("ok"):
            return _cabinet_response(result, status=400)
        return _cabinet_response({"role": info["role"], **result})
    raw = body.get("target_rub", body.get("daily_target_rub", 0))
    try:
        target = int(round(float(str(raw).replace(" ", "").replace(",", ".") or 0)))
    except Exception:
        return _cabinet_response({"error": "bad_request", "message": "target_rub должен быть числом."}, status=400)
    if target < 0 or target > 5000000:
        return _cabinet_response({"error": "bad_request", "message": "План должен быть от 0 до 5 000 000 ₽."}, status=400)
    try:
        database.set_setting("owner_daily_target_rub", str(target))
        payload = await asyncio.to_thread(owner_ai.command_center)
    except Exception as e:
        logger.error(f"panel_plan_target error: {e}")
        return _cabinet_response({"error": "server_error", "message": "Не удалось сохранить план."}, status=500)
    return _cabinet_response({"ok": True, "role": info["role"], **payload})


async def panel_action_evaluate_handler(request: web.Request) -> web.Response:
    """POST /api/panel/action/evaluate — проверить результат owner action."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"role": None, "permissions": {}}
    if info.get("role") != "owner":
        return _cabinet_response({
            "error": "forbidden",
            "message": "Проверка результата доступна только владельцу.",
        }, status=403)
    try:
        action_id = int(body.get("action_id") or 0)
    except Exception:
        action_id = 0
    if not action_id:
        return _cabinet_response({"error": "bad_request", "message": "action_id обязателен."}, status=400)
    try:
        item = await asyncio.to_thread(
            database.evaluate_owner_action,
            action_id,
            force=bool(body.get("force")),
        )
    except Exception as e:
        logger.error(f"panel_action_evaluate error: {e}")
        return _cabinet_response({"error": "server_error", "message": "Не удалось проверить результат."}, status=500)
    if not item:
        return _cabinet_response({"error": "not_found"}, status=404)
    return _cabinet_response({"ok": True, "action": item})


def _owner_assignment_due_label(raw: str | None = "") -> str:
    raw = str(raw or "").strip()
    if not raw:
        return ""
    try:
        dt = datetime.fromisoformat(raw[:19])
        return dt.strftime("%d.%m %H:%M")
    except Exception:
        return raw[:16]


def _owner_assignment_public_title(raw: str | None = "") -> str:
    text = str(raw or "Новая задача").strip()
    try:
        text = anonymizer.redact_pii(text)
    except Exception:
        pass
    text = re.sub(r"\b\d[\d\s.,]*(?:₽|руб(?:\.|лей|ля)?)", "сумма", text, flags=re.I)
    return " ".join(text.split())[:140] or "Новая задача"


def _owner_assignment_message(task: dict | None) -> str:
    task = task or {}
    payload = task.get("payload") if isinstance(task.get("payload"), dict) else {}
    summary = task.get("summary") if isinstance(task.get("summary"), dict) else {}
    assigned_to = str(payload.get("assigned_to") or summary.get("assigned_to") or "team").lower()
    role_label = {
        "admin": "Админ",
        "master": "Мастер",
        "team": "Команда",
    }.get(assigned_to, "Команда")
    assignee_name = str(payload.get("assignee_name") or summary.get("assignee_name") or "").strip()
    assigned_label = role_label + (f" · {assignee_name[:60]}" if assignee_name else "")
    title = _owner_assignment_public_title(task.get("title") or "Новая задача")
    due_label = _owner_assignment_due_label(task.get("result_due_at") or payload.get("due_at"))
    lines = [
        "Задача от владельца",
        f"Исполнитель: {assigned_label}",
        f"Задача: {title}",
    ]
    if due_label:
        lines.append(f"Срок: {due_label}")
    lines.append("Подробные финансовые показатели остаются в Owner OS.")
    return "\n".join(lines)


async def _deliver_owner_control_assignment(request: web.Request, task: dict | None) -> dict:
    """Доставляет назначенную owner_control задачу в рабочий контур без лишней аналитики."""
    if not isinstance(task, dict):
        return {"ok": False, "skipped": True, "reason": "empty_task"}
    payload = task.get("payload") if isinstance(task.get("payload"), dict) else {}
    assigned_to = str(payload.get("assigned_to") or "owner").strip().lower()
    if assigned_to not in ("admin", "master", "team"):
        return {"ok": True, "skipped": True, "reason": "internal_assignment"}
    state = str(payload.get("assignment_delivery_state") or "").strip().lower()
    if state == "delivered" and int(payload.get("assignment_delivery_message_id") or 0):
        return {"ok": True, "skipped": True, "reason": "already_delivered"}
    try:
        action_id = int(task.get("id") or 0)
    except Exception:
        action_id = 0
    if not action_id:
        return {"ok": False, "skipped": True, "reason": "no_action_id"}
    text = _owner_assignment_message(task)
    try:
        msg_id = await asyncio.to_thread(
            database.add_staff_message,
            0,
            "MAYA · задачи",
            text,
            "", "", "", "", 0, 0,
        )
    except Exception as e:
        logger.error(f"owner assignment team chat save: {e}")
        marked = await asyncio.to_thread(
            database.mark_owner_control_task_delivery,
            action_id,
            state="failed",
            channel="team_chat",
            error="team_chat_save_failed",
        )
        return {"ok": False, "state": "failed", "task": marked}
    try:
        await _push_team_message(request.app["bot_app"], 0, "MAYA · задачи", text, "")
    except Exception as e:
        logger.error(f"owner assignment team chat push: {e}")
    marked = await asyncio.to_thread(
        database.mark_owner_control_task_delivery,
        action_id,
        state="delivered",
        channel="team_chat",
        message_id=msg_id,
    )
    return {"ok": True, "state": "delivered", "message_id": msg_id, "task": marked}


async def panel_control_update_handler(request: web.Request) -> web.Response:
    """POST /api/panel/control/update — lifecycle ручной контрольной задачи."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"role": None, "permissions": {}}
    if info.get("role") != "owner":
        return _cabinet_response({
            "error": "forbidden",
            "message": "Контрольные задачи доступны только владельцу.",
        }, status=403)
    try:
        task_id = int(body.get("task_id") or body.get("action_id") or 0)
    except Exception:
        task_id = 0
    action = str(body.get("action") or "").strip().lower()
    if not task_id or action not in ("complete", "cancel", "postpone", "reopen", "assign", "revision"):
        return _cabinet_response({"error": "bad_request", "message": "Нужны task_id и action."}, status=400)
    try:
        updated = await asyncio.to_thread(
            owner_ai.update_control_task,
            task_id=task_id,
            action=action,
            note=body.get("note") or "",
            due_at=body.get("due_at"),
            due_in_days=body.get("due_in_days"),
            assigned_to=body.get("assigned_to") or "",
            assignee_name=body.get("assignee_name") or "",
        )
        if not updated.get("ok"):
            status = 404 if updated.get("error") == "not_found" else 400
            return _cabinet_response(updated, status=status)
        delivery = await _deliver_owner_control_assignment(request, updated.get("task"))
        if isinstance(delivery, dict) and isinstance(delivery.get("task"), dict):
            updated["task"] = delivery["task"]
        updated["assignment_delivery"] = delivery
        center = await asyncio.to_thread(owner_ai.command_center)
    except Exception as e:
        logger.error(f"panel_control_update error: {e}")
        return _cabinet_response({"error": "server_error", "message": "Не удалось обновить задачу."}, status=500)
    return _cabinet_response({"ok": True, "role": info["role"], "updated": updated.get("task"), **center})


async def panel_control_create_handler(request: web.Request) -> web.Response:
    """POST /api/panel/control/create — создать ручной контроль из owner-сигнала."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"role": None, "permissions": {}}
    if info.get("role") != "owner":
        return _cabinet_response({
            "error": "forbidden",
            "message": "Контрольные задачи доступны только владельцу.",
        }, status=403)
    title = str(body.get("title") or "").strip()
    if not title:
        return _cabinet_response({"error": "bad_request", "message": "title обязателен."}, status=400)
    try:
        created = await asyncio.to_thread(
            owner_ai.create_control_task,
            title=title,
            detail=body.get("detail") or "",
            priority=body.get("priority") or "medium",
            due_at=body.get("due_at"),
            due_in_days=body.get("due_in_days"),
            potential_rub=body.get("potential_rub"),
            owner_next_step=body.get("owner_next_step") or "",
            signal_key=body.get("signal_key") or "",
            signal_kind=body.get("signal_kind") or "",
            signal_source=body.get("signal_source") or "",
            action_job=body.get("action_job") or "",
            assigned_to=body.get("assigned_to") or "owner",
            assignee_name=body.get("assignee_name") or "",
            created_by=tg_id,
        )
        if not created.get("ok"):
            return _cabinet_response(created, status=400)
        delivery = await _deliver_owner_control_assignment(request, created.get("task"))
        if isinstance(delivery, dict) and isinstance(delivery.get("task"), dict):
            created["task"] = delivery["task"]
        created["assignment_delivery"] = delivery
        center = await asyncio.to_thread(owner_ai.command_center)
    except Exception as e:
        logger.error(f"panel_control_create error: {e}")
        return _cabinet_response({"error": "server_error", "message": "Не удалось создать задачу."}, status=500)
    return _cabinet_response({"ok": True, "role": info["role"], "created": created, **center})


async def panel_autonomy_tick_handler(request: web.Request) -> web.Response:
    """POST /api/panel/autonomy/tick — безопасный автопилот Maya OS v2."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"role": None, "permissions": {}}
    if info.get("role") != "owner":
        return _cabinet_response({
            "error": "forbidden",
            "message": "Автопилот Maya OS доступен только владельцу.",
        }, status=403)
    try:
        limit = int(body.get("limit") or 5)
    except Exception:
        limit = 5
    try:
        result = await asyncio.to_thread(
            owner_ai.run_autonomous_director_tick,
            created_by=tg_id,
            limit=limit,
        )
        deliveries = []
        for item in result.get("created") or []:
            task = item.get("task")
            if isinstance(task, dict):
                deliveries.append(await _deliver_owner_control_assignment(request, task))
        center = result.get("center") or await asyncio.to_thread(owner_ai.command_center)
    except Exception as e:
        logger.error(f"panel_autonomy_tick error: {e}")
        return _cabinet_response({"error": "server_error", "message": "Не удалось запустить автопилот."}, status=500)
    return _cabinet_response({
        "ok": True,
        "role": info["role"],
        "autopilot": result,
        "deliveries": deliveries,
        **center,
    })


async def panel_autopilot_supervision_handler(request: web.Request) -> web.Response:
    """POST /api/panel/autopilot/supervise — контроль исполнения Autopilot 2.1."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"role": None, "permissions": {}}
    if info.get("role") != "owner":
        return _cabinet_response({
            "error": "forbidden",
            "message": "Контроль исполнения Maya OS доступен только владельцу.",
        }, status=403)
    try:
        limit = int(body.get("limit") or 8)
    except Exception:
        limit = 8
    try:
        result = await asyncio.to_thread(
            owner_ai.run_autopilot_supervision_tick,
            created_by=tg_id,
            limit=limit,
        )
        center = result.get("center") or await asyncio.to_thread(owner_ai.command_center)
    except Exception as e:
        logger.error(f"panel_autopilot_supervision error: {e}")
        return _cabinet_response({"error": "server_error", "message": "Не удалось провести контроль исполнения."}, status=500)
    return _cabinet_response({
        "ok": True,
        "role": info["role"],
        "supervision": result,
        **center,
    })


async def panel_execution_loop_handler(request: web.Request) -> web.Response:
    """POST /api/panel/execution/loop — замкнутый цикл исполнения Maya OS v3."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"role": None, "permissions": {}}
    if info.get("role") != "owner":
        return _cabinet_response({
            "error": "forbidden",
            "message": "Замкнутый цикл Maya OS доступен только владельцу.",
        }, status=403)
    try:
        limit = int(body.get("limit") or 6)
    except Exception:
        limit = 6
    try:
        result = await asyncio.to_thread(
            owner_ai.run_execution_loop_tick,
            created_by=tg_id,
            limit=limit,
        )
        center = result.get("center") or await asyncio.to_thread(owner_ai.command_center)
    except Exception as e:
        logger.error(f"panel_execution_loop error: {e}")
        return _cabinet_response({"error": "server_error", "message": "Не удалось замкнуть цикл исполнения."}, status=500)
    return _cabinet_response({
        "ok": True,
        "role": info["role"],
        "execution_loop_tick": result,
        **center,
    })


async def panel_staff_tasks_handler(request: web.Request) -> web.Response:
    """POST /api/panel/staff_tasks — безопасная очередь поручений для рабочих кабинетов."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = int(tg_user["id"])
    info = _panel_resolve_role(tg_id)
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    try:
        payload = await asyncio.to_thread(
            owner_ai.staff_task_inbox,
            viewer_role=info.get("role") or "",
            limit=int(body.get("limit") or 12),
        )
    except Exception as e:
        logger.error(f"panel_staff_tasks error: {e}")
        return _cabinet_response({"error": "server_error", "message": "Не удалось загрузить задачи."}, status=500)
    return _cabinet_response({"ok": True, "role": info.get("role"), **payload})


async def panel_staff_task_update_handler(request: web.Request) -> web.Response:
    """POST /api/panel/staff_task/update — исполнитель отмечает ход поручения."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = int(tg_user["id"])
    info = _panel_resolve_role(tg_id)
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    try:
        task_id = int(body.get("task_id") or body.get("action_id") or 0)
    except Exception:
        task_id = 0
    action = str(body.get("action") or "").strip().lower()
    if not task_id or action not in ("accept", "accepted", "start", "run", "running", "done", "complete", "finish", "blocked"):
        return _cabinet_response({"error": "bad_request", "message": "Нужны task_id и action."}, status=400)
    actor_name = (
        info.get("master_name")
        or tg_user.get("full_name")
        or " ".join([str(tg_user.get("first_name") or ""), str(tg_user.get("last_name") or "")]).strip()
        or tg_user.get("username")
        or "Сотрудник"
    )
    try:
        updated = await asyncio.to_thread(
            owner_ai.update_staff_task,
            task_id=task_id,
            viewer_role=info.get("role") or "",
            actor_name=actor_name,
            actor_chat_id=tg_id,
            action=action,
            note=body.get("note") or "",
        )
    except Exception as e:
        logger.error(f"panel_staff_task_update error: {e}")
        return _cabinet_response({"error": "server_error", "message": "Не удалось обновить задачу."}, status=500)
    if not updated.get("ok"):
        status = 403 if updated.get("error") == "forbidden" else (404 if updated.get("error") == "not_found" else 400)
        return _cabinet_response(updated, status=status)
    return _cabinet_response({"ok": True, "role": info.get("role"), **updated})


def _build_master_overview(staff_id: int, pp: dict, master_name: str) -> web.Response:
    """Расписание (сегодня + ближайшие) и личная статистика мастера за период pp.
    Статистика (визиты/выручка/чаевые) — за окно периода ВКЛЮЧАЯ сегодня; расписание —
    всегда сегодня + ближайшие 30 дней независимо от периода."""
    today = date.today()
    today_str = today.isoformat()
    stats_start = pp["start"]     # YYYY-MM-DD, <= сегодня
    stats_end = pp["end"]         # = сегодня
    fetch_start = min(stats_start, today_str)
    fetch_end = (today + timedelta(days=30)).isoformat()
    max_pages = 60 if pp.get("period") == "year" else 25

    try:
        records = _yc.get_records_for_master(staff_id, fetch_start, fetch_end, max_pages=max_pages) or []
    except Exception as e:
        logger.error(f"master overview records staff={staff_id}: {e}")
        records = []
    records = [r for r in records if isinstance(r, dict) and not _is_gift_cert_record(r)]

    work = {}
    try:
        sched = _yc.get_staff_schedule(staff_id, today_str, fetch_end) or []
        for row in sched:
            if isinstance(row, dict) and row.get("is_working") and row.get("slots"):
                d = (row.get("date") or "")[:10]
                s = row["slots"][0]
                if d:
                    work[d] = (s.get("from", "") + "–" + s.get("to", ""))
    except Exception as e:
        logger.error(f"master overview schedule staff={staff_id}: {e}")

    def _dt(r):  return (r.get("datetime") or r.get("date") or "")
    def _day(r): return _dt(r)[:10]
    def _titles(r):
        return [(s.get("title") or "") for s in (r.get("services") or [])
                if isinstance(s, dict) and (s.get("title"))]
    def _cost(r):
        tot = 0.0
        for s in (r.get("services") or []):
            if isinstance(s, dict):
                try: tot += float(s.get("cost") or s.get("price_min") or 0)
                except Exception: pass
        return tot
    def _attended(r): return r.get("attendance") == 1 or r.get("visit_attendance") == 1
    def _client(r):
        c = r.get("client") or {}
        return (c.get("name") or "").strip() if isinstance(c, dict) else ""
    def _item(r, d):
        return {
            "time": _dt(r)[11:16], "date": d,
            "client": _client(r) or "Клиент", "services": _titles(r),
            "cost": round(_cost(r)),
            "status": "done" if _attended(r) else ("cancelled" if r.get("attendance") == -1 else "upcoming"),
        }

    visits_done = 0
    revenue = 0.0
    today_items, upcoming = [], []
    for r in records:
        d = _day(r)
        if not d:
            continue
        # Статистика за период (включая состоявшиеся визиты сегодня)
        if stats_start <= d <= stats_end and _attended(r):
            visits_done += 1
            revenue += _cost(r)
        # Расписание: сегодня + предстоящие
        if d == today_str:
            today_items.append(_item(r, d))
        elif d > today_str:
            upcoming.append(_item(r, d))

    today_items.sort(key=lambda x: x["time"])
    upcoming.sort(key=lambda x: (x["date"], x["time"]))
    grouped = []
    for it in upcoming:
        if not grouped or grouped[-1]["date"] != it["date"]:
            grouped.append({"date": it["date"], "working": work.get(it["date"], ""), "items": []})
        grouped[-1]["items"].append(it)

    # Чаевые за тот же период (to_iso — исключительная граница, tips_by_master это учитывает)
    tips_count, tips_total = 0, 0
    try:
        t = _yc.tips_for_master(int(staff_id), pp["from_iso"], pp["to_iso"]) or {}
        tips_count = int(t.get("count") or 0)
        tips_total = round(float(t.get("total") or 0))
    except Exception as e:
        logger.error(f"master overview tips staff={staff_id}: {e}")

    avg_check = round(revenue / visits_done) if visits_done else 0
    return _cabinet_response({
        "master_name": master_name or "",
        "period": pp["period"], "period_label": pp["label"],
        "today": {"date": today_str, "working": work.get(today_str, ""), "items": today_items},
        "upcoming": grouped[:14],
        "stats": {
            "visits_done": visits_done,
            "revenue": round(revenue),
            "avg_check": avg_check,
            "today_count": len(today_items),     # записей на сегодня
            "upcoming_count": len(upcoming),     # записей на будущие дни
            "tips_count": tips_count,
            "tips_total": tips_total,
        },
    })


async def panel_master_overview_handler(request: web.Request) -> web.Response:
    """POST /api/panel/master/overview — расписание + статистика привязанного мастера."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {}
    if not info.get("is_master") or not info.get("staff_id"):
        return _cabinet_response({"error": "not_master",
                                  "message": "Раздел доступен только привязанным мастерам."}, status=403)
    pp = _panel_period(body)   # period: day | week | month | prev_month | year
    return _build_master_overview(int(info["staff_id"]), pp, info.get("master_name") or "")


# ── «Клиенты на день» для мастера: записи дня + история/тег/AI-совет ─────────
def _genitive_name(name: str) -> str:
    """Мужское имя в родительном падеже для «у <имя>» (у Максима, у Ильи, у Алексея).
    Покрывает обычные русские мужские имена; несклоняемые/иностранные на гласную
    (Лео, Нико) и слово «коллеги» оставляем как есть."""
    n = (name or "").strip()
    if not n:
        return n
    low = n.lower()
    last = low[-1]
    if last in "оеуэюы":          # Лео, Нико, … — не склоняем
        return n
    if last == "й":               # Алексей, Андрей, Сергей → Алексея, Андрея, Сергея
        return n[:-1] + "я"
    if last == "ь":               # Игорь → Игоря
        return n[:-1] + "я"
    if last == "я":               # Илья, Костя → Ильи, Кости
        return n[:-1] + "и"
    if last == "а":               # Никита → Никиты; после к/г/х/ж/ш/ч/щ → «и» (Лука→Луки)
        if last == "а" and "коллег" in low:  # «коллеги» уже в род. падеже
            return n
        if len(low) >= 2 and low[-2] in "кгхжшчщ":
            return n[:-1] + "и"
        return n[:-1] + "ы"
    if last == "и":               # «коллеги» и пр. — не трогаем
        return n
    if last.isalpha():            # на согласную: Максим, Стас, Александр, Артём → +а
        return n + "а"
    return n


def _client_day_tag(history: list, this_staff_id: int, mnames: dict) -> dict:
    """Метка клиента для мастера: Новенький / Ваш постоянник / Стрижётся у <Имя>.
    history — посещённые визиты с master_id (порядок — новые первыми)."""
    attended = len([h for h in history if isinstance(h, dict)])
    if attended == 0:
        return {"kind": "new", "label": "Новенький"}
    usual = _usual_master(history)  # мастер из последнего визита (ушедших не берём)
    if usual and int(usual["id"]) != int(this_staff_id):
        # обычно ходит к действующему коллеге — полезно знать, к кому
        nm = mnames.get(usual["id"]) or usual.get("name") or ""
        first = (nm.split() or [""])[0] or "коллеги"
        return {"kind": "colleague", "label": "Стрижётся у " + _genitive_name(first)}
    # привычный мастер — это сам мастер (или активного «обычного» нет): постоянник
    # только при ≥2 визитах, иначе единственный (сегодняшний) визит = новенький.
    if attended >= 2:
        return {"kind": "regular", "label": "Ваш постоянник" if usual else "Постоянник"}
    return {"kind": "new", "label": "Новенький"}


def _master_day_records(staff_id: int, date_q: str) -> dict:
    """Записи мастера на ближайший (или заданный) предстоящий день + ростер имён."""
    today_str = date.today().isoformat()
    fetch_end = (date.today() + timedelta(days=30)).isoformat()
    try:
        records = _yc.get_records_for_master(staff_id, today_str, fetch_end) or []
    except Exception as e:
        logger.error(f"master day records staff={staff_id}: {e}")
        records = []
    by_day: dict = {}
    for r in records:
        if not isinstance(r, dict) or _is_gift_cert_record(r) or r.get("attendance") == -1:
            continue
        d = (r.get("datetime") or r.get("date") or "")[:10]
        if d and d >= today_str:
            by_day.setdefault(d, []).append(r)
    days = sorted(by_day.keys())
    target = date_q if date_q else today_str
    day_recs = (sorted(by_day.get(target, []), key=lambda r: (r.get("datetime") or ""))
                if target else [])
    try:
        roster = _yc.get_masters() or []
    except Exception:
        roster = []
    mnames = {m.get("id"): (m.get("name") or "") for m in roster
              if isinstance(m, dict) and not m.get("error") and m.get("id") is not None}
    return {"target": target, "day_recs": day_recs, "days": days[:14], "mnames": mnames}


def _assemble_day_client(r: dict, hist_raw: list, advice_row: dict | None,
                         this_staff_id: int, mnames: dict) -> dict:
    c = r.get("client") or {}
    cname = (c.get("name") or "Клиент").strip() or "Клиент"
    services = [s.get("title") for s in (r.get("services") or [])
                if isinstance(s, dict) and s.get("title")]
    cost = 0.0
    for s in (r.get("services") or []):
        if isinstance(s, dict):
            try: cost += float(s.get("cost") or s.get("price_min") or 0)
            except Exception: pass
    items, tag_hist = [], []
    for h in (hist_raw or []):
        if not isinstance(h, dict):
            continue
        st = h.get("staff") or {}
        mid = _norm_id(st.get("id") or h.get("staff_id"))
        hsv = [s.get("title") for s in (h.get("services") or [])
               if isinstance(s, dict) and s.get("title")]
        hc = 0.0
        for s in (h.get("services") or []):
            if isinstance(s, dict):
                try: hc += float(s.get("cost") or 0)
                except Exception: pass
        items.append({"date": (h.get("datetime") or h.get("date") or "")[:10],
                      "services": hsv, "master": st.get("name") or "", "cost": round(hc)})
        tag_hist.append({"master_id": mid, "master": st.get("name") or ""})
    order = sorted(range(len(items)), key=lambda i: items[i]["date"], reverse=True)
    items = [items[i] for i in order]
    tag_hist = [tag_hist[i] for i in order]
    tag = _client_day_tag(tag_hist, int(this_staff_id), mnames)
    advice = (advice_row or {}).get("advice_text") if advice_row else None
    return {"record_id": r.get("id"), "time": (r.get("datetime") or "")[11:16],
            "client": cname, "services": services, "cost": round(cost),
            "visits": len(items), "tag": tag, "history": items[:12], "advice": advice,
            # «визит проведён и оплачен»: paid_full — единственный надёжный признак оплаты
            "paid": bool(r.get("paid_full")), "arrived": r.get("attendance") == 1}


async def panel_master_day_handler(request: web.Request) -> web.Response:
    """POST /api/panel/master/day — клиенты мастера на предстоящий день: у каждого
    тег (новенький/постоянник/стрижётся у коллеги), история визитов и AI-совет по
    апселлу (тот же, что бот прислал). Только привязанный мастер; владелец/управляющий
    может посмотреть день конкретного мастера через staff_id."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {}
    staff_id = info.get("staff_id")
    master_name = info.get("master_name") or ""
    if not info.get("is_master"):
        if info.get("permissions", {}).get("dashboard") and body.get("staff_id"):
            staff_id, master_name = body.get("staff_id"), ""
        else:
            return _cabinet_response({"error": "not_master",
                                      "message": "Раздел доступен мастерам."}, status=403)
    if not staff_id:
        return _cabinet_response({"error": "not_master",
                                  "message": "Мастер не привязан."}, status=403)
    try:
        staff_id = int(staff_id)
    except (TypeError, ValueError):
        return _cabinet_response({"error": "bad_request",
                                  "message": "Некорректный staff_id."}, status=400)
    date_q = str(body.get("date") or "").strip()
    prep = await asyncio.to_thread(_master_day_records, staff_id, date_q)
    mnames = prep["mnames"]

    async def _enrich(r):
        c = r.get("client") or {}
        cid, rid = c.get("id"), r.get("id")
        hist = []
        if cid:
            try:
                hist = await asyncio.to_thread(_yc.get_client_history, int(cid), 30)
            except Exception:
                hist = []
        adv = None
        if rid:
            try:
                adv = await asyncio.to_thread(database.get_ai_advice_for_record, int(rid))
            except Exception:
                adv = None
        return _assemble_day_client(r, hist, adv, staff_id, mnames)

    # return_exceptions=True: сбой по одному клиенту не должен ронять весь список —
    # отдаём остальных (частичный результат), а не 500.
    enriched = await asyncio.gather(*[_enrich(r) for r in prep["day_recs"][:30]],
                                    return_exceptions=True)
    clients = [c for c in enriched if isinstance(c, dict)]
    for c in enriched:
        if isinstance(c, Exception):
            logger.error(f"master day enrich failed: {c}")
    day_plan = None
    try:
        forecasts = await _collect_master_day_forecasts(
            prep["target"],
            only_staff_id=staff_id,
        )
        if forecasts:
            day_plan = forecasts[0]
            day_plan.pop("delivery_master", None)
    except Exception as e:
        logger.error(f"master day plan staff={staff_id}: {e}")
    return _cabinet_response({"date": prep["target"], "clients": clients,
                              "days": prep["days"], "master_name": master_name,
                              "plan": day_plan})


async def panel_redeem_handler(request: web.Request) -> web.Response:
    """POST /api/panel/redeem — погашение кода лояльности или сертификата (кассир/владелец).
    body: {code, mode:'lookup'|'confirm'}. lookup только показывает данные, confirm — гасит."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"permissions": {}}
    if not info.get("permissions", {}).get("redeem"):
        return _cabinet_response({"error": "forbidden",
                                  "message": "Гасить коды могут кассиры или владелец."}, status=403)

    code = str(body.get("code") or "").strip().upper()
    mode = str(body.get("mode") or "lookup")
    if not code:
        return _cabinet_response({"ok": False, "reason": "Введите код."}, status=400)

    # 1) Подарочный сертификат?
    try:
        cert = database.get_gift_certificate(code)
    except Exception:
        cert = None
    if cert:
        if cert.get("payment_status") != "paid":
            return _cabinet_response({"ok": False, "type": "cert", "reason": "Сертификат ещё не оплачен."})
        if cert.get("used_at"):
            return _cabinet_response({"ok": False, "type": "cert", "reason": "Сертификат уже погашен",
                                      "used_at": cert["used_at"][:10]})
        try:
            if datetime.fromisoformat(cert["expires_at"]) < datetime.now():
                return _cabinet_response({"ok": False, "type": "cert", "reason": "Срок действия истёк."})
        except Exception:
            pass
        details = {
            "type": "cert", "code": cert["code"], "amount": cert.get("amount"),
            "recipient_name": cert.get("recipient_name", ""),
            "recipient_phone": cert.get("recipient_phone", ""),
            "expires_at": (cert.get("expires_at") or "")[:10],
        }
        if mode != "confirm":
            return _cabinet_response({"ok": True, "type": "cert", "valid": True, "details": details})
        logger.warning("p4_06_legacy_mutation_disabled:redeem_gift_certificate")
        return _cabinet_response({
            "ok": False,
            "type": "cert",
            "error": "canonical_gift_certificate_ingress_required",
            "reason": "Погашение сертификата временно недоступно.",
        }, status=503)
        try:
            database.mark_cert_used(code, int(tg_id))
        except Exception as e:
            logger.error(f"panel redeem cert: {e}")
            return _cabinet_response({"ok": False, "type": "cert", "reason": "Ошибка при погашении."}, status=500)
        return _cabinet_response({"ok": True, "type": "cert", "redeemed": True, "details": details})

    # 2) Код лояльности?
    try:
        lc = database.get_loyalty_code(code)
    except Exception:
        lc = None
    if lc:
        if mode != "confirm":
            valid = True
            reason = ""
            if lc.get("used_at"):
                valid, reason = False, "Код уже погашен"
            else:
                try:
                    if datetime.fromisoformat(lc["expires_at"]) < datetime.now():
                        valid, reason = False, "Срок действия истёк"
                except Exception:
                    pass
            return _cabinet_response({"ok": True, "type": "loyalty", "valid": valid, "reason": reason,
                                      "details": {"type": "loyalty", "code": code,
                                                  "points": lc.get("points"),
                                                  "service_title": lc.get("service_title", "")}})
        try:
            import loyalty as _loy
            res = _loy.consume_redeem_code(code, int(tg_id))
        except Exception as e:
            logger.error(f"panel redeem loyalty: {e}")
            return _cabinet_response({"ok": False, "type": "loyalty", "reason": "Ошибка при погашении."}, status=500)
        res = dict(res or {})
        res["type"] = "loyalty"
        if res.get("ok"):
            res["redeemed"] = True
        return _cabinet_response(res)

    return _cabinet_response({"ok": False, "reason": "Код не найден."})


_panel_bg_tasks = set()
_PANEL_JOBS = {
    "reactivation":  ("reactivation",   "run_reactivation_job",      "Реактивация уснувших клиентов", "client"),
    "birthday":      ("birthday",        "run_birthday_job",          "Поздравления именинников",      "client"),
    "cycle":         ("cycle_reminder",  "run_cycle_reminder_job",    "Цикл-напоминания «пора подстричься»", "client"),
    "reviews":       ("reviews",         "send_pending_review_requests", "Отправка запросов на отзыв",  "client"),
    "loyalty":       ("loyalty",         "run_earning_job",           "Начисление кэшбэка лояльности",  "system"),
    "subscriptions": ("subscriptions",   "run_subscriptions_job",     "Обновление абонементов",        "system"),
    "referral":      ("referral",        "run_referral_resolver_job", "Резолвер рефералов",            "system"),
    "leads":         ("lead_alerts",     "scan_and_alert",            "Алерты по зависшим заявкам",     "system"),
}

_OWNER_CLIENT_MESSAGE_JOBS = {"reactivation", "birthday", "cycle", "reviews"}
_OWNER_JOB_APPROVAL_TTL_SECONDS = 15 * 60
_OWNER_JOB_CONFIRM_RE = re.compile(
    r"^\s*(?:я\s+)?(?:да|давай|подтверждаю|согласен|согласна|ок|окей|верно|"
    r"всё\s+верно|все\s+верно|можно|запускай|запусти|отправляй|отправь|делай|сделай|"
    r"выполняй|начинай|погнали)"
    r"(?:[\s,]+(?:да|давай|подтверждаю|запускай|запусти|отправляй|отправь|делай|сделай|"
    r"выполняй|начинай|погнали|"
    r"рассылку|сообщения|клиентам|это|её|ее|всё|все|верно|можно))*[.!?]?\s*$",
    re.IGNORECASE,
)
_OWNER_JOB_CANCEL_RE = re.compile(
    r"^\s*(?:нет|стоп|отмена|отмени|не\s+надо|пока\s+не\s+надо|"
    r"не\s+запускай|не\s+отправляй|отложи|позже)[.!?]?\s*$",
    re.IGNORECASE,
)
_OWNER_JOB_STATUS_RE = re.compile(
    r"(?:что\s+с\s+рассылк|статус\w*\s+рассылк|"
    r"сколько\s+(?:ушло|отправлено)|рассылк\w*\s+(?:ушл|отправил|сработал)|"
    r"почему\s+рассылк\w*\s+не\s+(?:ушл|отправил|сработал))",
    re.IGNORECASE,
)


def _owner_pending_job_key(chat_id: int) -> str:
    return f"owner_chat_pending_job:{int(chat_id)}"


def _clear_pending_owner_job(chat_id: int) -> None:
    try:
        database.set_setting(_owner_pending_job_key(chat_id), "")
    except Exception:
        pass


def _remember_pending_owner_job(chat_id: int, job: str) -> None:
    if job not in _PANEL_JOBS:
        return
    try:
        database.set_setting(_owner_pending_job_key(chat_id), _json.dumps({
            "job": job,
            "created_at": time.time(),
        }))
    except Exception:
        pass


def _pending_owner_job_decision(chat_id: int, message: str, mode: str) -> tuple[str | None, str | None]:
    """Resolve a short natural reply only against a recent server-side action card."""
    if mode != "staff":
        return None, None
    is_confirm = bool(_OWNER_JOB_CONFIRM_RE.fullmatch(message or ""))
    is_cancel = bool(_OWNER_JOB_CANCEL_RE.fullmatch(message or ""))
    if not is_confirm and not is_cancel:
        return None, None
    try:
        payload = _json.loads(database.get_setting(_owner_pending_job_key(chat_id)) or "{}")
    except Exception:
        payload = {}
    job = str(payload.get("job") or "").strip().lower()
    try:
        age = time.time() - float(payload.get("created_at") or 0)
    except (TypeError, ValueError):
        age = _OWNER_JOB_APPROVAL_TTL_SECONDS + 1
    if job not in _PANEL_JOBS or age < 0 or age > _OWNER_JOB_APPROVAL_TTL_SECONDS:
        _clear_pending_owner_job(chat_id)
        return None, None
    _clear_pending_owner_job(chat_id)
    return ("confirm" if is_confirm else "cancel"), job


def _known_owner_job_audience(job: str) -> int | None:
    """Return a recent authoritative audience count without scanning or sending."""
    try:
        if job == "cycle":
            snapshot = cycle_reminder.load_candidate_snapshot() or {}
            generated = str(snapshot.get("generated_at") or "")
            generated_at = datetime.fromisoformat(generated[:19])
            if datetime.now() - generated_at > timedelta(hours=2):
                return None
            summary = snapshot.get("summary") or {}
            return max(0, int(summary.get("pending") or 0))
        if job == "reactivation":
            raw = database.get_setting("reactivation_last")
            payload = _json.loads(raw) if raw else {}
            if str(payload.get("at") or "") != date.today().isoformat():
                return None
            return max(0, int(payload.get("count") or 0))
    except Exception as exc:
        logger.warning("owner job audience %s: %s", job, exc)
    return None


def _owner_job_no_audience_reply() -> str:
    return (
        "Проверила актуальную аудиторию: сейчас нет клиентов, которые одновременно "
        "подходят под условия возврата и разрешили маркетинговые сообщения. "
        "Поэтому никому ничего не отправила."
    )


def _owner_job_action_card(signal: dict, chat_id: int) -> tuple[dict | None, str | None]:
    job = str((signal or {}).get("job") or "").strip().lower()
    if job not in _PANEL_JOBS:
        return None, "Не нашла такую задачу."
    if job in ("cycle", "reactivation") and _known_owner_job_audience(job) == 0:
        _clear_pending_owner_job(chat_id)
        return None, _owner_job_no_audience_reply()
    action = {
        "type": "run_job",
        "job": job,
        "label": signal.get("label") or "Запустить рассылку",
        "confirm": "__runjob:" + job,
    }
    for key in ("title", "problem", "reason", "potential_rub", "client_message", "priority"):
        if signal.get(key) is not None:
            action[key] = signal.get(key)
    _remember_pending_owner_job(chat_id, job)
    return action, None


def _owner_job_result_reply(job: str, label: str, summary: dict | None) -> str:
    summary = summary if isinstance(summary, dict) else {}
    sent_raw = summary.get("sent")
    candidates_raw = summary.get("candidates")
    try:
        sent = int(sent_raw) if sent_raw is not None else None
    except (TypeError, ValueError):
        sent = None
    try:
        candidates = int(candidates_raw) if candidates_raw is not None else None
    except (TypeError, ValueError):
        candidates = None
    if job in _OWNER_CLIENT_MESSAGE_JOBS and candidates == 0:
        return _owner_job_no_audience_reply()
    if sent is not None and sent > 0:
        return f"Готово. Отправила сообщения: {sent}."
    if job in _OWNER_CLIENT_MESSAGE_JOBS and sent == 0:
        skipped = int(summary.get("skipped") or 0)
        blocked = int(summary.get("blocked") or 0)
        errors = int(summary.get("errors") or 0)
        details = []
        if skipped:
            details.append(f"пропущено по настройкам или тихим часам: {skipped}")
        if blocked:
            details.append(f"недоступных адресатов: {blocked}")
        if errors:
            details.append(f"ошибок доставки: {errors}")
        suffix = " " + "; ".join(details) + "." if details else ""
        return f"Проверила аудиторию, но ни одного сообщения не отправила.{suffix}"
    if job in _OWNER_CLIENT_MESSAGE_JOBS:
        return (
            "Задача завершилась, но сервер не вернул подтверждённое число отправок. "
            "Не буду утверждать, что сообщения доставлены; проверьте журнал действий."
        )
    return f"Готово. Выполнила «{label}»."


def _owner_job_status_reply(chat_id: int, message: str, mode: str) -> str | None:
    if mode != "staff" or not _OWNER_JOB_STATUS_RE.search(message or ""):
        return None
    if (_panel_resolve_role(chat_id) or {}).get("role") != "owner":
        return None
    actions = database.list_owner_actions(limit=20) or []
    action = next(
        (row for row in actions if str(row.get("job") or "") in _OWNER_CLIENT_MESSAGE_JOBS),
        None,
    )
    if not action:
        return "В журнале пока нет запущенных клиентских рассылок."
    status = str(action.get("status") or "")
    if status == "running":
        return "Рассылка ещё выполняется. Скажу точное число после завершения."
    if status == "failed":
        return "Рассылка не выполнилась. Ошибка зафиксирована в журнале; клиентам не буду говорить, что она ушла."
    label = str(action.get("title") or _PANEL_JOBS.get(action.get("job"), (None, None, "Рассылка", None))[2])
    return _owner_job_result_reply(str(action.get("job") or ""), label, action.get("summary"))


def _owner_job_chat_response(chat_id: int, user_text: str, reply: str) -> web.Response:
    from memory import load_conversations, save_conversations
    conversations = load_conversations()
    history_key = _chat_history_key(chat_id, "staff")
    history, _ = _ensure_chat_history_ids(list(conversations.get(history_key) or []))
    try:
        safe_user_text = anonymizer.redact_pii(user_text or "")
    except Exception:
        safe_user_text = user_text or ""
    history.append(_user_history_item(safe_user_text))
    reply = enforce_maya_feminine(reply)
    history.append(_assistant_history_item(reply))
    conversations[history_key] = history
    save_conversations(conversations)
    return _cabinet_response(_with_chat_turn_ids({
        "reply": reply,
        "contact_request": False,
        "transcript": "",
    }, history))


async def panel_job_run_handler(request: web.Request) -> web.Response:
    """POST /api/panel/job/run — ручной запуск фоновой задачи (owner/manager)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"permissions": {}}
    if not info.get("permissions", {}).get("jobs"):
        return _cabinet_response({"error": "forbidden", "message": "Недостаточно прав."}, status=403)

    job = str(body.get("job") or "")
    spec = _PANEL_JOBS.get(job)
    if not spec:
        return _cabinet_response({"ok": False, "reason": "Неизвестная задача."}, status=400)
    mod_name, fn_name, label, kind = spec
    dedupe_key = f"panel_job_last:{int(tg_id) if tg_id else 0}:{job}"
    try:
        last = float(database.get_setting(dedupe_key) or 0)
    except Exception:
        last = 0.0
    now = time.time()
    if last and now - last < 60:
        return _cabinet_response({
            "ok": False,
            "duplicate": True,
            "job": job,
            "label": label,
            "cooldown_seconds_left": int(max(1, 60 - (now - last))),
            "reason": f"«{label}» уже запускалась меньше минуты назад. Подождите, чтобы не отправить дубли.",
        })
    try:
        mod = __import__(mod_name)
        fn = getattr(mod, fn_name)
    except Exception as e:
        logger.error(f"panel job import {job}: {e}")
        return _cabinet_response({"ok": False, "reason": "Задача недоступна."}, status=500)
    try:
        database.set_setting(dedupe_key, str(now))
    except Exception:
        pass

    action_id = None
    source_control_id = 0
    source_signal_key = ""
    try:
        journal_payload = {"label": label, "kind": kind}
        try:
            source_control_id = int(body.get("source_control_id") or 0)
        except Exception:
            source_control_id = 0
        if source_control_id:
            journal_payload["source_control_id"] = source_control_id
        source_signal_key = str(body.get("source_signal_key") or "").strip()[:180]
        if source_signal_key:
            journal_payload["source_signal_key"] = source_signal_key
        action_id = database.create_owner_action(
            job,
            title=str(body.get("title") or label),
            source=str(body.get("source") or "panel_jobs"),
            created_by=int(tg_id) if tg_id else None,
            payload=journal_payload,
        )
        if action_id and source_control_id:
            database.link_owner_control_task_action(
                source_control_id,
                action_id,
                job,
                action_status="running",
                note="Действие запущено из очереди контроля.",
            )
    except Exception as e:
        logger.warning(f"panel job journal create {job}: {e}")

    app = request.app["bot_app"]
    task = asyncio.create_task(fn(app))
    _panel_bg_tasks.add(task)
    task.add_done_callback(_panel_bg_tasks.discard)

    def _finish_journal(t: asyncio.Task) -> None:
        if not action_id:
            return
        try:
            summary = t.result()
            database.finish_owner_action(
                action_id,
                "done",
                summary=summary if isinstance(summary, dict) else {},
            )
        except Exception as e:
            database.finish_owner_action(action_id, "failed", error=str(e)[:200])

    task.add_done_callback(_finish_journal)

    # Быстрые задачи вернут результат сразу; долгие (массовые отправки) продолжат в фоне.
    try:
        summary = await asyncio.wait_for(asyncio.shield(task), timeout=12)
        return _cabinet_response({"ok": True, "done": True, "job": job, "label": label,
                                  "action_id": action_id,
                                  "summary": summary if isinstance(summary, dict) else {}})
    except asyncio.TimeoutError:
        return _cabinet_response({"ok": True, "started": True, "running": True,
                                  "job": job, "label": label, "action_id": action_id})
    except Exception as e:
        logger.error(f"panel job run {job}: {e}")
        if action_id:
            database.finish_owner_action(action_id, "failed", error=str(e)[:200])
        return _cabinet_response({"ok": False, "job": job, "reason": "Ошибка при выполнении."}, status=500)


async def _run_owner_job_from_chat(request: web.Request, chat_id: int, job: str) -> web.Response:
    """Запуск салонной задачи по подтверждению из чата AI-директора (нажата кнопка
    карточки → фронт прислал __runjob:<job>). Детерминированно, БЕЗ LLM. Только
    владелец/founder; те же задачи и исполнитель, что в /api/panel/job/run."""
    job = (job or "").strip().lower()
    _clear_pending_owner_job(chat_id)
    spec = _PANEL_JOBS.get(job)
    info = _panel_resolve_role(int(chat_id)) if chat_id else {"permissions": {}}
    role = info.get("role") or ""

    def audit(allowed: bool, reason: str = "") -> None:
        try:
            database.log_tool_call(chat_id, role, f"run_job:{job or '?'}", "write", allowed, reason)
        except Exception:
            pass

    if not spec:
        audit(False, "unknown_job")
        return _owner_job_chat_response(
            chat_id, job, "Не нашла такую задачу. Откройте Панель и запустите вручную."
        )
    if role != "owner":
        audit(False, "owner_only")
        return _owner_job_chat_response(
            chat_id, job, "Эта задача доступна только владельцу."
        )
    mod_name, fn_name, label, _kind = spec
    # Защита от двойного тапа/повторной отправки action-card: тот же job не
    # запускается повторно из чата чаще одного раза в минуту.
    dedupe_key = f"owner_chat_job_last:{int(chat_id)}:{job}"
    try:
        last = float(database.get_setting(dedupe_key) or 0)
    except Exception:
        last = 0.0
    now = time.time()
    if last and now - last < 60:
        audit(False, "duplicate_60s")
        return _owner_job_chat_response(
            chat_id,
            label,
            f"«{label}» уже запущена. Дайте ей минуту, чтобы не отправить дубли.",
        )
    try:
        database.set_setting(dedupe_key, str(now))
    except Exception:
        pass
    action_id = None
    try:
        mod = __import__(mod_name)
        fn = getattr(mod, fn_name)
        app = request.app["bot_app"]
        try:
            action_id = database.create_owner_action(
                job,
                title=label,
                source="chat_action_card",
                created_by=int(chat_id) if chat_id else None,
                payload={"label": label},
            )
        except Exception as e:
            logger.warning(f"chat run_job journal create {job}: {e}")
        task = asyncio.create_task(fn(app))
        _panel_bg_tasks.add(task)
        task.add_done_callback(_panel_bg_tasks.discard)

        def _finish_chat_journal(t: asyncio.Task) -> None:
            if not action_id:
                return
            try:
                summary = t.result()
                database.finish_owner_action(
                    action_id,
                    "done",
                    summary=summary if isinstance(summary, dict) else {},
                )
            except Exception as exc:
                database.finish_owner_action(action_id, "failed", error=str(exc)[:200])

        task.add_done_callback(_finish_chat_journal)
        audit(True, "started")
        try:
            summary = await asyncio.wait_for(asyncio.shield(task), timeout=12)
            reply = _owner_job_result_reply(job, label, summary)
        except asyncio.TimeoutError:
            reply = (
                f"Запустила «{label}». Задача ещё выполняется; "
                "точное число отправок будет в журнале после завершения."
            )
    except Exception as e:
        logger.error(f"chat run_job {job}: {e}")
        audit(False, "run_error")
        try:
            if action_id:
                database.finish_owner_action(action_id, "failed", error=str(e)[:200])
        except Exception:
            pass
        reply = "Не получилось запустить задачу — попробуйте из Панели."
    return _owner_job_chat_response(chat_id, label, reply)


async def panel_reviews_handler(request: web.Request) -> web.Response:
    """POST /api/panel/reviews — сводка + последние отзывы (owner/manager)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"permissions": {}}
    if not info.get("permissions", {}).get("reviews"):
        return _cabinet_response({"error": "forbidden", "message": "Недостаточно прав."}, status=403)
    try:
        days = int(body.get("days") or 90)
    except Exception:
        days = 90
    if days not in (30, 90, 365):
        days = 90
    try:
        summary = database.review_stats(days)
        items = database.list_recent_reviews(40, max(days, 90))
    except Exception as e:
        logger.error(f"panel reviews: {e}")
        return _cabinet_response({"error": "server_error"}, status=500)
    names = {}
    try:
        for m in database.list_masters():
            names[m.get("yclients_staff_id")] = m.get("full_name") or ""
    except Exception:
        names = {}
    out = []
    for it in items:
        out.append({
            "rating": it.get("rating"),
            "comment": (it.get("comment") or "").strip(),
            "date": (it.get("responded_at") or it.get("visit_closed_at") or "")[:10],
            "master": names.get(it.get("staff_id"), ""),
        })
    try:
        external = await asyncio.to_thread(reputation.reputation_snapshot, force_refresh=False)
    except Exception as e:
        logger.error(f"panel external reputation: {e}")
        external = {"status": "warn", "summary": {}, "sources": [], "text_analysis": {}}
    return _cabinet_response({
        "days": days,
        "summary": summary,
        "items": out,
        "external_reputation": external,
    })


async def panel_external_reviews_import_handler(request: web.Request) -> web.Response:
    """Owner-only разрешённый импорт отзывов/снимка рейтинга с карт."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") != "owner":
        return _cabinet_response({
            "error": "forbidden",
            "message": "Импорт внешних отзывов доступен только владельцу.",
        }, status=403)
    source = str(body.get("source") or "").strip().lower()
    imported = await asyncio.to_thread(
        reputation.import_reviews,
        source,
        body.get("reviews") or [],
    )
    if not imported.get("ok"):
        return _cabinet_response(imported, status=400)
    source_snapshot = None
    if body.get("rating") is not None or body.get("reviews_count") is not None:
        source_snapshot = await asyncio.to_thread(
            reputation.save_source_snapshot,
            source,
            rating=body.get("rating"),
            reviews_count=body.get("reviews_count"),
            observed_at=body.get("observed_at") or "",
            origin="owner_authorized_import",
        )
    snapshot = await asyncio.to_thread(reputation.reputation_snapshot, force_refresh=False)
    return _cabinet_response({
        "ok": True,
        "import": imported,
        "source_snapshot": source_snapshot,
        "reputation": snapshot,
    })


async def panel_reputation_refresh_handler(request: web.Request) -> web.Response:
    """Owner-only обновление официальной статистики подключённых площадок."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") != "owner":
        return _cabinet_response({"error": "forbidden"}, status=403)
    public_refresh = await asyncio.to_thread(reputation.refresh_public_reviews)
    pending = await asyncio.to_thread(database.list_unalerted_external_reviews, 20)
    notification = {"delivered": False, "count": 0}
    if pending:
        notification = await _notify_owner_reputation(request.app["bot_app"], pending)
        if notification.get("delivered"):
            await asyncio.to_thread(
                database.mark_external_reviews_alerted,
                [row.get("id") for row in pending if row.get("id")],
            )
    snapshot = await asyncio.to_thread(reputation.reputation_snapshot, force_refresh=True)
    return _cabinet_response({
        "ok": True,
        "public_refresh": public_refresh,
        "notification": notification,
        "reputation": snapshot,
    })


async def broadcast_send_to_base(bot, text: str) -> dict:
    """Единый цикл рассылки по клиентам с маркетинговым согласием (152-ФЗ + ст.18
    Закона о рекламе). Источник истины и для бота (/broadcast), и для панели.
    Антиспам: ~30 сообщений/сек. {name} подставляется, если есть в тексте."""
    from telegram.error import Forbidden, BadRequest
    import broadcast_templates as _bt
    sent = blocked = errors = skipped_no_consent = skipped_opt_out = skipped_too_soon = 0
    has_placeholder = "{name}" in (text or "")
    for c in database.list_telegram_clients():
        chat_id = c.get("telegram_chat_id")
        if not chat_id:
            continue
        if not database.has_marketing_consent(c["id"]):
            skipped_no_consent += 1
            continue
        # Персональные настройки клиента: (1) явный opt-out от акций; (2) частотный
        # троттл — но ТОЛЬКО для тех, кто сам выбрал частоту в настройках, иначе
        # дефолтный недельный кап молча резал бы рассылку всей ненастроенной базе.
        _prefs = database.get_notify_prefs(c["id"])
        if _prefs.get("marketing") is False:
            skipped_opt_out += 1
            continue
        if database.has_saved_notify_prefs(c["id"]):
            _min_days = database.MARKETING_FREQ_DAYS.get(_prefs.get("marketing_freq", "week"), 7)
            if database.marketing_sent_within(c["id"], _min_days):
                skipped_too_soon += 1
                continue
        personalized = _bt.render(text, client_name=c.get("name")) if has_placeholder else text
        push_body = _push_preview_body(personalized) or "Откройте MAYA — внутри новое сообщение."
        try:
            await bot.send_message(chat_id, personalized, parse_mode="Markdown")
            sent += 1
            database.set_marketing_last_sent(c["id"])
            await asyncio.sleep(0.035)
        except Forbidden:
            blocked += 1
        except BadRequest:
            try:
                await bot.send_message(chat_id, personalized)
                sent += 1
                database.set_marketing_last_sent(c["id"])
                await asyncio.sleep(0.035)
            except Exception:
                errors += 1
        except Exception as e:
            errors += 1
            logger.error(f"broadcast → {chat_id}: {e}")
        try:
            await _send_client_push(
                int(chat_id),
                title="Сообщение от MAYA",
                body=push_body,
                url="/app/",
                tag="marketing-broadcast",
                data={"event": "marketing.broadcast"},
                persist_in_chat=True,
                chat_text=personalized,
            )
        except Exception as e:
            logger.error(f"broadcast push/chat → {chat_id}: {e}")
    return {"sent": sent, "blocked": blocked, "errors": errors,
            "skipped_no_consent": skipped_no_consent,
            "skipped_opt_out": skipped_opt_out, "skipped_too_soon": skipped_too_soon}


def _panel_broadcast_recipients():
    """Сколько клиентов получит рассылку (с согласием) и сколько всего с Telegram."""
    total = consented = 0
    try:
        for c in database.list_telegram_clients():
            if not c.get("telegram_chat_id"):
                continue
            total += 1
            if database.has_marketing_consent(c["id"]):
                consented += 1
    except Exception as e:
        logger.error(f"panel broadcast recipients: {e}")
    return consented, total


async def panel_broadcast_handler(request: web.Request) -> web.Response:
    """POST /api/panel/broadcast — конструктор рассылки (owner/manager, право marketing).
    body: {mode:'templates'|'preview'|'send', text?, code?}."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"permissions": {}}
    if not info.get("permissions", {}).get("marketing"):
        return _cabinet_response({"error": "forbidden", "message": "Недостаточно прав."}, status=403)

    import broadcast_templates as _bt
    mode = str(body.get("mode") or "preview")

    if mode == "templates":
        cats = [{"code": code, "label": label} for code, label in _bt.CATEGORIES]
        tpls = [{"code": t["code"], "category": t["category"], "title": t["title"],
                 "emoji": t.get("emoji", ""), "body": t["body"]} for t in _bt.TEMPLATES]
        return _cabinet_response({"categories": cats, "templates": tpls})

    text = str(body.get("text") or "").strip()
    if not text and body.get("code"):
        for t in _bt.TEMPLATES:
            if t["code"] == body["code"]:
                text = t["body"]
                break
    if not text:
        return _cabinet_response({"ok": False, "reason": "Пустой текст рассылки."}, status=400)

    consented, total = _panel_broadcast_recipients()

    if mode == "preview":
        return _cabinet_response({"ok": True, "text": text, "recipients": consented,
                                  "total": total, "excluded": total - consented})

    if mode == "send":
        if consented <= 0:
            return _cabinet_response({"ok": False, "reason": "Нет получателей с согласием на рассылку."})
        app = request.app["bot_app"]
        task = asyncio.create_task(broadcast_send_to_base(app.bot, text))
        _panel_bg_tasks.add(task)
        task.add_done_callback(_panel_bg_tasks.discard)
        try:
            summary = await asyncio.wait_for(asyncio.shield(task), timeout=12)
            return _cabinet_response({"ok": True, "done": True, "recipients": consented,
                                      "summary": summary if isinstance(summary, dict) else {}})
        except asyncio.TimeoutError:
            return _cabinet_response({"ok": True, "started": True, "running": True,
                                      "recipients": consented})
        except Exception as e:
            logger.error(f"panel broadcast send: {e}")
            return _cabinet_response({"ok": False, "reason": "Ошибка при отправке."}, status=500)

    return _cabinet_response({"ok": False, "reason": "Неизвестный режим."}, status=400)


def _panel_record_seen(tg_id: int, name: str) -> None:
    """Запоминает, кто открывал панель/приложение (для выбора управляющего). Последние 30."""
    try:
        raw = database.get_setting("panel_seen") or "[]"
        try:
            lst = _json.loads(raw)
            if not isinstance(lst, list):
                lst = []
        except Exception:
            lst = []
        lst = [x for x in lst if isinstance(x, dict) and x.get("id") != tg_id]
        lst.insert(0, {"id": int(tg_id), "name": (name or "")[:40]})
        database.set_setting("panel_seen", _json.dumps(lst[:30], ensure_ascii=False))
    except Exception as e:
        logger.error(f"panel seen: {e}")


def _panel_get_seen() -> list:
    try:
        lst = _json.loads(database.get_setting("panel_seen") or "[]")
        return [x for x in lst if isinstance(x, dict) and x.get("id")]
    except Exception:
        return []


def _panel_get_manager_ids() -> list:
    ids = []
    try:
        raw = database.get_setting("panel_manager_ids") or ""
        for x in raw.replace(" ", "").split(","):
            x = x.strip()
            if x.lstrip("-").isdigit():
                v = int(x)
                if v not in ids:
                    ids.append(v)
    except Exception:
        pass
    return ids


def _panel_set_manager_ids(ids: list) -> None:
    uniq = []
    for i in ids:
        if i not in uniq:
            uniq.append(i)
    database.set_setting("panel_manager_ids", ",".join(str(i) for i in uniq))


async def panel_team_handler(request: web.Request) -> web.Response:
    """POST /api/panel/team — мастера: ростер, bind-коды, роль кассира (owner)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"permissions": {}}
    if not info.get("permissions", {}).get("staff"):
        return _cabinet_response({"error": "forbidden", "message": "Недостаточно прав."}, status=403)

    mode = str(body.get("mode") or "list")

    if mode == "list":
        try:
            roster = _yc.get_masters() or []
        except Exception:
            roster = []
        mt = {}
        try:
            for m in database.list_masters():
                mt[m.get("yclients_staff_id")] = m
        except Exception:
            mt = {}
        out = []
        for r in roster:
            if not isinstance(r, dict) or r.get("error"):
                continue
            sid = r.get("id")
            row = mt.get(sid)
            bound = bool(row and row.get("telegram_chat_id"))
            out.append({
                "staff_id": sid,
                "name": r.get("name", ""),
                "specialization": r.get("specialization", ""),
                "registered": bool(row),
                "bound": bound,
                "code": (row.get("bind_code") if (row and not bound) else None),
                "cashier": bool(row and row.get("can_redeem")),
            })
        return _cabinet_response({"masters": out})

    if mode == "bind_code":
        try:
            sid = int(body.get("staff_id") or 0)
        except Exception:
            sid = 0
        name = str(body.get("name") or "").strip() or f"staff_{sid}"
        if not sid:
            return _cabinet_response({"ok": False, "reason": "Не указан мастер."}, status=400)
        try:
            if bool(body.get("reset")):
                code = database.reset_master_bind_code(sid, name)
            else:
                code = database.create_master_with_bind_code(sid, name)
        except Exception as e:
            logger.error(f"panel team bind_code: {e}")
            return _cabinet_response({"ok": False, "reason": "Ошибка генерации кода."}, status=500)
        if code is None:
            return _cabinet_response({"ok": False, "reason": "Мастер уже привязан. Нажмите «Новый код», чтобы сбросить привязку."})
        return _cabinet_response({"ok": True, "code": code})

    if mode == "cashier":
        try:
            sid = int(body.get("staff_id") or 0)
        except Exception:
            sid = 0
        on = bool(body.get("on"))
        if not sid:
            return _cabinet_response({"ok": False, "reason": "Не указан мастер."}, status=400)
        ok = database.set_cashier_role(sid, on)
        if not ok:
            return _cabinet_response({"ok": False, "reason": "Сначала выдайте мастеру код — после этого он появится в системе."})
        return _cabinet_response({"ok": True, "cashier": on})

    return _cabinet_response({"ok": False, "reason": "Неизвестный режим."}, status=400)


async def panel_managers_handler(request: web.Request) -> web.Response:
    """POST /api/panel/managers — назначение управляющих (owner, право roles)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"permissions": {}}
    if not info.get("permissions", {}).get("roles"):
        return _cabinet_response({"error": "forbidden", "message": "Недостаточно прав."}, status=403)

    mode = str(body.get("mode") or "list")

    if mode == "list":
        out = []
        for i in _panel_get_manager_ids():
            name = ""
            try:
                m = database.get_master_by_chat_id(i)
                if m:
                    name = m.get("full_name") or ""
            except Exception:
                pass
            out.append({"id": i, "name": name})
        return _cabinet_response({"managers": out})

    if mode == "add":
        try:
            new_id = int(body.get("tg_id"))
        except Exception:
            return _cabinet_response({"ok": False, "reason": "Введите числовой Telegram ID."}, status=400)
        if database.is_admin(new_id):
            return _cabinet_response({"ok": False, "reason": "Это владелец — у него уже полный доступ."})
        ids = _panel_get_manager_ids()
        if new_id not in ids:
            ids.append(new_id)
        _panel_set_manager_ids(ids)
        return _cabinet_response({"ok": True})

    if mode == "remove":
        try:
            rid = int(body.get("tg_id"))
        except Exception:
            return _cabinet_response({"ok": False, "reason": "Некорректный ID."}, status=400)
        _panel_set_manager_ids([i for i in _panel_get_manager_ids() if i != rid])
        return _cabinet_response({"ok": True})

    if mode == "recent":
        # Недавно заходившие — кандидаты в управляющие (исключаем владельцев, текущих управляющих, мастеров)
        mgr_ids = set(_panel_get_manager_ids())
        out = []
        for s in _panel_get_seen():
            sid = s.get("id")
            if not sid or sid in mgr_ids:
                continue
            try:
                if database.is_admin(int(sid)):
                    continue
            except Exception:
                pass
            is_m = False
            try:
                is_m = bool(database.get_master_by_chat_id(int(sid)))
            except Exception:
                pass
            out.append({"id": sid, "name": s.get("name", ""), "is_master": is_m})
        return _cabinet_response({"recent": out[:20]})

    return _cabinet_response({"ok": False, "reason": "Неизвестный режим."}, status=400)


async def panel_masters_stats_handler(request: web.Request) -> web.Response:
    """POST /api/panel/masters_stats — выручка/визиты/рейтинг по каждому мастеру (analytics)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"permissions": {}}
    if not info.get("permissions", {}).get("analytics"):
        return _cabinet_response({"error": "forbidden", "message": "Недостаточно прав."}, status=403)
    pp = _panel_period(body)
    start, end = pp["start"], pp["end"]   # то же окно, что и в salon_stats
    try:
        ratings = database.reviews_by_master(90)
    except Exception:
        ratings = {}
    # Выручка по мастеру = сумма ПРОДАЖ услуг из касс (как в YClients), привязанных
    # к мастеру через record_id записи. Это совпадает со строкой «Услуги» салонной
    # выручки до рубля (проверено), т.к. источник один — финансовые операции.
    try:
        txs = _yc.get_company_transactions(start, end)
    except Exception as e:
        logger.error(f"masters_stats tx: {e}")
        txs = []
    try:
        recs = _yc.get_company_records(start, end)
    except Exception:
        recs = []
    rec_staff = {}        # record_id -> staff_id
    visits_by_staff = {}  # staff_id -> кол-во визитов (пришёл)
    for r in recs:
        if not isinstance(r, dict):
            continue
        rid, sid = r.get("id"), r.get("staff_id")
        if rid is not None and sid is not None:
            rec_staff[rid] = sid
        if (not _is_gift_cert_record(r)) and (r.get("attendance") == 1 or r.get("visit_attendance") == 1):
            if sid is not None:
                visits_by_staff[sid] = visits_by_staff.get(sid, 0) + 1
    rev_by_staff = {}
    for t in txs:
        if not isinstance(t, dict) or t.get("sold_item_type") != "service":
            continue
        try:
            a = float(t.get("amount") or 0)
        except Exception:
            a = 0.0
        if a <= 0:
            continue
        sid = None
        m = t.get("master")
        if isinstance(m, dict) and m.get("id"):
            sid = m.get("id")
        if sid is None:
            sid = rec_staff.get(t.get("record_id"))
        if sid is None:
            continue
        rev_by_staff[sid] = rev_by_staff.get(sid, 0.0) + a
    try:
        roster = _yc.get_masters() or []
    except Exception:
        roster = []
    names = {}
    for m in roster:
        if isinstance(m, dict) and not m.get("error") and m.get("id") is not None:
            names[m.get("id")] = m.get("name", "")
    staff_ids = set(names.keys()) | set(rev_by_staff.keys()) | set(visits_by_staff.keys())
    out = []
    for sid in staff_ids:
        rt = ratings.get(sid) or {}
        out.append({
            "staff_id": sid,
            "name": names.get(sid) or f"Мастер #{sid}",
            "visits": int(visits_by_staff.get(sid, 0)),
            "revenue": round(rev_by_staff.get(sid, 0.0)),
            "avg_rating": rt.get("avg"),
            "reviews": rt.get("n", 0),
        })
    out.sort(key=lambda x: x["revenue"], reverse=True)
    return _cabinet_response({"period": pp["period"], "period_label": pp["label"],
                              "from": start, "to": end, "masters": out})


# ════════════════════════════════════════════════════════════════════════════
#  Зарплата мастеров (владелец/админ)
# ════════════════════════════════════════════════════════════════════════════
# Доля мастера от его валовой выручки ПО УСЛУГАМ. Илья — 60%, остальные — 50%.
# Стас (владелец) — показываем 100% (оставляет всё себе). staff_id из YClients.
MASTER_SALARY_PCT = {1460233: 0.60}   # Илья Третьяков — 60%
MASTER_SALARY_DEFAULT = 0.50
OWNER_STAFF_ID = 1461615              # Стас — владелец

# ── Антон (администратор): фикс по дням недели ──────────────────────────────
# Вс и Пн — выходной, платим 1000₽. Вт–Сб — ставка 1500₽ + 5% от валовой
# выручки салона за день. (weekday(): Пн=0 … Вс=6.)
# Telegram-id ассистента Антона: только ему бот шлёт напоминания о расходах,
# и только он (помимо владельца) видит аналитику/отчёт. Переопределяется настройкой.
def _anton_chat_id() -> int:
    try:
        v = database.get_setting("anton_chat_id")
        if v and str(v).lstrip("-").isdigit():
            return int(v)
    except Exception:
        pass
    return 339683535
ANTON_CHAT_ID = _anton_chat_id()
# Дополнительные расходы — учитываем КАЖДЫЙ день (включая выходные Антона).
DAILY_EXTRA_EXPENSES = [
    {"label": "Доп. расход 1", "amount": 1800},
    {"label": "Доп. расход 2", "amount": 600},
]

_SALARY_YEAR_CACHE = {"date": None, "rev": {}}   # {staff_id: выручка за год}, кеш на день


def _revenue_by_master(start: str, end: str) -> dict:
    """Выручка по услугам по каждому мастеру за [start, end] (YYYY-MM-DD, вкл.).
    Источник — финоперации YClients (sold_item_type='service'); привязка к мастеру
    по master.id, иначе record_id→staff_id. Совпадает со строкой «Услуги»."""
    try:
        txs = _yc.get_company_transactions(start, end)
    except Exception as e:
        logger.error(f"_revenue_by_master tx: {e}")
        txs = []
    try:
        recs = _yc.get_company_records(start, end)
    except Exception:
        recs = []
    rec_staff = {}
    for r in recs:
        if isinstance(r, dict):
            rid, sid = r.get("id"), r.get("staff_id")
            if rid is not None and sid is not None:
                rec_staff[rid] = sid
    rev = {}
    for t in txs:
        if not isinstance(t, dict) or t.get("sold_item_type") != "service":
            continue
        try:
            a = float(t.get("amount") or 0)
        except Exception:
            a = 0.0
        if a <= 0:
            continue
        sid = None
        m = t.get("master")
        if isinstance(m, dict) and m.get("id"):
            sid = m.get("id")
        if sid is None:
            sid = rec_staff.get(t.get("record_id"))
        if sid is None:
            continue
        rev[sid] = rev.get(sid, 0.0) + a
    return rev


def _pay_week() -> dict:
    """Расчётная неделя ЗП: Чт→Ср включительно, выплата в следующий четверг.
    {start, end, pay_date} в YYYY-MM-DD."""
    today = date.today()
    days_since_thu = (today.weekday() - 3) % 7    # Пн=0…Чт=3 — дней назад был четверг
    start = today - timedelta(days=days_since_thu)
    end = start + timedelta(days=6)
    return {"start": start.isoformat(), "end": end.isoformat(),
            "pay_date": (end + timedelta(days=1)).isoformat()}


def _anton_payroll(from_iso: str, to_iso: str) -> dict:
    """Подтверждённые начисления Антона из взаиморасчётов YClients.

    При сбое не используем календарный прогноз: финансовый отчёт должен явно
    показать отсутствие данных, а не правдоподобную, но неверную сумму.
    """
    try:
        payroll = _yc.get_staff_payroll_summary(ANTON_STAFF_ID, from_iso, to_iso)
    except Exception as exc:
        logger.error("anton payroll %s..%s: %s", from_iso, to_iso, exc)
        payroll = None
    return anton_salary_for_period(from_iso, to_iso, payroll)


async def _yearly_gross_refresh():
    """Фоном пересчитывает валовую по мастерам за год (с 1 янв). Кеш на день."""
    today = date.today()
    try:
        rev = await asyncio.to_thread(_revenue_by_master,
                                      today.replace(month=1, day=1).isoformat(), today.isoformat())
        _SALARY_YEAR_CACHE["rev"] = rev
        _SALARY_YEAR_CACHE["date"] = today.isoformat()
        logger.info("Годовая валовая по мастерам пересчитана (%d мастеров)", len(rev))
    except Exception as e:
        logger.error(f"yearly gross refresh: {e}")


async def panel_salary_handler(request: web.Request) -> web.Response:
    """POST /api/panel/salary — окно зарплат: расчётная неделя Чт→Ср по каждому
    мастеру (валовая × доля) + валовая за год (кеш, обновляется фоном раз в день)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"permissions": {}}
    if not info.get("permissions", {}).get("analytics"):
        return _cabinet_response({"error": "forbidden", "message": "Недостаточно прав."}, status=403)

    pw = _pay_week()
    # Транзакций в будущем нет — запрашиваем по сегодня (валовая «неделя к текущему дню»).
    week_end_q = min(pw["end"], date.today().isoformat())
    try:
        rev_week = await asyncio.to_thread(_revenue_by_master, pw["start"], week_end_q)
    except Exception as e:
        logger.error(f"salary week revenue: {e}")
        rev_week = {}
    try:
        roster = _yc.get_masters() or []
    except Exception:
        roster = []
    names = {m.get("id"): m.get("name", "") for m in roster
             if isinstance(m, dict) and not m.get("error") and m.get("id") is not None}

    # Годовая валовая — из кеша; если кеш не за сегодня, запускаем фоновый пересчёт.
    today_str = date.today().isoformat()
    year_ready = _SALARY_YEAR_CACHE.get("date") == today_str
    yearly = _SALARY_YEAR_CACHE.get("rev", {}) if year_ready else {}
    if not year_ready:
        asyncio.create_task(_yearly_gross_refresh())

    staff_ids = set(names) | set(rev_week)
    rows = []
    for sid in staff_ids:
        gross = round(rev_week.get(sid, 0.0))
        is_owner = (sid == OWNER_STAFF_ID)
        pct = 1.0 if is_owner else MASTER_SALARY_PCT.get(sid, MASTER_SALARY_DEFAULT)
        rows.append({
            "staff_id": sid,
            "name": names.get(sid) or f"Мастер #{sid}",
            "gross_week": gross,
            "percent": int(round(pct * 100)),
            "salary_week": round(gross * pct),
            "is_owner": is_owner,
            "gross_year": round(yearly.get(sid, 0)) if year_ready else None,
        })
    rows.sort(key=lambda x: (x["gross_year"] or 0, x["salary_week"]), reverse=True)
    note = ""
    if not rev_week:
        note = ("Финансовые данные YClients недоступны — вероятно, истекла лицензия "
                "филиала (нужно продлить в YClients). Зарплаты появятся, как только доступ вернётся.")
    return _cabinet_response({
        "pay_week": pw,
        "year_ready": year_ready,
        "year_label": "с 1 января",
        "masters": rows,
        "note": note,
    })


def _service_cost(r: dict) -> float:
    c = 0.0
    for s in (r.get("services") or []):
        if isinstance(s, dict):
            try:
                c += float(s.get("cost") or s.get("price_min") or 0)
            except Exception:
                pass
    return c


def _today_earn_from_records(recs: list, pct: float, today_iso: str) -> dict:
    """Факт заработка за сегодня + ПОТЕНЦИАЛ MAYA из уже полученных записей мастера.
    Потенциал = сегодняшние визиты × целевой чек (лучший из сегодняшнего/исторического
    + 20% апселл-запас, который советует MAYA) × доля мастера. Красный/зелёный на плитке
    считается фронтом из ratio earned/potential."""
    visits_today, gross_today = 0, 0.0
    hist = []
    for r in recs:
        if not isinstance(r, dict) or _is_gift_cert_record(r) or r.get("paid_full") != 1:
            continue
        d = (r.get("datetime") or r.get("date") or "")[:10]
        cost = _service_cost(r)
        if d == today_iso:
            visits_today += 1
            gross_today += cost
        elif cost > 0:
            hist.append(cost)
    earned_today = round(gross_today * pct)
    today_avg = (gross_today / visits_today) if visits_today else 0.0
    # Цель = средний чек в ЛУЧШИЕ дни мастера (топ-40% исторических чеков за 60 дней) —
    # то, что достижимо с апселлом/уходом по совету MAYA. Ориентир ФИКСИРОВАННЫЙ (не
    # привязан к сегодняшнему), поэтому «продаёт себестоимость без допов» → чек низкий →
    # ratio низкий → плитка красная; «делает как в лучшие дни» → ratio→1 → зелёная.
    if hist:
        hist.sort(reverse=True)
        top = hist[:max(1, round(len(hist) * 0.4))]
        target_check = sum(top) / len(top)
    else:
        target_check = today_avg * 1.3
    target_check = max(target_check, today_avg)   # сегодня выше лучших → цель = сегодня (зелёный)
    potential_today = round(visits_today * target_check * pct)
    if potential_today < earned_today:
        potential_today = earned_today
    return {"earned_today": earned_today, "potential_today": potential_today,
            "visits_today": visits_today}


def _master_today_earn(staff_id: int, pct: float) -> dict:
    """Отдельный расчёт факт/потенциал за сегодня (fetch 60 дней записей мастера)."""
    today = date.today()
    try:
        recs = _yc.get_records_for_master(
            staff_id, (today - timedelta(days=60)).isoformat(), today.isoformat()) or []
    except Exception as e:
        logger.error(f"today earn records staff={staff_id}: {e}")
        recs = []
    return _today_earn_from_records(recs, pct, today.isoformat())


def _master_month_behind(staff_id: int, pct: float) -> bool:
    """True, если личный доход за текущий месяц-к-дате отстаёт от прошлого месяца
    на ту же дату (для окраски недельной плитки в красный)."""
    today = date.today()
    m_start, _ = _month_bounds(today, 0)
    p_start, p_end = _month_bounds(today, 1)
    p_cut = min(p_end, p_start + timedelta(days=(today - m_start).days))
    try:
        cur = _revenue_by_master(m_start.isoformat(), today.isoformat()).get(staff_id, 0.0)
        prev = _revenue_by_master(p_start.isoformat(), p_cut.isoformat()).get(staff_id, 0.0)
    except Exception as e:
        logger.error(f"month behind staff={staff_id}: {e}")
        return False
    return round(cur * pct) < round(prev * pct)


_GROSS_MONTH_CACHE: dict = {}  # sid -> (expires_ts, value)


async def _gross_month_for(sid: int):
    """Валовая мастера за текущий месяц. Двойной YClients-проход по месяцу дорогой,
    поэтому кэш 15 мин; при холодном кэше ждём максимум 8с, дальше считаем в фоне
    (эндпоинт не упирается в 25с-таймаут beget-прокси, фронт покажет «…» и добьёт
    значение следующим заходом)."""
    import time as _t
    hit = _GROSS_MONTH_CACHE.get(sid)
    if hit and hit[0] > _t.time():
        return hit[1]
    m_start, _m_end = _month_bounds(date.today())

    async def _calc():
        rev = await asyncio.to_thread(
            _revenue_by_master, m_start.isoformat(), date.today().isoformat())
        val = round(rev.get(sid, 0.0)) if isinstance(rev, dict) else 0
        _GROSS_MONTH_CACHE[sid] = (_t.time() + 900, val)
        return val

    task = asyncio.create_task(_calc())
    try:
        return await asyncio.wait_for(asyncio.shield(task), timeout=8)
    except asyncio.TimeoutError:
        return None
    except Exception as e:
        logger.error(f"gross_month sid={sid}: {e}")
        return None


async def panel_my_earnings_handler(request: web.Request) -> web.Response:
    """POST /api/panel/my_earnings — личный заработок мастера за ТЕКУЩУЮ расчётную
    неделю (Чт→Ср, до сегодня): валовая по услугам × его доля. Та же формула, что в
    окне ЗП аналитики. Доступно только привязанному мастеру — видит ТОЛЬКО себя.
    Владельцу/Антону этот эндпоинт не нужен (у них в плитке выручка салона)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {}
    sid = info.get("staff_id")
    if not info.get("is_master") or not sid:
        return _cabinet_response({"error": "not_master",
                                  "message": "Раздел доступен мастерам."}, status=403)
    sid = int(sid)
    pw = _pay_week()
    week_end_q = min(pw["end"], date.today().isoformat())
    try:
        rev_week = await asyncio.to_thread(_revenue_by_master, pw["start"], week_end_q)
    except Exception as e:
        logger.error(f"my_earnings revenue staff={sid}: {e}")
        rev_week = {}
    gross = round(rev_week.get(sid, 0.0))
    is_owner = (sid == OWNER_STAFF_ID)
    pct = 1.0 if is_owner else MASTER_SALARY_PCT.get(sid, MASTER_SALARY_DEFAULT)
    # факт/потенциал за сегодня + отставание месяца (параллельно)
    today_earn, behind = await asyncio.gather(
        asyncio.to_thread(_master_today_earn, sid, pct),
        asyncio.to_thread(_master_month_behind, sid, pct),
    )
    # валовая за месяц — кэш 15 мин + мягкий таймаут (см. _gross_month_for)
    gross_month = await _gross_month_for(sid)
    return _cabinet_response({
        "pay_week": pw,
        "gross_week": gross,
        "percent": int(round(pct * 100)),
        "salary_week": round(gross * pct),
        "gross_month": gross_month,
        "salary_month": (round(gross_month * pct) if gross_month is not None else None),
        "earned_today": today_earn["earned_today"],
        "potential_today": today_earn["potential_today"],
        "visits_today": today_earn["visits_today"],
        "salary_today": today_earn["earned_today"],   # плитка теперь на той же (records) базе
        "month_behind": bool(behind),
        "is_owner": is_owner,
    })


def _month_bounds(anchor: date, months_back: int = 0):
    """(first_day, last_day) месяца, отстоящего на months_back от anchor."""
    y, m = anchor.year, anchor.month - months_back
    while m <= 0:
        m += 12; y -= 1
    start = date(y, m, 1)
    nxt = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    end = nxt - timedelta(days=1)
    return start, end


def _client_key(rec: dict):
    """Устойчивый ключ клиента: id, иначе нормализованное имя (без ПД в LLM не уходит)."""
    c = rec.get("client") or {}
    cid = c.get("id")
    if cid:
        return ("id", int(cid)) if str(cid).isdigit() else ("id", cid)
    nm = (c.get("name") or "").strip().lower()
    return ("nm", nm) if nm else None


def _master_clients_month(staff_id: int) -> dict:
    """Агрегат по клиентской базе мастера за текущий месяц + сравнение темпа
    с прошлым месяцем + анонимные метрики для совета MAYA. Телефоны НЕ включаются."""
    today = date.today()
    m_start, _ = _month_bounds(today, 0)
    p_start, p_end_full = _month_bounds(today, 1)
    # окно ретроспективы: 6 полных месяцев до текущего — для «новый/вернувшийся»
    look_start, _ = _month_bounds(today, 6)
    try:
        records = _yc.get_records_for_master(staff_id, look_start.isoformat(), today.isoformat()) or []
    except Exception as e:
        logger.error(f"master clients records staff={staff_id}: {e}")
        records = []

    # темп прошлого месяца: тот же по счёту день (столько же прошло дней)
    days_elapsed = (today - m_start).days
    p_cutoff = min(p_end_full, p_start + timedelta(days=days_elapsed))

    served_now = {}          # key -> {name, visits}
    served_prev_pace = set()
    served_prev_full = set()
    seen_before_month = set()  # был у мастера в look_start..m_start (до этого месяца)
    visits_now = 0
    visits_prev_pace = [0]     # визиты прошлого месяца к той же дате (list — чтоб мутировать в цикле)
    visits_prev_full = [0]     # визиты за весь прошлый месяц
    svc_freq = {}

    for r in records:
        if not isinstance(r, dict) or _is_gift_cert_record(r):
            continue
        if r.get("paid_full") != 1:       # «обслужен» = визит оплачен (paid_full — надёжный признак)
            continue
        d = (r.get("datetime") or r.get("date") or "")[:10]
        if not d:
            continue
        key = _client_key(r)
        if key is None:
            continue
        if look_start.isoformat() <= d < m_start.isoformat():
            seen_before_month.add(key)
        if m_start.isoformat() <= d <= today.isoformat():
            nm = ((r.get("client") or {}).get("name") or "Клиент").strip() or "Клиент"
            slot = served_now.setdefault(key, {"name": nm, "visits": 0})
            slot["visits"] += 1
            visits_now += 1
            for s in (r.get("services") or []):
                if isinstance(s, dict) and s.get("title"):
                    svc_freq[s["title"]] = svc_freq.get(s["title"], 0) + 1
        if p_start.isoformat() <= d <= p_cutoff.isoformat():
            served_prev_pace.add(key)
            visits_prev_pace[0] += 1
        if p_start.isoformat() <= d <= p_end_full.isoformat():
            served_prev_full.add(key)
            visits_prev_full[0] += 1

    unique_now = len(served_now)
    new_react = sum(1 for k in served_now if k not in seen_before_month)
    returning = unique_now - new_react
    # темп считаем по ВИЗИТАМ (приёмам) — это то, что мастер сверяет с YClients
    delta_pace = visits_now - visits_prev_pace[0]

    # выручка мастера за месяц + личная доля
    try:
        rev_map = _revenue_by_master(m_start.isoformat(), today.isoformat())
        gross = round(rev_map.get(staff_id, 0.0))
    except Exception as e:
        logger.error(f"master clients revenue staff={staff_id}: {e}")
        gross = 0
    is_owner = (staff_id == OWNER_STAFF_ID)
    pct = 1.0 if is_owner else MASTER_SALARY_PCT.get(staff_id, MASTER_SALARY_DEFAULT)
    personal = round(gross * pct)
    avg_check = round(gross / visits_now) if visits_now else 0
    top_services = sorted(svc_freq.items(), key=lambda kv: kv[1], reverse=True)[:3]
    # факт/потенциал за сегодня — из тех же полученных записей (без лишнего запроса)
    te = _today_earn_from_records(records, pct, today.isoformat())

    # список имён (БЕЗ телефонов), по убыванию визитов затем по алфавиту
    names = sorted(served_now.values(), key=lambda v: (-v["visits"], v["name"].lower()))
    clients = [{"name": v["name"], "visits": v["visits"]} for v in names]

    return {
        "month": m_start.strftime("%Y-%m"),
        "earned_today": te["earned_today"],
        "potential_today": te["potential_today"],
        "visits_today": te["visits_today"],
        "total": visits_now,          # headline «Обслужено» = визиты/приёмы (как в YClients)
        "unique": unique_now,         # уникальных людей за месяц
        "clients": clients,
        "prev_pace": visits_prev_pace[0],   # визитов к этой дате прошлого месяца
        "prev_full": visits_prev_full[0],   # визитов за весь прошлый месяц
        "prev_pace_unique": len(served_prev_pace),
        "prev_full_unique": len(served_prev_full),
        "delta": delta_pace,          # по визитам
        "new_clients": new_react,
        "returning": returning,
        "visits": visits_now,
        "gross": gross,
        "personal": personal,
        "percent": int(round(pct * 100)),
        "avg_check": avg_check,
        "top_services": [{"title": t, "count": c} for t, c in top_services],
        "days_elapsed": days_elapsed,
    }


def _master_clients_advice(agg: dict, staff_id: int) -> str | None:
    """Совет MAYA по клиентской базе. На вход — ТОЛЬКО анонимные агрегаты (без
    имён/телефонов). Кэш на сутки в settings (mcli_adv:{staff_id})."""
    cache_key = f"mcli_adv:{staff_id}"
    today_iso = date.today().isoformat()
    try:
        raw = database.get_setting(cache_key)
        if raw:
            cached = _json.loads(raw)
            if cached.get("date") == today_iso and cached.get("month") == agg.get("month"):
                return cached.get("advice")
    except Exception:
        pass
    if agg.get("total", 0) == 0 and agg.get("prev_full", 0) == 0:
        return None
    tops = ", ".join(f'{s["title"]} ({s["count"]})' for s in agg.get("top_services", [])) or "—"
    pace = ("опережает" if agg["delta"] > 0 else "отстаёт" if agg["delta"] < 0 else "идёт вровень")
    prompt = (
        "Ты MAYA — AI-директор мужского барбершопа. Дай мастеру короткий разбор его "
        "клиентской базы за текущий месяц и что конкретно сделать, чтобы поднять и "
        "ВАЛОВЫЙ доход салона, и свой ЛИЧНЫЙ (он получает "
        f'{agg["percent"]}% с услуг). Пиши по-русски, на «ты», деловито и по делу, '
        "без воды и без выдуманных цифр. Дай 3–4 конкретных действия списком.\n\n"
        "Данные (обезличенные):\n"
        f'- приёмов (визитов) в этом месяце: {agg["visits"]}, уникальных клиентов: {agg.get("unique", 0)}\n'
        f'- из них новых/вернувшихся после паузы: {agg["new_clients"]}, постоянных: {agg["returning"]}\n'
        f'- темп по визитам к той же дате прошлого месяца: {pace} на {abs(agg["delta"])} '
        f'(было {agg["prev_pace"]}, весь прошлый месяц {agg["prev_full"]})\n'
        f'- валовая по услугам: {agg["gross"]} ₽, личный доход ~{agg["personal"]} ₽, средний чек {agg["avg_check"]} ₽\n'
        f'- топ услуги: {tops}\n\n'
        "Формат ответа: 1–2 предложения оценки, затем маркированный список действий. "
        "Максимум 90 слов."
    )
    try:
        from claude_ai import complete_text
        advice = complete_text(prompt, max_tokens=320)
    except Exception as e:
        logger.error(f"master clients advice staff={staff_id}: {e}")
        return None
    advice = (advice or "").strip() or None
    if advice:
        try:
            database.set_setting(cache_key, _json.dumps(
                {"date": today_iso, "month": agg.get("month"), "advice": advice}, ensure_ascii=False))
        except Exception:
            pass
    return advice


async def panel_master_clients_handler(request: web.Request) -> web.Response:
    """POST /api/panel/master/clients — клиентская база мастера за текущий месяц:
    общее число обслуженных, список имён (БЕЗ телефонов), темп к прошлому месяцу и
    совет MAYA. Только привязанный мастер (или владелец/управляющий по staff_id)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {}
    staff_id = info.get("staff_id")
    if not info.get("is_master"):
        if info.get("permissions", {}).get("dashboard") and body.get("staff_id"):
            staff_id = body.get("staff_id")
        else:
            return _cabinet_response({"error": "not_master",
                                      "message": "Раздел доступен мастерам."}, status=403)
    if not staff_id:
        return _cabinet_response({"error": "not_master",
                                  "message": "Мастер не привязан."}, status=403)
    try:
        staff_id = int(staff_id)
    except (TypeError, ValueError):
        return _cabinet_response({"error": "bad_request", "message": "Некорректный staff_id."}, status=400)

    agg = await asyncio.to_thread(_master_clients_month, staff_id)
    advice = await asyncio.to_thread(_master_clients_advice, agg, staff_id)
    agg["advice"] = advice
    return _cabinet_response(agg)


# ════════════════════════════════════════════════════════════════════════════
#  GOD-режим: закрытый founder-кабинет MAYA (только основатель, FOUNDER_IDS)
# ════════════════════════════════════════════════════════════════════════════
def _god_gate(request: web.Request, body: dict):
    """(tg_id, None) если запрос от основателя; иначе (None, error_response)."""
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return None, _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    if not tg_id:
        return None, _cabinet_response({"error": "no_user_id"}, status=400)
    info = _panel_resolve_role(int(tg_id))
    if not info.get("is_founder"):
        return None, _cabinet_response(
            {"error": "forbidden", "message": "Раздел доступен только основателю MAYA."},
            status=403)
    return int(tg_id), None


def _god_get_renewals() -> list:
    raw = database.get_setting("god_renewals")
    if raw:
        try:
            data = _json.loads(raw)
            if isinstance(data, list):
                return data
        except Exception:
            pass
    return [dict(r) for r in getattr(config, "GOD_DEFAULT_RENEWALS", [])]


def _god_set_renewals(items: list):
    database.set_setting("god_renewals", _json.dumps(items, ensure_ascii=False))


def _god_ai_budget_usd() -> float:
    raw = database.get_setting("god_ai_budget_usd")
    try:
        return float(raw) if raw else float(getattr(config, "GOD_AI_BUDGET_USD", 50.0))
    except Exception:
        return 50.0


def _god_ai_spent_usd(days: int = 30) -> float:
    try:
        return float((ai_billing.build_cost_data(days) or {}).get("ai_usd") or 0.0)
    except Exception:
        return 0.0


def _god_renewals_view() -> list:
    """Оплаты к продлению с обратным отсчётом и статусом (overdue/soon/ok/unset)."""
    warn = int(getattr(config, "GOD_RENEWAL_WARN_DAYS", 7))
    today = date.today()
    out = []
    for r in _god_get_renewals():
        due = str(r.get("due_date") or "").strip()
        days_left, status = None, "unset"
        if due:
            try:
                d = date.fromisoformat(due[:10])
                days_left = (d - today).days
                status = "overdue" if days_left < 0 else ("soon" if days_left <= warn else "ok")
            except Exception:
                status = "unset"  # кривая дата — честно показываем «не задана», не маскируем под ok
        out.append({"key": r.get("key"), "label": r.get("label"),
                    "amount": int(r.get("amount") or 0), "due_date": due,
                    "days_left": days_left, "status": status})
    out.sort(key=lambda x: (x["days_left"] is None,
                            x["days_left"] if x["days_left"] is not None else 99999))
    return out


def _god_health_checks() -> dict:
    """In-process самодиагностика. {checks:[{key,label,status,detail}], summary:{ok,warn,fail}}."""
    import shutil as _sh
    checks = []

    def add(key, label, status, detail=""):
        checks.append({"key": key, "label": label, "status": status, "detail": detail})

    # 1) YClients жив + лицензия (get_masters ловит «истекла лицензия»/нет доступа)
    try:
        masters = _yc.get_masters() or []
        if masters and isinstance(masters[0], dict) and masters[0].get("error"):
            add("yclients", "YClients · запись и лицензия", "fail",
                "Ошибка API: " + str(masters[0].get("error"))[:90])
        elif not masters:
            add("yclients", "YClients · запись и лицензия", "warn",
                "Список мастеров пуст — проверь доступ/лицензию филиала")
        else:
            add("yclients", "YClients · запись и лицензия", "ok",
                "Мастеров активно: %d" % len(masters))
    except Exception as e:
        add("yclients", "YClients · запись и лицензия", "fail", str(e)[:90])

    # 2) Ключи ИИ
    ok_key = getattr(config, "OPENAI_API_KEY", "") or ""
    fk = getattr(config, "FAL_KEY", "") or os.environ.get("FAL_KEY", "")
    missing = []
    if not (ok_key and ok_key.startswith("sk-")):
        missing.append("OpenAI")
    if not fk:
        missing.append("fal.ai")
    if missing:
        add("ai_keys", "Ключи ИИ (OpenAI/fal)", "fail",
            "Нет/некорректны: " + ", ".join(missing))
    else:
        add("ai_keys", "Ключи ИИ (OpenAI/fal)", "ok", "Все ключи на месте")

    # 3) База данных пишется
    try:
        database.set_setting("god_probe_ts", date.today().isoformat())
        rb = database.get_setting("god_probe_ts")
        add("db", "База данных", "ok" if rb else "fail",
            "Запись и чтение успешны" if rb else "Чтение вернуло пусто")
    except Exception as e:
        add("db", "База данных", "fail", str(e)[:90])

    # 4) Диск
    try:
        du = _sh.disk_usage(os.path.dirname(database.DB_PATH) or ".")
        free_pct = round(du.free / du.total * 100)
        st = "ok" if free_pct >= 15 else ("warn" if free_pct >= 7 else "fail")
        add("disk", "Свободно на диске", st, "%d%% свободно" % free_pct)
    except Exception as e:
        add("disk", "Свободно на диске", "warn", str(e)[:90])

    # 5) Дневной отчёт владельцу (свежесть)
    try:
        last = database.get_setting("last_daily_report_at")
        if last:
            try:
                ddiff = (date.today() - date.fromisoformat(last[:10])).days
            except Exception:
                ddiff = 0
            st = "ok" if ddiff <= 1 else "warn"
            add("daily_report", "Дневной отчёт владельцу", st, "Последний: " + last[:16])
        else:
            add("daily_report", "Дневной отчёт владельцу", "warn", "Ещё ни разу не зафиксирован")
    except Exception:
        add("daily_report", "Дневной отчёт владельцу", "warn", "Нет данных")

    # 6) Бюджет ИИ за месяц
    try:
        spent = _god_ai_spent_usd(30)
        budget = _god_ai_budget_usd()
        st = "ok" if spent <= budget else "warn"
        add("ai_budget", "Бюджет ИИ (месяц)", st, "$%.2f из $%.0f" % (spent, budget))
    except Exception:
        add("ai_budget", "Бюджет ИИ (месяц)", "ok", "")

    # 7) Предстоящие оплаты
    try:
        soon = [r for r in _god_renewals_view() if r["status"] in ("soon", "overdue")]
        if soon:
            n = soon[0]
            add("renewals", "Предстоящие оплаты", "warn",
                n["label"] + ": " + ("просрочено" if n["status"] == "overdue"
                                      else "через %s дн." % n["days_left"]))
        else:
            add("renewals", "Предстоящие оплаты", "ok", "В ближайшее время нет")
    except Exception:
        add("renewals", "Предстоящие оплаты", "ok", "")

    # 8) Dual-role аккаунты (мастер + клиент): контекст не должен теряться.
    try:
        audit = memory.audit_dual_role_client_context(yc=_yc, repair=True, limit=20)
        issues = audit.get("issues") or []
        repaired = audit.get("repaired") or []
        dual_role = int(audit.get("dual_role") or 0)
        healthy = int(audit.get("healthy") or 0)
        fails = [it for it in issues if it.get("severity") == "fail"]
        warns = [it for it in issues if it.get("severity") != "fail"]
        if fails:
            first = fails[0]
            add(
                "dual_role",
                "Dual-role аккаунты",
                "fail",
                f"{first.get('name')}: {first.get('detail') or first.get('reason') or 'ошибка'}",
            )
        elif warns or repaired:
            parts = []
            if repaired:
                parts.append("автопочинка: %d" % len(repaired))
            if warns:
                parts.append("внимание: %s" % ", ".join(it.get("name") or "аккаунт" for it in warns[:2]))
            if dual_role:
                parts.append("в норме %d/%d" % (healthy, dual_role))
            add("dual_role", "Dual-role аккаунты", "warn", " · ".join(parts))
        else:
            detail = "Dual-role аккаунтов не найдено" if dual_role == 0 else "В норме %d/%d" % (healthy, dual_role)
            add("dual_role", "Dual-role аккаунты", "ok", detail)
    except Exception as e:
        add("dual_role", "Dual-role аккаунты", "warn", str(e)[:90])

    # 9) Ролевая матрица: founder=owner, прочие админы=manager, мастера не теряются.
    try:
        role_issues = []
        admin_ids = [int(x) for x in (database.list_admins() or [])]
        master_rows = list(database.list_masters() or [])
        founder_count = 0
        manager_admins = 0
        master_ok = 0
        for aid in admin_ids:
            info = _panel_resolve_role(aid)
            if info.get("is_founder"):
                founder_count += 1
                if info.get("role") != "owner":
                    role_issues.append(f"founder {aid} не owner")
            else:
                manager_admins += 1
                if info.get("role") != "manager":
                    role_issues.append(f"admin {aid} не manager")
        for row in master_rows:
            chat_id = row.get("telegram_chat_id")
            if not chat_id:
                continue
            info = _panel_resolve_role(int(chat_id))
            if not info.get("is_master"):
                role_issues.append(f"master {chat_id} потерян")
                continue
            if info.get("role") in ("owner", "manager", "master"):
                master_ok += 1
            else:
                role_issues.append(f"master {chat_id} без роли")
        if role_issues:
            add("role_matrix", "Ролевая матрица", "fail", "; ".join(role_issues[:3]))
        else:
            add(
                "role_matrix",
                "Ролевая матрица",
                "ok",
                f"owner/founder: {founder_count}, admin→manager: {manager_admins}, masters: {master_ok}",
            )
    except Exception as e:
        add("role_matrix", "Ролевая матрица", "warn", str(e)[:90])

    summary = {"ok": sum(1 for c in checks if c["status"] == "ok"),
               "warn": sum(1 for c in checks if c["status"] == "warn"),
               "fail": sum(1 for c in checks if c["status"] == "fail")}
    return {"checks": checks, "summary": summary}


async def god_overview_handler(request: web.Request) -> web.Response:
    """POST /api/god/overview — витрина основателя: пульс салона + расход ИИ +
    сводка здоровья + ближайшая оплата + кол-во подписчиков."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    _tg, err = _god_gate(request, body)
    if err:
        return err
    pp = _panel_period({"period": "month"})
    metrics = {}
    try:
        metrics = await asyncio.to_thread(database.dashboard_metrics,
                                          from_iso=pp["from_iso"], to_iso=pp["to_iso"])
    except Exception as e:
        logger.warning(f"god_overview metrics: {e}")
    today_rev = None
    try:
        rep = await asyncio.to_thread(_daily_report, date.today().isoformat())
        today_rev = (rep.get("cash", {}).get("sum", 0) or 0) + (rep.get("card", {}).get("sum", 0) or 0)
    except Exception as e:
        logger.warning(f"god_overview daily: {e}")
    cost = {}
    try:
        cost = ai_billing.build_cost_data(30) or {}
    except Exception:
        cost = {}
    health = await asyncio.to_thread(_god_health_checks)
    renewals = _god_renewals_view()
    nearest = next((r for r in renewals if r["days_left"] is not None), None)
    try:
        subs = database.list_maya_tenants()
    except Exception:
        subs = []
    return _cabinet_response({
        "period_label": pp["label"],
        "salon": {
            "today_revenue": today_rev,
            "acquisition": metrics.get("acquisition", {}),
            "bookings": metrics.get("bookings", {}),
        },
        "ai_cost": {"ai_rub": cost.get("ai_rub"), "ai_usd": cost.get("ai_usd"),
                    "servers_rub": cost.get("servers_rub"), "total_rub": cost.get("total_rub")},
        "health": health["summary"],
        "nearest_renewal": nearest,
        "subscribers": {"total": len(subs),
                        "active": sum(1 for s in subs if s.get("status") == "active"),
                        "pending": sum(1 for s in subs if s.get("status") == "pending")},
    })


async def god_health_handler(request: web.Request) -> web.Response:
    """POST /api/god/health — самодиагностика системы."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    _tg, err = _god_gate(request, body)
    if err:
        return err
    res = await asyncio.to_thread(_god_health_checks)
    return _cabinet_response(res)


async def god_billing_handler(request: web.Request) -> web.Response:
    """POST /api/god/billing — расходы ИИ+серверы, оплаты к продлению, бюджет ИИ.
    action: view (по умолч.) | set_renewal {key,label,due_date,amount} | set_budget {usd}."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    _tg, err = _god_gate(request, body)
    if err:
        return err
    action = str(body.get("action") or "view")
    if action == "set_renewal":
        key = str(body.get("key") or "").strip()
        if not key:
            return _cabinet_response({"error": "bad_request"}, status=400)
        items = _god_get_renewals()
        found = False
        for it in items:
            if it.get("key") == key:
                if "due_date" in body:
                    it["due_date"] = str(body.get("due_date") or "")[:10]
                if "amount" in body:
                    try:
                        it["amount"] = int(body.get("amount") or 0)
                    except Exception:
                        pass
                if body.get("label"):
                    it["label"] = str(body.get("label"))[:60]
                found = True
                break
        if not found:
            items.append({"key": key, "label": str(body.get("label") or key)[:60],
                          "amount": int(body.get("amount") or 0),
                          "due_date": str(body.get("due_date") or "")[:10]})
        _god_set_renewals(items)
    elif action == "set_budget":
        try:
            database.set_setting("god_ai_budget_usd", str(float(body.get("usd") or 0)))
        except Exception:
            return _cabinet_response({"error": "bad_request"}, status=400)
    cost = {}
    try:
        cost = ai_billing.build_cost_data(30) or {}
    except Exception:
        cost = {}
    return _cabinet_response({
        "ai": {"ai_usd": cost.get("ai_usd"), "ai_rub": cost.get("ai_rub"),
               "by_feature": cost.get("by_feature", []), "days": cost.get("days", 30)},
        "servers": {"servers_rub": cost.get("servers_rub"),
                    "breakdown": cost.get("servers_breakdown", {})},
        "total_rub": cost.get("total_rub"),
        "renewals": _god_renewals_view(),
        "ai_budget_usd": _god_ai_budget_usd(),
        "ai_spent_usd": _god_ai_spent_usd(30),
    })


async def god_subscribers_handler(request: web.Request) -> web.Response:
    """POST /api/god/subscribers — реестр салонов-подписчиков MAYA.
    action: list (по умолч.) | add {name,city,plan,owner,phone,mrr,status} |
            set_status {id, status:active|suspended|pending}."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    _tg, err = _god_gate(request, body)
    if err:
        return err
    action = str(body.get("action") or "list")
    if action == "add":
        name = str(body.get("name") or "").strip()
        if not name:
            return _cabinet_response({"error": "bad_request",
                                      "message": "Укажите название салона."}, status=400)
        _st = str(body.get("status") or "pending")
        if _st not in ("active", "suspended", "pending"):
            _st = "pending"
        try:
            database.add_maya_tenant(
                name=name, city=str(body.get("city") or ""),
                plan=str(body.get("plan") or ""), owner_name=str(body.get("owner") or ""),
                phone=str(body.get("phone") or ""), mrr=int(body.get("mrr") or 0),
                status=_st)
        except Exception as e:
            logger.error(f"god add tenant: {e}")
            return _cabinet_response({"error": "server_error"}, status=500)
    elif action == "set_status":
        tid = body.get("id")
        status = str(body.get("status") or "")
        if not tid or status not in ("active", "suspended", "pending"):
            return _cabinet_response({"error": "bad_request"}, status=400)
        try:
            database.set_maya_tenant_status(int(tid), status)
        except Exception as e:
            logger.error(f"god set tenant status: {e}")
            return _cabinet_response({"error": "server_error"}, status=500)
    try:
        items = database.list_maya_tenants()
    except Exception:
        items = []
    return _cabinet_response({
        "subscribers": items,
        "summary": {"total": len(items),
                    "active": sum(1 for s in items if s.get("status") == "active"),
                    "pending": sum(1 for s in items if s.get("status") == "pending"),
                    "suspended": sum(1 for s in items if s.get("status") == "suspended"),
                    "mrr": sum(int(s.get("mrr") or 0) for s in items if s.get("status") == "active")},
    })


def _preliminary_payout() -> dict:
    """Предварительная выплата за ТЕКУЩУЮ расчётную неделю (Чт→Ср, до сегодня)
    для ВСЕХ, кроме Стаса-владельца:
      • каждый мастер = его валовая за неделю × его доля,
      • Антон = фактически начислено в YClients за тот же период.
    Кладётся в дневной отчёт, чтобы владелец каждый день видел накопленную сумму к выплате."""
    pw = _pay_week()
    start = pw["start"]
    today = date.today()
    end = min(date.fromisoformat(pw["end"]), today).isoformat()
    try:
        txs = _yc.get_company_transactions(start, end)
    except Exception as e:
        logger.error(f"_preliminary_payout tx: {e}")
        txs = []
    try:
        recs = _yc.get_company_records(start, end)
    except Exception:
        recs = []
    rec_staff = {r.get("id"): r.get("staff_id") for r in recs
                 if isinstance(r, dict) and r.get("id") is not None and r.get("staff_id") is not None}
    by_master = {}                 # staff_id -> валовая за неделю (услуги)
    for t in txs:
        if not isinstance(t, dict) or t.get("sold_item_type") != "service":
            continue
        try:
            a = float(t.get("amount") or 0)
        except Exception:
            a = 0.0
        if a <= 0:
            continue
        sid = None
        m = t.get("master")
        if isinstance(m, dict) and m.get("id"):
            sid = m.get("id")
        if sid is None:
            sid = rec_staff.get(t.get("record_id"))
        if sid is not None:
            by_master[sid] = by_master.get(sid, 0.0) + a
    try:
        roster = _yc.get_masters() or []
    except Exception:
        roster = []
    names = {m.get("id"): m.get("name", "") for m in roster
             if isinstance(m, dict) and not m.get("error") and m.get("id") is not None}
    rows = []
    masters_total = 0
    for sid, g in by_master.items():
        if sid == OWNER_STAFF_ID:                       # Стаса не включаем
            continue
        pct = MASTER_SALARY_PCT.get(sid, MASTER_SALARY_DEFAULT)
        sal = round(g * pct)
        if sal <= 0:
            continue
        rows.append({"staff_id": sid, "name": names.get(sid) or f"Мастер #{sid}",
                     "gross_week": round(g), "percent": int(round(pct * 100)), "salary": sal})
        masters_total += sal
    rows.sort(key=lambda x: x["salary"], reverse=True)
    anton = _anton_payroll(start, end)
    anton_total = anton["total"]
    return {
        "week": {"start": start, "end": pw["end"], "through": end, "pay_date": pw.get("pay_date")},
        "masters": rows,
        "anton": {**anton, "salary": anton_total},
        "masters_total": masters_total,
        "total": (masters_total + anton_total) if anton_total is not None else None,
    }


def _daily_report(date_iso: str) -> dict:
    """Дневной отчёт для владельца за один день (YYYY-MM-DD):
      - зарплата барберов, работающих в этот день (график YClients): выручка×реальный %
      - сколько визитов и на какую сумму оплачено наличными vs картой
    Источник денег — финоперации YClients (по услугам); нал/карта — по account.is_cash.
    """
    try:
        txs = _yc.get_company_transactions(date_iso, date_iso)
    except Exception as e:
        logger.error(f"_daily_report tx: {e}")
        txs = []
    try:
        recs = _yc.get_company_records(date_iso, date_iso)
    except Exception:
        recs = []
    rec_staff = {}
    for r in recs:
        if isinstance(r, dict) and r.get("id") is not None and r.get("staff_id") is not None:
            rec_staff[r.get("id")] = r.get("staff_id")

    rev = {}                       # staff_id -> валовая по услугам за день
    cash_sum = 0.0; card_sum = 0.0
    cash_recs = set(); card_recs = set()
    for t in txs:
        if not isinstance(t, dict) or t.get("sold_item_type") != "service":
            continue
        try:
            a = float(t.get("amount") or 0)
        except Exception:
            a = 0.0
        if a <= 0:
            continue
        # мастер для зарплаты
        sid = None
        m = t.get("master")
        if isinstance(m, dict) and m.get("id"):
            sid = m.get("id")
        if sid is None:
            sid = rec_staff.get(t.get("record_id"))
        if sid is not None:
            rev[sid] = rev.get(sid, 0.0) + a
        # нал/карта — по счёту операции
        acc = t.get("account")
        is_cash = bool(acc.get("is_cash")) if isinstance(acc, dict) else False
        rid = t.get("record_id")
        if is_cash:
            cash_sum += a
            if rid is not None:
                cash_recs.add(rid)
        else:
            card_sum += a
            if rid is not None:
                card_recs.add(rid)

    # кто работает в этот день — из графика YClients
    try:
        working = _yc.get_working_masters(date_iso) or []
    except Exception as e:
        logger.error(f"_daily_report working: {e}")
        working = []
    try:
        roster = _yc.get_masters() or []
    except Exception:
        roster = []
    names = {m.get("id"): m.get("name", "") for m in roster
             if isinstance(m, dict) and not m.get("error") and m.get("id") is not None}

    masters = []
    included = set()
    for w in working:
        if not isinstance(w, dict):
            continue
        if not (w.get("is_working") or w.get("schedule_unknown")):
            continue
        sid = w.get("id")
        if sid is None:
            continue
        included.add(sid)
        gross = round(rev.get(sid, 0.0))
        is_owner = (sid == OWNER_STAFF_ID)
        pct = 1.0 if is_owner else MASTER_SALARY_PCT.get(sid, MASTER_SALARY_DEFAULT)
        masters.append({
            "staff_id": sid,
            "name": w.get("name") or names.get(sid) or f"Мастер #{sid}",
            "gross": gross,
            "percent": int(round(pct * 100)),
            "salary": round(gross * pct),
            "is_owner": is_owner,
        })
    # добиваем тех, у кого была выручка, но в графике их нет (чтобы ЗП не потерялась)
    for sid, g in rev.items():
        if sid in included or round(g) <= 0:
            continue
        is_owner = (sid == OWNER_STAFF_ID)
        pct = 1.0 if is_owner else MASTER_SALARY_PCT.get(sid, MASTER_SALARY_DEFAULT)
        masters.append({
            "staff_id": sid,
            "name": names.get(sid) or f"Мастер #{sid}",
            "gross": round(g),
            "percent": int(round(pct * 100)),
            "salary": round(g * pct),
            "is_owner": is_owner,
            "off_schedule": True,   # работал, но в графике не значился
        })
    masters.sort(key=lambda x: x["salary"], reverse=True)

    total_gross_val = round(sum(rev.values()))
    salary_total_val = round(sum(m["salary"] for m in masters if not m.get("is_owner")))

    anton = _anton_payroll(date_iso, date_iso)
    anton_total = anton.get("total")

    # ── Дополнительные расходы (каждый день) ──
    extra_items = [{"label": e["label"], "amount": e["amount"]} for e in DAILY_EXTRA_EXPENSES]
    extra_total = sum(e["amount"] for e in DAILY_EXTRA_EXPENSES)

    # ── Расходы по салону от Антона за этот день (кофе, уборщица, лента…) ──
    try:
        salon_exp_items = database.get_salon_expenses(date_iso)
    except Exception as e:
        logger.error(f"_daily_report salon_expenses: {e}")
        salon_exp_items = []
    salon_exp_total = sum(int(x.get("amount") or 0) for x in salon_exp_items)

    expenses_total = (
        salary_total_val + anton_total + extra_total + salon_exp_total
        if anton_total is not None else None
    )

    # Предварительная выплата за неделю (Чт→Ср до сегодня) — все, кроме Стаса (#11)
    try:
        prelim = _preliminary_payout()
    except Exception as e:
        logger.error(f"_daily_report prelim: {e}")
        prelim = None

    # ── Чистая прибыль ВЛАДЕЛЬЦА (Стаса) — только для owner-окна в отчёте ──
    # Чистыми = валовая − ВСЕ расходы (ЗП мастеров + ЗП Антона + покупки + доп.расходы).
    # Разбивка: сам заработал (свои услуги 100%) + доля с сотрудников (их валовая − их ЗП).
    owner_gross = round(sum(m["gross"] for m in masters if m.get("is_owner")))
    employees_gross = max(0, total_gross_val - owner_gross)
    employees_margin = employees_gross - salary_total_val
    owner_net = ({
        "own": owner_gross,                       # заработал сам (свои услуги, 100%)
        "employees_gross": employees_gross,       # валовая сотрудников
        "employees_salary": salary_total_val,     # − их зарплаты
        "employees_margin": employees_margin,     # = доля с сотрудников
        "anton": anton_total,                     # − ЗП Антона
        "purchases": salon_exp_total,             # − покупки (внёс Антон)
        "extra": extra_total,                     # − фикс. доп.расходы
        "net": total_gross_val - expenses_total,  # = чистыми
    } if expenses_total is not None else None)

    # ── Касса со слов Антона + сверка с расчётной наличкой YClients ──
    try:
        _cl = database.get_cash_log(date_iso)
    except Exception:
        _cl = None
    cash_reported = None
    if _cl:
        # 🔴 Ожидаемая наличка за день = пришло налом − наличные расходы за день
        # (закупки, которые Антон вносит и оплачивает ИЗ КАССЫ). Без вычета расходов
        # сверка показывала ложную «недостачу» ровно на сумму дневных закупок.
        _cash_rev = round(cash_sum)                 # пришло налом по YClients
        # Наличные расходы за день = закупки Антона + фикс. доп.расходы (Стас: доп.расходы
        # тоже идут наличкой из кассы каждый день).
        _cash_exp = salon_exp_total + extra_total
        _computed = _cash_rev - _cash_exp            # сколько НАЛИЧКИ должно остаться за день
        # кто вносил кассу: Антон / Стас / иной админ
        _eb = _cl.get("entered_by")
        try:
            from config import FOUNDER_IDS as _FIDS
        except Exception:
            _FIDS = {948205934}
        if _eb == ANTON_CHAT_ID:
            _by = "Антон"
        elif _eb and int(_eb) in _FIDS:
            _by = "Стас"
        elif _eb:
            try:
                _m = database.get_master_by_chat_id(int(_eb)) or {}
                _by = _m.get("full_name") or "администратор"
            except Exception:
                _by = "администратор"
        else:
            _by = ""
        cash_reported = {
            "total_till": _cl["total_till"],
            "day_cash": _cl["day_cash"],
            "cash_revenue": _cash_rev,                 # пришло налом (YClients)
            "day_expenses": _cash_exp,                 # − наличные расходы за день (закупки)
            "computed_day_cash": _computed,            # = ожидаемая наличка (выручка − расходы)
            "diff": _cl["day_cash"] - _computed,       # >0 излишек, <0 недостача
            "by": _by,                                  # кто внёс кассу
        }

    return {
        "date": date_iso,
        "masters": masters,
        "cash": {"count": len(cash_recs), "sum": round(cash_sum)},
        "card": {"count": len(card_recs), "sum": round(card_sum)},
        "total_gross": total_gross_val,
        "salary_total": salary_total_val,
        "anton": anton,
        "extra_expenses": {"items": extra_items, "total": extra_total},
        "salon_expenses": {"items": salon_exp_items, "total": salon_exp_total},
        "expenses_total": expenses_total,
        "owner_net": owner_net,           # owner-only окно «чистая прибыль Стаса»
        "cash_reported": cash_reported,   # касса со слов Антона + сверка
        "prelim_payout": prelim,
        "note": ("" if txs else "Пока нет проведённых оплат за день — касса появится "
                 "после первых закрытых визитов в YClients."),
    }


def _period_report(from_iso: str, to_iso: str) -> dict:
    """Агрегированная касса/ЗП за ДИАПАЗОН дат (для аналитики по периоду).
    Нал/карта, валовая, зарплаты мастеров (gross×% по выручке за период)."""
    try:
        txs = _yc.get_company_transactions(from_iso, to_iso)
    except Exception as e:
        logger.error(f"_period_report tx: {e}")
        txs = []
    try:
        recs = _yc.get_company_records(from_iso, to_iso)
    except Exception:
        recs = []
    rec_staff = {}
    for r in recs:
        if isinstance(r, dict) and r.get("id") is not None and r.get("staff_id") is not None:
            rec_staff[r.get("id")] = r.get("staff_id")
    rev = {}
    cash_sum = 0.0; card_sum = 0.0
    cash_recs = set(); card_recs = set()
    for t in txs:
        if not isinstance(t, dict) or t.get("sold_item_type") != "service":
            continue
        try:
            a = float(t.get("amount") or 0)
        except Exception:
            a = 0.0
        if a <= 0:
            continue
        sid = None
        m = t.get("master")
        if isinstance(m, dict) and m.get("id"):
            sid = m.get("id")
        if sid is None:
            sid = rec_staff.get(t.get("record_id"))
        if sid is not None:
            rev[sid] = rev.get(sid, 0.0) + a
        acc = t.get("account")
        is_cash = bool(acc.get("is_cash")) if isinstance(acc, dict) else False
        rid = t.get("record_id")
        if is_cash:
            cash_sum += a
            if rid is not None:
                cash_recs.add(rid)
        else:
            card_sum += a
            if rid is not None:
                card_recs.add(rid)
    try:
        roster = _yc.get_masters() or []
    except Exception:
        roster = []
    names = {m.get("id"): m.get("name", "") for m in roster
             if isinstance(m, dict) and not m.get("error") and m.get("id") is not None}
    masters = []
    for sid, g in rev.items():
        if round(g) <= 0:
            continue
        is_owner = (sid == OWNER_STAFF_ID)
        pct = 1.0 if is_owner else MASTER_SALARY_PCT.get(sid, MASTER_SALARY_DEFAULT)
        masters.append({
            "staff_id": sid,
            "name": names.get(sid) or f"Мастер #{sid}",
            "gross": round(g),
            "percent": int(round(pct * 100)),
            "salary": round(g * pct),
            "is_owner": is_owner,
        })
    masters.sort(key=lambda x: x["salary"], reverse=True)
    total_gross_val = round(sum(rev.values()))
    salary_total_val = round(sum(m["salary"] for m in masters if not m.get("is_owner")))
    anton = _anton_payroll(from_iso, to_iso)
    return {
        "from": from_iso, "to": to_iso, "range": True,
        "masters": masters,
        "cash": {"count": len(cash_recs), "sum": round(cash_sum)},
        "card": {"count": len(card_recs), "sum": round(card_sum)},
        "total_gross": total_gross_val,
        "salary_total": salary_total_val,
        "anton": anton,
        "note": "" if txs else "За период нет проведённых оплат.",
    }


async def panel_daily_report_handler(request: web.Request) -> web.Response:
    """POST /api/panel/daily_report {date?} — дневной отчёт (только владелец):
    зарплаты работающих барберов + нал/карта. date по умолчанию — сегодня.
    Если date = 'YYYY-MM-DD..YYYY-MM-DD' — агрегат за период (для аналитики)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"role": None}
    if info.get("role") != "owner":
        return _cabinet_response({"error": "forbidden", "message": "Отчёт доступен только владельцу."}, status=403)
    d = (body.get("date") or "").strip() or date.today().isoformat()
    try:
        if ".." in d:
            f_iso, _, t_iso = d.partition("..")
            rep = await asyncio.to_thread(_period_report, f_iso.strip(), t_iso.strip())
        else:
            rep = await asyncio.to_thread(_daily_report, d)
    except Exception as e:
        logger.error(f"panel_daily_report: {e}")
        return _cabinet_response({"error": "report_failed", "message": "Не удалось собрать отчёт."}, status=502)
    # «Чистая прибыль Стаса» и касса — ТОЛЬКО основателю (не другим owner, не Антону).
    try:
        from config import FOUNDER_IDS as _FIDS
    except Exception:
        _FIDS = {948205934}
    if isinstance(rep, dict) and int(tg_id) not in _FIDS:
        rep.pop("owner_net", None)
        rep.pop("cash_reported", None)
    return _cabinet_response(rep)


def _build_analytics_pdf(metrics: dict, period_label: str) -> bytes:
    """Простой PDF-отчёт по аналитике за период (reportlab, кириллица через TTF)."""
    import io as _io, os as _os
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as _canvas
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    font = "Helvetica"
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
              _os.path.expanduser("~/Library/Fonts/Montserrat-Regular.otf")]:
        if _os.path.exists(p):
            try:
                pdfmetrics.registerFont(TTFont("PanelBody", p))
                font = "PanelBody"
                break
            except Exception:
                pass
    buf = _io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    y = H - 30 * mm
    c.setFont(font, 20); c.drawString(22 * mm, y, "Мужская Эстетика — Аналитика")
    y -= 9 * mm
    c.setFont(font, 11)
    c.drawString(22 * mm, y, f"Период: {period_label}")
    y -= 12 * mm

    def line(label, value):
        nonlocal y
        c.setFont(font, 12); c.drawString(24 * mm, y, str(label))
        c.drawRightString(W - 22 * mm, y, str(value))
        y -= 8 * mm

    def header(t):
        nonlocal y
        y -= 4 * mm
        c.setFont(font, 13); c.drawString(22 * mm, y, t); y -= 9 * mm

    m = metrics
    rev = (m["subscriptions"]["new_revenue_rub"] or 0) + (m["gift_certs"]["revenue_rub"] or 0)
    header("Сводка")
    line("Выручка в приложении, ₽", f"{rev:,}".replace(",", " "))
    line("Новые клиенты", m["acquisition"]["total_new"])
    line("Записи через бота", m["bookings"]["created"])
    line("Активные абонементы", m["subscriptions"]["active"])
    line("Средний рейтинг", (f'{m["reviews"]["avg_rating"]:.1f}' if m["reviews"]["avg_rating"] is not None else "—"))
    header("Лояльность")
    line("Начислено баллов", m["loyalty"]["earned"])
    line("Списано баллов", m["loyalty"]["redeemed"])
    line("Сгорело баллов", m["loyalty"]["expired"])
    header("Источники клиентов")
    for k, v in sorted((m["acquisition"]["by_source"] or {}).items(), key=lambda x: -x[1]):
        line(k, v)
    c.showPage(); c.save()
    return buf.getvalue()


async def panel_report_pdf_handler(request: web.Request) -> web.Response:
    """POST /api/panel/report_pdf — PDF-отчёт за период, отправляется владельцу в Telegram."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"permissions": {}}
    if not info.get("permissions", {}).get("analytics"):
        return _cabinet_response({"error": "forbidden", "message": "Недостаточно прав."}, status=403)
    pp = _panel_period(body)
    try:
        from telegram import InputFile
        import io as _io
        metrics = database.dashboard_metrics(from_iso=pp["from_iso"], to_iso=pp["to_iso"])
        pdf_bytes = await asyncio.to_thread(_build_analytics_pdf, metrics, pp["label"])
        bot = request.app["bot_app"].bot
        await bot.send_document(
            chat_id=int(tg_id),
            document=InputFile(_io.BytesIO(pdf_bytes), filename=f"analytics_{pp['period']}.pdf"),
            caption=f"📊 Аналитика · {pp['label']} ({pp['start']} – {pp['end']})",
        )
    except Exception as e:
        logger.error(f"panel report_pdf: {e}")
        return _cabinet_response({"ok": False, "reason": "Не удалось сформировать отчёт."}, status=500)
    return _cabinet_response({"ok": True, "sent": True})


async def panel_salon_stats_handler(request: web.Request) -> web.Response:
    """POST /api/panel/salon_stats — реальная выручка/визиты/клиенты по всему салону из YClients."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"permissions": {}}
    if not info.get("permissions", {}).get("analytics"):
        return _cabinet_response({"error": "forbidden", "message": "Недостаточно прав."}, status=403)
    pp = _panel_period(body)
    start, end = pp["start"], pp["end"]   # YYYY-MM-DD, обе границы включительно (для YClients)

    # ── Выручка = продажи из касс (как в YClients): услуги+товары+абонементы+сертификаты ──
    SALE_LABELS = {
        "service": "Услуги",
        "goods_transaction": "Товары",
        "loyalty_abonement": "Абонементы",
        "loyalty_certificate": "Сертификаты",
    }
    try:
        txs = _yc.get_company_transactions(start, end)
    except Exception as e:
        logger.error(f"panel salon_stats tx: {e}")
        txs = []
    revenue = 0.0
    breakdown = {}
    for t in txs:
        if not isinstance(t, dict):
            continue
        item = t.get("sold_item_type")
        if not item:          # не продажа (инкассация/расход/депозит) — в выручку не идёт
            continue
        try:
            a = float(t.get("amount") or 0)
        except Exception:
            a = 0.0
        if a <= 0:            # возвраты/отрицательные не считаем доходом
            continue
        revenue += a
        breakdown[item] = breakdown.get(item, 0.0) + a

    # ── Визиты/клиенты — из записей за то же окно ──
    try:
        recs = _yc.get_company_records(start, end)
    except Exception:
        recs = []
    visits = 0
    clients = set()
    for r in recs:
        if not isinstance(r, dict) or _is_gift_cert_record(r):
            continue
        if r.get("attendance") == 1 or r.get("visit_attendance") == 1:
            visits += 1
            c = r.get("client") or {}
            cid = c.get("id") if isinstance(c, dict) else None
            if cid:
                clients.add(cid)

    bd = [{"key": k, "label": SALE_LABELS.get(k, k), "value": round(v)}
          for k, v in sorted(breakdown.items(), key=lambda x: -x[1])]
    return _cabinet_response({
        "period": pp["period"],
        "period_label": pp["label"],
        "from": start,
        "to": end,
        "visits": visits,
        "revenue": round(revenue),
        "breakdown": bd,
        "avg_check": round(revenue / visits) if visits else 0,
        "clients": len(clients),
        "records": len(recs),
    })


async def panel_salon_today_handler(request: web.Request) -> web.Response:
    """POST /api/panel/salon_today — сегодняшние визиты по всему салону (все мастера) из YClients."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = tg_user.get("id")
    info = _panel_resolve_role(int(tg_id)) if tg_id else {"permissions": {}}
    if not info.get("permissions", {}).get("analytics"):
        return _cabinet_response({"error": "forbidden", "message": "Недостаточно прав."}, status=403)

    today = date.today()
    start = today.isoformat()
    end = (today + timedelta(days=1)).isoformat()
    try:
        recs = _yc.get_company_records(start, end)
    except Exception as e:
        logger.error(f"panel salon_today: {e}")
        recs = []
    items = []
    done = upcoming = 0
    revenue = 0.0
    for r in recs:
        if not isinstance(r, dict) or _is_gift_cert_record(r):
            continue
        dt = (r.get("datetime") or r.get("date") or "")
        if dt[:10] != today.isoformat():
            continue
        cost = 0.0
        for s in (r.get("services") or []):
            if isinstance(s, dict):
                try:
                    cost += float(s.get("cost") or 0)
                except Exception:
                    pass
        att = r.get("attendance") == 1 or r.get("visit_attendance") == 1
        cancelled = r.get("attendance") == -1
        if att:
            done += 1
            revenue += cost
        elif not cancelled:
            upcoming += 1
        staff = r.get("staff") or {}
        client = r.get("client") or {}
        items.append({
            "time": dt[11:16],
            "master": (staff.get("name") if isinstance(staff, dict) else "") or "",
            "client": (client.get("name") if isinstance(client, dict) else "") or "Клиент",
            "services": [s.get("title") for s in (r.get("services") or [])
                         if isinstance(s, dict) and s.get("title")],
            "cost": round(cost),
            "status": "done" if att else ("cancelled" if cancelled else "upcoming"),
        })
    items.sort(key=lambda x: x["time"])
    return _cabinet_response({
        "date": today.isoformat(),
        "visits_done": done,
        "upcoming": upcoming,
        "revenue_done": round(revenue),
        "items": items,
    })


async def health_handler(request: web.Request) -> web.Response:
    """GET /yclients-webhook — health check для дебага."""
    if not _webhook_secret_ok(request):
        return web.json_response({"error": "forbidden"}, status=403)
    return web.json_response({
        "status": "ready",
        "service": "barbershop-bot-webhook",
        "time": datetime.now().isoformat(timespec="seconds"),
        "masters_bound": sum(
            1 for m in database.list_masters() if m.get("telegram_chat_id")
        ),
    })


def _voice_stt_prompt() -> str:
    """Short Russian context that improves recognition of business terms."""
    names = ", ".join(
        str(name).strip() for name in _voice_known_master_names()[:20] if str(name).strip()
    )[:400].rstrip(" ,")
    services = ", ".join(
        str(title).strip()
        for title in _voice_known_service_titles()[:50]
        if str(title).strip()
    )[:900].rstrip(" ,")
    parts = [
        "Русская речь в MAYA барбершопа «Мужская Эстетика».",
        "Темы: запись, свободное окошко, услуги, мастера, расписание, YClients, "
        "выручка, загрузка, средний чек и валовая прибыль.",
    ]
    if names:
        parts.append(f"Имена специалистов: {names}.")
    if services:
        parts.append(f"Названия услуг: {services}.")
    parts.append("Точная транскрипция с обычной пунктуацией, без добавления новых слов.")
    return " ".join(parts)


def _transcribe_openai(raw: bytes, *, prompt: str = "") -> str | None:
    """Transcribe one audio message with OpenAI GPT-4o Transcribe."""
    try:
        import config as _c
        key = getattr(_c, "OPENAI_API_KEY", "") or ""
        proxy = getattr(_c, "PROXY_URL", "") or None
    except Exception:
        return None
    if not key or not raw:
        return None
    # Имя файла по сигнатуре — OpenAI определяет формат и по расширению.
    if raw[:4] == b"\x1aE\xdf\xa3":   ext, mime = "webm", "audio/webm"
    elif raw[4:8] == b"ftyp":         ext, mime = "mp4", "audio/mp4"
    elif raw[:4] == b"OggS":          ext, mime = "ogg", "audio/ogg"
    elif raw[:4] == b"RIFF":          ext, mime = "wav", "audio/wav"
    elif raw[:3] == b"ID3" or (raw[:1] == b"\xff" and (raw[1] & 0xE0) == 0xE0):
        ext, mime = "mp3", "audio/mpeg"
    else:                             ext, mime = "webm", "audio/webm"
    try:
        import httpx
        kw = {"timeout": httpx.Timeout(40.0)}
        if proxy:
            kw["proxy"] = proxy
        # Полная gpt-4o-transcribe точнее mini на трудной/шумной речи (имена, цифры).
        _stt_model = os.getenv("STT_MODEL") or getattr(_c, "STT_MODEL", "gpt-4o-transcribe")
        data = {"model": _stt_model, "language": "ru"}
        if prompt:
            data["prompt"] = prompt
        with httpx.Client(**kw) as c:
            r = c.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                data=data,
                files={"file": (f"audio.{ext}", raw, mime)},
            )
            r.raise_for_status()
            j = r.json()
            try:                            # учёт STT-расхода в ИИ-бюджет
                import ai_billing
                ai_billing.log_audio_usage("maya_voice_stt", _stt_model, j.get("usage") or {})
            except Exception:
                pass
            return (j.get("text") or "").strip() or None
    except Exception as e:
        logger.error(f"_transcribe_openai: {e}")
        return None


def _voice_stt_provider() -> str:
    provider = os.getenv("VOICE_STT_PROVIDER") or getattr(config, "VOICE_STT_PROVIDER", "local")
    provider = str(provider).strip().lower()
    return provider if provider in {"local", "openai", "google", "auto"} else "local"


def _voice_stt_external_fallback_enabled() -> bool:
    value = os.getenv("VOICE_STT_ALLOW_EXTERNAL_FALLBACK")
    if value is None:
        value = getattr(config, "VOICE_STT_ALLOW_EXTERNAL_FALLBACK", False)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _voice_stt_local_fallback_enabled() -> bool:
    value = os.getenv("VOICE_STT_ALLOW_LOCAL_FALLBACK")
    if value is None:
        value = getattr(config, "VOICE_STT_ALLOW_LOCAL_FALLBACK", True)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _transcribe_local(raw: bytes) -> str | None:
    try:
        import local_stt

        return local_stt.transcribe(raw, initial_prompt=_voice_stt_prompt())
    except Exception as e:
        logger.error(f"_transcribe_local: {e}")
        return None


def _transcribe_google(raw: bytes) -> str | None:
    """Legacy external fallback, enabled only explicitly."""
    import tempfile as _tmp
    import os as _os

    import speech_recognition as sr
    from pydub import AudioSegment

    src_path = wav_path = None
    try:
        fd, src_path = _tmp.mkstemp(suffix=".bin"); _os.close(fd)
        with open(src_path, "wb") as f:
            f.write(raw)
        fd, wav_path = _tmp.mkstemp(suffix=".wav"); _os.close(fd)
        AudioSegment.from_file(src_path).export(wav_path, format="wav")
        recognizer = sr.Recognizer()
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)
        return recognizer.recognize_google(audio_data, language="ru-RU")
    except Exception as e:
        logger.error(f"_transcribe_google: {e}")
        return None
    finally:
        for path in (src_path, wav_path):
            if path and _os.path.exists(path):
                try:
                    _os.remove(path)
                except OSError:
                    pass


def _transcribe_audio_bytes(raw: bytes) -> str | None:
    """Route raw PWA/Telegram audio through the configured STT provider."""
    try:
        max_bytes = int(os.getenv("VOICE_STT_MAX_BYTES") or getattr(
            config, "VOICE_STT_MAX_BYTES", 8 * 1024 * 1024
        ))
    except (TypeError, ValueError):
        max_bytes = 8 * 1024 * 1024
    if not raw or len(raw) > max(256 * 1024, max_bytes):
        return None

    provider = _voice_stt_provider()
    if provider == "local":
        return _transcribe_local(raw)
    if provider == "openai":
        text = _transcribe_openai(raw, prompt=_voice_stt_prompt())
        if text:
            return text
        if _voice_stt_local_fallback_enabled():
            return _transcribe_local(raw)
        return None
    if provider == "google":
        return _transcribe_google(raw)

    # auto keeps local audio on the server unless external fallback is explicitly enabled.
    text = _transcribe_local(raw)
    if text:
        return text
    if not _voice_stt_external_fallback_enabled():
        return None
    text = _transcribe_openai(raw, prompt=_voice_stt_prompt())
    if text:
        return text
    return _transcribe_google(raw)


def _transcribe_audio_b64(audio_b64: str) -> str | None:
    """Decode PWA audio and pass it to the shared STT route."""
    import base64 as _b64

    try:
        encoded = audio_b64.strip()
        if encoded.startswith("data:") and "," in encoded:
            encoded = encoded.split(",", 1)[1]
        raw = _b64.b64decode(encoded)
    except Exception:
        return None
    return _transcribe_audio_bytes(raw)


# ════════════════════════════════════════════════════════════════════════
# Согласия (152-ФЗ + ст.18 ФЗ «О рекламе») для приложения.
# Логика и тексты — те же, что у бота: общая БД (`consents`,
# `marketing_consent_at`), общие версии. Источник записи — "app".
# Клиент, подписавший согласие в Telegram-боте, в приложении подписывать
# ещё раз не должен (consent_gate_status вернёт "pass").
# ════════════════════════════════════════════════════════════════════════

# Краткий текст политики для экрана согласия (полная версия — у бота PRIVACY_TEXT).
# Дублируем здесь, чтобы webhook_server не импортировал bot.py (избегаем циклов).
_PRIVACY_SHORT = (
    "Барбершоп «Мужская Эстетика», Ставрополь.\n\n"
    "Оператор персональных данных: ИП Мосин Станислав Евгеньевич, ИНН 263409096156.\n\n"
    "Какие данные собираем: имя и номер телефона — только для оформления записи.\n"
    "Зачем: записать к мастеру, связаться по записи, напомнить о визите.\n"
    "AI-помощник: для формирования ответов передаётся только обезличенная информация (услуга, мастер, дата, время), без имени и телефона.\n\n"
    "Маркетинговые сообщения: промокоды, акции, поздравления — шлём только при отдельном согласии. Без него — только служебные напоминания о записях. Отписаться можно в любой момент.\n\n"
    "Ваши права: уточнить, удалить данные, отозвать согласие — 8-962-447-67-47, malehaircut@gmail.com."
)


def _authed_chat_id(request: web.Request, body: dict | None = None) -> int | None:
    """Единая проверка авторизации: initData (Mini App), auth_data (PWA) или
    веб-сессия (вход через ВК/телефон: body.session_token / X-Session-Token)."""
    init_data = request.headers.get("X-Telegram-InitData", "")
    tg_user = _verify_telegram_init_data(init_data, TELEGRAM_TOKEN) if init_data else None
    if not tg_user and isinstance(body, dict) and isinstance(body.get("auth_data"), dict):
        tg_user = _verify_telegram_login_widget(body["auth_data"], TELEGRAM_TOKEN)
    if tg_user and tg_user.get("id"):
        return int(tg_user["id"])
    tok = ((body or {}).get("session_token") if isinstance(body, dict) else None) \
        or request.headers.get("X-Session-Token", "")
    if tok:
        try:
            sess = web_auth.resolve_session(tok)
            cid = sess.get("chat_id") if sess else None
            if cid:
                return int(cid)
        except Exception:
            pass
    return None


def _client_record_response(payload: dict, status: int = 200) -> web.Response:
    response = _cabinet_response(payload, status=status)
    response.headers["Cache-Control"] = "no-store"
    return response


def _client_record_failure(error: client_record_actions.ClientRecordError) -> web.Response:
    payload = {
        "success": False,
        "ok": False,
        "error": error.code,
        "code": error.code,
        "message": error.message,
    }
    if error.code == "outcome_unknown":
        payload.update({"unknown": True, "retry_allowed": False})
    if error.reference:
        payload["execution_id"] = error.reference
    return _client_record_response(payload, status=error.status)


async def _client_record_request_context(
    request: web.Request,
) -> tuple[dict | None, dict | None, int | None, web.Response | None]:
    try:
        body = await request.json()
    except Exception:
        return None, None, None, _client_record_response({
            "success": False, "error": "invalid_json", "code": "invalid_json",
        }, status=400)
    if not isinstance(body, dict):
        return None, None, None, _client_record_response({
            "success": False, "error": "invalid_json", "code": "invalid_json",
        }, status=400)

    chat_id = _authed_chat_id(request, body)
    if not chat_id:
        return body, None, None, _client_record_response({
            "success": False, "error": "unauthorized", "code": "unauthorized",
        }, status=401)
    if not database.has_valid_consent_by_chat_id(int(chat_id)):
        return body, None, None, _client_record_response({
            "success": False, "error": "needs_consent", "code": "needs_consent",
        }, status=403)

    client = database.get_client(int(chat_id))
    if not client:
        return body, None, None, _client_record_response({
            "success": False, "error": "client_not_found", "code": "client_not_found",
        }, status=404)
    phone = str(client.get("phone") or "").strip()
    if len("".join(ch for ch in phone if ch.isdigit())) < 10:
        return body, client, None, _client_record_response({
            "success": False, "error": "phone_required", "code": "phone_required",
        }, status=409)
    try:
        record_id = int(body.get("record_id") or 0)
    except (TypeError, ValueError):
        record_id = 0
    if record_id <= 0:
        return body, client, None, _client_record_response({
            "success": False, "error": "not_found", "code": "not_found",
            "message": "Запись не найдена.",
        }, status=404)
    return body, client, record_id, None


async def client_cancel_record_handler(request: web.Request) -> web.Response:
    """Cancel only the authenticated client's future YClients record."""
    body, client, record_id, error_response = await _client_record_request_context(request)
    if error_response is not None:
        return error_response

    marker_set = False

    def _mark_authorized(rid: int) -> None:
        nonlocal marker_set
        database.mark_cancel_actor(rid, "client")
        marker_set = True

    try:
        result = await asyncio.to_thread(
            client_record_actions.cancel_for_client,
            _yc,
            int(record_id),
            str(client.get("phone") or ""),
            before_write=_mark_authorized,
        )
    except client_record_actions.ClientRecordError as exc:
        if marker_set:
            database.pop_recent_cancel_actor(int(record_id), max_age=3600)
        return _client_record_failure(exc)
    except Exception as exc:
        if marker_set:
            database.pop_recent_cancel_actor(int(record_id), max_age=3600)
        logger.error("client cancel record_id=%s: %s", record_id, exc)
        return _client_record_response({
            "success": False,
            "error": "yclients_unavailable",
            "code": "yclients_unavailable",
            "message": "Не удалось связаться с системой записи.",
        }, status=502)
    return _client_record_response({
        "success": True,
        "ok": True,
        "record_id": result["record_id"],
        "widget": "mybookings",
    })


async def client_reschedule_record_handler(request: web.Request) -> web.Response:
    """Reschedule only the authenticated client's future record via PUT."""
    body, client, record_id, error_response = await _client_record_request_context(request)
    if error_response is not None:
        return error_response

    marker_set = False

    def _mark_authorized(rid: int) -> None:
        nonlocal marker_set
        database.mark_reschedule_actor(rid, "client")
        marker_set = True

    try:
        result = await asyncio.to_thread(
            client_record_actions.reschedule_for_client,
            _yc,
            int(record_id),
            str(client.get("phone") or ""),
            body,
            before_write=_mark_authorized,
        )
    except client_record_actions.ClientRecordError as exc:
        if marker_set:
            database.pop_recent_reschedule_actor(int(record_id), max_age=3600)
        return _client_record_failure(exc)
    except Exception as exc:
        if marker_set:
            database.pop_recent_reschedule_actor(int(record_id), max_age=3600)
        logger.error("client reschedule record_id=%s: %s", record_id, exc)
        return _client_record_response({
            "success": False,
            "error": "yclients_unavailable",
            "code": "yclients_unavailable",
            "message": "Не удалось связаться с системой записи.",
        }, status=502)
    return _client_record_response({
        "success": True,
        "ok": True,
        "record_id": result["record_id"],
        "datetime": result["datetime"],
        "widget": "mybookings",
    })


async def client_book_with_loyalty_handler(request: web.Request) -> web.Response:
    """Create the authenticated client's booking and redeem one care service.

    Nothing monetary is trusted from the browser. The service, current price,
    balance and exact slot for the combined duration are rechecked server-side.
    """
    return _client_record_response({
        "success": False,
        "error": "p4_03_legacy_mutation_disabled",
        "code": "p4_03_legacy_mutation_disabled",
    }, status=409)

    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    chat_id = _authed_chat_id(request, body)
    if not chat_id:
        return _client_record_response({
            "success": False, "error": "unauthorized", "code": "unauthorized",
        }, status=401)
    if not database.has_valid_consent_by_chat_id(int(chat_id)):
        return _client_record_response({
            "success": False, "error": "needs_consent", "code": "needs_consent",
        }, status=403)
    client = database.get_client(int(chat_id))
    if not client:
        return _client_record_response({
            "success": False, "error": "client_not_found", "code": "client_not_found",
        }, status=404)
    phone = str(client.get("phone") or "").strip()
    if len("".join(ch for ch in phone if ch.isdigit())) < 10:
        return _client_record_response({
            "success": False, "error": "phone_required", "code": "phone_required",
        }, status=409)

    try:
        staff_id = int(body.get("staff_id") or 0)
        service_ids = list(dict.fromkeys(
            int(item) for item in (body.get("service_ids") or []) if int(item) > 0
        ))
    except (TypeError, ValueError):
        staff_id, service_ids = 0, []
    if staff_id <= 0 or not service_ids or len(service_ids) > 8:
        return _client_record_response({
            "success": False, "error": "invalid_booking", "code": "invalid_booking",
        }, status=400)
    try:
        active_ids = {int(item) for item in getattr(config, "ACTIVE_MASTER_IDS", [])}
    except Exception:
        active_ids = set()
    if active_ids and staff_id not in active_ids:
        return _client_record_response({
            "success": False, "error": "staff_unavailable", "code": "staff_unavailable",
        }, status=409)

    start_raw = str(body.get("datetime") or body.get("start") or "").strip()
    start_match = re.match(r"^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?", start_raw)
    if not start_match:
        return _client_record_response({
            "success": False, "error": "invalid_datetime", "code": "invalid_datetime",
        }, status=400)
    date_value, time_value = start_match.group(1), start_match.group(2)
    try:
        booking_dt = datetime.strptime(f"{date_value} {time_value}", "%Y-%m-%d %H:%M")
    except ValueError:
        return _client_record_response({
            "success": False, "error": "invalid_datetime", "code": "invalid_datetime",
        }, status=400)
    if booking_dt < datetime.now() - timedelta(minutes=2) or booking_dt > datetime.now() + timedelta(days=90):
        return _client_record_response({
            "success": False, "error": "invalid_datetime", "code": "invalid_datetime",
        }, status=400)

    request_id = str(body.get("request_id") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", request_id):
        return _client_record_response({
            "success": False, "error": "invalid_request_id", "code": "invalid_request_id",
        }, status=400)
    requested_care_title = str(body.get("loyalty_service_title") or "").strip()
    try:
        requested_care_id = int(body.get("loyalty_service_id") or 0)
    except (TypeError, ValueError):
        requested_care_id = 0

    try:
        catalog = await asyncio.to_thread(_yc.get_services, staff_id)
    except Exception as exc:
        logger.error("loyalty booking catalog staff_id=%s: %s", staff_id, exc)
        catalog = []
    catalog = [row for row in (catalog or []) if isinstance(row, dict) and not row.get("error")]
    catalog_by_id = {
        int(row["id"]): row for row in catalog
        if str(row.get("id") or "").isdigit()
    }
    if any(service_id not in catalog_by_id for service_id in service_ids):
        return _client_record_response({
            "success": False, "error": "service_not_found", "code": "service_not_found",
        }, status=409)

    import loyalty as _loy

    care = _loy.current_care_service(requested_care_title, catalog)
    if not care:
        return _client_record_response({
            "success": False, "error": "loyalty_service_unavailable",
            "code": "loyalty_service_unavailable",
        }, status=409)
    care_id = int(care.get("id") or 0)
    if care_id <= 0 or care_id not in service_ids or (requested_care_id and requested_care_id != care_id):
        return _client_record_response({
            "success": False, "error": "loyalty_service_mismatch",
            "code": "loyalty_service_mismatch",
        }, status=400)

    try:
        await asyncio.to_thread(
            _loy.lazy_backfill_for_client,
            int(client["id"]),
            phone,
        )
    except Exception as exc:
        logger.error("loyalty booking import client_id=%s: %s", client.get("id"), exc)

    # Reserve before checking the live slot so a retry can return the already
    # finalized booking even though that booking has made the slot unavailable.
    # Invalid/taken slots release the temporary hold immediately below.
    reservation = database.reserve_loyalty_points(
        client_id=int(client["id"]),
        points=int(care["price"]),
        request_id=request_id,
    )
    if reservation.get("state") == "finalized":
        return _client_record_response({
            "success": True,
            "ok": True,
            "record_id": reservation.get("record_id"),
            "spent_points": int(reservation.get("points") or care["price"]),
            "remaining_points": int(reservation.get("balance") or 0),
            "loyalty_service": care["title"],
            "idempotent": True,
        })
    if reservation.get("state") == "in_progress":
        return _client_record_response({
            "success": False, "error": "booking_in_progress", "code": "booking_in_progress",
        }, status=409)
    if not reservation.get("ok"):
        return _client_record_response({
            "success": False, "error": "insufficient_points", "code": "insufficient_points",
            "balance": int(reservation.get("balance") or 0),
        }, status=409)

    try:
        slots = await asyncio.to_thread(
            _yc.get_available_slots,
            staff_id,
            date_value,
            service_ids,
        )
    except Exception as exc:
        logger.error("loyalty booking slots staff_id=%s: %s", staff_id, exc)
        slots = [{"error": "yclients_unavailable"}]
    if slots and isinstance(slots[0], dict) and slots[0].get("error"):
        database.release_loyalty_reservation(
            client_id=int(client["id"]), request_id=request_id,
        )
        return _client_record_response({
            "success": False, "error": "yclients_unavailable", "code": "yclients_unavailable",
        }, status=502)

    def _slot_time(slot: dict) -> str:
        raw = str((slot or {}).get("time") or (slot or {}).get("datetime") or "")
        match = re.search(r"(?:T|\s)(\d{2}:\d{2})", raw)
        return match.group(1) if match else raw[:5]

    if not any(_slot_time(slot) == time_value for slot in (slots or [])):
        database.release_loyalty_reservation(
            client_id=int(client["id"]), request_id=request_id,
        )
        return _client_record_response({
            "success": False, "error": "slot_taken", "code": "slot_taken",
            "message": "Это время уже недоступно. Выберите другое.",
        }, status=409)

    try:
        prefs = database.get_notify_prefs_by_chat_id(int(chat_id))
        notify_hours = int(prefs.get("reminder_hours") or 0) if prefs.get("reminder") else 0
    except Exception:
        notify_hours = 3
    booking_result = await asyncio.to_thread(
        _yc.create_booking,
        staff_id=staff_id,
        service_ids=service_ids,
        datetime_str=f"{date_value}T{time_value}:00",
        client_name=str(client.get("name") or "Клиент"),
        client_phone=phone,
        notify_by_sms=notify_hours,
        bridge_origin="webhook.loyalty",
    )
    if not booking_result.get("success"):
        if _action_outcome_unknown(booking_result):
            return _client_record_response(_action_unknown_payload(
                booking_result,
                "Результат записи уточняется. Не повторяйте действие. Баллы пока зарезервированы.",
            ), status=202)
        database.release_loyalty_reservation(
            client_id=int(client["id"]), request_id=request_id,
        )
        code = str(booking_result.get("code") or "booking_failed")
        status = 409 if code in {"slot_taken", "staff_unavailable"} else 502
        return _client_record_response({
            "success": False,
            "error": code,
            "code": code,
            "message": _booking_failure_reply(booking_result),
        }, status=status)

    record_id = int(booking_result.get("record_id") or 0)
    service_names = [
        str(catalog_by_id[service_id].get("title") or "Услуга")
        for service_id in service_ids
    ]
    if record_id <= 0:
        database.release_loyalty_reservation(
            client_id=int(client["id"]), request_id=request_id,
        )
        return _client_record_response({
            "success": True,
            "ok": True,
            "record_id": None,
            "loyalty_applied": False,
            "warning": "booking_created_loyalty_needs_admin",
        })

    redemption = await asyncio.to_thread(
        _loy.apply_redemption_for_booking,
        client_id=int(client["id"]),
        record_id=record_id,
        service_titles=[care["title"]],
        service_quotes=[care],
        reservation_id=request_id,
    )
    if int(redemption.get("total_points") or 0) <= 0:
        database.release_loyalty_reservation(
            client_id=int(client["id"]), request_id=request_id,
        )
    try:
        database.save_booking(
            int(client["id"]),
            service=", ".join(service_names),
            master=str(catalog_by_id.get(care_id, {}).get("staff_name") or ""),
            datetime_str=f"{date_value}T{time_value}:00",
            yclients_record_id=record_id,
        )
    except Exception as exc:
        logger.error("loyalty booking save record_id=%s: %s", record_id, exc)
    return _client_record_response({
        "success": True,
        "ok": True,
        "record_id": record_id,
        "loyalty_applied": int(redemption.get("total_points") or 0) > 0,
        "spent_points": int(redemption.get("total_points") or 0),
        "remaining_points": int(redemption.get("remaining") or 0),
        "loyalty_service": care["title"],
        "datetime": f"{date_value}T{time_value}:00",
        "services": service_names,
    })


async def booking_prefill_handler(request: web.Request) -> web.Response:
    """
    POST /api/booking/prefill — имя и телефон для финального шага онлайн-записи.
    Отдаём полный телефон только авторизованному клиенту с действующим согласием.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    def _booking_response(data: dict, status: int = 200) -> web.Response:
        resp = _cabinet_response(data, status=status)
        resp.headers["Cache-Control"] = "no-store"
        return resp

    chat_id = _authed_chat_id(request, body)
    if not chat_id:
        return _booking_response({"success": False, "error": "unauthorized"}, status=401)

    try:
        client = database.get_client(int(chat_id))
    except Exception as e:
        logger.error(f"booking_prefill: get_client {chat_id}: {e}")
        return _booking_response({"success": False, "error": "internal"}, status=500)

    if not client:
        return _booking_response({
            "success": True,
            "known": False,
            "has_phone": False,
            "name": "",
            "phone": "",
        })

    if not database.has_valid_consent_by_chat_id(int(chat_id)):
        return _booking_response({
            "success": True,
            "known": True,
            "needs_consent": True,
            "has_phone": False,
            "name": client.get("name") or "",
            "phone": "",
        })

    phone = (client.get("phone") or "").strip()
    phone_digits = "".join(ch for ch in phone if ch.isdigit())
    has_phone = len(phone_digits) >= 10
    return _booking_response({
        "success": True,
        "known": True,
        "has_phone": has_phone,
        "name": client.get("name") or "",
        "phone": phone if has_phone else "",
    })


async def client_link_consume_handler(request: web.Request) -> web.Response:
    """Present a server-issued challenge using the original authenticated channel."""
    import legacy_client_command_bridge as client_commands
    try:
        body = await request.json()
        if not isinstance(body, dict) or set(body) - {"auth_data", "session_token", "token"} or not isinstance(body.get("token"), str):
            raise ValueError("invalid_client_link_request")
        proof = client_commands.channel_proof(request.headers, body)
        await asyncio.to_thread(client_commands.command, "consume", proof, {"token": body["token"]})
        return _cabinet_response({"linked": True})
    except ValueError:
        return _cabinet_response({"error": "verified_client_link_required"}, status=403)
    except Exception:
        logger.error("canonical client linking unavailable")
        return _cabinet_response({"error": "client_link_unavailable"}, status=503)


async def consent_status_handler(request: web.Request) -> web.Response:
    """Canonical read: never create a Client, link, profile or consent fact."""
    import legacy_client_command_bridge as client_commands
    try:
        body = await request.json()
        if not isinstance(body, dict) or set(body) - {"auth_data", "session_token"}:
            raise ValueError("invalid_consent_request")
        proof = client_commands.channel_proof(request.headers, body)
        result = await asyncio.to_thread(client_commands.command, "status", proof, {})
        return _cabinet_response({"status": client_commands.consent_status(result),
            "privacy_text": _PRIVACY_SHORT, "version": database.CONSENT_VERSION,
            "client_link_required": result.get("client_link_required", False)})
    except ValueError:
        return _cabinet_response({"error": "verified_client_link_required",
            "message": "Подтвердите привязку клиента к этому каналу."}, status=403)
    except Exception:
        logger.error("canonical consent status unavailable")
        return _cabinet_response({"error": "consent_unavailable"}, status=503)


async def consent_submit_handler(request: web.Request) -> web.Response:
    """A18 initiator: backend independently authenticates the original channel."""
    import legacy_client_command_bridge as client_commands
    try:
        body = await request.json()
        if not isinstance(body, dict) or set(body) - {"auth_data", "session_token", "accept_pdn", "accept_marketing", "idempotency_key"}:
            raise ValueError("invalid_consent_request")
        if type(body.get("accept_pdn")) is not bool or type(body.get("accept_marketing")) is not bool:
            raise ValueError("explicit_consent_decisions_required")
        proof = client_commands.channel_proof(request.headers, body)
        await asyncio.to_thread(client_commands.command, "consent", proof, {
            "privacy": body["accept_pdn"], "marketing": body["accept_marketing"],
            "idempotencyKey": body.get("idempotency_key"),
        })
        result = await asyncio.to_thread(client_commands.command, "status", proof, {})
        return _cabinet_response({"status": client_commands.consent_status(result), "marketing": result.get("marketing", False)})
    except ValueError:
        return _cabinet_response({"error": "verified_client_link_required",
            "message": "Подтвердите привязку клиента и повторите тот же запрос."}, status=403)
    except Exception:
        logger.error("canonical consent command unavailable; no local fallback")
        return _cabinet_response({"error": "consent_unavailable",
            "message": "Не удалось получить результат. Повторите тот же запрос."}, status=503)


def _applogin_nonce_ok(n) -> bool:
    """Простая валидация nonce от приложения: 8..80 url-safe символов."""
    return isinstance(n, str) and 8 <= len(n) <= 80 and all(c.isalnum() or c in "-_" for c in n)


async def applogin_start_handler(request: web.Request) -> web.Response:
    """
    POST /api/applogin/start — нативное приложение начинает вход через Telegram.
    Body: { nonce: "<случайная строка от приложения>" }

    Веб-виджет Telegram не работает в WKWebView (origin standalone-приложения не
    проходит проверку домена бота). Поэтому: приложение генерит nonce → зовёт этот
    эндпоинт → получает deep-link на бота `?start=app_<nonce>` → открывает её → бот
    подтверждает вход (привязывает chat_id+сессию к nonce) → приложение опрашивает
    /api/applogin/poll и забирает session-токен. Nonce живёт 10 минут, одноразовый.
    Auth не требуется — это и есть начало входа.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    nonce = body.get("nonce") if isinstance(body, dict) else None
    if not _applogin_nonce_ok(nonce):
        return _cabinet_response({"error": "bad_nonce"}, status=400)
    try:
        database.applogin_create(nonce)
    except Exception as e:
        logger.error(f"applogin_start: {e}")
        return _cabinet_response({"error": "start_failed"}, status=500)
    from config import BOT_USERNAME
    deep_link = f"https://t.me/{BOT_USERNAME}?start=app_{nonce}"
    return _cabinet_response({"status": "ok", "nonce": nonce, "deep_link": deep_link})


async def applogin_poll_handler(request: web.Request) -> web.Response:
    """
    POST /api/applogin/poll — приложение опрашивает статус входа.
    Body: { nonce }
    → { status: pending | ready(+token, chat_id) | expired }. ready отдаётся один раз.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    nonce = body.get("nonce") if isinstance(body, dict) else None
    if not _applogin_nonce_ok(nonce):
        return _cabinet_response({"error": "bad_nonce"}, status=400)
    try:
        res = database.applogin_poll(nonce)
    except Exception as e:
        logger.error(f"applogin_poll: {e}")
        return _cabinet_response({"error": "poll_failed"}, status=500)
    return _cabinet_response(res)


async def notify_prefs_handler(request: web.Request) -> web.Response:
    """
    POST /api/cabinet/notify-prefs — персональные настройки уведомлений клиента.
    Body: { prefs?: {...} }  (+ auth: auth_data / session_token / X-Telegram-InitData)
    Если prefs передан — частично обновляем; всегда возвращаем актуальный полный набор.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    chat_id = _authed_chat_id(request, body)
    if not chat_id:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    try:
        client_id = database.get_or_create_client(chat_id)
        patch = body.get("prefs")
        if isinstance(patch, dict) and patch:
            prefs = database.set_notify_prefs(client_id, patch)
        else:
            prefs = database.get_notify_prefs(client_id)
    except Exception as e:
        logger.error(f"notify_prefs chat_id={chat_id}: {e}")
        return _cabinet_response({"error": "prefs_failed"}, status=500)
    return _cabinet_response({"prefs": prefs})


async def cert_create_handler(request: web.Request) -> web.Response:
    """
    POST /api/cert/create — покупка подарочного сертификата картой прямо в приложении.

    Body: { amount: 2000|3000|5000, auth_data?: {...} }  (+ заголовок X-Telegram-InitData)

    Создаёт сертификат (pending) и платёж ЮKassa, возвращает confirmation_url —
    приложение открывает страницу оплаты ЮKassa внутри себя. После успешной оплаты
    фоновый _poll_payment (внедрён из бота) помечает сертификат paid и присылает
    PDF покупателю в его Telegram-чат с ботом.

    Получатель по умолчанию — сам покупатель (имя/телефон из БД); полученный PDF
    он может переслать тому, кому дарит. Реквизиты карты в приложение НЕ вводятся —
    оплата проходит на стороне ЮKassa.
    """
    logger.warning("p4_06_legacy_mutation_disabled:initiate_gift_certificate_purchase")
    return _cabinet_response({
        "error": "canonical_gift_certificate_ingress_required",
        "message": "Покупка сертификата временно недоступна. Попробуйте позже.",
    }, status=503)
    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    if not isinstance(body, dict):
        return _cabinet_response({"error": "invalid_json"}, status=400)

    chat_id = _authed_chat_id(request, body)
    if not chat_id:
        return _cabinet_response({"error": "unauthorized"}, status=401)

    try:
        amount = int(body.get("amount") or 0)
    except (TypeError, ValueError):
        amount = 0
    if amount not in _CERT_AMOUNTS:
        return _cabinet_response({
            "error": "bad_amount",
            "message": "Доступны сертификаты на 2 000, 3 000 и 5 000 ₽.",
        }, status=400)

    # Получатель: либо явно заданный (режим «в подарок»), либо сам покупатель («себе»).
    # Телефон проверяем тем же валидатором, что и бот; hash_phone берёт последние
    # 10 цифр, поэтому любой формат (+7 / 8 / без префикса) ищется одинаково.
    raw_phone = (body.get("recipient_phone") or "").strip()
    raw_name = (body.get("recipient_name") or "").strip()
    if raw_phone:
        if not anonymizer.is_valid_phone(raw_phone):
            return _cabinet_response({
                "error": "bad_phone",
                "message": "Проверьте номер телефона получателя.",
            }, status=400)
        recipient_phone = raw_phone
        recipient_name = raw_name or "Получатель"
    else:
        # «Себе» — имя/телефон покупателя из БД (клиент известен по Telegram-id)
        client = database.get_client(chat_id)
        recipient_name = (client or {}).get("name") or "Клиент"
        recipient_phone = (client or {}).get("phone") or ""
        if not recipient_phone:
            return _cabinet_response({
                "error": "no_phone",
                "message": ("Укажите получателя (имя и телефон) — либо оформите одну запись "
                            "через @malesthetic_bot, чтобы покупка «себе» заработала. "
                            "Телефон: 8-962-447-67-47."),
            }, status=400)

    code = database.new_cert_code(amount)
    expires_at = (datetime.now() + timedelta(days=365)).isoformat(timespec="seconds")
    try:
        database.save_gift_certificate(
            code=code,
            amount=amount,
            recipient_phone=recipient_phone,
            recipient_name=recipient_name,
            buyer_chat_id=chat_id,
            expires_at=expires_at,
            payment_status="pending",
        )
    except Exception as e:
        logger.error(f"cert_create save chat_id={chat_id} code={code}: {e}")
        return _cabinet_response({
            "error": "save_failed",
            "message": "Не удалось создать сертификат. Попробуйте позже.",
        }, status=500)

    description = (
        f"Подарочный сертификат {amount} ₽ — «Мужская Эстетика». "
        f"Срок действия 12 месяцев."
    )
    return_url = "https://t.me/malesthetic_bot"

    try:
        payment = await yukassa_api.create_payment(
            amount_rub=amount,
            description=description,
            return_url=return_url,
            metadata={"cert_code": code, "buyer_chat_id": chat_id},
            customer_phone=recipient_phone,
            idempotence_key=f"cert-{code}",
        )
    except Exception as e:
        logger.error(f"cert_create payment chat_id={chat_id} code={code}: {e}")
        return _cabinet_response({
            "error": "payment_failed",
            "message": ("Не получилось создать оплату. Попробуйте позже или "
                        "позвоните 8-962-447-67-47."),
        }, status=502)

    try:
        database.set_cert_payment_id(code, payment["id"])
    except Exception as e:
        logger.error(f"cert_create set_payment_id code={code}: {e}")

    # Фоновый опрос статуса + выдача PDF покупателю в Telegram — переиспользуем
    # протестированную _poll_payment бота (внедрена через register_payment_poller).
    if _poll_payment_fn is not None:
        try:
            asyncio.create_task(_poll_payment_fn(request.app["bot_app"], code, payment["id"]))
        except Exception as e:
            logger.error(f"cert_create poll start code={code}: {e}")
    else:
        logger.error(f"cert_create: _poll_payment_fn не внедрён — PDF для {code} не уйдёт автоматически")

    return _cabinet_response({
        "ok": True,
        "code": code,
        "amount": amount,
        "confirmation_url": payment.get("confirmation_url"),
    })


async def sub_create_handler(request: web.Request) -> web.Response:
    """
    POST /api/sub/create — покупка абонемента картой прямо в приложении.

    Body: { plan: 'haircut'|'complex'|'beard', tier: 'senior'|'top', auth_data?: {...} }

    Создаёт pending-подписку и платёж ЮKassa, возвращает confirmation_url
    (страница оплаты открывается внутри приложения). После оплаты фоновый поллер
    (внедрён из бота) активирует абонемент и уведомляет покупателя в Telegram.
    Абонемент личный — получателя не спрашиваем; телефон для чека 54-ФЗ берём из БД.
    """
    logger.warning("p4_05_legacy_mutation_disabled:initiate_customer_subscription_purchase")
    return _cabinet_response({
        "error": "canonical_subscription_ingress_required",
        "message": "Покупка абонемента временно недоступна. Попробуйте позже.",
    }, status=503)
    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    if not isinstance(body, dict):
        return _cabinet_response({"error": "invalid_json"}, status=400)

    chat_id = _authed_chat_id(request, body)
    if not chat_id:
        return _cabinet_response({"error": "unauthorized"}, status=401)

    plan_code = (body.get("plan") or "").strip()
    tier = (body.get("tier") or "").strip()
    plan = subscriptions.get_plan(plan_code)
    if not plan or tier not in ("senior", "top"):
        return _cabinet_response({
            "error": "bad_plan",
            "message": "Тариф не найден. Обновите приложение и попробуйте снова.",
        }, status=400)

    # Телефон обязателен для чека 54-ФЗ — берём из БД (появляется после первой записи)
    client_id = database.get_or_create_client(chat_id)
    client_row = database.get_client(chat_id)
    customer_phone = (client_row or {}).get("phone")
    if not customer_phone:
        return _cabinet_response({
            "error": "no_phone",
            "message": ("Чтобы оформить абонемент, нужен ваш телефон для чека. Оформите одну "
                        "запись через @malesthetic_bot (я попрошу телефон) — после этого покупка "
                        "в приложении заработает. Или позвоните: 8-962-447-67-47."),
        }, status=400)

    # Не плодим вторую активную подписку (как в боте)
    active = database.get_active_subscription_for_client(client_id)
    if active:
        try:
            days_left = (datetime.fromisoformat(active["expires_at"]).date() - datetime.now().date()).days
        except Exception:
            days_left = 999
        if days_left > subscriptions.RENEW_PUSH_DAYS_BEFORE:
            try:
                expires = datetime.fromisoformat(active["expires_at"]).strftime("%d.%m")
            except Exception:
                expires = "—"
            return _cabinet_response({
                "error": "already_active",
                "message": (f"У вас уже активный абонемент до {expires}. Новый можно будет купить, "
                            f"когда останется ≤ {subscriptions.RENEW_PUSH_DAYS_BEFORE} дней."),
            }, status=400)

    price = subscriptions.get_plan_price(plan, tier)
    tier_label = subscriptions.TIER_LABELS.get(tier, "")
    started_at = datetime.now().isoformat(timespec="seconds")
    expires_at = (datetime.now() + timedelta(days=subscriptions.SUBSCRIPTION_DURATION_DAYS)).isoformat(timespec="seconds")

    try:
        sub_id = database.create_subscription(
            client_id=client_id, plan_code=plan_code, tier=tier,
            price_rub=price, visits_included=plan["visits_per_month"],
            started_at=started_at, expires_at=expires_at,
        )
    except Exception as e:
        logger.error(f"sub_create save chat_id={chat_id} plan={plan_code}: {e}")
        return _cabinet_response({
            "error": "save_failed",
            "message": "Не удалось создать абонемент. Попробуйте позже.",
        }, status=500)

    description = (
        f"Абонемент «{plan['title']} ({tier_label})» — «Мужская Эстетика». "
        f"{plan['visits_per_month']} визита: {', '.join(plan['services_included'])}. "
        f"Срок действия 30 дней."
    )
    return_url = "https://t.me/malesthetic_bot"

    try:
        payment = await yukassa_api.create_payment(
            amount_rub=price,
            description=description,
            return_url=return_url,
            metadata={"subscription_id": sub_id, "plan_code": plan_code, "tier": tier},
            customer_phone=customer_phone,
            idempotence_key=f"sub-{sub_id}",
        )
    except Exception as e:
        logger.error(f"sub_create payment chat_id={chat_id} sub={sub_id}: {e}")
        try:
            database.update_subscription_status(sub_id, "refunded")
        except Exception:
            pass
        return _cabinet_response({
            "error": "payment_failed",
            "message": ("Не получилось создать оплату. Попробуйте позже или "
                        "позвоните 8-962-447-67-47."),
        }, status=502)

    try:
        database.set_subscription_payment_id(sub_id, payment["id"])
    except Exception as e:
        logger.error(f"sub_create set_payment_id sub={sub_id}: {e}")

    # Фоновый опрос статуса + активация + уведомление в Telegram — переиспользуем
    # протестированный _poll_subscription_payment бота (внедрён при старте).
    if _poll_sub_payment_fn is not None:
        try:
            asyncio.create_task(_poll_sub_payment_fn(request.app["bot_app"], sub_id, payment["id"]))
        except Exception as e:
            logger.error(f"sub_create poll start sub={sub_id}: {e}")
    else:
        logger.error(f"sub_create: _poll_sub_payment_fn не внедрён — sub#{sub_id} не активируется автоматически")

    return _cabinet_response({
        "ok": True,
        "subscription_id": sub_id,
        "plan": plan_code,
        "tier": tier,
        "amount": price,
        "confirmation_url": payment.get("confirmation_url"),
    })


def _finalize_booking_for_chat(chat_id: int, cr: dict) -> str | None:
    """
    Оформляет запись для авторизованного клиента приложения. Имя/телефон берём из
    БД (клиент известен по Telegram-id), создаём запись в YClients и сохраняем —
    как делает бот в _finalize_booking, но без Telegram-UI (контакт уже есть).
    Возвращает текст-подтверждение, либо None (тогда оставим исходный текст ИИ).
    """
    try:
        client = database.get_client(chat_id)
        name = (client or {}).get("name") or "Клиент"
        phone = (client or {}).get("phone") or ""
        if not phone:
            return ("Почти готово! Для записи нужен ваш номер телефона. Оформите эту запись "
                    "один раз через @malesthetic_bot (я попрошу телефон) — дальше всё будет "
                    "автоматически. Или позвоните: 8-962-447-67-47.")
        loyalty_quote = None
        requested_points = list(cr.get("pay_with_points") or [])
        if requested_points and client and client.get("id"):
            try:
                import loyalty as _loy

                _loy.lazy_backfill_for_client(int(client["id"]), phone)
                balance = int(database.loyalty_balance(int(client["id"])))
                in_order = {
                    _loy._normalize_service_title(title)
                    for title in (cr.get("service_names") or [])
                }
                candidates = [
                    care for care in _loy.current_care_services()
                    if _loy._normalize_service_title(care.get("title")) in in_order
                    and _loy._normalize_service_title(care.get("title")) in {
                        _loy._normalize_service_title(title) for title in requested_points
                    }
                    and int(care.get("price") or 0) <= balance
                ]
                if candidates:
                    loyalty_quote = max(candidates, key=lambda care: int(care["price"]))
            except Exception as exc:
                logger.error("chat loyalty validation client_id=%s: %s", client.get("id"), exc)
        # YClients SMS/WhatsApp-напоминание — по персональной настройке клиента:
        # выключил напоминание → notify_by_sms=0 (YClients молчит); иначе за reminder_hours.
        try:
            _np = database.get_notify_prefs_by_chat_id(chat_id)
            _nbs = int(_np.get("reminder_hours") or 0) if _np.get("reminder") else 0
        except Exception:
            _nbs = 3
        result = _yc.create_booking(
            staff_id=cr["staff_id"],
            service_ids=cr["service_ids"],
            datetime_str=cr["datetime_str"],
            client_name=name,
            client_phone=phone,
            notify_by_sms=_nbs,
            bridge_origin="webhook.chat",
        )
        if not result.get("success"):
            logger.error(
                "chat booking failed chat_id=%s code=%s status=%s error=%s",
                chat_id,
                result.get("code"),
                result.get("http_status"),
                result.get("error"),
            )
            return _booking_failure_reply(result)
        try:
            if client and client.get("id"):
                database.save_booking(
                    client["id"],
                    service=", ".join(cr["service_names"]),
                    master=cr["staff_name"],
                    datetime_str=cr["datetime_str"],
                    yclients_record_id=result.get("record_id"),
                )
        except Exception as e:
            logger.error(f"chat save_booking chat_id={chat_id}: {e}")
        redemption = None
        record_id = result.get("record_id")
        if loyalty_quote and record_id and client and client.get("id"):
            try:
                import loyalty as _loy

                redemption = _loy.apply_redemption_for_booking(
                    client_id=int(client["id"]),
                    record_id=int(record_id),
                    service_titles=[loyalty_quote["title"]],
                    service_quotes=[loyalty_quote],
                )
            except Exception as exc:
                logger.error("chat loyalty redemption record_id=%s: %s", record_id, exc)
        dt = str(cr["datetime_str"]).replace("T", " ")[:16]
        reply = ("Готово, записала вас! ✅\n\n"
                 "✂️ " + ", ".join(cr["service_names"]) + "\n"
                 "💈 " + cr["staff_name"] + "\n"
                 "📅 " + dt)
        if redemption and int(redemption.get("total_points") or 0) > 0:
            reply += (
                f"\n🪙 {int(redemption['total_points'])} баллов списано за "
                f"{loyalty_quote['title']}. Осталось "
                f"{int(redemption.get('remaining') or 0)} баллов."
            )
        return reply + "\n\nЖдём вас в «Мужской Эстетике»! 💈"
    except Exception as e:
        logger.error(f"_finalize_booking_for_chat chat_id={chat_id}: {e}")
        return None


async def chat_options_handler(request: web.Request) -> web.Response:
    """CORS preflight для /api/chat (POST)."""
    resp = _cabinet_response({"ok": True})
    resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return resp


def _master_chat_shortcut(chat_id: int, message: str) -> str | None:
    """Короткие внутренние ответы мастеру без вызова AI-модели."""
    try:
        info = _panel_resolve_role(int(chat_id))
    except Exception:
        info = {}
    if not (info.get("is_master") or info.get("role") in ("owner", "manager")):
        return None

    text = (message or "").lower()
    master = None
    try:
        master = database.get_master_by_chat_id(int(chat_id))
    except Exception:
        master = None
    master_name = info.get("master_name") or (master or {}).get("full_name") or "мастер"
    staff_id = info.get("staff_id") or _master_staff_id(master)
    push_count = 0
    if master:
        try:
            push_count = len(_push_subscriptions_for_master(master))
        except Exception:
            push_count = 0

    # Заглушка про «чаевые» убрана: вопросы про чаевые (сколько, на сколько) теперь
    # обрабатывает AI через инструмент get_my_tips — иначе бот «тупил» на этом слове.

    if any(w in text for w in ("пуш", "push", "уведомлен", "notification")) and not any(
            w in text for w in ("запис", "клиент", "во сколько", "сколько у", "расписан",
                                "услуг", "график", "придёт", "придет", "пятниц", "сегодня", "завтра")):
        return (
            f"Вижу вас как {master_name}. Уведомления мастера работают через установленную PWA/APK: "
            "новая запись, перенос, отмена и чаевые приходят push-сообщением. "
            + (
                f"Сейчас push-подписка найдена: {push_count}."
                if push_count else
                "Сейчас push-подписки нет — откройте приложение и нажмите «Включить уведомления»."
            )
        )

    if any(w in text for w in ("кто я", "я мастер", "моя роль", "роль", "распозна")) and not any(
            w in text for w in ("запис", "клиент", "во сколько", "сколько у", "расписан",
                                "услуг", "график", "придёт", "придет", "пятниц")):
        return (
            f"Да, распознал: {master_name}. "
            f"Роль: {info.get('role') or 'сотрудник'}, staff_id: {staff_id or 'не указан'}. "
            "В приложении вам должна быть доступна «Панель управления»."
        )

    return None


_UPSELL_OFFER_RE = re.compile(
    r"(добавляем\s+что-то\s+или\s+только\s+стрижк|"
    r"к\s+стрижк[еия]\s+можно\s+(?:еще|ещё)|"
    r"можно\s+(?:еще|ещё)\s+добавить)",
    re.IGNORECASE | re.DOTALL,
)
_UPSELL_ADDON_RE = re.compile(
    r"(бород|моделирован|тонирован|уклад|камуфляж|усы|брить|комплекс|пакет)",
    re.IGNORECASE,
)
_UPSELL_DECLINE_WORDS_RE = re.compile(
    r"\b(нет|не\s+надо|без|только|остав|стри[дж]к[аеиуой]?)\b",
    re.IGNORECASE,
)


def _history_text(item) -> str:
    if isinstance(item, dict) and item.get("content_enc"):
        try:
            from pii_crypto import decrypt
            decrypted = decrypt(item.get("content_enc"))
            if decrypted:
                return decrypted
        except Exception:
            pass
    content = item.get("content") if isinstance(item, dict) else ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
            elif isinstance(part, str):
                parts.append(part)
        return " ".join(parts)
    return ""


def _assistant_just_offered_upsell(history: list[dict]) -> bool:
    for item in reversed(history[-8:]):
        if not isinstance(item, dict) or item.get("role") != "assistant":
            continue
        return bool(_UPSELL_OFFER_RE.search(_history_text(item)))
    return False


def _looks_like_upsell_decline(message: str) -> bool:
    text = (message or "").lower().replace("ё", "е").strip()
    if not text:
        return False
    if re.search(r"\b(без|нет|не\s+надо|только)\b.*(бород|уклад|моделирован|тонирован|доп)", text):
        return True
    if _UPSELL_ADDON_RE.search(text):
        return False
    if re.fullmatch(r"[\s.,!?-]*(мужская\s+)?стри[дж]к[аеиуой]?[\s.,!?-]*", text):
        return True
    if _UPSELL_DECLINE_WORDS_RE.search(text) and len(text) <= 80:
        return True
    return False


def _deterministic_upsell_reply(message: str, history: list[dict]) -> str | None:
    """Do not interrupt the booking flow after an upsell decline.

    The AI prompt and tool loop already suppress repeated upsells. Returning a
    fixed reply here loses context such as the chosen master/time, so let the
    model continue the current booking step.
    """
    return None


_SHOP_SUBS_RE = re.compile(r"\b(абонемент\w*|подписк\w*)\b", re.IGNORECASE)
_SHOP_CERT_RE = re.compile(r"\b(сертификат\w*|подарочн\w*)\b", re.IGNORECASE)
_SHOP_BUY_INTENT_RE = re.compile(
    r"\b(куп\w*|оформ\w*|хоч\w*|покаж\w*|откр\w*|выбер\w*|какие|цены|стоим\w*|тариф\w*)\b",
    re.IGNORECASE,
)
_SHOP_STATUS_INTENT_RE = re.compile(
    r"\b(мой|моя|мое|моё|у\s+меня|остат\w*|актив\w*|сколько|есть\s+ли|провер\w*)\b",
    re.IGNORECASE,
)
_SHOP_AMOUNT_RE = re.compile(
    r"(?<!\d)(\d{1,3}(?:[\s\u00a0\u202f]\d{3})+|\d{4,6})(?!\d)"
)


def _shop_rubles(value: Any) -> str:
    try:
        return f"{int(value):,}".replace(",", " ")
    except (TypeError, ValueError, OverflowError):
        return "0"


def _requested_shop_amount(text: str) -> int | None:
    match = _SHOP_AMOUNT_RE.search(text or "")
    if not match:
        return None
    try:
        return int(re.sub(r"\s+", "", match.group(1)))
    except (TypeError, ValueError, OverflowError):
        return None


def _subscription_shop_catalog() -> tuple[str, set[int]]:
    offers = []
    prices: set[int] = set()
    for plan in getattr(subscriptions, "PLANS", ()) or ():
        if not isinstance(plan, dict):
            continue
        title = str(plan.get("title") or "").strip()
        plan_prices = plan.get("prices") if isinstance(plan.get("prices"), dict) else {}
        try:
            senior = int(plan_prices.get("senior"))
            top = int(plan_prices.get("top"))
        except (TypeError, ValueError, OverflowError):
            continue
        if not title or senior <= 0 or top <= 0:
            continue
        prices.update((senior, top))
        offers.append(
            f"«{title}» — {_shop_rubles(senior)} ₽ у старшего / "
            f"{_shop_rubles(top)} ₽ у топ-мастера"
        )
    return "; ".join(offers), prices


def _direct_shop_action(message: str) -> tuple[str, dict] | None:
    """Deterministic app navigation for obvious shop intents."""
    text = (message or "").strip().lower().replace("ё", "е")
    if not text:
        return None
    has_subs = bool(_SHOP_SUBS_RE.search(text))
    has_cert = bool(_SHOP_CERT_RE.search(text))
    if has_subs and has_cert and _SHOP_BUY_INTENT_RE.search(text):
        catalog, _ = _subscription_shop_catalog()
        amounts = ", ".join(_shop_rubles(amount) for amount in _CERT_AMOUNTS[:-1])
        amounts += f" и {_shop_rubles(_CERT_AMOUNTS[-1])} ₽"
        catalog_text = (
            f"Абонементы: {catalog}. "
            if catalog
            else "Актуальные абонементы и цены показаны в магазине. "
        )
        return (
            catalog_text + f"Сертификаты: {amounts}. Открываю магазин.",
            {"type": "open_shop", "label": "Открыть магазин", "screen": "shop"},
        )
    if has_subs and _SHOP_STATUS_INTENT_RE.search(text) and not _SHOP_BUY_INTENT_RE.search(text):
        return (
            "Ваш активный абонемент и остаток услуг видны в личном кабинете.",
            {"type": "open_cabinet", "label": "Открыть кабинет", "screen": "cabinet"},
        )
    if has_subs and (_SHOP_BUY_INTENT_RE.search(text) or len(text) <= 24):
        catalog, valid_prices = _subscription_shop_catalog()
        requested_amount = _requested_shop_amount(text)
        unavailable = (
            f"Абонемента за {_shop_rubles(requested_amount)} ₽ в магазине нет. "
            if requested_amount and requested_amount not in valid_prices
            else ""
        )
        catalog_text = (
            f"Доступны: {catalog}. "
            if catalog
            else "Актуальные варианты и цены показаны в магазине. "
        )
        return (
            unavailable + catalog_text
            + "Открываю раздел «Абонементы» — оплатить можно картой прямо в приложении.",
            {"type": "open_subs", "label": "Оформить абонемент"},
        )
    if has_cert and (_SHOP_BUY_INTENT_RE.search(text) or len(text) <= 28):
        requested_amount = _requested_shop_amount(text)
        unavailable = (
            f"Сертификата на {_shop_rubles(requested_amount)} ₽ в магазине нет. "
            if requested_amount and requested_amount not in _CERT_AMOUNTS
            else ""
        )
        amounts = ", ".join(_shop_rubles(amount) for amount in _CERT_AMOUNTS[:-1])
        amounts += f" и {_shop_rubles(_CERT_AMOUNTS[-1])} ₽"
        return (
            unavailable + f"Доступные номиналы: {amounts}. "
            "Открываю раздел «Сертификаты»: выберите получателя и оплатите картой.",
            {"type": "open_certs", "label": "Оформить сертификат"},
        )
    return None


CLIENT_CHAT_DISABLED_TOOLS = {"barber_knowledge"}
CLIENT_CHAT_SURFACE_NUDGE = (
    "\n\n[Это клиентский кабинет MAYA. Здесь нельзя использовать базу знаний по технике "
    "стрижек, учебник барбера, схемы стрижек и картинки из книги. Отвечай только как "
    "администратор салона: про запись, услуги, мастеров, уровни мастеров, свободное "
    "время, скидки, абонементы, сертификаты, адрес, режим работы и клиентский сервис. "
    "Если клиент спрашивает «как стричь/техника/схема» — мягко скажи, что в клиентском "
    "чате помогаешь с записью и услугами салона.]"
)
CHAT_TEMPORARY_ERROR_REPLY = (
    "MAYA временно недоступна. Записаться можно через кнопку ниже — "
    "форма записи и свободные окна работают."
)
STAFF_CHAT_TEMPORARY_ERROR_REPLY = (
    "MAYA временно недоступна. Рабочие данные в кабинете остаются доступны; "
    "чат вернётся после восстановления AI-сервиса."
)


def _chat_temporary_error(mode: str) -> tuple[str, dict | None]:
    if str(mode or "").strip().lower() == "staff":
        return STAFF_CHAT_TEMPORARY_ERROR_REPLY, None
    return CHAT_TEMPORARY_ERROR_REPLY, {
        "type": "open_booking",
        "label": "Записаться",
        "screen": "book",
    }
STAFF_BOOKING_SCOPE_REPLY = (
    "В рабочем чате я не записываю вас как клиента и не оформляю клиентские записи. "
    "Здесь я помогаю по работе: аналитика, выручка, зарплаты, расписание и задачи салона. "
    "Для личной записи откройте кабинет клиента."
)
STAFF_CHAT_SURFACE_NUDGE = (
    "\n\n[Это рабочий кабинет MAYA для владельца/персонала. Не отвечай клиентской "
    "витриной и не подменяй бизнес-вопросы списком команды. Если спрашивают про "
    "выручку, прибыль, кассу, зарплаты, загрузку, клиентов, эффективность мастеров "
    "или динамику бизнеса — используй доступные бизнес-инструменты и отвечай цифрами. "
    "Если сотрудник просит записать его как клиента, оформить клиентскую запись, "
    "перенести/отменить личную запись или открыть клиентский booking-flow — откажи "
    "и скажи перейти в кабинет клиента. Не раскрывай телефоны/имена клиентов.]"
)

SALON_FOUNDED_YEAR = "2019"
_BOOKING_INTENT_RE = re.compile(
    r"\b(хочу|надо|нужно|можно|давай|запиши|записаться|запис[а-я]*|оформ[а-я]*|"
    r"постричься|подстричься)\b",
    re.IGNORECASE,
)
_BOOKING_SERVICE_RE = re.compile(
    r"\b(стриж|стрид|бород|брит|камуфляж|тонир|уход|услуг|мастер)\w*",
    re.IGNORECASE,
)
_BOOKING_SPECIFIC_RE = re.compile(
    r"\b(сегодня|завтра|послезавтра|понедельник|вторник|сред[ау]|четверг|пятниц[ау]|"
    r"суббот[ау]|воскресень[ея]|стас|илья|илюх|саша|сан[ея]|александр|алексей|л[её]ш|"
    r"макс|максим|киянск|дарм|третьяк|мосин|чурсинов|\d{1,2}[:.]\d{2}|\b\d{1,2}\s*(?:час|ч|:00))\b",
    re.IGNORECASE,
)
_BOOKING_START_ONLY_RE = re.compile(
    r"^\s*(?:хочу\s+)?(?:записаться|запиши(?:те)?\s+меня|запись)\s*[.!?]*\s*$",
    re.IGNORECASE,
)
_CLIENT_GREETING_ONLY_RE = re.compile(
    r"^\s*(?:привет(?:ствую)?|здравствуй(?:те)?|доброе\s+утро|добрый\s+день|"
    r"добрый\s+вечер|салют|хай)\s*[!.,?]*\s*$",
    re.IGNORECASE,
)
_USUAL_MASTER_INTENT_RE = re.compile(
    r"(?:\b(?:мой|моему|моего|свой|своему|своего)\s+"
    r"(?:(?:постоянн|обычн|любим)\w*\s+)?(?:мастер|барбер)\w*\b|"
    r"\b(?:постоянн|обычн|любим)\w*\s+(?:мастер|барбер)\w*\b|"
    r"\bк\s+тому\s+же\s+(?:мастер|барбер)\w*\b|"
    r"\bкак\s+обычно\b|\bкак\s+в\s+прошл\w*\s+раз\b|"
    r"\b(?:то\s+же|тоже)\s+самое\b)",
    re.IGNORECASE,
)
_REPEAT_BOOKING_YES_RE = re.compile(
    r"^\s*(?:да|ага|угу|конечно|верно|точно|подходит|хочу|можно|"
    r"давайте|давай\s+так|повтор(?:и|им|ить)|(?:то\s+же|тоже)\s+самое|"
    r"да[,.!\s]+(?:давайте|конечно|как\s+(?:обычно|в\s+прошл\w*\s+раз))|"
    r"как\s+(?:обычно|в\s+прошл\w*\s+раз))\s*[.!?]*\s*$",
    re.IGNORECASE,
)
_REPEAT_BOOKING_NO_RE = re.compile(
    r"^\s*(?:нет|не\s+сейчас|друг(?:ой|ого)\s+(?:мастер|барбер)|"
    r"друг(?:ая|ую)\s+услуг(?:а|у)|хочу\s+изменить)\s*[.!?]*\s*$",
    re.IGNORECASE,
)
_STAFF_CLIENT_BOOKING_RE = re.compile(
    r"\b("
    r"запиши(?:те)?(?:\s+меня|\s+нас)?|записать\s+(?:меня|нас)|"
    r"хочу\s+(?:записаться|постричься|подстричься|на\s+стриж)|"
    r"(?:надо|нужно|можно)\s+(?:записаться|постричься|подстричься|на\s+стриж)|"
    r"записаться|постричься|подстричься|"
    r"(?:перенеси|перенести|отмени|отменить)\s+(?:мою|мне|меня)?\s*запис)"
    r"\b",
    re.IGNORECASE,
)
_ADDRESS_INTENT_RE = re.compile(
    r"\b(адрес|где\s+вы|где\s+находитесь|как\s+добраться|куда\s+ехать|карты|2gis|2гис|"
    r"яндекс\.?карт|лермонтова)\b",
    re.IGNORECASE,
)
_DISCOUNT_INTENT_RE = re.compile(
    r"\b(скидк|акци|балл|бонус|лояльн|промокод|реферал|день\s+рожд|др)\w*",
    re.IGNORECASE,
)
_MASTERS_INTENT_RE = re.compile(
    r"\b(мастер\w*|барбер\w*|сотрудник\w*|команд\w*|кто\s+стрижет|кто\s+стриж[её]т|к\s+кому|посоветуй|"
    r"топ-мастер|старш(?:ий|ие)|кто\s+лучше)\b",
    re.IGNORECASE,
)
_BUSINESS_MASTER_ANALYTICS_RE = re.compile(
    r"\b(прибыл\w*|выруч\w*|доход\w*|касс\w*|оборот\w*|деньг\w*|"
    r"заработ\w*|зарабат\w*|принос\w*|прин[еёо]с\w*|сделал\w*|сделали|"
    r"зарплат\w*|марж\w*|прибыльн\w*|рентабельн\w*|"
    r"средн\w*\s+чек|чек\w*|визит\w*|клиент\w*)\b",
    re.IGNORECASE,
)
_BUSINESS_ANALYTICS_RE = re.compile(
    r"\b(аналитик\w*|отч[её]т\w*|валов\w*|прибыл\w*|выруч\w*|доход\w*|"
    r"касс\w*|оборот\w*|марж\w*|зарплат\w*|заработ\w*|зарабат\w*|"
    r"средн\w*\s+чек|чист\w*\s+прибыл\w*|сколько\s+заработ\w*)\b",
    re.IGNORECASE,
)
_BUSINESS_PERSON_ANALYTICS_RE = re.compile(
    r"\bкто\b.{0,80}\b("
    r"прибыл\w*|выруч\w*|доход\w*|касс\w*|оборот\w*|деньг\w*|"
    r"заработ\w*|зарабат\w*|принос\w*|прин[еёо]с\w*|сделал\w*|сделали|"
    r"зарплат\w*|марж\w*|прибыльн\w*|рентабельн\w*)\b",
    re.IGNORECASE,
)
_FOUNDED_INTENT_RE = re.compile(
    r"\b(когда\s+основан|год\s+основан|основан|сколько\s+лет|истори[яи]\s+салона)\b",
    re.IGNORECASE,
)


def _chat_request_mode(body: dict | None) -> str:
    mode = str((body or {}).get("mode") or "").strip().lower()
    return "staff" if mode == "staff" else "client"


def _chat_effective_mode(body: dict | None, chat_id: int) -> str:
    """Resolve app surface mode after auth; staff mode is never trusted from payload alone."""
    if _chat_request_mode(body) != "staff":
        return "client"
    try:
        info = _panel_resolve_role(int(chat_id))
    except Exception:
        info = {}
    if info.get("is_master") or info.get("role") in ("owner", "manager", "master"):
        return "staff"
    return "client"


def _chat_history_key(chat_id: int, mode: str) -> str:
    """PWA chat memory is separated by app surface, not only by Telegram ID."""
    surface = "staff" if mode == "staff" else "client"
    return f"pwa:{surface}:{int(chat_id)}"


def _chat_disabled_tools(mode: str) -> set[str]:
    # В рабочем кабинете база знаний/аналитика должны быть доступны по RBAC.
    return set() if mode == "staff" else set(CLIENT_CHAT_DISABLED_TOOLS)


def _chat_llm_message(safe_message: str, *, mode: str, voice_mode: bool = False) -> str:
    content = safe_message or ""
    content += STAFF_CHAT_SURFACE_NUDGE if mode == "staff" else CLIENT_CHAT_SURFACE_NUDGE
    if voice_mode:
        content += _VOICE_STYLE_NUDGE
    return content


def _business_master_analytics_intent(message: str) -> bool:
    low = (message or "").strip().lower().replace("ё", "е")
    if not low:
        return False
    return bool(
        (_MASTERS_INTENT_RE.search(low) and _BUSINESS_MASTER_ANALYTICS_RE.search(low))
        or _BUSINESS_PERSON_ANALYTICS_RE.search(low)
    )


def _client_business_scope_reply(message: str) -> str | None:
    low = (message or "").strip().lower().replace("ё", "е")
    if not (_business_master_analytics_intent(low) or _BUSINESS_ANALYTICS_RE.search(low)):
        return None
    return (
        "Это внутренний вопрос салона. В клиентском кабинете я не показываю выручку, "
        "прибыль, зарплаты и аналитику мастеров. Здесь помогу выбрать услугу, мастера "
        "или удобное время записи."
    )


def _staff_booking_scope_reply(message: str) -> str | None:
    low = (message or "").strip().lower().replace("ё", "е")
    if not low:
        return None
    if _STAFF_CLIENT_BOOKING_RE.search(low):
        return STAFF_BOOKING_SCOPE_REPLY
    return None


def _allow_client_chat_shortcuts(body: dict, chat_id: int, message: str) -> bool:
    if _chat_request_mode(body) == "staff":
        return False
    if _business_master_analytics_intent(message):
        return False
    return True


def _analytics_period_from_text(message: str) -> tuple[str, str | None, str | None]:
    low = (message or "").strip().lower().replace("ё", "е")
    if "вчера" in low:
        return "yesterday", None, None
    if "прошл" in low and "недел" in low:
        return "last_week", None, None
    if "недел" in low:
        return "week", None, None
    if "месяц" in low or "июл" in low or "июн" in low or "январ" in low or "феврал" in low:
        return "month", None, None
    if "сегодня" in low:
        return "today", None, None
    return "last_30", None, None


def _rub(value) -> str:
    try:
        n = int(round(float(value or 0)))
    except Exception:
        n = 0
    return f"{n:,}".replace(",", " ") + " ₽"


_STAFF_FACT_ANALYTICS_METRIC_RE = re.compile(
    r"\b(выруч\w*|оборот\w*|касс\w*|заработ\w*|зарабат\w*|"
    r"прибыл(?:ь|и|ью|е|ей)|потбыл\w*|пребыл\w*|прибел\w*|"
    r"средн\w*\s+чек|визит\w*|клиент\w*|топ\s+услуг\w*|статистик\w*)\b",
    re.IGNORECASE,
)
_STAFF_FACT_ANALYTICS_REQUEST_RE = re.compile(
    r"(?:\b(?:сколько|какая|какой|покажи|показать|дай|посчитай|сводка)\b|"
    r"\bза\s+(?:сегодня|вчера|недел\w*|месяц\w*|\d+\s+дн\w*)\b|"
    r"\b(?:моя|мой|мои|наша|наш|общая|общий|личная|личный)\b)",
    re.IGNORECASE,
)
_STAFF_FACT_ANALYTICS_PLANNING_RE = re.compile(
    r"\b(почему|как\s+(?:поднять|увеличить|вырастить|улучшить)|"
    r"план\w*|прогноз\w*|цель\w*|добить|увелич\w*|поднять|"
    r"выраст\w*|улучш\w*|привлеч\w*|заполн\w*|теря\w*)\b",
    re.IGNORECASE,
)
_STAFF_BUSINESS_SCOPE_RE = re.compile(
    r"(?:\b(?:по|для)\s+(?:всему\s+)?(?:бизнесу|салону)\b|"
    r"\b(?:бизнеса|салона|всего\s+бизнеса|всего\s+салона)\b|"
    r"\b(?:по\s+всем|все|всех)\s+(?:мастер\w*|сотрудник\w*)\b|"
    r"\b(?:общая|общий|общую)\s+(?:выруч\w*|касс\w*|статистик\w*)\b|"
    r"\bкасс\w*\b|\bмы\s+заработ\w*|\bсколько\s+заработали\b|"
    r"\bтоп\s+услуг\w*)",
    re.IGNORECASE,
)
_STAFF_PERSONAL_SCOPE_RE = re.compile(
    r"(?:\b(?:моя|мой|мои|личная|личный)\b|\bу\s+меня\b|"
    r"\bсколько\s+я\b|\bя\s+(?:заработ\w*|сделал\w*)\b)",
    re.IGNORECASE,
)

_STAFF_PROFIT_WORD_RE = re.compile(
    r"\b(?:прибыл(?:ь|и|ью|е|ей)|потбыл\w*|пребыл\w*|прибел\w*)\b",
    re.IGNORECASE,
)
_STAFF_GROSS_PROFIT_RE = re.compile(r"\bвалов\w*\b", re.IGNORECASE)
_STAFF_NET_PROFIT_RE = re.compile(r"\bчист\w*\b", re.IGNORECASE)
_STAFF_FINANCIAL_FOLLOWUP_RE = re.compile(
    r"^\s*(?:а\s+)?(?:сумм\w*\s+(?:мне\w{0,2}\s*)?(?:назови|скажи|дай)|"
    r"назови\s+(?:мне\s+)?сумм\w*|сколько\s+(?:это|получается|в\s+итоге)|"
    r"общ(?:ая|ую|ий|ие)|всего|по\s+(?:всему\s+)?(?:салону|бизнесу)|"
    r"мо[яю]|личн(?:ая|ую))\s*[.!?]*\s*$",
    re.IGNORECASE,
)
_STAFF_BUSINESS_SCOPE_FOLLOWUP_RE = re.compile(
    r"^\s*(?:общ(?:ая|ую|ий|ие)|всего|по\s+(?:всему\s+)?(?:салону|бизнесу))\s*[.!?]*\s*$",
    re.IGNORECASE,
)
_STAFF_PERSONAL_SCOPE_FOLLOWUP_RE = re.compile(
    r"^\s*(?:мо[яю]|личн(?:ая|ую))\s*[.!?]*\s*$",
    re.IGNORECASE,
)
_STAFF_ANALYTICS_PERIOD_RE = re.compile(
    r"\b(?:сегодня|вчера|позавчера|недел\w*|месяц\w*|последн\w*\s+30\s+дн\w*)\b",
    re.IGNORECASE,
)


def _staff_financial_metric(message: str) -> str | None:
    """Resolve the requested financial concept before the request reaches an LLM."""
    low = (message or "").strip().lower().replace("ё", "е")
    if not _STAFF_PROFIT_WORD_RE.search(low):
        return None
    if _STAFF_NET_PROFIT_RE.search(low):
        return "net_profit"
    if _STAFF_GROSS_PROFIT_RE.search(low):
        return "gross_profit"
    return "unspecified_profit"


def _staff_financial_context_message(message: str, history: list | None) -> str:
    """Attach the last explicit metric to short follow-ups such as 'name the amount'."""
    context_message = message or ""
    recent_user_messages = []
    for item in reversed(list(history or [])[-10:]):
        if isinstance(item, dict) and item.get("role") == "user":
            content = item.get("content")
            if isinstance(content, str):
                recent_user_messages.append(content)

    if _STAFF_FINANCIAL_FOLLOWUP_RE.match(context_message):
        previous_metric = next(
            (
                content for content in recent_user_messages
                if _STAFF_FACT_ANALYTICS_METRIC_RE.search(content)
            ),
            None,
        )
        if previous_metric:
            context_message = f"{previous_metric}\n{context_message}"

    if (
        _STAFF_FACT_ANALYTICS_METRIC_RE.search(context_message)
        and not _STAFF_ANALYTICS_PERIOD_RE.search(context_message)
    ):
        previous_period = next(
            (content for content in recent_user_messages if _STAFF_ANALYTICS_PERIOD_RE.search(content)),
            None,
        )
        if previous_period:
            context_message = f"{context_message}\n{previous_period}"
    return context_message


def _staff_fact_analytics_intent(message: str) -> bool:
    """True only for a factual snapshot, not advice or growth planning."""
    low = (message or "").strip().lower().replace("ё", "е")
    if not low or not _STAFF_FACT_ANALYTICS_METRIC_RE.search(low):
        return False
    if _STAFF_FACT_ANALYTICS_PLANNING_RE.search(low):
        return False
    if _staff_financial_metric(low):
        return True
    if _STAFF_FACT_ANALYTICS_REQUEST_RE.search(low):
        return True
    return bool(re.fullmatch(
        r"(?:моя\s+)?(?:выручка|касса|оборот|статистика|средний\s+чек)[.!?\s]*",
        low,
    ))


def _analytics_range_caption(date_from: str, date_to: str) -> str:
    try:
        start = date.fromisoformat(str(date_from)[:10])
        end = date.fromisoformat(str(date_to)[:10])
    except (TypeError, ValueError):
        return f"{date_from} — {date_to}"
    if start.year == end.year:
        return f"{start:%d.%m}–{end:%d.%m.%Y}"
    return f"{start:%d.%m.%Y}–{end:%d.%m.%Y}"


def _staff_financial_analytics_reply(
    chat_id: int,
    message: str,
    mode: str = "staff",
    history: list | None = None,
) -> str | None:
    """Return YClients-grounded staff analytics without allowing LLM arithmetic.

    On the employee surface an unqualified "revenue" request means the linked
    employee's own production. Business totals require explicit business/team
    wording. This prevents a founder who is also a working master from receiving
    the whole-company report when asking from their employee workspace.
    """
    if str(mode or "").strip().lower() != "staff":
        return None
    intent_message = _staff_financial_context_message(message, history)
    if not _staff_fact_analytics_intent(intent_message):
        return None

    financial_metric = _staff_financial_metric(intent_message)

    try:
        info = _panel_resolve_role(int(chat_id))
    except Exception:
        info = {}

    explicit_business = bool(
        _STAFF_BUSINESS_SCOPE_RE.search(intent_message or "")
        or _STAFF_BUSINESS_SCOPE_FOLLOWUP_RE.match(message or "")
    )
    explicit_personal = bool(
        _STAFF_PERSONAL_SCOPE_RE.search(intent_message or "")
        or _STAFF_PERSONAL_SCOPE_FOLLOWUP_RE.match(message or "")
    )
    if financial_metric:
        # Profit is a company metric. It must never silently become a master's revenue.
        scope = "business"
    elif explicit_business:
        scope = "business"
    elif explicit_personal or info.get("is_master"):
        scope = "personal"
    else:
        scope = "business"

    if scope == "business" and not (info.get("permissions") or {}).get("analytics"):
        return (
            "Общую выручку и кассу бизнеса я показываю только владельцу или "
            "администратору. Вашу личную статистику могу показать отдельно."
        )
    if financial_metric and info.get("role") != "owner" and not info.get("is_founder"):
        return (
            "Валовую и чистую прибыль я показываю только владельцу: расчёт использует "
            "сводную зарплату и расходы бизнеса. Доступную вам выручку могу показать отдельно."
        )
    if financial_metric == "unspecified_profit":
        return (
            "Уточните, какую прибыль показать: валовую после прямой оплаты труда "
            "или чистую после всех расходов. Эти суммы нельзя смешивать."
        )
    if scope == "personal" and not info.get("staff_id"):
        return (
            "Не вижу привязку вашего входа к сотруднику YClients, поэтому не могу "
            "безопасно определить личную выручку. Проверьте привязку профиля в кабинете."
        )

    try:
        import analytics
        period, date_from, date_to = _analytics_period_from_text(intent_message)
        if financial_metric and not _STAFF_ANALYTICS_PERIOD_RE.search(intent_message):
            period = "month"
        frm, to, label = analytics.resolve_period(period, date_from, date_to)
        wants_top = bool(re.search(
            r"\bтоп\s+услуг|что\s+прода", intent_message or "", re.IGNORECASE,
        ))
        summary = analytics.business_summary(frm, to, include_top=wants_top)
    except Exception as e:
        logger.error("staff financial analytics shortcut: %s", e)
        return "Не смогла получить проверенную аналитику из YClients. Попробуйте ещё раз через минуту."

    source_status = summary.get("source_status") or {}
    if source_status.get("transactions") == "unavailable":
        return "YClients сейчас не отдал финансовые операции. Я не буду показывать неподтверждённые цифры."

    period_caption = f"{label}, {_analytics_range_caption(frm, to)}"
    if scope == "business":
        total_gross = int(round(float(summary.get("total_gross") or 0)))
        salary_total = int(round(float(summary.get("salary_total") or 0)))
        margin_after_payroll = total_gross - salary_total
        if financial_metric == "gross_profit":
            return "\n".join([
                f"Точную валовую прибыль бизнеса за период «{period_caption}» сейчас "
                "корректно назвать нельзя.",
                f"Проверенная выручка: {_rub(total_gross)}. Расчётная зарплата "
                f"мастеров: {_rub(salary_total)}. Маржа после зарплаты: "
                f"{_rub(margin_after_payroll)}.",
                "В YClients нет полной себестоимости материалов и других прямых затрат "
                "за этот период. Поэтому маржу после зарплаты не выдаю за валовую прибыль.",
                "Источник: одна актуальная выборка финансовых операций YClients.",
            ])
        if financial_metric == "net_profit":
            return "\n".join([
                f"Подтверждённую чистую прибыль за период «{period_caption}» сейчас "
                "корректно назвать нельзя.",
                f"Подтверждённая выручка: {_rub(total_gross)}. После расчётной зарплаты "
                f"мастеров остаётся {_rub(margin_after_payroll)}.",
                "В MAYA пока нет полного учёта аренды, материалов, налогов, эквайринга "
                "и всех прочих расходов за этот период. Я не буду выдавать неполную "
                "сумму за чистую прибыль.",
                "Источник: одна актуальная выборка финансовых операций YClients.",
            ])
        lines = [
            f"Общая статистика бизнеса за период «{period_caption}»:",
            f"Выручка: {_rub(summary.get('total_gross'))}",
            f"Наличные: {_rub((summary.get('cash') or {}).get('sum'))}",
            f"Карта: {_rub((summary.get('card') or {}).get('sum'))}",
            f"Оплаченных визитов: {int(summary.get('visits') or 0)}",
            f"Средний чек: {_rub(summary.get('avg_check'))}",
        ]
        top_services = summary.get("top_services") or []
        if wants_top and top_services:
            lines.append("Топ услуг:")
            for index, service in enumerate(top_services[:3], 1):
                lines.append(
                    f"{index}. {service.get('title') or 'Услуга'} — {_rub(service.get('sum'))}"
                )
        lines.append("Источник: живые финансовые операции YClients на момент запроса.")
        return "\n".join(lines)

    staff_id = int(info.get("staff_id") or 0)
    mine = next(
        (
            row for row in (summary.get("masters") or [])
            if int((row or {}).get("staff_id") or 0) == staff_id
        ),
        None,
    )
    if not mine:
        return (
            f"Ваша личная статистика за период «{period_caption}»: проведённых оплат "
            "по вашим услугам пока нет. Источник: YClients."
        )

    lines = [
        f"Ваша личная статистика за период «{period_caption}»:",
        f"Выручка по вашим услугам: {_rub(mine.get('gross'))}",
        f"Оплаченных визитов: {int(mine.get('visits') or 0)}",
        f"Средний чек: {_rub(mine.get('avg_check'))}",
    ]
    if mine.get("is_owner"):
        lines.append(
            "Зарплату владельца не приравниваю к этой выручке: личный доход "
            "считается отдельно с учётом расходов бизнеса."
        )
    else:
        lines.append(
            f"Расчётная зарплата ({int(mine.get('percent') or 0)}%): "
            f"{_rub(mine.get('salary'))}"
        )
    lines.append("Источник: живые финансовые операции YClients на момент запроса.")
    return "\n".join(lines)


_FOUNDER_RULE_DELETE_RE = re.compile(
    r"^(?:забудь|удали|отмени|деактивируй)\s+правило\s*#?\s*(\d+)\s*[.!?]*$",
    re.IGNORECASE,
)
_FOUNDER_RULE_ADD_RE = re.compile(
    r"^(?:(?:запомни|сохрани|добавь)\s+(?:новое\s+)?правило"
    r"(?:\s+(?:для\s+)?(?:майи|работы|бизнеса|салона))?"
    r"|(?:научись|обучись)\s+(?:новому\s+)?правилу)\s*(?::|—|-)?\s*(.*)$",
    re.IGNORECASE | re.DOTALL,
)
_FOUNDER_RULE_UNSAFE_RE = re.compile(
    r"\b(?:игнорируй|обойди|отмени)\b.{0,80}"
    r"\b(?:системн\w*\s+правил|безопасност|авторизац|провер\w*\s+доступ)\b",
    re.IGNORECASE | re.DOTALL,
)
_FOUNDER_RULE_PERMISSION_RE = re.compile(
    r"\b(?:разреш\w*|запрет\w*|включ\w*|отключ\w*|открой\w*|закрой\w*)\b"
    r".{0,100}\b(?:доступ\w*|прав\w*|истор\w*|данн\w*|карточ\w*)\b",
    re.IGNORECASE | re.DOTALL,
)


def _founder_rule_command(message: str) -> tuple[str, str | int | None] | None:
    """Parse only explicit procedural-memory commands, never ordinary chat."""
    text = (message or "").strip()
    if not text:
        return None
    text = re.sub(
        r"^(?:майя|мая|маюш(?:а|ка)?)\s*[,!:—-]?\s*",
        "",
        text,
        count=1,
        flags=re.IGNORECASE,
    ).strip()
    low = text.lower().replace("ё", "е")

    match = _FOUNDER_RULE_DELETE_RE.match(text)
    if match:
        return "delete", int(match.group(1))
    if "чему я тебя науч" in low or (
        any(word in low for word in ("покажи", "перечисли")) and "правил" in low
    ):
        return "list", None
    match = _FOUNDER_RULE_ADD_RE.match(text)
    if match:
        rule = (match.group(1) or "").strip(" \t\r\n:—-")
        return ("add", rule) if rule else ("usage", None)
    return None


def _founder_learning_reply(chat_id: int, message: str, mode: str = "staff") -> str | None:
    """Founder-only procedural memory available without an LLM round-trip."""
    command = _founder_rule_command(message)
    if not command:
        return None
    try:
        info = _panel_resolve_role(int(chat_id))
    except Exception:
        info = {}
    if not info.get("is_founder"):
        logger.warning("Founder memory command denied for chat_id=%s", chat_id)
        return "Постоянные правила MAYA может менять только основатель."
    if str(mode or "").strip().lower() != "staff":
        return "Чтобы изменить постоянные правила MAYA, откройте рабочий чат."

    action, value = command
    if action == "usage":
        return "Напишите правило полностью: «Майя, запомни правило: …»."
    if action == "list":
        rules = database.list_salon_rules(active_only=True, limit=40)
        if not rules:
            return "Постоянных правил пока нет."
        lines = [f"{row['id']}. {row['rule_text']}" for row in rules]
        return "Постоянные правила MAYA:\n" + "\n".join(lines)
    if action == "delete":
        deleted = database.deactivate_salon_rule(int(value))
        if deleted:
            return f"Удалила правило [{int(value)}]. Со следующего сообщения оно не действует."
        return f"Действующего правила [{int(value)}] нет."

    rule = str(value or "").strip()
    if len(rule) < 8:
        return "Правило слишком короткое. Уточните, что именно MAYA должна делать."
    if len(rule) > 500:
        return "Правило длиннее 500 символов. Сформулируйте его короче и конкретнее."
    redacted = anonymizer.redact_pii(rule)
    if redacted != rule:
        return "Не сохранила правило: постоянная память не должна содержать персональные данные."
    if _FOUNDER_RULE_UNSAFE_RE.search(rule):
        return "Не сохранила правило: оно пытается отменить серверные ограничения безопасности."
    if _FOUNDER_RULE_PERMISSION_RE.search(rule):
        return (
            "Не сохранила правило: разрешения меняются только прямой "
            "командой из безопасного каталога. Например: «Майя, разреши всем "
            "клиентам видеть свою историю посещений»."
        )

    rules = database.list_salon_rules(active_only=True, limit=100)
    normalized = re.sub(r"\s+", " ", rule).strip().lower().replace("ё", "е")
    for row in rules:
        current = re.sub(r"\s+", " ", str(row.get("rule_text") or "")).strip().lower().replace("ё", "е")
        if current == normalized:
            return f"Это правило уже сохранено под номером [{row['id']}]."
    if len(rules) >= 40:
        return "Активных правил уже 40. Сначала удалите ненужное командой «Майя, удали правило N»."

    rule_id = database.add_salon_rule(rule, created_by=int(chat_id))
    return (
        f"Запомнила правило [{rule_id}]: {rule}\n"
        "Оно начнёт действовать со следующего сообщения во всех чатах MAYA."
    )


def _founder_permission_command(message: str) -> tuple[str, bool | None] | None:
    """Parse explicit global capability commands from the founder."""
    text = (message or "").strip()
    if not text:
        return None
    text = re.sub(
        r"^(?:майя|мая|маюш(?:а|ка)?)\s*[,!:—-]?\s*",
        "",
        text,
        count=1,
        flags=re.IGNORECASE,
    ).strip()
    low = text.lower().replace("ё", "е")
    if (
        any(marker in low for marker in ("покажи", "перечисли", "какие", "статус"))
        and any(marker in low for marker in ("разрешен", "доступ", "возможност"))
    ):
        return "list", None

    history_target = any(marker in low for marker in (
        "истори", "прошлые посещ", "прошлые визит",
    ))
    all_clients = "клиент" in low or "всем пользовател" in low
    if not (history_target and all_clients):
        return None
    if any(marker in low for marker in (
        "запрети", "отключи", "выключи", "закрой доступ", "не разрешай",
    )):
        return maya_capabilities.CLIENT_SELF_VISIT_HISTORY, False
    if any(marker in low for marker in (
        "разреши", "включи", "открой доступ", "дай доступ",
    )):
        return maya_capabilities.CLIENT_SELF_VISIT_HISTORY, True
    return None


def _founder_permission_reply(
    chat_id: int,
    message: str,
    mode: str = "staff",
) -> str | None:
    command = _founder_permission_command(message)
    if not command:
        return None
    try:
        info = _panel_resolve_role(int(chat_id))
    except Exception:
        info = {}
    if not info.get("is_founder"):
        logger.warning("Founder capability command denied for chat_id=%s", chat_id)
        return "Глобальные разрешения MAYA может менять только основатель."
    if str(mode or "").strip().lower() != "staff":
        return "Чтобы изменить разрешения MAYA, откройте рабочий чат."

    capability, enabled = command
    if capability == "list":
        rows = maya_capabilities.list_capabilities()
        lines = ["Разрешения MAYA для клиентов:"]
        for row in rows:
            status = "включено" if row["enabled"] else "отключено"
            lines.append(f"• {row['label']}: {status}")
        return "\n".join(lines)

    try:
        result = maya_capabilities.set_enabled(
            capability,
            bool(enabled),
            actor_id=int(chat_id),
        )
    except (KeyError, PermissionError):
        return "Такого безопасного разрешения нет в каталоге MAYA."
    if result["enabled"]:
        return (
            "Разрешила всем авторизованным клиентам видеть в чате только свою "
            "историю посещений. Доступ к чужим карточкам остаётся закрыт."
        )
    return (
        "Отключила клиентам просмотр истории посещений через чат. "
        "Данные в YClients не изменены."
    )


_OWN_VISIT_HISTORY_RE = re.compile(
    r"\b(?:"
    r"истори\w*\s+мо(?:их|ей)\s+(?:визит|посещ)\w*|"
    r"мо[яию]\s+истори\w*\s+(?:визит|посещ)\w*|"
    r"мо[ия]\s+(?:прошл\w*\s+)?(?:визит|посещ)\w*|"
    r"когда\s+я\s+(?:был|приходил|ходил)\w*|"
    r"что\s+я\s+(?:делал|брал)\w*\s+(?:в\s+)?прошл\w*\s+(?:раз|визит)\w*|"
    r"к\s+кому\s+я\s+(?:ходил|записывался)\w*|"
    r"какие\s+услуг\w*\s+я\s+(?:брал|делал)\w*"
    r")\b",
    re.IGNORECASE,
)
_OWN_VISIT_HISTORY_REQUEST_RE = re.compile(
    r"\b(?:покажи|дай|расскажи|открой)\w*.{0,30}\bмне\b.{0,30}"
    r"(?:истори|визит|посещ)",
    re.IGNORECASE | re.DOTALL,
)


def _own_visit_history_intent(message: str) -> bool:
    """Match first-person history requests, never another client's dossier."""
    text = (message or "").strip().lower().replace("ё", "е")
    if not text:
        return False
    return bool(
        _OWN_VISIT_HISTORY_RE.search(text)
        or _OWN_VISIT_HISTORY_REQUEST_RE.search(text)
    )


def _visit_history_date_label(value) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "дата не указана"
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed.strftime("%d.%m.%Y")
    except ValueError:
        try:
            return date.fromisoformat(raw[:10]).strftime("%d.%m.%Y")
        except ValueError:
            return raw[:10]


async def _own_visit_history_reply(chat_id: int, message: str) -> str | None:
    """Return only the authenticated user's attended YClients visits."""
    if not _own_visit_history_intent(message):
        return None
    if not maya_capabilities.is_enabled(
        maya_capabilities.CLIENT_SELF_VISIT_HISTORY
    ):
        return "Просмотр истории посещений через чат сейчас отключён владельцем."
    try:
        client = database.get_client(int(chat_id))
    except Exception as e:
        logger.error("own visit history client lookup: %s", e)
        client = None
    if not client or not client.get("id"):
        return (
            "Ваш аккаунт пока не связан с клиентской карточкой. "
            "Откройте личный кабинет и завершите привязку."
        )
    phone = str(client.get("phone") or "").strip()
    if len("".join(ch for ch in phone if ch.isdigit())) < 10:
        return "В клиентской карточке не подтверждён телефон. Завершите привязку в личном кабинете."

    client_id = int(client["id"])
    try:
        cached = memory.normalize_history(
            database.get_client_history_cached(client_id, max_age_hours=24 * 30)
        )
    except Exception:
        cached = []

    refreshed = None
    try:
        refreshed = await asyncio.to_thread(
            memory.warm_client_history_cache_for_phone,
            client_id,
            phone,
            _yc,
            True,
            30,
        )
    except Exception as e:
        logger.error("own visit history refresh: %s", e)

    if isinstance(refreshed, dict) and refreshed.get("ok"):
        history = memory.normalize_history(refreshed.get("history") or [])
        used_cached_fallback = False
    else:
        history = cached
        used_cached_fallback = bool(cached)

    history = [
        row for row in history
        if isinstance(row, dict) and (
            row.get("date") or row.get("services") or row.get("master")
        )
    ]
    history.sort(key=lambda row: str(row.get("date") or ""), reverse=True)
    if not history:
        return "В YClients не нашла завершённых посещений для вашей привязанной карточки."

    low = (message or "").lower().replace("ё", "е")
    full = any(marker in low for marker in (
        "всю истор", "полную истор", "все посещ", "все визит",
    ))
    limit = 30 if full else 10
    shown = history[:limit]
    lines = ["Вот ваша история завершённых посещений из YClients:"]
    for index, row in enumerate(shown, 1):
        service_titles = [
            str(item.get("title") or "").strip()
            for item in (row.get("services") or [])
            if isinstance(item, dict) and str(item.get("title") or "").strip()
        ]
        if not service_titles and str(row.get("service") or "").strip():
            service_titles = [str(row["service"]).strip()]
        services = ", ".join(service_titles) or "услуги не указаны"
        master = str(row.get("master") or "").strip()
        details = f"{_visit_history_date_label(row.get('date'))}: {services}"
        if master:
            details += f", мастер {master}"
        lines.append(f"{index}. {details}")
    if len(history) > len(shown):
        lines.append(
            f"Показала {len(shown)} последних из {len(history)} найденных. "
            "Спросите «покажи полную историю моих посещений», чтобы увидеть больше."
        )
    if used_cached_fallback:
        lines.append(
            "YClients временно не ответил, поэтому показываю последнюю "
            "синхронизированную историю."
        )
    return "\n".join(lines)


_OWNER_TODAY_SCHEDULE_RE = re.compile(
    r"\b(?:расписан\w*|запис\w*|загрузк\w*|окн\w*)\b",
    re.IGNORECASE,
)
_OWNER_TODAY_MONEY_RE = re.compile(
    r"\b(?:сумм\w*|выруч\w*|заработ\w*|денег|деньг\w*|чек\w*)\b",
    re.IGNORECASE,
)
_OWNER_TODAY_UPSELL_RE = re.compile(
    r"\b(?:апсейл\w*|допродаж\w*|доп\w*\s+услуг\w*|"
    r"дополнительн\w*\s+услуг\w*|увелич\w*\s+(?:средн\w*\s+)?чек\w*)\b",
    re.IGNORECASE,
)


def _owner_today_commercial_intent(message: str) -> bool:
    """Recognise one compound request about today's load, money and upsell."""
    low = (message or "").strip().lower().replace("ё", "е")
    if not low:
        return False
    has_today = "сегодня" in low or "на текущий день" in low
    has_schedule = bool(_OWNER_TODAY_SCHEDULE_RE.search(low))
    has_money = bool(_OWNER_TODAY_MONEY_RE.search(low))
    has_upsell = bool(_OWNER_TODAY_UPSELL_RE.search(low))
    return has_today and has_schedule and (has_money or has_upsell)


def _owner_today_commercial_reply(
    chat_id: int,
    message: str,
    mode: str = "staff",
) -> str | None:
    """Answer a compound owner request from one verified YClients snapshot."""
    if str(mode or "").strip().lower() != "staff":
        return None
    if not _owner_today_commercial_intent(message):
        return None
    try:
        info = _panel_resolve_role(int(chat_id))
    except Exception:
        info = {}
    if info.get("role") != "owner" and not info.get("is_founder"):
        return None

    try:
        import owner_ai
        snapshot = owner_ai.business_snapshot()
    except Exception as e:
        logger.error("owner today commercial shortcut: %s", e)
        return (
            "Не смогла получить актуальное расписание и суммы из YClients. "
            "Попробуйте ещё раз через минуту."
        )

    if not isinstance(snapshot, dict):
        return (
            "YClients сейчас не отдал проверенную картину дня. "
            "Я не буду подставлять приблизительные цифры."
        )

    def whole(value) -> int:
        try:
            return max(0, int(round(float(value or 0))))
        except (TypeError, ValueError):
            return 0

    booked = whole(snapshot.get("booked_today"))
    priced_records = whole(snapshot.get("priced_records"))
    unpriced_records = whole(snapshot.get("unpriced_records"))
    priced_revenue = whole(snapshot.get("booked_service_revenue_rub"))
    expected_revenue = whole(snapshot.get("expected_revenue_rub"))
    upsell_potential = whole(snapshot.get("upsell_potential_rub"))
    with_upsell = whole(snapshot.get("forecast_high_rub"))
    if not with_upsell:
        with_upsell = expected_revenue + upsell_potential

    lines = [
        "По сегодняшнему расписанию YClients:",
        f"Записей: {booked}.",
    ]
    if unpriced_records:
        lines.extend([
            (
                f"Подтверждённая сумма услуг в {priced_records} записях: "
                f"{_rub(priced_revenue)}."
            ),
            (
                f"Ещё {unpriced_records} записей без полной цены в расписании. "
                f"Осторожная оценка всего дня: около {_rub(expected_revenue)}."
            ),
        ])
    else:
        lines.append(
            f"Сумма услуг по текущим записям: {_rub(priced_revenue or expected_revenue)}."
        )

    if upsell_potential:
        lines.extend([
            f"Реалистичный потенциал допродаж: ещё около {_rub(upsell_potential)}.",
            f"Итого день с апсейлом: около {_rub(with_upsell)}.",
        ])
        attach_rate = snapshot.get("historical_addon_attach_rate_pct")
        avg_addon = whole(snapshot.get("historical_avg_addon_rub"))
        if attach_rate and avg_addon:
            lines.append(
                "Прогноз допродаж рассчитан по реальной истории: "
                f"допуслуга добавляется примерно в {whole(attach_rate)}% подходящих "
                f"записей, средняя допродажа — {_rub(avg_addon)}."
            )
    else:
        lines.append(
            "Честный потенциал апсейла сейчас не рассчитываю: в истории недостаточно "
            "подтверждённых допродаж."
        )

    lines.append(
        "Сумма расписания и прогноз апсейла показаны отдельно: прогноз не является "
        "уже полученной выручкой."
    )
    return "\n".join(lines)


def _owner_daily_briefing_intent(message: str) -> bool:
    low = (message or "").strip().lower().replace("ё", "е")
    if not low:
        return False
    if any(marker in low for marker in (
        "сводка на сегодня",
        "сводку на сегодня",
        "брифинг на сегодня",
        "план на день",
        "с чего начать",
        "что мне сделать",
    )):
        return True
    has_today = "сегодня" in low or "на текущий день" in low
    has_business_scope = any(marker in low for marker in (
        "по бизнесу",
        "по салону",
        "с бизнесом",
        "с салоном",
        "что у нас",
        "как дела",
        "загрузка",
    ))
    return has_today and has_business_scope


def _owner_daily_briefing_reply(chat_id: int, message: str, mode: str = "staff") -> str | None:
    """Verified daily brief that does not depend on an available LLM quota."""
    if str(mode or "").strip().lower() != "staff":
        return None
    if not _owner_daily_briefing_intent(message):
        return None
    try:
        info = _panel_resolve_role(int(chat_id))
    except Exception:
        info = {}
    if info.get("role") != "owner" and not info.get("is_founder"):
        return None
    try:
        import owner_ai
        return owner_ai.format_daily_briefing(owner_ai.daily_briefing())
    except Exception as e:
        logger.error("owner daily briefing shortcut: %s", e)
        return "Не смогла собрать проверенную сводку из YClients. Попробуйте ещё раз через минуту."


def _owner_master_profit_reply(chat_id: int, message: str, mode: str = "staff") -> str | None:
    """Deterministic answer for owner/founder questions about master revenue/profit."""
    if str(mode or "").strip().lower() != "staff":
        return None
    if not _business_master_analytics_intent(message):
        return None
    try:
        info = _panel_resolve_role(int(chat_id))
    except Exception:
        info = {}
    if not (info.get("permissions") or {}).get("analytics"):
        return None
    if info.get("role") != "owner" and not info.get("is_founder"):
        return (
            "Это уровень владельца: прибыль по мастерам, маржу после ЗП и выплаты "
            "я показываю только владельцу. В рабочем кабинете могу помочь с вашей "
            "разрешённой аналитикой, расписанием и операционными задачами."
        )
    try:
        import analytics
        period, date_from, date_to = _analytics_period_from_text(message)
        frm, to, label = analytics.resolve_period(period, date_from, date_to)
        summary = analytics.business_summary(frm, to)
    except Exception as e:
        logger.error(f"owner master profit shortcut: {e}")
        return "Не смогла собрать аналитику по мастерам из YClients. Попробуйте ещё раз через минуту."

    masters = [m for m in (summary.get("masters") or []) if isinstance(m, dict)]
    masters = [m for m in masters if int(m.get("gross") or 0) > 0]
    if not masters:
        return f"За период «{label}» в YClients нет проведённых оплат по мастерам."

    by_gross = sorted(masters, key=lambda m: int(m.get("gross") or 0), reverse=True)
    employees = [m for m in masters if not m.get("is_owner")]
    by_margin = sorted(
        employees or masters,
        key=lambda m: int(m.get("gross") or 0) - int(m.get("salary") or 0),
        reverse=True,
    )
    leader = by_gross[0]
    margin_leader = by_margin[0]

    def row(m: dict) -> str:
        margin = int(m.get("gross") or 0) - int(m.get("salary") or 0)
        return (
            f"{m.get('name') or 'Мастер'}: выручка {_rub(m.get('gross'))}, "
            f"ЗП {_rub(m.get('salary'))}, маржа {_rub(margin)}, "
            f"визитов {int(m.get('visits') or 0)}, средний чек {_rub(m.get('avg_check'))}"
        )

    top3 = "\n".join(f"{i}. {row(m)}" for i, m in enumerate(by_gross[:3], 1))
    margin = int(margin_leader.get("gross") or 0) - int(margin_leader.get("salary") or 0)
    return (
        f"За период «{label}» лидер по выручке — {leader.get('name') or 'мастер'}.\n\n"
        f"Топ по выручке:\n{top3}\n\n"
        f"Если считать вклад мастера как выручка минус расчётная ЗП, "
        f"лидер по марже — {margin_leader.get('name') or 'мастер'}: {_rub(margin)}. "
        f"Это маржа после ЗП, не чистая прибыль салона: постоянные расходы здесь не разнесены по мастерам."
    )


def _client_chat_shortcut(message: str) -> tuple[str, dict | None] | None:
    """Fast deterministic answers for the client-facing MAYA cabinet."""
    text = (message or "").strip()
    low = text.lower().replace("ё", "е")
    if not low:
        return None

    if _CLIENT_GREETING_ONLY_RE.fullmatch(low):
        return (
            "Здравствуйте! Рада вас видеть. Помочь с записью или подсказать по услугам?",
            None,
        )

    if _BOOKING_START_ONLY_RE.fullmatch(low):
        return (
            "Конечно. На какую услугу вас записать?",
            None,
        )

    if _ADDRESS_INTENT_RE.search(low):
        return (
            "Мы находимся в Ставрополе: ул. Лермонтова, 343. Работаем каждый день с 10:00 до 21:00.",
            None,
        )

    if _FOUNDED_INTENT_RE.search(low):
        return (
            f"«Мужская Эстетика» работает с {SALON_FOUNDED_YEAR} года. "
            "Сейчас это премиальный барбершоп в Ставрополе с сильной командой мастеров.",
            None,
        )

    if _DISCOUNT_INTENT_RE.search(low):
        return (
            "По скидкам: в кабинете видны ваши баллы и бонусы, есть реферальная программа, "
            "подарочные сертификаты и абонементы для более выгодных регулярных визитов.",
            {"type": "open_cabinet", "label": "Открыть кабинет", "screen": "cabinet"},
        )

    if _MASTERS_INTENT_RE.search(low) and not _business_master_analytics_intent(low):
        return (
            "Команда: топ-мастера — Стас Мосин и Илья Третьяков; старшие мастера — "
            "Алексей Дарма, Максим Чурсинов и Александр Киянский. "
            "Под задачу и удобное время могу подобрать мастера и сразу проверить свободные окна.",
            {"type": "open_team", "label": "Посмотреть мастеров", "screen": "team"},
        )

    if (
        _BOOKING_INTENT_RE.search(low)
        and _BOOKING_SERVICE_RE.search(low)
        and not _BOOKING_SPECIFIC_RE.search(low)
        and len(low) <= 120
    ):
        return (
            "Конечно. Запишу вас. Подскажите, к какому мастеру хотите и на какой день или время?",
            {"type": "open_booking", "label": "Открыть запись", "screen": "book"},
        )

    return None


def _client_usual_booking_shortcut(
    chat_id: int,
    message: str,
) -> tuple[str, dict | None] | None:
    """Resolve "my regular master" deterministically from the client's visits."""
    low = (message or "").strip().lower().replace("ё", "е")
    if not low or not _USUAL_MASTER_INTENT_RE.search(low):
        return None
    try:
        usual = memory.get_usual_booking(int(chat_id), warm=True)
    except Exception as exc:
        logger.error("usual booking shortcut: %s", exc)
        usual = None
    if not usual or not usual.get("master_name"):
        return (
            "Пока не вижу в истории постоянного мастера. Назовите мастера или выберите любого — я продолжу запись.",
            None,
        )

    master_name = str(usual["master_name"]).strip()
    service_text = str(usual.get("service_text") or "").strip()
    asks_to_book = bool(_BOOKING_INTENT_RE.search(low) or "как обычно" in low)
    if not asks_to_book:
        return (
            f"Ваш постоянный мастер по истории визитов — {master_name}. Записать вас к нему?",
            None,
        )

    # If the client named a service in this message, it remains in chat history
    # and wins over the historical set. Otherwise we can continue "as usual".
    has_service_now = bool(re.search(
        r"\b(?:стриж|стрид|бород|брит|камуфляж|тонир|уход|комплекс)\w*",
        low,
        re.IGNORECASE,
    ))
    use_usual_services = "как обычно" in low
    if service_text and use_usual_services and not has_service_now:
        return (
            f"Выбрала вашего постоянного мастера — {master_name}. Обычно у вас: {service_text}. "
            "На какой день и время записать? Можно сказать «ближайшее окно».",
            None,
        )
    if has_service_now:
        return (
            f"Выбрала вашего постоянного мастера — {master_name}. "
            "На какой день и время записать? Можно сказать «ближайшее окно».",
            None,
        )
    return (
        f"Выбрала вашего постоянного мастера — {master_name}. На какую услугу вас записать?",
        None,
    )


def _repeat_booking_widget_data(usual: dict | None) -> dict | None:
    """Build the allowlisted booking prefill from server-side visit history."""
    if not isinstance(usual, dict):
        return None
    service_names = [
        str(value or "").strip()
        for value in (usual.get("service_names") or [])
        if str(value or "").strip()
    ]
    if not service_names:
        service_text = str(usual.get("service_text") or "").strip()
        if service_text:
            service_names = [
                value.strip() for value in service_text.split(",") if value.strip()
            ]
    return normalize_chat_widget_data("book", {
        "repeat_booking": True,
        "master_id": usual.get("master_id"),
        "master_name": usual.get("master_name"),
        "service_ids": usual.get("service_ids") or [],
        "service_names": service_names,
    })


def _latest_repeat_booking_offer(history: list | None) -> bool:
    """A short "yes" is repeat-booking consent only after MAYA's exact offer."""
    for item in reversed(history or []):
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role not in {"assistant", "user"}:
            continue
        action = item.get("action") if role == "assistant" else None
        return bool(
            isinstance(action, dict)
            and str(action.get("type") or "").strip().lower() == "repeat_booking"
        )
    return False


def _client_repeat_booking_decision(
    chat_id: int,
    message: str,
    history: list | None,
) -> dict | None:
    """Resolve repeat booking without asking the model to remember master/services."""
    low = (message or "").strip().lower().replace("ё", "е")
    if not low:
        return None
    pending_offer = _latest_repeat_booking_offer(history)
    explicit_repeat = bool(
        _USUAL_MASTER_INTENT_RE.search(low)
        and (_BOOKING_INTENT_RE.search(low) or "как обычно" in low or "как в прошл" in low)
    )
    if pending_offer and _REPEAT_BOOKING_NO_RE.fullmatch(low):
        return {
            "reply": "Хорошо. Что меняем: мастера или услуги?",
            "action": None,
            "widget": None,
            "widget_data": None,
        }
    if not explicit_repeat and not (
        pending_offer and _REPEAT_BOOKING_YES_RE.fullmatch(low)
    ):
        return None

    try:
        usual = memory.get_usual_booking(int(chat_id), warm=True)
    except Exception as exc:
        logger.error("repeat booking decision: %s", exc)
        usual = None
    widget_data = _repeat_booking_widget_data(usual)
    if not usual or not usual.get("master_name"):
        return {
            "reply": (
                "Пока не вижу в истории постоянного мастера. "
                "Выберите мастера — я продолжу запись."
            ),
            "action": {"type": "open_booking", "label": "Выбрать мастера", "screen": "book"},
            "widget": "book",
            "widget_data": None,
        }
    if not widget_data:
        return {
            "reply": (
                f"Постоянного мастера вижу — {usual['master_name']}, но прошлые услуги "
                "сейчас недоступны для точного повтора. Выберите услугу."
            ),
            "action": None,
            "widget": "book",
            "widget_data": None,
        }
    service_text = str(usual.get("service_text") or "").strip()
    return {
        "reply": (
            f"Оставила как в прошлый раз: {usual['master_name']}"
            f"{f' · {service_text}' if service_text else ''}. "
            "Выберите только дату и время 👇"
        ),
        "action": None,
        "widget": "book",
        "widget_data": widget_data,
    }


def _plain_maya_delta(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"[*_`]+", "", str(text))


def _plain_maya_text(text: str) -> str:
    text = _plain_maya_delta(text or "")
    text = re.sub(
        r"\n?\s*[^.\n!?]{0,160}\bуточн[^\n.!?]{0,120}\bу\s+Стаса[.!?]?",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\n?\s*Детальн[^\n.!?]{0,220}\bу\s+Стаса[.!?]?",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\b([01]?\d|2[0-3])\s+час(?:а|ов)?\s+([0-5]?\d)\s+минут(?:а|ы)?\b",
        lambda m: f"{int(m.group(1))}:{int(m.group(2)):02d}",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return enforce_maya_feminine(text).strip()


def _chat_knowledge_images(chat_id: int, message: str, mode: str = "client", limit: int = 3) -> list[dict]:
    """База знаний по технике/схемам УБРАНА из мозга Майи (решение Стаса 2026-07-06).
    Схемы стрижек больше НИКОГДА не прикрепляются — ни клиенту, ни сотруднику."""
    return []


async def knowledge_image_handler(request: web.Request) -> web.Response:
    """GET /api/knowledge/image/{name} — optimized book page for MAYA knowledge answers."""
    name = os.path.basename(str(request.match_info.get("name") or ""))
    if not re.fullmatch(r"IMG_\d{4,}\.(?:jpg|jpeg|png|webp)", name, re.IGNORECASE):
        return web.Response(status=404, text="not found")
    path = os.path.join(os.path.dirname(__file__), "barber_knowledge_images", name)
    if not os.path.isfile(path):
        return web.Response(status=404, text="not found")
    return web.FileResponse(path, headers={
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
    })


def _resolve_chat_tg_user(request: web.Request, body: dict) -> dict | None:
    """Resolve the app chat identity from Telegram initData, widget auth, or web session."""
    init_data = request.headers.get("X-Telegram-InitData", "")
    tg_user = _verify_telegram_init_data(init_data, TELEGRAM_TOKEN) if init_data else None
    if not tg_user and isinstance(body.get("auth_data"), dict):
        tg_user = _verify_telegram_login_widget(body["auth_data"], TELEGRAM_TOKEN)
    if not tg_user and body.get("session_token"):
        try:
            tg_user = session_tg_user(web_auth.resolve_session(body.get("session_token")))
        except Exception:
            pass
    return tg_user


_CHAT_MESSAGE_ID_RE = re.compile(r"^msg_[0-9a-f]{32}$")


def _new_chat_message_id() -> str:
    return f"msg_{uuid.uuid4().hex}"


def _is_chat_message_id(value: object) -> bool:
    return bool(_CHAT_MESSAGE_ID_RE.fullmatch(str(value or "").strip()))


def _ensure_chat_history_ids(history: list[dict] | None) -> tuple[list[dict], bool]:
    """Migrate legacy chat items to persistent, unique server IDs."""
    normalized = []
    seen: set[str] = set()
    changed = False
    for raw_item in history or []:
        if not isinstance(raw_item, dict):
            normalized.append(raw_item)
            continue
        item = raw_item
        message_id = str(item.get("id") or "").strip()
        if not _is_chat_message_id(message_id) or message_id in seen:
            item = dict(item)
            message_id = _new_chat_message_id()
            item["id"] = message_id
            changed = True
        seen.add(message_id)
        normalized.append(item)
    return normalized, changed


def _user_history_item(text: str) -> dict:
    return {
        "id": _new_chat_message_id(),
        "role": "user",
        "content": _plain_maya_text(text or ""),
    }


def _with_chat_turn_ids(payload: dict, history: list[dict]) -> dict:
    """Attach IDs of the latest persisted user/assistant turn to a response."""
    result = dict(payload)
    user_message_id = None
    assistant_message_id = None
    for item in reversed(history or []):
        if not isinstance(item, dict) or not _is_chat_message_id(item.get("id")):
            continue
        if assistant_message_id is None and item.get("role") == "assistant":
            assistant_message_id = item["id"]
        elif user_message_id is None and item.get("role") == "user":
            user_message_id = item["id"]
        if user_message_id and assistant_message_id:
            break
    if assistant_message_id:
        result["id"] = assistant_message_id
        result["message_id"] = assistant_message_id
    if user_message_id:
        result["user_message_id"] = user_message_id
    return result


def _chat_history_payload(history: list[dict], offset: int = 0) -> list[dict]:
    messages = []
    for i, item in enumerate(history or []):
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        text = _plain_maya_text(_history_text(item))
        if not text:
            continue
        message_id = item.get("id") if _is_chat_message_id(item.get("id")) else offset + i
        if role == "user":
            messages.append({"id": message_id, "role": "user", "text": text})
        elif role == "assistant":
            msg = {"id": message_id, "role": "bot", "text": text}
            if item.get("link"):
                msg["link"] = item.get("link")
            if isinstance(item.get("action"), dict):
                msg["action"] = item.get("action")
            if isinstance(item.get("images"), list):
                msg["images"] = item.get("images")
            widget = normalize_chat_widget(item.get("widget"))
            if widget:
                msg["widget"] = widget
                widget_data = normalize_chat_widget_data(widget, item.get("widget_data"))
                if widget_data:
                    msg["widget_data"] = widget_data
            messages.append(msg)
    return messages


def _assistant_history_item(
    text: str,
    *,
    link=None,
    action=None,
    images=None,
    widget: str | None = None,
    widget_data: dict | None = None,
) -> dict:
    item = {
        "id": _new_chat_message_id(),
        "role": "assistant",
        "content": _plain_maya_text(text or ""),
    }
    if link:
        item["link"] = link
    if isinstance(action, dict):
        item["action"] = action
    if isinstance(images, list) and images:
        item["images"] = images
    normalized_widget = normalize_chat_widget(widget)
    if normalized_widget:
        item["widget"] = normalized_widget
        normalized_data = normalize_chat_widget_data(normalized_widget, widget_data)
        if normalized_data:
            item["widget_data"] = normalized_data
    return item


def _store_assistant_message_in_chat(
    chat_id: int,
    text: str,
    *,
    mode: str = "client",
    action: dict | None = None,
    widget: str | None = None,
    widget_data: dict | None = None,
    link=None,
    images: list | None = None,
    dedupe_key: str = "",
    protect_content: bool = False,
) -> bool:
    """Кладёт сервисное сообщение MAYA в историю чата приложения.

    Нужен для мостика push → переписка: уведомление не только всплывает, но и
    остаётся в чате, чтобы клиент мог открыть приложение позже и перечитать его.
    """
    try:
        cid = int(chat_id)
    except (TypeError, ValueError):
        return False
    clean = _plain_maya_text(text or "")
    if not clean:
        return False
    try:
        conversations = memory.load_conversations()
        history_key = _chat_history_key(cid, mode)
        history = list(conversations.get(history_key) or [])
        history, _ = _ensure_chat_history_ids(history)
        want_key = str(dedupe_key or "").strip()[:160]
        if want_key:
            for item in reversed(history):
                if isinstance(item, dict) and item.get("role") == "assistant" and item.get("dedupe_key") == want_key:
                    return False
        item = _assistant_history_item(
            clean,
            link=link,
            action=action,
            images=images,
            widget=widget,
            widget_data=widget_data,
        )
        if protect_content:
            try:
                from pii_crypto import encrypt
                encrypted = encrypt(clean)
            except Exception as exc:
                logger.error("protected app chat storage failed: %s", exc)
                return False
            if not encrypted:
                return False
            item["content"] = "[Защищённое служебное сообщение MAYA]"
            item["content_enc"] = encrypted
            item["protected"] = True
        if want_key:
            item["dedupe_key"] = want_key
        history.append(item)
        conversations[history_key] = history
        memory.save_conversations(conversations)
        return True
    except Exception as e:
        logger.error(f"store assistant message in chat {cid}: {e}")
        return False


def _ensure_client_loyalty_chat_offer(chat_id: int) -> bool:
    """Invite a client into the slot-aware loyalty booking flow once per balance."""
    try:
        client = database.get_client(int(chat_id))
    except Exception:
        client = None
    if not isinstance(client, dict):
        return False
    client_id = int(client.get("id") or 0)
    phone = str(client.get("phone") or "").strip()
    if not client_id or len("".join(ch for ch in phone if ch.isdigit())) < 10:
        return False
    try:
        import loyalty as _loy

        _loy.lazy_backfill_for_client(client_id, phone)
        balance = int(database.loyalty_balance(client_id))
        spend = _loy.loyalty_spend_summary(balance)
    except Exception as exc:
        logger.error("client loyalty offer lookup %s: %s", client_id, exc)
        return False
    affordable = list(spend.get("affordable_services") or [])
    if balance <= 0 or not affordable:
        return False
    text = (
        f"У вас {balance} баллов — ими уже можно оплатить дополнительный уход. "
        "Выберите мастера, услугу и время: я проверю оставшееся окно и предложу "
        "только тот уход, который мастер действительно успеет сделать."
    )
    signature = "|".join(
        f'{item.get("id") or item.get("title")}:{item.get("price")}'
        for item in affordable
    )
    return _store_assistant_message_in_chat(
        int(chat_id),
        text,
        mode="client",
        action={
            "type": "open_booking",
            "label": "Подобрать по времени",
            "screen": "book",
        },
        widget="book",
        dedupe_key=f"loyalty-spend:{client_id}:{balance}:{signature}"[:160],
    )


def _ensure_client_repeat_booking_offer(chat_id: int) -> bool:
    """Offer one-click repeat booking from confirmed visit history."""
    try:
        client = database.get_client(int(chat_id))
    except Exception:
        client = None
    if not isinstance(client, dict):
        return False
    client_id = int(client.get("id") or 0)
    phone = str(client.get("phone") or "").strip()
    if not client_id or len("".join(ch for ch in phone if ch.isdigit())) < 10:
        return False
    try:
        usual = memory.get_usual_booking(int(chat_id), warm=True)
    except Exception as exc:
        logger.error("client repeat offer lookup %s: %s", client_id, exc)
        return False
    if not isinstance(usual, dict) or usual.get("source") != "yclients_history":
        return False
    widget_data = _repeat_booking_widget_data(usual)
    if not widget_data:
        return False

    signature = "|".join([
        str(usual.get("visit_date") or "")[:19],
        str(usual.get("master_id") or usual.get("master_name") or ""),
        ",".join(widget_data.get("service_ids") or widget_data.get("service_names") or []),
    ])
    dedupe_key = f"repeat-booking:{client_id}:{signature}"[:160]
    if _chat_has_assistant_dedupe_key(int(chat_id), "client", dedupe_key):
        return False

    # Do not push a new repeat offer while the client already has an active visit.
    try:
        today = date.today().isoformat()
        for booking in _yc.get_client_bookings(phone, days_back=1, days_ahead=90) or []:
            if not isinstance(booking, dict) or booking.get("error") or booking.get("message"):
                continue
            visit_day = str(booking.get("datetime") or booking.get("date") or "")[:10]
            attendance = booking.get("attendance", booking.get("status"))
            try:
                attendance = int(attendance)
            except (TypeError, ValueError):
                attendance = 0
            if visit_day >= today and attendance not in (-1, 1):
                return False
    except Exception as exc:
        # The attended-history result is still authoritative. A temporary CRM
        # error must not make MAYA invent data, but it need not disable repeat.
        logger.warning("client repeat upcoming lookup %s: %s", client_id, exc)

    service_text = str(usual.get("service_text") or "").strip()
    text = (
        f"Вам как в прошлый раз: к {usual['master_name']}"
        f"{f' на {service_text}' if service_text else ''}?"
    )
    return _store_assistant_message_in_chat(
        int(chat_id),
        text,
        mode="client",
        action={
            "type": "repeat_booking",
            "label": "Да, как в прошлый раз",
        },
        dedupe_key=dedupe_key,
    )


_TELEGRAM_CHAT_MIRROR_BOT_IDS: set[int] = set()
_COMMUNICATION_SHADOW_TASKS: set[asyncio.Task] = set()


def _telegram_chat_mirror_dedupe_key(chat_id: int, text: str) -> str:
    clean = _plain_maya_text(text or "")
    digest = hashlib.sha256(clean.encode("utf-8")).hexdigest()[:24]
    return f"telegram:{int(chat_id)}:{digest}"


def _chat_has_assistant_dedupe_key(chat_id: int, mode: str, dedupe_key: str) -> bool:
    try:
        conversations = memory.load_conversations()
        history = conversations.get(_chat_history_key(int(chat_id), mode)) or []
        return any(
            isinstance(item, dict)
            and item.get("role") == "assistant"
            and item.get("dedupe_key") == dedupe_key
            for item in reversed(history)
        )
    except Exception:
        return False


def _is_staff_chat_recipient(chat_id: int) -> bool:
    try:
        if database.get_master_by_chat_id(int(chat_id)):
            return True
    except Exception:
        pass
    try:
        return bool(database.is_admin(int(chat_id)))
    except Exception:
        return False


def install_staff_telegram_chat_mirror(bot) -> bool:
    """Mirror every successful staff Telegram text into the durable app chat."""
    if bot is None:
        return False
    bot_class = bot.__class__
    original_attr = "_maya_original_send_message_for_chat_mirror"
    original = getattr(bot_class, original_attr, None)
    if original is None:
        original = getattr(bot_class, "send_message", None)
        if not callable(original):
            return False
        setattr(bot_class, original_attr, original)

        async def _send_message_with_app_mirror(self, *args, **kwargs):
            sent_message = await original(self, *args, **kwargs)
            if id(self) not in _TELEGRAM_CHAT_MIRROR_BOT_IDS:
                return sent_message
            try:
                chat_id = kwargs.get("chat_id", args[0] if args else None)
                text = kwargs.get("text", args[1] if len(args) > 1 else "")
                chat_id = int(chat_id)
                message_id = getattr(sent_message, "message_id", None)
                if text and message_id is not None:
                    import maya_inbox_bridge

                    shadow_task = asyncio.create_task(
                        maya_inbox_bridge.observe_legacy_telegram_send(
                            telegram_chat_id=chat_id,
                            message_id=message_id,
                            body_text=str(text),
                        )
                    )
                    _COMMUNICATION_SHADOW_TASKS.add(shadow_task)
                    shadow_task.add_done_callback(
                        _COMMUNICATION_SHADOW_TASKS.discard
                    )
                if text and _is_staff_chat_recipient(chat_id):
                    _store_assistant_message_in_chat(
                        chat_id,
                        str(text),
                        mode="staff",
                        dedupe_key=_telegram_chat_mirror_dedupe_key(chat_id, str(text)),
                        protect_content=True,
                    )
            except Exception as exc:
                logger.error("Telegram → app chat mirror failed: %s", exc)
            return sent_message

        setattr(bot_class, "send_message", _send_message_with_app_mirror)
    _TELEGRAM_CHAT_MIRROR_BOT_IDS.add(id(bot))
    return True


async def chat_history_handler(request: web.Request) -> web.Response:
    """POST /api/chat/history — return the saved MAYA chat history for the logged-in user."""
    from memory import load_conversations, save_conversations

    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    if not isinstance(body, dict):
        return _cabinet_response({"error": "invalid_json"}, status=400)

    tg_user = _resolve_chat_tg_user(request, body)
    if not tg_user:
        return _cabinet_response(
            {"error": "unauthorized", "message": "Войдите через Telegram, ВКонтакте или по номеру."},
            status=401,
        )

    chat_id = tg_user.get("id")
    if not chat_id:
        return _cabinet_response({"error": "no_user_id"}, status=400)
    chat_id = int(chat_id)

    if not database.has_valid_consent_by_chat_id(chat_id):
        return _cabinet_response({
            "error": "needs_consent",
            "message": ("Чтобы общаться с ассистентом, подпишите согласие на обработку "
                        "персональных данных: откройте @malesthetic_bot и нажмите /start."),
        }, status=403)

    chat_mode = _chat_effective_mode(body, chat_id)
    history_key = _chat_history_key(chat_id, chat_mode)
    if chat_mode == "client":
        await asyncio.to_thread(_ensure_client_loyalty_chat_offer, chat_id)
        await asyncio.to_thread(_ensure_client_repeat_booking_offer, chat_id)
    conversations = load_conversations()
    full_history, migrated = _ensure_chat_history_ids(
        list(conversations.get(history_key) or [])
    )
    if migrated:
        conversations[history_key] = full_history
        save_conversations(conversations)
    messages = _chat_history_payload(full_history)

    return _cabinet_response({"messages": messages})


async def chat_delete_handler(request: web.Request) -> web.Response:
    """POST /api/chat/delete — delete one MAYA message or clear the whole chat history."""
    from memory import load_conversations, save_conversations

    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    if not isinstance(body, dict):
        return _cabinet_response({"error": "invalid_json"}, status=400)

    tg_user = _resolve_chat_tg_user(request, body)
    if not tg_user:
        return _cabinet_response(
            {"error": "unauthorized", "message": "Войдите через Telegram, ВКонтакте или по номеру."},
            status=401,
        )

    chat_id = tg_user.get("id")
    if not chat_id:
        return _cabinet_response({"error": "no_user_id"}, status=400)
    chat_id = int(chat_id)

    chat_mode = _chat_effective_mode(body, chat_id)
    history_key = _chat_history_key(chat_id, chat_mode)
    conversations = load_conversations()
    history = list(conversations.get(history_key) or [])
    history, _ = _ensure_chat_history_ids(history)
    delete_mode = str(body.get("delete_mode") or body.get("delete") or "").strip().lower()
    if not delete_mode:
        legacy_mode = str(body.get("mode") or "").strip().lower()
        if legacy_mode in ("all", "clear", "reset", "one"):
            delete_mode = legacy_mode

    if delete_mode in ("all", "clear", "reset"):
        conversations.pop(history_key, None)
        save_conversations(conversations)
        return _cabinet_response({"ok": True, "deleted": "all", "messages": []})

    deleted = False
    deleted_id = None
    want_role = str(body.get("role") or "").strip().lower()
    if want_role == "bot":
        want_role = "assistant"
    want_text = _plain_maya_text(str(body.get("text") or ""))
    raw_id = body.get("message_id", body.get("id"))
    server_id = str(raw_id or "").strip()
    if _is_chat_message_id(server_id):
        for idx, item in enumerate(history):
            if isinstance(item, dict) and item.get("id") == server_id:
                deleted_id = server_id
                del history[idx]
                deleted = True
                break
    else:
        try:
            legacy_index = int(raw_id)
        except Exception:
            legacy_index = None
        if legacy_index is not None and 0 <= legacy_index < len(history):
            item = history[legacy_index]
            role_matches = not want_role or (
                isinstance(item, dict) and item.get("role") == want_role
            )
            text_matches = not want_text or (
                isinstance(item, dict)
                and _plain_maya_text(_history_text(item)) == want_text
            )
            if role_matches and text_matches:
                deleted_id = item.get("id") if isinstance(item, dict) else None
                del history[legacy_index]
                deleted = True

    if not deleted:
        if want_role in ("user", "assistant") and want_text:
            for idx in range(len(history) - 1, -1, -1):
                item = history[idx]
                if not isinstance(item, dict) or item.get("role") != want_role:
                    continue
                if _plain_maya_text(_history_text(item)) == want_text:
                    deleted_id = item.get("id")
                    del history[idx]
                    deleted = True
                    break

    if history:
        conversations[history_key] = history
    else:
        conversations.pop(history_key, None)
    save_conversations(conversations)
    messages = _chat_history_payload(conversations.get(history_key) or [])
    return _cabinet_response({
        "ok": True,
        "deleted": bool(deleted),
        "deleted_id": deleted_id,
        "messages": messages,
    })


async def chat_handler(request: web.Request) -> web.Response:
    """
    POST /api/chat — чат с ассистентом прямо в приложении.
    Тот же «мозг», что у Telegram-бота (OpenAI-backed claude_ai.get_ai_response) и ТА ЖЕ
    история переписки (memory по user_id) — диалог общий с ботом.

    Авторизация — как у кабинета: либо X-Telegram-InitData (Mini App),
    либо auth_data в теле (PWA через Login Widget).
    Тело: { "message": "...", "auth_data": {...}? }
    """
    # Ленивые импорты — чтобы не ловить циклические зависимости на загрузке модуля
    from claude_ai import get_ai_response, OPENAI_PWA_CHAT_MODEL, VOICE_CLAUDE_MODEL
    from memory import load_conversations, save_conversations

    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    if not isinstance(body, dict):
        return _cabinet_response({"error": "invalid_json"}, status=400)

    message = (body.get("message") or "").strip()
    chat_mode = _chat_request_mode(body)

    # Авторизация: сначала initData (Mini App), затем Login Widget (PWA)
    init_data = request.headers.get("X-Telegram-InitData", "")
    tg_user = _verify_telegram_init_data(init_data, TELEGRAM_TOKEN) if init_data else None
    if not tg_user and isinstance(body.get("auth_data"), dict):
        tg_user = _verify_telegram_login_widget(body["auth_data"], TELEGRAM_TOKEN)
    # Вход через ВК / по номеру (веб-сессия без Telegram): токен → chat_id.
    if not tg_user and body.get("session_token"):
        try:
            tg_user = session_tg_user(web_auth.resolve_session(body.get("session_token")))
        except Exception:
            pass
    if not tg_user:
        return _cabinet_response(
            {"error": "unauthorized", "message": "Войдите через Telegram, ВКонтакте или по номеру."},
            status=401,
        )

    chat_id = tg_user.get("id")
    if not chat_id:
        return _cabinet_response({"error": "no_user_id"}, status=400)
    chat_id = int(chat_id)
    chat_mode = _chat_effective_mode(body, chat_id)

    # 152-ФЗ: без согласия диалог с ассистентом недоступен (как и кабинет)
    if not database.has_valid_consent_by_chat_id(chat_id):
        return _cabinet_response({
            "error": "needs_consent",
            "message": ("Чтобы общаться с ассистентом, подпишите согласие на обработку "
                        "персональных данных: откройте @malesthetic_bot и нажмите /start."),
        }, status=403)

    # Голосовой помощник (hands-free): фронт шлёт сентинел "__vg__" при входе в
    # голосовой режим → MAYA здоровается ГОЛОСОМ (TTS без LLM и без записи в историю).
    if message == "__vg__":
        # Узнаём собеседника: имя из Telegram + роль (founder/owner/manager/master/client).
        # Без этого приветствие безличное — читается как «она меня не узнаёт».
        _nm = (tg_user.get("first_name") or "").strip()
        try:
            from claude_ai import _resolve_role
            _role = _resolve_role(chat_id)
        except Exception:
            _role = "client"
        _hi = f"Здравствуйте, {_nm}!" if _nm else "Здравствуйте!"
        if chat_mode == "staff" and _role == "founder":
            greet = f"{_hi} Это MAYA, я на связи. Чем сегодня займёмся?"
        elif chat_mode == "staff" and _role in ("owner", "manager", "master"):
            greet = f"{_hi} Это MAYA. Чем помочь по работе?"
        else:
            greet = f"{_hi} Я MAYA. Слушаю вас — чем могу помочь?"
        out = {"reply": greet}
        try:
            import voice
            import base64 as _b64
            _au = await voice.synthesize(greet, fmt="mp3")
            if _au:
                out["audio_reply"] = _b64.b64encode(_au).decode("ascii")
        except Exception as e:
            logger.error(f"chat_handler greeting tts: {e}")
        return _cabinet_response(out)

    # Hands-free голосовой режим (фронт шлёт message="__vm__" вместе с аудио):
    # ответ делаем КОРОЧЕ — быстрее генерится и быстрее озвучивается.
    voice_mode = (message == "__vm__")

    # Голосовое: если пришло аудио — расшифровываем его в текст и дальше как обычное сообщение
    transcript = None
    audio_b64 = body.get("audio")
    if audio_b64 and isinstance(audio_b64, str):
        transcript = await asyncio.to_thread(_transcribe_audio_b64, audio_b64)
        if not transcript:
            return _cabinet_response({
                "reply": "Не расслышала голосовое. Попробуйте записать ещё раз или напишите текстом.",
                "transcript": "",
            })
        message = transcript

    if not message:
        return _cabinet_response({"error": "empty_message"}, status=400)
    if len(message) > 2000:
        message = message[:2000]

    # Карточка-действие директора: владелец нажал кнопку подтверждения — фронт шлёт
    # детерминированную команду __runjob:<job>. Запускаем задачу БЕЗ LLM (только владелец).
    if message.startswith("__runjob:"):
        if chat_mode != "staff":
            return _cabinet_response({
                "reply": _client_business_scope_reply(message) or "Это действие доступно только в рабочем кабинете.",
                "contact_request": False,
                "transcript": transcript or "",
            })
        return await _run_owner_job_from_chat(request, chat_id, message.split(":", 1)[1].strip().lower())

    master_reply = _master_chat_shortcut(chat_id, message) if chat_mode == "staff" else None
    if master_reply:
        return _cabinet_response({"reply": master_reply})

    history_key = _chat_history_key(chat_id, chat_mode)
    conversations = load_conversations()
    history, migrated = _ensure_chat_history_ids(
        list(conversations.get(history_key) or [])
    )
    if migrated:
        conversations[history_key] = history
        save_conversations(conversations)

    def _saved_chat_response(payload: dict) -> web.Response:
        return _cabinet_response(_with_chat_turn_ids(payload, history))

    pending_decision, pending_job = _pending_owner_job_decision(chat_id, message, chat_mode)
    if pending_decision == "confirm" and pending_job:
        return await _run_owner_job_from_chat(request, chat_id, pending_job)
    if pending_decision == "cancel":
        return _owner_job_chat_response(
            chat_id, message, "Хорошо, рассылку не запускаю."
        )

    job_status_reply = _owner_job_status_reply(chat_id, message, chat_mode)
    if job_status_reply:
        return _owner_job_chat_response(chat_id, message, job_status_reply)

    founder_permission_reply = _founder_permission_reply(
        chat_id, message, mode=chat_mode,
    )
    if founder_permission_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(founder_permission_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": founder_permission_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    founder_learning_reply = _founder_learning_reply(chat_id, message, mode=chat_mode)
    if founder_learning_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(founder_learning_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": founder_learning_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    own_history_reply = await _own_visit_history_reply(chat_id, message)
    if own_history_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(own_history_reply, widget="history"))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": own_history_reply,
            "widget": "history",
            "contact_request": False,
            "transcript": transcript or "",
        })

    staff_booking_reply = _staff_booking_scope_reply(message) if chat_mode == "staff" else None
    if staff_booking_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(staff_booking_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": staff_booking_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    client_business_reply = _client_business_scope_reply(message) if chat_mode == "client" else None
    if client_business_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(client_business_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": client_business_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    owner_today_reply = _owner_today_commercial_reply(
        chat_id, message, mode=chat_mode,
    )
    if owner_today_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(owner_today_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": owner_today_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    owner_daily_reply = _owner_daily_briefing_reply(chat_id, message, mode=chat_mode)
    if owner_daily_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(owner_daily_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": owner_daily_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    owner_profit_reply = _owner_master_profit_reply(chat_id, message, mode=chat_mode)
    if owner_profit_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(owner_profit_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": owner_profit_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    verified_analytics_reply = _staff_financial_analytics_reply(
        chat_id, message, mode=chat_mode, history=history,
    )
    if verified_analytics_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(verified_analytics_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": verified_analytics_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    if transcript and should_clarify_transcript(message, history, _voice_known_master_names()):
        out = {
            "reply": CLARIFY_REPEAT_TEXT,
            "contact_request": False,
            "transcript": "",
        }
        try:
            import voice
            import base64 as _b64
            _audio = await voice.synthesize(CLARIFY_REPEAT_TEXT, fmt="mp3")
            if _audio:
                out["audio_reply"] = _b64.b64encode(_audio).decode("ascii")
        except Exception as e:
            logger.error(f"chat_handler unclear voice tts: {e}")
        return _cabinet_response(out)

    direct_shop = _direct_shop_action(message) if chat_mode == "client" else None
    if direct_shop:
        direct_text, direct_action = direct_shop
        direct_widget = widget_for_action(direct_action) or "shop"
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(
            direct_text, action=direct_action, widget=direct_widget,
        ))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": direct_text,
            "action": direct_action,
            "widget": direct_widget,
            "contact_request": False,
            "transcript": transcript or "",
        })

    repeat_shortcut = None
    if _allow_client_chat_shortcuts(body, chat_id, message):
        repeat_shortcut = _client_repeat_booking_decision(chat_id, message, history)
    if repeat_shortcut:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(
            repeat_shortcut["reply"],
            action=repeat_shortcut.get("action"),
            widget=repeat_shortcut.get("widget"),
            widget_data=repeat_shortcut.get("widget_data"),
        ))
        conversations[history_key] = history
        save_conversations(conversations)
        out = {
            "reply": repeat_shortcut["reply"],
            "contact_request": False,
            "transcript": transcript or "",
        }
        for key in ("action", "widget", "widget_data"):
            if repeat_shortcut.get(key):
                out[key] = repeat_shortcut[key]
        return _saved_chat_response(out)

    client_shortcut = None
    if _allow_client_chat_shortcuts(body, chat_id, message):
        client_shortcut = (
            _client_usual_booking_shortcut(chat_id, message)
            or _client_chat_shortcut(message)
        )
    if client_shortcut:
        direct_text, direct_action = client_shortcut
        direct_widget = widget_for_action(direct_action)
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(
            direct_text, action=direct_action, widget=direct_widget,
        ))
        conversations[history_key] = history
        save_conversations(conversations)
        out = {
            "reply": direct_text,
            "contact_request": False,
            "transcript": transcript or "",
        }
        if direct_action:
            out["action"] = direct_action
        if direct_widget:
            out["widget"] = direct_widget
        if transcript:
            try:
                import voice
                import base64 as _b64
                _audio = await voice.synthesize(direct_text, fmt="mp3")
                if _audio:
                    out["audio_reply"] = _b64.b64encode(_audio).decode("ascii")
            except Exception as e:
                logger.error(f"chat_handler shortcut tts: {e}")
        return _saved_chat_response(out)

    deterministic_reply = _deterministic_upsell_reply(message, history)
    if deterministic_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(deterministic_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": deterministic_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    # PWA-история разделена по поверхности кабинета, формат тот же: {role, content}
    # 152-ФЗ: обезличиваем сообщение клиента ДО отправки в LLM и ДО сохранения —
    # так же, как в Telegram-боте (bot.py: anonymizer.redact_pii). Веб-чат раньше слал сырьё.
    safe_message = anonymizer.redact_pii(message)
    history.append(_user_history_item(safe_message))

    # Голос: ТОТ ЖЕ мозг/знания/инструменты, что и текст, но подача — под ОЗВУЧКУ:
    # живая разговорная речь, словами вместо сокращений/markdown. Это НЕ урезание
    # знаний (как было с «1-2 фразами»), а стиль для голоса. Транзиентно — в историю не пишем.
    model_history = history[-30:]
    llm_history = model_history[:-1] + [{
        "role": "user",
        "content": _chat_llm_message(safe_message, mode=chat_mode, voice_mode=voice_mode),
    }]
    # Модель голоса: для консультаций и записи клиентов используем максимальную GPT-модель.
    _vmodel = OPENAI_PWA_CHAT_MODEL if chat_mode == "client" else None
    if voice_mode and chat_mode != "client":
        from claude_ai import _resolve_role
        _vmodel = None if _resolve_role(chat_id) == "founder" else VOICE_CLAUDE_MODEL
    try:
        response_text, contact_request, gift_cert_action = get_ai_response(
            llm_history,
            user_id=chat_id,
            model=_vmodel,
            disabled_tools=_chat_disabled_tools(chat_mode),
            mode=chat_mode,
        )
    except Exception as e:
        logger.error(f"chat_handler: ошибка AI: {e}")
        fallback_text, fallback_action = _chat_temporary_error(chat_mode)
        history.append(_assistant_history_item(fallback_text, action=fallback_action))
        conversations[history_key] = history
        save_conversations(conversations)
        payload = {
            "reply": fallback_text,
            "contact_request": False,
            "transcript": transcript or "",
        }
        if fallback_action:
            payload["action"] = fallback_action
            fallback_widget = widget_for_action(fallback_action)
            if fallback_widget:
                payload["widget"] = fallback_widget
        return _cabinet_response(payload)

    # Если ИИ готов оформить запись (request_booking) — клиент авторизован,
    # оформляем сами (в Telegram это делает контакт-флоу бота, в приложении — мы).
    if contact_request:
        if chat_mode == "staff":
            response_text = STAFF_BOOKING_SCOPE_REPLY
            contact_request = None
        else:
            booking_msg = _finalize_booking_for_chat(chat_id, contact_request)
            if booking_msg:
                response_text = booking_msg

    # Покупка из чата приложения — сертификат ИЛИ абонемент (общий слот gift_cert_action,
    # разделяем по kind). Вместо ссылки на бота отдаём in-app действие, которое
    # открывает нужный раздел приложения с оплатой картой.
    reply_link = None
    cert_action = None
    chat_widget = widget_from_signal(gift_cert_action)
    if gift_cert_action:
        if gift_cert_action.get("kind") == "widget":
            pass
        elif gift_cert_action.get("kind") == "subscription":
            response_text = (
                "Абонементы 🎟 Нажмите кнопку ниже — откроется раздел «Абонементы»: "
                "выберите тариф и уровень (Старший / Топ) и оплатите картой. "
                "Абонемент активируется сразу после оплаты 👇"
            )
            cert_action = {"type": "open_subs", "label": "Оформить абонемент"}
        elif gift_cert_action.get("kind") == "contact":
            # В приложении клиент уже авторизован (телефон известен по сессии),
            # так что request_client_contact тут практически не срабатывает. На
            # всякий случай НЕ превращаем сигнал в (ошибочное) действие с
            # сертификатом — оставляем текст Антона как есть.
            pass
        elif gift_cert_action.get("kind") == "run_job":
            # AI-директор предложил запустить рассылку — отдаём карточку с кнопкой.
            # Нажатие пришлёт __runjob:<job>, и задача запустится (см. _run_owner_job_from_chat).
            cert_action, blocked_reply = _owner_job_action_card(gift_cert_action, chat_id)
            if blocked_reply:
                response_text = blocked_reply
        else:
            amt = gift_cert_action.get("amount")
            response_text = (
                (f"Подарочный сертификат на {amt} ₽ 🎁 " if amt else "Подарочный сертификат 🎁 ")
                + "Нажмите кнопку ниже — откроется раздел «Сертификаты»: выберите получателя "
                "и оплатите картой. PDF-сертификат придёт вам в Telegram 👇"
            )
            cert_action = {"type": "open_certs", "label": "Оформить сертификат"}
            if amt in (2000, 3000, 5000):
                cert_action["amount"] = amt

    chat_widget = chat_widget or widget_for_action(cert_action)

    response_text = _plain_maya_text(response_text or "Секунду, не расслышала — повторите, пожалуйста.")
    knowledge_images = _chat_knowledge_images(chat_id, message, chat_mode)
    history.append(_assistant_history_item(
        response_text,
        link=reply_link,
        action=cert_action,
        images=knowledge_images,
        widget=chat_widget,
    ))
    conversations[history_key] = history
    save_conversations(conversations)

    # Чтобы числа с пробелом-разделителем («2 000 ₽») не разрывались по строкам
    # в узких пузырях чата — склеиваем пробел между цифрами и перед ₽ в NBSP.
    display_text = re.sub(r"(?<=\d)\s(?=[\d₽])", " ", response_text)

    # Голосовой ОТВЕТ в приложении: если клиент написал ГОЛОСОМ (transcript задан)
    # и фича включена — озвучиваем ответ в MP3 (Safari/iOS-PWA не играют Opus в
    # <audio>, MP3 — играют) и кладём base64 в audio_reply. Любая ошибка или
    # выключенный флаг → только текст (фолбэк, диалог не ломается).
    audio_reply_b64 = None
    if transcript:
        try:
            import voice
            import base64 as _b64
            _audio = await voice.synthesize(response_text, fmt="mp3")
            if _audio:
                audio_reply_b64 = _b64.b64encode(_audio).decode("ascii")
        except Exception as e:
            logger.error(f"chat_handler: voice reply synth: {e}")

    resp = {
        "reply": display_text,
        "contact_request": bool(contact_request),
        "transcript": transcript or "",
    }
    if reply_link:
        resp["link"] = reply_link
    if cert_action:
        resp["action"] = cert_action
    if chat_widget:
        resp["widget"] = chat_widget
    if knowledge_images:
        resp["images"] = knowledge_images
    if audio_reply_b64:
        resp["audio_reply"] = audio_reply_b64        # mp3 base64 — приложение проигрывает
    return _cabinet_response(_with_chat_turn_ids(resp, history))


# Стиль для озвучки: тот же мозг/знания, но подача под голос (как в /api/chat).
_VOICE_STYLE_NUDGE = (
    "\n\n[Это голосовой разговор. Отвечай живой естественной разговорной речью — "
    "полно и точно по сути, но по делу, без воды. НЕ используй markdown, списки и "
    "сокращения: проговаривай словами (например «среда», а не «ср»; «рублей», а не "
    "«₽»; «телефон», а не «тел.»). Если нужно перечислить много (услуги, цены) — назови "
    "голосом главное и предложи прислать полный список текстом.]"
)


def _pop_sentence(buf: str, force: bool = False):
    """Отрезает от начала буфера ОДНО завершённое предложение для пословной озвучки.
    Возвращает (предложение, остаток); (None, buf) — если границы ещё нет.
    Граница — .!?… + пробел/конец, но точка после цифры (15.00, 2.5) не считается.
    force=True — отдать весь остаток (финальный хвост без знака конца).
    Защита: буфер ≥280 символов без знаков режем по последнему пробелу (длинный список)."""
    n = len(buf)
    i = 0
    while i < n:
        ch = buf[i]
        if ch in "!?…\n" or (ch == "." and (i == 0 or not buf[i - 1].isdigit())):
            j = i + 1
            while j < n and buf[j] in ".!?…":
                j += 1
            while j < n and buf[j] in '"»)]':
                j += 1
            if j >= n:
                break  # знак в самом конце — ждём, вдруг это «т.е.» в середине фразы
            if ch == "\n" or buf[j].isspace():
                sent = buf[:j].strip()
                rest = buf[j:].lstrip()
                if len(sent) >= 2:
                    return sent, rest
        i += 1
    if force and buf.strip():
        return buf.strip(), ""
    if len(buf) >= 280:
        cut = buf.rfind(" ", 0, 280)
        if cut > 40:
            return buf[:cut].strip(), buf[cut:].lstrip()
    return None, buf


async def chat_stream_handler(request: web.Request) -> web.Response:
    """
    POST /api/chat/stream — то же, что /api/chat, но ответ стримится по SSE,
    чтобы первые слова появлялись через ~1с, а не после полного ответа.

    Голос (body.voice=true + аудио): помимо текстовых дельт, по мере готовности
    КАЖДОГО предложения отдаём событие {"type":"audio","seq":n,"b64":mp3} — фронт
    проигрывает их по очереди, поэтому MAYA начинает говорить с первого предложения,
    не дожидаясь конца ответа и полной озвучки (sentence-boundary chunking).

    Поток событий (по одному JSON в строке `data: ...`):
      {"type":"delta","text":"..."}  — кусок текста ответа
      {"type":"reset"}               — стереть настримленное (была присказка перед
                                       вызовом инструмента, сейчас придёт сам ответ)
      {"type":"done","reply":"...","widget":"book"?,"action":{...}?,"contact_request":bool}
                                     — финал: авторитетный текст + booking/cert-действия
      {"type":"error"}               — сбой; фронт делает фолбэк на /api/chat

    Не-стрим случаи (быстрый ответ мастеру, ошибки авторизации/согласия) отдаются
    обычным JSON — фронт это распознаёт по Content-Type и рендерит как /api/chat.
    """
    from claude_ai import get_ai_response_stream, OPENAI_PWA_CHAT_MODEL
    from memory import load_conversations, save_conversations

    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    if not isinstance(body, dict):
        return _cabinet_response({"error": "invalid_json"}, status=400)

    message = (body.get("message") or "").strip()
    chat_mode = _chat_request_mode(body)

    # Авторизация — идентична /api/chat
    init_data = request.headers.get("X-Telegram-InitData", "")
    tg_user = _verify_telegram_init_data(init_data, TELEGRAM_TOKEN) if init_data else None
    if not tg_user and isinstance(body.get("auth_data"), dict):
        tg_user = _verify_telegram_login_widget(body["auth_data"], TELEGRAM_TOKEN)
    if not tg_user and body.get("session_token"):
        try:
            tg_user = session_tg_user(web_auth.resolve_session(body.get("session_token")))
        except Exception:
            pass
    if not tg_user:
        return _cabinet_response(
            {"error": "unauthorized", "message": "Войдите через Telegram, ВКонтакте или по номеру."},
            status=401,
        )

    chat_id = tg_user.get("id")
    if not chat_id:
        return _cabinet_response({"error": "no_user_id"}, status=400)
    chat_id = int(chat_id)
    chat_mode = _chat_effective_mode(body, chat_id)

    if not database.has_valid_consent_by_chat_id(chat_id):
        return _cabinet_response({
            "error": "needs_consent",
            "message": ("Чтобы общаться с ассистентом, подпишите согласие на обработку "
                        "персональных данных: откройте @malesthetic_bot и нажмите /start."),
        }, status=403)

    transcript = None
    audio_b64 = body.get("audio")
    if audio_b64 and isinstance(audio_b64, str):
        transcript = await asyncio.to_thread(_transcribe_audio_b64, audio_b64)
        if not transcript:
            return _cabinet_response({
                "reply": "Не расслышала голосовое. Попробуйте записать ещё раз или напишите текстом.",
                "transcript": "",
            })
        message = transcript

    if not message:
        return _cabinet_response({"error": "empty_message"}, status=400)
    if len(message) > 2000:
        message = message[:2000]

    if message.startswith("__runjob:"):
        if chat_mode != "staff":
            return _cabinet_response({
                "reply": _client_business_scope_reply(message) or "Это действие доступно только в рабочем кабинете.",
                "contact_request": False,
                "transcript": transcript or "",
            })
        return await _run_owner_job_from_chat(request, chat_id, message.split(":", 1)[1].strip().lower())

    # Быстрый ответ мастеру — без стрима, обычным JSON
    master_reply = _master_chat_shortcut(chat_id, message) if chat_mode == "staff" else None
    if master_reply:
        return _cabinet_response({"reply": master_reply, "transcript": transcript or ""})

    history_key = _chat_history_key(chat_id, chat_mode)
    conversations = load_conversations()
    history, migrated = _ensure_chat_history_ids(
        list(conversations.get(history_key) or [])
    )
    if migrated:
        conversations[history_key] = history
        save_conversations(conversations)

    def _saved_chat_response(payload: dict) -> web.Response:
        return _cabinet_response(_with_chat_turn_ids(payload, history))

    pending_decision, pending_job = _pending_owner_job_decision(chat_id, message, chat_mode)
    if pending_decision == "confirm" and pending_job:
        return await _run_owner_job_from_chat(request, chat_id, pending_job)
    if pending_decision == "cancel":
        return _owner_job_chat_response(
            chat_id, message, "Хорошо, рассылку не запускаю."
        )

    job_status_reply = _owner_job_status_reply(chat_id, message, chat_mode)
    if job_status_reply:
        return _owner_job_chat_response(chat_id, message, job_status_reply)

    founder_permission_reply = _founder_permission_reply(
        chat_id, message, mode=chat_mode,
    )
    if founder_permission_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(founder_permission_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": founder_permission_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    founder_learning_reply = _founder_learning_reply(chat_id, message, mode=chat_mode)
    if founder_learning_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(founder_learning_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": founder_learning_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    own_history_reply = await _own_visit_history_reply(chat_id, message)
    if own_history_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(own_history_reply, widget="history"))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": own_history_reply,
            "widget": "history",
            "contact_request": False,
            "transcript": transcript or "",
        })

    staff_booking_reply = _staff_booking_scope_reply(message) if chat_mode == "staff" else None
    if staff_booking_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(staff_booking_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": staff_booking_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    client_business_reply = _client_business_scope_reply(message) if chat_mode == "client" else None
    if client_business_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(client_business_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": client_business_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    owner_today_reply = _owner_today_commercial_reply(
        chat_id, message, mode=chat_mode,
    )
    if owner_today_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(owner_today_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": owner_today_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    owner_daily_reply = _owner_daily_briefing_reply(chat_id, message, mode=chat_mode)
    if owner_daily_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(owner_daily_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": owner_daily_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    owner_profit_reply = _owner_master_profit_reply(chat_id, message, mode=chat_mode)
    if owner_profit_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(owner_profit_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": owner_profit_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    verified_analytics_reply = _staff_financial_analytics_reply(
        chat_id, message, mode=chat_mode, history=history,
    )
    if verified_analytics_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(verified_analytics_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": verified_analytics_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    direct_shop = _direct_shop_action(message) if chat_mode == "client" else None
    if direct_shop:
        direct_text, direct_action = direct_shop
        direct_widget = widget_for_action(direct_action) or "shop"
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(
            direct_text, action=direct_action, widget=direct_widget,
        ))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": direct_text,
            "action": direct_action,
            "widget": direct_widget,
            "contact_request": False,
            "transcript": transcript or "",
        })

    repeat_shortcut = None
    if _allow_client_chat_shortcuts(body, chat_id, message):
        repeat_shortcut = _client_repeat_booking_decision(chat_id, message, history)
    if repeat_shortcut:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(
            repeat_shortcut["reply"],
            action=repeat_shortcut.get("action"),
            widget=repeat_shortcut.get("widget"),
            widget_data=repeat_shortcut.get("widget_data"),
        ))
        conversations[history_key] = history
        save_conversations(conversations)
        out = {
            "reply": repeat_shortcut["reply"],
            "contact_request": False,
            "transcript": transcript or "",
        }
        for key in ("action", "widget", "widget_data"):
            if repeat_shortcut.get(key):
                out[key] = repeat_shortcut[key]
        return _saved_chat_response(out)

    client_shortcut = None
    if _allow_client_chat_shortcuts(body, chat_id, message):
        client_shortcut = (
            _client_usual_booking_shortcut(chat_id, message)
            or _client_chat_shortcut(message)
        )
    if client_shortcut:
        direct_text, direct_action = client_shortcut
        direct_widget = widget_for_action(direct_action)
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(
            direct_text, action=direct_action, widget=direct_widget,
        ))
        conversations[history_key] = history
        save_conversations(conversations)
        out = {
            "reply": direct_text,
            "contact_request": False,
            "transcript": transcript or "",
        }
        if direct_action:
            out["action"] = direct_action
        if direct_widget:
            out["widget"] = direct_widget
        if transcript and body.get("voice"):
            try:
                import voice
                import base64 as _b64
                _audio = await voice.synthesize(direct_text, fmt="mp3")
                if _audio:
                    out["audio_reply"] = _b64.b64encode(_audio).decode("ascii")
            except Exception as e:
                logger.error(f"chat_stream shortcut tts: {e}")
        return _saved_chat_response(out)

    deterministic_reply = _deterministic_upsell_reply(message, history)
    if deterministic_reply:
        safe_message = anonymizer.redact_pii(message)
        history.append(_user_history_item(safe_message))
        history.append(_assistant_history_item(deterministic_reply))
        conversations[history_key] = history
        save_conversations(conversations)
        return _saved_chat_response({
            "reply": deterministic_reply,
            "contact_request": False,
            "transcript": transcript or "",
        })

    # 152-ФЗ: обезличиваем сообщение и в СТРИМ-пути тоже — фронт шлёт чат сюда
    # ПЕРВЫМ (фолбэк на /api/chat). Тот же redact_pii, что в не-стрим chat_handler.
    safe_message = anonymizer.redact_pii(message)
    history.append(_user_history_item(safe_message))

    # Голосовой режим (hands-free): фронт шлёт voice=true вместе с аудио. Тот же
    # мозг/знания/инструменты, максимальная модель и стиль под озвучку —
    # транзиентно (в историю НЕ пишем). Озвучку шлём только когда фича включена.
    voice_mode = bool(body.get("voice"))
    voice_unclear = bool(transcript and should_clarify_transcript(
        message, history, _voice_known_master_names()
    ))
    model_override = OPENAI_PWA_CHAT_MODEL if chat_mode == "client" else None
    model_history = history[-30:]
    llm_history = model_history[:-1] + [{
        "role": "user",
        "content": _chat_llm_message(safe_message, mode=chat_mode, voice_mode=voice_mode),
    }]
    if voice_mode:
        from claude_ai import VOICE_CLAUDE_MODEL, _resolve_role
        # Голосовой консультант/запись клиентов — максимальная GPT-модель.
        if chat_mode != "client":
            model_override = None if _resolve_role(chat_id) == "founder" else VOICE_CLAUDE_MODEL

    # ── Открываем SSE-поток ──────────────────────────────────────────────
    resp = web.StreamResponse(status=200, headers={
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",  # просим nginx/прокси НЕ буферизовать
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Telegram-InitData, X-Session-Token",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    })
    resp.enable_chunked_encoding()
    await resp.prepare(request)

    async def _send(obj: dict) -> None:
        await resp.write(b"data: " + _json.dumps(obj, ensure_ascii=False).encode("utf-8") + b"\n\n")

    if voice_unclear:
        await _send({"type": "delta", "text": CLARIFY_REPEAT_TEXT})
        audio_sent = False
        if voice_mode:
            try:
                import voice as _voicemod
                import base64 as _b64
                if _voicemod.is_enabled():
                    au = await _voicemod.synthesize(CLARIFY_REPEAT_TEXT, fmt="mp3")
                    if au:
                        await _send({
                            "type": "audio",
                            "seq": 0,
                            "b64": _b64.b64encode(au).decode("ascii"),
                        })
                        audio_sent = True
            except Exception as e:
                logger.error(f"chat_stream unclear voice tts: {e}")
        done = {
            "type": "done",
            "reply": CLARIFY_REPEAT_TEXT,
            "contact_request": False,
            "transcript": "",
        }
        if audio_sent:
            done["voice"] = True
            done["audio_chunks"] = 1
        await _send(done)
        try:
            await resp.write_eof()
        except Exception:
            pass
        return resp

    # Голос: отдаём расшифровку сразу — пользователь видит свои слова, пока MAYA думает.
    if transcript:
        await _send({"type": "transcript", "text": transcript})

    # Генератор — синхронный и блокирующий (OpenAI API + сетевые
    # инструменты). Крутим его в потоке, события переливаем в очередь loop'а.
    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()
    SENTINEL = object()

    def _producer() -> None:
        try:
            for ev in get_ai_response_stream(
                llm_history,
                user_id=chat_id,
                model=model_override,
                disabled_tools=_chat_disabled_tools(chat_mode),
                mode=chat_mode,
            ):
                loop.call_soon_threadsafe(queue.put_nowait, ev)
        except Exception as e:
            logger.error(f"chat_stream: ошибка AI: {e}")
            fallback_text, fallback_action = _chat_temporary_error(chat_mode)
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {
                    "type": "fallback",
                    "text": fallback_text,
                    "action": fallback_action,
                },
            )
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, SENTINEL)

    loop.run_in_executor(None, _producer)

    streamed_parts: list[str] = []   # что реально настримили (для финального reply)
    contact_request = None
    gift_cert_action = None
    meta_text = ""
    fallback_action = None
    had_error = False

    # ── Озвучка по предложениям (sentence-boundary chunking) ─────────────────
    # Скорость: TTS каждого предложения запускаем СРАЗУ и ПАРАЛЛЕЛЬНО (через РФ-прокси
    # один round-trip ~1-2с — последовательно это копилось в «заторможенность»).
    # Пока озвучивается 1-е, уже синтезируются 2-е и 3-е; отдаём по очереди (seq),
    # готовые — немедленно, не дожидаясь неготовых. Клиент играет в порядке seq.
    import voice as _voicemod
    import base64 as _b64
    tts_on = bool(voice_mode and transcript and _voicemod.is_enabled())
    _tts_buf = ""
    _aud_seq = 0
    _aud_tasks = []     # asyncio.Task синтеза в порядке предложений (FIFO)

    async def _emit(au) -> None:
        nonlocal _aud_seq
        if au:
            await _send({"type": "audio", "seq": _aud_seq,
                         "b64": _b64.b64encode(au).decode("ascii")})
            _aud_seq += 1

    def _queue_sentences(force: bool = False) -> None:
        nonlocal _tts_buf
        while True:
            sent, rest = _pop_sentence(_tts_buf, force=force)
            if not sent:
                break
            _tts_buf = rest
            _aud_tasks.append(loop.create_task(
                _voicemod.synthesize(enforce_maya_feminine(sent), fmt="mp3")
            ))

    async def _drain_ready() -> None:
        # отдаём ТОЛЬКО уже готовые куски с головы очереди — порядок не нарушаем,
        # на неготовых не блокируемся (продолжаем читать дельты дальше).
        while _aud_tasks and _aud_tasks[0].done():
            t = _aud_tasks.pop(0)
            try:
                au = t.result()
            except Exception as e:
                logger.error(f"chat_stream: voice tts chunk: {e}")
                au = None
            await _emit(au)

    def _cancel_audio() -> None:
        for t in _aud_tasks:
            t.cancel()
        _aud_tasks.clear()

    try:
        while True:
            ev = await queue.get()
            if ev is SENTINEL:
                break
            t = ev.get("type")
            if t == "delta":
                txt = _plain_maya_delta(ev.get("text", ""))
                if not txt:
                    continue
                streamed_parts.append(txt)
                await _send({"type": "delta", "text": txt})
                if tts_on:
                    _tts_buf += txt
                    _queue_sentences(force=False)
                    await _drain_ready()
            elif t == "reset":
                streamed_parts.clear()
                if tts_on:                 # присказка перед инструментом — отменяем хвост
                    _tts_buf = ""
                    _cancel_audio()
                await _send({"type": "reset"})
            elif t == "meta":
                contact_request = ev.get("contact_request")
                gift_cert_action = ev.get("gift_cert_action")
                meta_text = ev.get("text") or ""
            elif t == "fallback":
                txt = _plain_maya_text(ev.get("text") or CHAT_TEMPORARY_ERROR_REPLY)
                fallback_action = ev.get("action")
                streamed_parts.clear()
                if tts_on:
                    _tts_buf = ""
                    _cancel_audio()
                await _send({"type": "reset"})
                streamed_parts.append(txt)
                await _send({"type": "delta", "text": txt})
            elif t == "error":
                had_error = True
                await _send({"type": "error"})
        # хвост финального ответа + ждём оставшиеся синтезы по порядку
        if tts_on:
            _queue_sentences(force=True)
            for t in _aud_tasks:
                try:
                    au = await t
                except Exception as e:
                    logger.error(f"chat_stream: voice tts tail: {e}")
                    au = None
                await _emit(au)
            _aud_tasks.clear()
    except (ConnectionResetError, asyncio.CancelledError):
        _cancel_audio()
        return resp  # клиент ушёл — молча закрываемся

    if had_error:
        try:
            await resp.write_eof()
        except Exception:
            pass
        return resp

    # Финал: авторитетный текст + booking/cert-постобработка (как в /api/chat)
    response_text = ("".join(streamed_parts).strip()) or meta_text

    if contact_request:
        if chat_mode == "staff":
            response_text = STAFF_BOOKING_SCOPE_REPLY
            contact_request = None
        else:
            try:
                booking_msg = await loop.run_in_executor(
                    None, _finalize_booking_for_chat, chat_id, contact_request)
            except Exception as e:
                logger.error(f"chat_stream: booking finalize: {e}")
                booking_msg = None
            if booking_msg:
                response_text = booking_msg

    cert_action = fallback_action
    chat_widget = widget_from_signal(gift_cert_action, cert_action)
    if gift_cert_action:
        if gift_cert_action.get("kind") == "widget":
            pass
        elif gift_cert_action.get("kind") == "subscription":
            response_text = (
                "Абонементы 🎟 Нажмите кнопку ниже — откроется раздел «Абонементы»: "
                "выберите тариф и уровень (Старший / Топ) и оплатите картой. "
                "Абонемент активируется сразу после оплаты 👇"
            )
            cert_action = {"type": "open_subs", "label": "Оформить абонемент"}
        elif gift_cert_action.get("kind") == "contact":
            # В приложении клиент уже авторизован (телефон известен по сессии),
            # так что request_client_contact тут практически не срабатывает. На
            # всякий случай НЕ превращаем сигнал в (ошибочное) действие с
            # сертификатом — оставляем текст Антона как есть.
            pass
        elif gift_cert_action.get("kind") == "run_job":
            # AI-директор предложил запустить рассылку — отдаём карточку с кнопкой.
            # Нажатие пришлёт __runjob:<job>, и задача запустится (см. _run_owner_job_from_chat).
            cert_action, blocked_reply = _owner_job_action_card(gift_cert_action, chat_id)
            if blocked_reply:
                response_text = blocked_reply
        else:
            amt = gift_cert_action.get("amount")
            response_text = (
                (f"Подарочный сертификат на {amt} ₽ 🎁 " if amt else "Подарочный сертификат 🎁 ")
                + "Нажмите кнопку ниже — откроется раздел «Сертификаты»: выберите получателя "
                "и оплатите картой. PDF-сертификат придёт вам в Telegram 👇"
            )
            cert_action = {"type": "open_certs", "label": "Оформить сертификат"}
            if amt in (2000, 3000, 5000):
                cert_action["amount"] = amt

    chat_widget = chat_widget or widget_for_action(cert_action)

    response_text = _plain_maya_text(response_text or "Секунду, не расслышала — повторите, пожалуйста.")
    knowledge_images = _chat_knowledge_images(chat_id, message, chat_mode)
    history.append(_assistant_history_item(
        response_text,
        action=cert_action,
        images=knowledge_images,
        widget=chat_widget,
    ))
    conversations[history_key] = history
    save_conversations(conversations)

    display_text = re.sub(r"(?<=\d)\s(?=[\d₽])", " ", response_text)
    done = _with_chat_turn_ids({
        "type": "done",
        "reply": display_text,
        "contact_request": bool(contact_request),
        "transcript": transcript or "",
    }, history)
    if cert_action:
        done["action"] = cert_action
    if chat_widget:
        done["widget"] = chat_widget
    if knowledge_images:
        done["images"] = knowledge_images
    if tts_on:
        done["voice"] = True
        done["audio_chunks"] = _aud_seq    # сколько звуковых кусков прислали
    await _send(done)
    try:
        await resp.write_eof()
    except Exception:
        pass
    return resp


async def realtime_handler(request: web.Request) -> web.Response:
    """
    GET /api/realtime — голосовой мост «как ChatGPT» (WebSocket).
    Авторизация первым сообщением {type:"auth", session_token|auth_data|init_data}
    (браузерный WS не умеет кастомные заголовки). Дальше — realtime_bridge.run_session.
    Наружу открыт только этот путь (nginx), мост сам гоняет звук realtime↔OpenAI tool-loop.
    """
    import realtime_bridge
    import aiohttp
    # max_msg_size — потолок на одно входящее WS-сообщение (анти-DoS по памяти).
    # 0 = без лимита (опасно). Аудиокадры из браузера — десятки КБ, 1 МиБ с запасом.
    ws = web.WebSocketResponse(heartbeat=20, max_msg_size=1024 * 1024)
    await ws.prepare(request)

    if not realtime_bridge.is_enabled():
        await ws.send_json({"type": "error", "message": "realtime_disabled"})
        await ws.close()
        return ws

    # 1) Авторизация — первым сообщением (с таймаутом)
    try:
        first = await ws.receive(timeout=15)
    except Exception:
        await ws.close()
        return ws
    if first.type != aiohttp.WSMsgType.TEXT:
        await ws.close()
        return ws
    try:
        auth = _json.loads(first.data)
    except Exception:
        auth = {}

    tg_user = None
    init_data = auth.get("init_data") or request.headers.get("X-Telegram-InitData", "")
    if init_data:
        tg_user = _verify_telegram_init_data(init_data, TELEGRAM_TOKEN)
    if not tg_user and isinstance(auth.get("auth_data"), dict):
        tg_user = _verify_telegram_login_widget(auth["auth_data"], TELEGRAM_TOKEN)
    if not tg_user and auth.get("session_token"):
        try:
            tg_user = session_tg_user(web_auth.resolve_session(auth.get("session_token")))
        except Exception:
            pass
    chat_id = int(tg_user["id"]) if (tg_user and tg_user.get("id")) else None
    if not chat_id:
        await ws.send_json({"type": "error", "message": "unauthorized"})
        await ws.close()
        return ws
    if not database.has_valid_consent_by_chat_id(chat_id):
        await ws.send_json({"type": "error", "message": "needs_consent"})
        await ws.close()
        return ws

    # Режим страницы: 'staff' (рабочий кабинет сотрудника) или 'client' (по умолч.).
    # Мост сам проверит серверную роль — клиент не получит staff-Майю.
    mode = "staff" if str(auth.get("mode") or "").lower() == "staff" else "client"

    await ws.send_json({"type": "ready"})
    try:
        await realtime_bridge.run_session(ws, chat_id, mode=mode)
    except Exception as e:
        logger.error(f"realtime_handler: {e}")
    if not ws.closed:
        await ws.close()
    return ws


# ─── Веб-вход без Telegram (VK ID / телефон) ─────────────────────────────

# Анти-брутфорс/анти-SMS-бомбинг телефонного входа. HTTP обслуживает один процесс
# (вебхук в event-loop бота) → in-process учёт атомарен: между чтением и инкрементом
# нет await, гонки нет, межпроцессный замок не нужен. Фиксированное окно + cooldown.
_PHONE_START_MAX = 5            # не более N отправок кода…
_PHONE_START_WINDOW = 3600      # …за окно, сек (час)
_PHONE_START_COOLDOWN = 60      # и не чаще раза в N сек (анти-SMS-бомбинг)
_PHONE_VERIFY_MAX = 7           # не более N попыток ввода кода на номер…
_PHONE_VERIFY_WINDOW = 900      # …за окно, сек (15 мин)
_phone_start_hits: dict = {}
_phone_verify_hits: dict = {}


def _rl_gc(store: dict, window: float) -> None:
    now = time.time()
    for k in list(store.keys()):
        arr = [t for t in store.get(k, ()) if now - t < window]
        if arr:
            store[k] = arr
        else:
            store.pop(k, None)


def _rl_hit(store: dict, key: str, limit: int, window: float, cooldown: float = 0):
    """Регистрирует попытку по ключу. Возвращает (allowed, retry_after_sec).
    Инкремент только при allowed — отказ не «съедает» лимит."""
    now = time.time()
    arr = [t for t in store.get(key, ()) if now - t < window]
    if cooldown and arr and (now - arr[-1]) < cooldown:
        store[key] = arr
        return False, int(cooldown - (now - arr[-1])) + 1
    if len(arr) >= limit:
        store[key] = arr
        return False, int(window - (now - arr[0])) + 1
    arr.append(now)
    store[key] = arr
    if len(store) > 4096:        # не течём памятью на долгоживущем процессе
        _rl_gc(store, window)
    return True, 0


async def auth_phone_start_handler(request: web.Request) -> web.Response:
    """POST /api/auth/phone/start  Body: {phone} → звонок-пароль или SMS."""
    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    phone = (body or {}).get("phone", "")
    ip = (request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
          or request.remote or "-1")
    # Анти-SMS-бомбинг: лимит и по IP, и по нормализованному номеру.
    norm = web_auth.normalize_phone(phone) or "?"
    ok_ip, ra_ip = _rl_hit(_phone_start_hits, "ip:" + str(ip),
                           _PHONE_START_MAX, _PHONE_START_WINDOW, _PHONE_START_COOLDOWN)
    ok_ph, ra_ph = _rl_hit(_phone_start_hits, "ph:" + norm,
                           _PHONE_START_MAX, _PHONE_START_WINDOW, _PHONE_START_COOLDOWN)
    if not (ok_ip and ok_ph):
        return _cabinet_response(
            {"ok": False, "error": "rate_limited", "retry_after": max(ra_ip, ra_ph),
             "message": "Слишком часто запрашиваете код. Попробуйте позже."}, status=429)
    res = await web_auth.start_phone_login(phone, client_ip=ip)
    return _cabinet_response(res, status=200 if res.get("ok") else 400)


async def auth_phone_verify_handler(request: web.Request) -> web.Response:
    """POST /api/auth/phone/verify  Body: {phone, code} → сессия."""
    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    phone = (body or {}).get("phone", "")
    code = (body or {}).get("code", "")
    ip = (request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
          or request.remote or "-1")
    # Анти-брутфорс кода: считаем КАЖДУЮ попытку (по номеру жёстко, по IP — мягче,
    # за NAT номеров много). Превышение → 429, не доходя до проверки кода.
    norm = web_auth.normalize_phone(phone) or "?"
    ok_ph, ra_ph = _rl_hit(_phone_verify_hits, "ph:" + norm,
                           _PHONE_VERIFY_MAX, _PHONE_VERIFY_WINDOW)
    ok_ip, ra_ip = _rl_hit(_phone_verify_hits, "ip:" + str(ip),
                           _PHONE_VERIFY_MAX * 4, _PHONE_VERIFY_WINDOW)
    if not (ok_ph and ok_ip):
        return _cabinet_response(
            {"ok": False, "error": "rate_limited", "retry_after": max(ra_ph, ra_ip),
             "message": "Слишком много попыток. Попробуйте позже."}, status=429)
    res = await web_auth.verify_phone_login(phone, code)
    return _cabinet_response(res, status=200 if res.get("ok") else 401)


async def cabinet_link_phone_handler(request: web.Request) -> web.Response:
    """POST /api/cabinet/link-phone  Body: {phone, code} (+ авторизация:
    X-Telegram-InitData / auth_data / session_token).

    Привязывает ПОДТВЕРЖДЁННЫЙ по SMS-коду YClients телефон к уже залогиненному
    через Telegram клиенту. Это закрывает кейс «скачал приложение, вошёл через
    Telegram, но кабинет пустой»: после привязки cabinet_me/_build_full_cabinet
    видят телефон и подтягивают карточку, визиты и баллы из YClients —
    без захода в чат-бота. Владение номером доказывается кодом из SMS YClients."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    chat_id = _authed_chat_id(request, body)
    if not chat_id:
        return _cabinet_response({"ok": False, "error": "unauthorized"}, status=401)
    phone = body.get("phone", "")
    code = body.get("code", "")
    if not phone or not code:
        return _cabinet_response({"ok": False, "error": "bad_input"}, status=400)
    # Подтверждаем владение номером кодом из SMS (через YClients /user/auth).
    res = await web_auth.verify_phone_login(phone, code)
    if not res.get("ok"):
        return _cabinet_response({"ok": False, "error": res.get("error") or "wrong_code"}, status=400)
    # Пишем номер в строку этого Telegram-клиента (шифрование + HMAC внутри).
    try:
        client_id = database.get_or_create_client(int(chat_id))
        database.update_client(client_id, phone=web_auth.normalize_phone(phone) or phone)
    except Exception as e:
        logger.error(f"cabinet/link-phone: привязка для chat_id={chat_id} не удалась: {e}")
        return _cabinet_response({"ok": False, "error": "bind_failed"}, status=500)
    logger.info(f"cabinet/link-phone: телефон привязан к chat_id={chat_id}")
    return _cabinet_response({"ok": True})


async def auth_vk_handler(request: web.Request) -> web.Response:
    """POST /api/auth/vk  Body: {code, code_verifier, device_id, redirect_uri?}
    → VK ID (OAuth 2.1 + PKCE) обмен кода → сессия."""
    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    body = body or {}
    # VK-вход по требованию владельца не используется. Закрыт по умолчанию
    # (VK_LOGIN_ENABLED=False) — обратимо через config, без потери кода.
    if not getattr(config, "VK_LOGIN_ENABLED", False):
        return _cabinet_response({"error": "vk_disabled", "message": "Вход через VK отключён."}, status=403)
    ex = await web_auth.exchange_vk_code(
        body.get("code", ""),
        redirect_uri=body.get("redirect_uri"),
        code_verifier=body.get("code_verifier", ""),
        device_id=body.get("device_id", ""),
    )
    if not ex.get("ok"):
        return _cabinet_response(ex, status=401)
    res = web_auth.issue_vk_session(ex["vk_user_id"], name=ex.get("name", ""),
                                    phone=ex.get("phone"))
    return _cabinet_response(res)


async def auth_vk_sdk_handler(request: web.Request) -> web.Response:
    """POST /api/auth/vk-sdk  Body: {access_token, user_id} — результат VK ID SDK
    (виджет OAuthList + VKID.Auth.exchangeCode на клиенте) → наша веб-сессия.
    Это путь «Войти через приложение ВК» без дэнса подтверждения нового устройства."""
    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    body = body or {}
    # VK-вход по требованию владельца не используется. Закрыт по умолчанию
    # (VK_LOGIN_ENABLED=False) — обратимо через config, без потери кода.
    if not getattr(config, "VK_LOGIN_ENABLED", False):
        return _cabinet_response({"error": "vk_disabled", "message": "Вход через VK отключён."}, status=403)
    res = await web_auth.vk_session_from_token(
        body.get("access_token", ""), body.get("user_id"))
    return _cabinet_response(res, status=200 if res.get("ok") else 401)


async def auth_yandex_start_handler(request: web.Request) -> web.Response:
    """POST /api/auth/yandex/start Body: {state, redirect_uri?}
    → готовая ссылка Yandex ID OAuth. Client secret на фронт не отдаём."""
    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    body = body or {}
    res = web_auth.build_yandex_auth_url(
        str(body.get("state") or ""),
        redirect_uri=body.get("redirect_uri"),
    )
    return _cabinet_response(res, status=200 if res.get("ok") else 403)


async def auth_yandex_handler(request: web.Request) -> web.Response:
    """POST /api/auth/yandex Body: {code, redirect_uri?}
    → Yandex ID OAuth exchange → наша web-session."""
    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    body = body or {}
    ex = await web_auth.exchange_yandex_code(
        body.get("code", ""),
        redirect_uri=body.get("redirect_uri"),
    )
    if not ex.get("ok"):
        return _cabinet_response(ex, status=401)
    res = web_auth.issue_yandex_session(
        ex["yandex_user_id"],
        name=ex.get("name", ""),
        phone=ex.get("phone"),
        email=ex.get("email", ""),
        avatar_url=ex.get("avatar_url", ""),
    )
    return _cabinet_response(res)


async def cabinet_me_via_session_handler(request: web.Request) -> web.Response:
    """POST /api/cabinet/me-via-session  Header: X-Session-Token.
    Кабинет для входа без Telegram. Если телефон сматчился с Telegram-клиентом —
    полный кабинет; иначе мягко зовём записаться (YClients-only кабинет — следующий шаг)."""
    sess = web_auth.resolve_session(request.headers.get("X-Session-Token", ""))
    if not sess:
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_user = session_tg_user(sess)
    chat_id = tg_user.get("id") if tg_user else None
    if chat_id:
        return await _build_full_cabinet(int(chat_id), tg_user)
    sess_profile = normalize_tg_user({"full_name": sess.get("display_name")})
    return _cabinet_response({
        "known": False,
        "needs_booking": True,
        "has_phone": bool(sess.get("phone_hash")),
        "name": sess_profile.get("display_name", ""),
        "message": "Запишись на первую стрижку — и здесь появятся твой кабинет, баллы и история.",
    })


async def push_subscribe_handler(request: web.Request) -> web.Response:
    """
    POST /api/push/subscribe
    Сохраняет Web Push subscription только для распознанного мастера/сотрудника.
    """
    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    if not isinstance(body, dict):
        return _cabinet_response({"error": "invalid_json"}, status=400)

    chat_id = _authed_chat_id(request, body)
    if not chat_id:
        return _cabinet_response({"error": "unauthorized"}, status=401)

    subscription = body.get("subscription")
    if not isinstance(subscription, dict) or not subscription.get("endpoint"):
        return _cabinet_response({"error": "bad_subscription"}, status=400)

    ua = request.headers.get("User-Agent", "")
    master = _master_by_chat_id(chat_id)
    if master:
        # Мастер/сотрудник — подписка с staff_id (записи/переносы/отмены/чаевые)
        saved = _save_master_push_subscription(
            master=master, chat_id=chat_id, subscription=subscription, user_agent=ua)
        staff_id = _master_staff_id(master)
        role = "master"
    else:
        # Клиент — подписка по chat_id (staff_id NULL): напоминания + предложение чаевых после визита
        saved = _save_master_push_subscription_sqlite(None, chat_id, subscription, ua)
        staff_id = None
        role = "client"
    if not saved:
        return _cabinet_response({
            "error": "push_storage_not_configured",
            "message": "Не удалось сохранить push-подписку.",
        }, status=501)

    return _cabinet_response({
        "ok": True,
        "role": role,
        "staff_id": staff_id,
        "push_enabled": bool(WEBPUSH_VAPID_PRIVATE_KEY),
    })


async def tip_sent_handler(request: web.Request) -> web.Response:
    """
    POST /api/tips/sent
    Клиент нажал «Я перевёл» на экране чаевых. Это служебный сигнал мастеру,
    не банковское подтверждение поступления денег.
    """
    try:
        body = await request.json()
    except Exception:
        return _cabinet_response({"error": "invalid_json"}, status=400)
    if not isinstance(body, dict):
        return _cabinet_response({"error": "invalid_json"}, status=400)

    master = _master_by_tip_key(body.get("master"), body.get("master_id"))
    if not master:
        return _cabinet_response({"error": "master_not_found"}, status=404)

    amount = body.get("amount") or 0
    try:
        amount_i = int(float(amount))
    except (TypeError, ValueError):
        amount_i = 0
    record_id = body.get("record_id")
    note = _plain_maya_text(str(body.get("note") or "")).strip()[:240]
    # Записываем чаевые для аналитики по каждому мастеру (служебный сигнал, не банк. подтверждение)
    try:
        database.save_tip(
            master_id=body.get("master_id") or master.get("id") or master.get("staff_id"),
            master_slug=body.get("master") or master.get("slug", ""),
            master_name=master.get("name", ""),
            amount=amount_i, record_id=record_id, note=note,
        )
    except Exception as e:
        logger.error(f"tip_sent: save_tip failed: {e}")
    record_part = f"\nЗапись: #{record_id}" if record_id else ""
    note_part = f"\nСообщение: {note.replace('[', '(').replace(']', ')')}" if note else ""
    text = (
        "💸 *Клиент отметил перевод чаевых*\n\n"
        f"Сумма: *{amount_i:,} ₽*".replace(",", " ")
        + record_part + note_part +
        "\n\n_Проверь поступление в банковском приложении._"
    )

    sent_tg = False
    if master.get("telegram_chat_id") and not database.is_master_muted(master["telegram_chat_id"]):
        try:
            await request.app["bot_app"].bot.send_message(
                chat_id=master["telegram_chat_id"],
                text=text,
                parse_mode="Markdown",
            )
            sent_tg = True
        except Exception as e:
            logger.error(f"tip_sent: Telegram send failed: {e}")

    sent_push = await _send_master_push(
        master,
        title="Вам оставили чай",
        body="Вам оставили чай" + (" и сообщение" if note else ""),
        url="/app/?panel=schedule",
        tag=f"tip-{record_id or _master_staff_id(master) or 'master'}",
        data={"record_id": record_id, "event": "tip.sent", "amount": amount_i},
    )

    return _cabinet_response({
        "ok": True,
        "telegram": sent_tg,
        "push_sent": sent_push,
        "note_saved": bool(note),
    })


_SHIFT_REMINDER_OFFSETS = (60, 30)
_SHIFT_REMINDERS_SENT: set[tuple[int, str, int]] = set()


def _master_day_brief_send_hour() -> int:
    raw = os.environ.get(
        "MASTER_DAY_BRIEF_SEND_HOUR",
        str(getattr(config, "MASTER_DAY_BRIEF_SEND_HOUR", 8)),
    )
    try:
        return max(0, min(23, int(raw)))
    except (TypeError, ValueError):
        return 8


def _growth_role_recipients() -> dict[str, set[int]]:
    """Resolve owner and manager recipients from server-side role sources."""
    try:
        founders = {int(value) for value in (getattr(config, "FOUNDER_IDS", []) or [])}
    except Exception:
        founders = set()
    try:
        admins = {int(value) for value in (database.list_admins() or [])}
    except Exception:
        admins = set()
    managers = set(admins) - founders
    try:
        raw = database.get_setting("panel_manager_ids") or ""
        managers.update(
            int(value) for value in raw.replace(" ", "").split(",")
            if value.strip().lstrip("-").isdigit()
        )
    except Exception:
        pass
    managers.difference_update(founders)
    return {"owner": founders, "manager": managers}


async def _send_growth_role_briefs_once(
    app: Application,
    *,
    now: datetime | None = None,
    target_date: str | None = None,
    force: bool = False,
) -> dict:
    """Deliver one aggregate morning brief to owner and manager roles."""
    now = now or datetime.now()
    date_s = target_date or master_briefing.scheduled_brief_date(
        now,
        send_hour=_master_day_brief_send_hour(),
    )
    if not date_s:
        return {"ok": True, "skipped": True, "reason": "outside_send_window", "sent": 0}
    owner_plan = await asyncio.to_thread(growth_planner.get_growth_plan, role="owner")
    manager_plan = growth_planner.manager_view(owner_plan)
    payloads = {
        "owner": {
            "message": growth_planner.render_owner_morning_message(owner_plan),
            "url": "https://malesthetic.pro/app/?panel=os",
            "button": "Открыть план MAYA",
        },
        "manager": {
            "message": growth_planner.render_manager_morning_message(manager_plan),
            "url": "https://malesthetic.pro/app/?panel=analytics",
            "button": "Открыть план мастеров",
        },
    }
    sent = 0
    skipped = 0
    deliveries = []
    for role, chat_ids in _growth_role_recipients().items():
        payload = payloads[role]
        for chat_id in sorted(chat_ids):
            delivery_key = f"growth_role_brief_sent:{date_s}:{role}:{chat_id}"
            if not force and database.get_setting(delivery_key):
                skipped += 1
                deliveries.append({"role": role, "state": "skipped", "reason": "already_sent"})
                continue
            try:
                import maya_inbox_bridge

                accepted = await maya_inbox_bridge.publish_inbox_item(
                    type="growth_plan" if role == "owner" else "morning_brief",
                    title="MAYA · утренний план" + (" владельца" if role == "owner" else " менеджера"),
                    body_text=payload["message"],
                    source_seed=delivery_key,
                    telegram_chat_ids=[int(chat_id)],
                    deep_link=payload["url"].replace("https://malesthetic.pro", "") or "/app/?panel=os",
                    fanout_owners=(role == "owner"),
                    telegram_buttons=[{"text": payload["button"], "url": payload["url"]}],
                )
                if not accepted:
                    deliveries.append({"role": role, "state": "failed", "reason": "action_engine_rejected"})
                    continue
                database.set_setting(delivery_key, now.isoformat(timespec="seconds"))
                sent += 1
                deliveries.append({"role": role, "state": "accepted"})
            except Exception as e:
                logger.error(f"growth role brief {role}: {e}")
                deliveries.append({"role": role, "state": "failed"})
    return {
        "ok": True,
        "date": date_s,
        "sent": sent,
        "skipped_count": skipped,
        "deliveries": deliveries,
    }


async def _collect_master_day_forecasts(
    target_date: str,
    *,
    only_staff_id: int | None = None,
) -> list[dict]:
    """Собирает персональные планы без отправки сообщений."""
    try:
        parsed_date = date.fromisoformat(str(target_date)[:10]).isoformat()
    except Exception:
        return []
    try:
        masters = list(database.list_masters())
    except Exception as e:
        logger.error(f"master day brief: list_masters failed: {e}")
        return []
    try:
        from business_rules import OWNER_STAFF_ID, salary_percent
    except Exception:
        OWNER_STAFF_ID = 0

        def salary_percent(_staff_id):
            return 0.5

    try:
        growth = await asyncio.to_thread(growth_planner.get_growth_plan, role="owner")
        growth_by_staff = {
            int(row.get("staff_id") or 0): row
            for row in (growth.get("masters") or [])
            if isinstance(row, dict) and row.get("staff_id")
        }
    except Exception as e:
        logger.error(f"master day brief: growth plan failed: {e}")
        growth_by_staff = {}

    forecasts = []
    for master in masters:
        staff_id = _master_staff_id(master)
        if not staff_id or int(staff_id) == int(OWNER_STAFF_ID or 0):
            continue
        if only_staff_id and int(staff_id) != int(only_staff_id):
            continue
        try:
            records = await asyncio.to_thread(
                _yc.get_records_for_master,
                int(staff_id),
                parsed_date,
                parsed_date,
            )
        except Exception as e:
            logger.error(f"master day brief: records staff={staff_id}: {e}")
            continue
        schedule_known = False
        is_working = bool(records)
        shift_hours = ""
        try:
            schedule_rows = await asyncio.to_thread(
                _yc.get_staff_schedule,
                int(staff_id),
                parsed_date,
                parsed_date,
            )
            valid_schedule_rows = [
                row for row in (schedule_rows or [])
                if isinstance(row, dict) and not row.get("error")
            ]
            schedule_row = next((
                row for row in valid_schedule_rows
                if str(row.get("date") or "")[:10] == parsed_date
            ), valid_schedule_rows[0] if len(valid_schedule_rows) == 1 else None)
            if schedule_row is not None:
                schedule_known = True
                is_working = bool(schedule_row.get("is_working") and schedule_row.get("slots"))
                shift_hours = ", ".join(
                    f"{slot.get('from', '')}-{slot.get('to', '')}"
                    for slot in (schedule_row.get("slots") or [])
                    if isinstance(slot, dict)
                )
        except Exception as e:
            logger.info(f"master day brief: schedule staff={staff_id}: {e}")
        if schedule_known and not is_working and not records:
            continue
        client_ids = set()
        for record in records or []:
            client = record.get("client") if isinstance(record, dict) else {}
            try:
                client_id = int((client or {}).get("id") or 0)
            except (TypeError, ValueError):
                client_id = 0
            if client_id:
                client_ids.add(client_id)
        history_sem = asyncio.Semaphore(4)

        async def _load_history(client_id: int) -> tuple[int, list[dict]]:
            try:
                async with history_sem:
                    return client_id, await _fetch_client_history(client_id)
            except Exception as e:
                logger.info(f"master day brief: history client={client_id}: {e}")
                return client_id, []

        history_rows = await asyncio.gather(*(
            _load_history(client_id) for client_id in sorted(client_ids)
        ))
        histories = dict(history_rows)
        try:
            catalog = await asyncio.to_thread(_yc.get_services, int(staff_id))
        except Exception as e:
            logger.info(f"master day brief: catalog staff={staff_id}: {e}")
            catalog = []
        growth_row = growth_by_staff.get(int(staff_id), {})
        previous_result = None
        try:
            previous_date = (date.fromisoformat(parsed_date) - timedelta(days=1)).isoformat()
            previous_raw = database.get_setting(
                f"master_growth_day_plan:{previous_date}:{int(staff_id)}"
            )
            previous_forecast = _json.loads(previous_raw or "{}")
            if isinstance(previous_forecast, dict) and previous_forecast.get("date"):
                previous_records = await asyncio.to_thread(
                    _yc.get_records_for_master,
                    int(staff_id),
                    previous_date,
                    previous_date,
                )
                previous_result = master_briefing.evaluate_day_result(
                    previous_forecast,
                    previous_records or [],
                )
        except Exception as e:
            logger.info(f"master day brief: previous result staff={staff_id}: {e}")
        forecast = master_briefing.build_day_forecast(
            staff_id=int(staff_id),
            master_name=(
                master.get("full_name")
                or master.get("name")
                or f"Мастер #{staff_id}"
            ),
            target_date=parsed_date,
            records=records or [],
            histories_by_client=histories,
            salary_percent=salary_percent(int(staff_id)),
            service_catalog=catalog or [],
            previous_month_daily_target_rub=growth_row.get("previous_month_daily_rub") or 0,
            growth_daily_target_rub=growth_row.get("daily_target_remaining_rub") or 0,
            previous_day_result=previous_result,
        )
        forecast["is_working"] = is_working or bool(records)
        forecast["schedule_known"] = schedule_known
        forecast["shift_hours"] = shift_hours
        forecast["delivery_master"] = master
        forecasts.append(forecast)
    return forecasts


async def _send_master_day_briefs_once(
    app: Application,
    *,
    now: datetime | None = None,
    target_date: str | None = None,
    only_staff_id: int | None = None,
    force: bool = False,
) -> dict:
    """Send each scheduled master one role-safe plan for the target workday."""
    now = now or datetime.now()
    date_s = target_date or master_briefing.scheduled_brief_date(
        now,
        send_hour=_master_day_brief_send_hour(),
    )
    if not date_s:
        return {"ok": True, "skipped": True, "reason": "outside_send_window", "sent": 0}
    forecasts = await _collect_master_day_forecasts(
        date_s,
        only_staff_id=only_staff_id,
    )
    sent = 0
    skipped = 0
    deliveries = []
    for forecast in forecasts:
        staff_id = int(forecast.get("staff_id") or 0)
        master = forecast.pop("delivery_master", {})
        if forecast.get("schedule_known") and not forecast.get("is_working"):
            skipped += 1
            deliveries.append({"staff_id": staff_id, "state": "skipped", "reason": "day_off"})
            continue
        compact_forecast = master_briefing.compact_forecast_snapshot(forecast)
        try:
            database.set_setting(
                f"master_growth_day_plan:{date_s}:{staff_id}",
                _json.dumps(compact_forecast, ensure_ascii=False),
            )
        except Exception as e:
            logger.error(f"master day brief snapshot staff={staff_id}: {e}")
        delivery_key = f"master_day_brief_delivery:{date_s}:{staff_id}"
        if not force and database.get_setting(delivery_key):
            skipped += 1
            deliveries.append({"staff_id": staff_id, "state": "skipped", "reason": "already_accepted"})
            continue
        chat_id = master.get("telegram_chat_id")
        message = master_briefing.render_master_day_message(forecast)
        try:
            import maya_inbox_bridge

            telegram_ids = None
            if chat_id and not database.is_master_muted(int(chat_id)):
                telegram_ids = [int(chat_id)]
            target_label = "сегодня" if date_s == now.date().isoformat() else "завтра"
            accepted = await maya_inbox_bridge.publish_inbox_item(
                type="morning_brief",
                title=f"MAYA · план на {target_label}",
                body_text=message,
                source_seed=f"master-day-brief|{date_s}|{staff_id}",
                telegram_chat_ids=telegram_ids,
                deep_link="/app/?panel=schedule",
                payload={"staff_id": staff_id, "date": date_s},
                fanout_owners=False,
            )
        except Exception as e:
            logger.error(f"master day brief Action Engine staff={staff_id}: {e}")
            accepted = False
        if not accepted:
            deliveries.append({"staff_id": staff_id, "state": "failed", "reason": "action_engine_rejected"})
            continue
        accepted_at = now.isoformat(timespec="seconds")
        database.set_setting(delivery_key, accepted_at)
        database.set_setting(f"master_day_brief_sent:{date_s}:{staff_id}", accepted_at)
        database.set_setting(
            f"master_day_brief_last:{staff_id}",
            _json.dumps({
                "date": date_s,
                "accepted_at": accepted_at,
                "records_count": forecast.get("records_count"),
                "booked_revenue_rub": forecast.get("booked_revenue_rub"),
                "potential_total_revenue_rub": forecast.get("potential_total_revenue_rub"),
                "primary_daily_target_rub": forecast.get("primary_daily_target_rub"),
                "primary_target_progress_pct": forecast.get("primary_target_progress_pct"),
                "potential_target_progress_pct": forecast.get("potential_target_progress_pct"),
                "opportunities_count": forecast.get("opportunities_count"),
            }, ensure_ascii=False),
        )
        sent += 1
        deliveries.append({"staff_id": staff_id, "state": "accepted"})
    return {
        "ok": True,
        "date": date_s,
        "sent": sent,
        "skipped_count": skipped,
        "forecast_count": len(forecasts),
        "deliveries": deliveries,
    }


async def panel_master_day_brief_handler(request: web.Request) -> web.Response:
    """Owner-only preview/send персонального плана мастера."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") != "owner":
        return _cabinet_response({
            "error": "forbidden",
            "message": "Планы мастеров доступны только владельцу.",
        }, status=403)
    target_date = str(
        body.get("date")
        or date.today().isoformat()
    )[:10]
    try:
        date.fromisoformat(target_date)
    except Exception:
        return _cabinet_response({"error": "bad_date"}, status=400)
    try:
        staff_id = int(body.get("staff_id") or 0) or None
    except (TypeError, ValueError):
        return _cabinet_response({"error": "bad_staff_id"}, status=400)
    if body.get("send"):
        result = await _send_master_day_briefs_once(
            request.app["bot_app"],
            target_date=target_date,
            only_staff_id=staff_id,
            force=bool(body.get("force")),
        )
        return _cabinet_response(result)
    forecasts = await _collect_master_day_forecasts(target_date, only_staff_id=staff_id)
    for forecast in forecasts:
        forecast.pop("delivery_master", None)
    return _cabinet_response({
        "ok": True,
        "mode": "preview",
        "date": target_date,
        "forecasts": forecasts,
    })


def _parse_work_start(value: Any, day: date) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, dict):
        value = (
            value.get("start")
            or value.get("from")
            or value.get("start_time")
            or value.get("work_start")
        )
    s = str(value or "").strip()
    if not s:
        return None
    try:
        if "T" in s or (len(s) >= 16 and "-" in s):
            return datetime.fromisoformat(s.replace("Z", "+00:00").split("+")[0])
        if re.match(r"^\d{1,2}:\d{2}", s):
            hh, mm = s[:5].split(":")
            return datetime(day.year, day.month, day.day, int(hh), int(mm))
    except Exception:
        return None
    return None


def _master_work_start(master: dict, day: date) -> datetime | None:
    staff_id = _master_staff_id(master)
    if not staff_id:
        return None
    day_s = day.isoformat()
    for name in ("get_master_work_start", "get_master_shift_start", "get_staff_work_start"):
        fn = getattr(database, name, None)
        if not callable(fn):
            continue
        try:
            return _parse_work_start(fn(staff_id=staff_id, date=day_s), day)
        except TypeError:
            try:
                return _parse_work_start(fn(staff_id, day_s), day)
            except Exception as e:
                logger.error(f"{name}: {e}")
        except Exception as e:
            logger.error(f"{name}: {e}")
    try:
        rows = _yc.get_staff_schedule(int(staff_id), day_s, day_s)
        row = rows[0] if rows and isinstance(rows[0], dict) else {}
        slots = row.get("slots") if row.get("is_working") else None
        if slots:
            return _parse_work_start(slots[0], day)
    except Exception as e:
        logger.error(f"shift reminders: YClients schedule failed for {staff_id}: {e}")
    return None


async def _send_shift_reminders_once(app: Application) -> int:
    try:
        masters = list(database.list_masters())
    except Exception as e:
        logger.error(f"shift reminders: list_masters failed: {e}")
        return 0

    now = datetime.now()
    sent = 0
    for master in masters:
        staff_id = _master_staff_id(master)
        if not staff_id:
            continue
        start = await asyncio.to_thread(_master_work_start, master, now.date())
        if not start:
            continue
        minutes_left = int((start - now).total_seconds() // 60)
        for offset in _SHIFT_REMINDER_OFFSETS:
            if minutes_left < offset or minutes_left > offset + 4:
                continue
            key = (staff_id, now.date().isoformat(), offset)
            if key in _SHIFT_REMINDERS_SENT:
                continue
            label = "1 час" if offset == 60 else "30 минут"
            text = (
                f"⏰ *До начала рабочего дня осталось {label}*\n\n"
                f"Старт смены: {start.strftime('%H:%M')}\n"
                "Открой приложение, чтобы проверить расписание."
            )
            try:
                import maya_inbox_bridge
                tg = master.get("telegram_chat_id")
                telegram_ids = None
                if tg and not database.is_master_muted(int(tg)):
                    telegram_ids = [int(tg)]
                accepted = await maya_inbox_bridge.publish_inbox_item(
                    type="shift_reminder",
                    title=f"До рабочего дня {label}",
                    body_text=text.replace("*", ""),
                    source_seed=f"shift|{staff_id}|{now.date().isoformat()}|{offset}",
                    telegram_chat_ids=telegram_ids,
                    deep_link="/app/?panel=schedule",
                    payload={"staff_id": staff_id, "date": now.date().isoformat(), "minutes": offset},
                    fanout_owners=False,
                    telegram_parse_mode="Markdown",
                )
            except Exception as inbox_exc:
                logger.warning(f"shift reminder Action Engine: {inbox_exc}")
                accepted = False
            if accepted:
                _SHIFT_REMINDERS_SENT.add(key)
                sent += 1
    return sent


async def master_shift_reminder_loop(app: Application):
    """Фоновая проверка напоминаний за 60 и 30 минут до смены мастера."""
    while True:
        try:
            await _send_shift_reminders_once(app)
        except Exception as e:
            logger.error(f"shift reminder loop: {e}")
        await asyncio.sleep(300)


async def master_day_brief_loop(app: Application):
    """Утром готовит и лично доставляет планы мастерам на текущий рабочий день."""
    await asyncio.sleep(75)
    while True:
        try:
            result = await _send_master_day_briefs_once(app)
            if result and not result.get("skipped"):
                logger.info(
                    "master day brief: date=%s sent=%s skipped=%s",
                    result.get("date"),
                    result.get("sent"),
                    result.get("skipped_count"),
                )
        except Exception as e:
            logger.error(f"master day brief loop: {e}")
        try:
            role_result = await _send_growth_role_briefs_once(app)
            if role_result and not role_result.get("skipped"):
                logger.info(
                    "growth role brief: date=%s sent=%s skipped=%s",
                    role_result.get("date"),
                    role_result.get("sent"),
                    role_result.get("skipped_count"),
                )
        except Exception as e:
            logger.error(f"growth role brief loop: {e}")
        await asyncio.sleep(600)


async def client_retention_refresh_loop(app: Application):
    """Обновляет тяжёлые клиентские снимки отдельно от запросов чата."""
    await asyncio.sleep(120)
    while True:
        try:
            result = await asyncio.to_thread(owner_ai.client_retention, force=True)
            summary = (result or {}).get("summary") or {}
            logger.info(
                "client retention refreshed: cohort=%s returned=%s forward=%s%%",
                summary.get("previous_cohort_clients"),
                summary.get("returned_clients"),
                summary.get("forward_booking_pct"),
            )
        except Exception as e:
            logger.error(f"client retention refresh loop: {e}")
        try:
            registry = await asyncio.to_thread(owner_ai.client_registry_analysis, force=True)
            logger.info(
                "client registry refreshed: complete=%s total=%s loyal=%s",
                registry.get("complete"),
                registry.get("total_clients"),
                registry.get("loyal_clients"),
            )
        except Exception as e:
            logger.error(f"client registry refresh loop: {e}")
        await asyncio.sleep(21600)


def _owner_reputation_ids() -> list[int]:
    owner_ids = set()
    for value in getattr(config, "FOUNDER_IDS", []) or []:
        try:
            owner_ids.add(int(value))
        except (TypeError, ValueError):
            continue
    return sorted(owner_ids)


async def notify_owner_cycle_candidates(snapshot: dict) -> dict:
    """Submit one PII-free return-queue alert to its canonical executor."""
    payload = cycle_reminder.owner_alert_push_payload(snapshot)
    if not payload:
        return {"attempted": False, "owners": 0, "push": 0}
    owner_ids = _owner_reputation_ids()
    try:
        import maya_inbox_bridge

        accepted = await maya_inbox_bridge.publish_inbox_item(
            type="owner_alert",
            title=payload["title"],
            body_text=payload["body"],
            source_seed=str(payload["data"]["event_id"]),
            telegram_chat_ids=owner_ids,
            deep_link=payload["url"],
            payload={"event": "cycle.candidates", "event_id": payload["data"]["event_id"]},
            fanout_owners=True,
        )
    except Exception as exc:
        logger.error("cycle owner Action Engine delivery: %s", exc)
        accepted = False
    return {
        "attempted": bool(accepted),
        "owners": len(owner_ids),
        "accepted": bool(accepted),
        "event_id": payload["data"]["event_id"],
    }


async def _notify_owner_reputation(app: Application, rows: list[dict]) -> dict:
    alert = reputation.build_owner_review_alert(rows)
    if not alert.get("text"):
        return {"delivered": False, "count": 0, "owners": 0}
    owner_ids = _owner_reputation_ids()
    if not owner_ids:
        return {"delivered": False, "count": alert.get("count", 0), "owners": 0}

    review_ids = sorted(str(row.get("id")) for row in rows if row.get("id"))
    try:
        import maya_inbox_bridge

        delivered = await maya_inbox_bridge.publish_inbox_item(
            type="review_alert",
            title=alert.get("push_title") or "Новый отзыв",
            body_text=alert["text"],
            source_seed="reviews|" + "|".join(review_ids),
            telegram_chat_ids=owner_ids,
            deep_link="/app/?god=1",
            payload={"event": "reputation.new_review", "review_ids": review_ids},
            fanout_owners=True,
        )
    except Exception as e:
        logger.error(f"reputation owner Action Engine delivery: {e}")
        delivered = False
    return {
        "delivered": delivered,
        "count": alert.get("count", 0),
        "positive": alert.get("positive", 0),
        "negative": alert.get("negative", 0),
        "owners": len(owner_ids),
        "accepted": bool(delivered),
    }


async def reputation_monitor_loop(app: Application):
    """Раз в час проверяет публичные карточки и сообщает только о новых отзывах."""
    await asyncio.sleep(150)
    while True:
        try:
            refresh = await asyncio.to_thread(reputation.refresh_public_reviews)
            pending = await asyncio.to_thread(database.list_unalerted_external_reviews, 20)
            notification = {"delivered": False, "count": 0}
            if pending:
                notification = await _notify_owner_reputation(app, pending)
                if notification.get("delivered"):
                    await asyncio.to_thread(
                        database.mark_external_reviews_alerted,
                        [row.get("id") for row in pending if row.get("id")],
                    )
            logger.info(
                "reputation monitor: sources=%s new=%s notified=%s",
                refresh.get("sources_ready"),
                refresh.get("new"),
                notification.get("count"),
            )
        except Exception as e:
            logger.error(f"reputation monitor loop: {e}")
        await asyncio.sleep(3600)


async def waitlist_admin_alert_loop(app: Application):
    """Фоновый пинг админам (Антону) о новичках в листе ожидания (каждые ~2 мин)."""
    import freed_slot
    while True:
        try:
            await freed_slot.alert_admins_new_waitlist(app)
        except Exception as e:
            logger.error(f"waitlist admin alert loop: {e}")
        await asyncio.sleep(120)


async def maya_operating_rhythm_loop(app: Application):
    """Безопасный rhythm-loop Maya OS: внутренние задачи, контроль и замыкание циклов."""
    await asyncio.sleep(60)
    while True:
        try:
            result = await asyncio.to_thread(
                owner_ai.run_operating_rhythm_tick,
                created_by="maya_os_scheduler",
                force=False,
            )
            if result and not result.get("skipped"):
                summary = result.get("summary") or {}
                logger.info(
                    "maya operating rhythm tick: created=%s updated=%s skipped=%s",
                    summary.get("created_count"),
                    summary.get("updated_count"),
                    summary.get("skipped_count"),
                )
        except Exception as e:
            logger.error(f"maya operating rhythm loop: {e}")
        await asyncio.sleep(900)


async def usage_fal_handler(request: web.Request) -> web.Response:
    """POST /api/usage/fal — фиксирует одну успешную генерацию fal.ai (cutmatch)
    = 1 изображение по фикс. цене ($0.15). Зовётся PHP-прокси после успешной
    try-haircut. Низкие ставки (косметический счётчик расхода)."""
    try:
        ai_billing.log_fal_image()
    except Exception as e:
        logger.warning("usage_fal: %s", e)
    return _cabinet_response({"ok": True})


async def auth_status_handler(request: web.Request) -> web.Response:
    """GET /api/auth/status — какие способы входа сейчас живые.
    Фронт красит огоньки на кнопках: зелёный = работает, красный = нет.
    Telegram всегда доступен; Яндекс/VK — по флагам; телефон — когда
    задан ключ SMS.ru. Поменяю конфиг на сервере → огонёк сам позеленеет."""
    return _cabinet_response({
        "telegram": True,
        "vk": bool(getattr(config, "VK_LOGIN_ENABLED", False)),
        "yandex": bool(getattr(config, "YANDEX_LOGIN_ENABLED", False)
                       and getattr(config, "YANDEX_CLIENT_ID", "")
                       and getattr(config, "YANDEX_CLIENT_SECRET", "")),
        "phone": bool(getattr(config, "SMSRU_API_ID", "")),
    })


CUTMATCH_DAILY_LIMIT = 2


async def analyze_face_handler(request: web.Request) -> web.Response:
    """POST /api/analyze-face — ИИ-анализ лица (анфас+профиль) + подбор стрижек.
    Требует авторизации (как чат): initData / auth_data / session_token.
    Лимит CUTMATCH_DAILY_LIMIT консультаций в день на пользователя."""
    if not cutmatch.is_enabled():
        return cutmatch._resp(
            {"error": "disabled", "message": "CutMatch временно отключён."},
            status=404,
        )
    try:
        body = await request.json()
    except Exception:
        return cutmatch._resp({"error": "invalid_json"}, status=400)

    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return cutmatch._resp(
            {"error": "unauthorized",
             "message": "Войди в приложение, чтобы получить подбор стрижки."},
            status=401)
    uid = int(tg_user["id"])

    # Сотрудники (владелец/админы) — без лимита: они показывают приложение клиентам.
    is_staff = False
    try:
        is_staff = bool(database.is_admin(uid))
    except Exception:
        is_staff = False

    used = database.cutmatch_count_today(uid)
    if not is_staff and used >= CUTMATCH_DAILY_LIMIT:
        return cutmatch._resp(
            {"error": "limit", "used": used, "limit": CUTMATCH_DAILY_LIMIT,
             "message": "На сегодня лимит консультаций исчерпан "
                        f"({CUTMATCH_DAILY_LIMIT} в день). Возвращайся завтра ✂️"},
            status=429)

    front = (body.get("photo_front") or body.get("photo") or "").strip()
    profile = (body.get("photo_profile") or "").strip()
    if not front:
        return cutmatch._resp({"error": "missing_photo", "message": "Нужно фото анфас"}, status=400)

    try:
        result = await asyncio.to_thread(cutmatch.analyze_face, front, profile or None)
    except Exception as exc:
        logger.error("analyze_face failed: %s", exc, exc_info=True)
        return cutmatch._resp(
            {"error": "analyze_failed",
             "message": "Не удалось проанализировать фото. Попробуй другое — анфас, хороший свет, без кепки."},
            status=502)

    if is_staff:
        result["unlimited"] = True  # счётчик не тратим, остаток не показываем
    else:
        new_count = database.cutmatch_incr_today(uid)
        result["used"] = new_count
        result["limit"] = CUTMATCH_DAILY_LIMIT
        result["remaining"] = max(0, CUTMATCH_DAILY_LIMIT - new_count)
    return cutmatch._resp(result)


# ── Telegram-аватар пользователя для пилюли имени ──
_TG_PHOTO_CACHE = {}   # chat_id -> {"value": data_uri|None, "expires_at": float}


def _fetch_tg_photo(chat_id: int):
    """Скачивает аватар пользователя Telegram через бота (по chat_id) → data-URI.
    Успешный ответ кешируем надолго, а сетевой сбой — только кратко, чтобы
    флапающий Telegram-прокси не прятал фото до конца дня."""
    import requests, base64
    now_ts = time.time()
    c = _TG_PHOTO_CACHE.get(chat_id)
    if c and float(c.get("expires_at") or 0) > now_ts:
        return c.get("value")
    proxy = getattr(config, "PROXY_URL", "") or ""
    pr = {"http": proxy, "https": proxy} if proxy else None
    data_uri = None
    had_network_error = False
    try:
        base = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"
        for attempt in range(3):
            try:
                r = requests.get(
                    base + "/getUserProfilePhotos",
                    params={"user_id": chat_id, "limit": 1},
                    proxies=pr,
                    timeout=20,
                )
                r.raise_for_status()
                photos = (r.json().get("result") or {}).get("photos") or []
                if photos:
                    file_id = photos[0][-1]["file_id"]   # самый крупный размер последнего фото
                    f = requests.get(
                        base + "/getFile",
                        params={"file_id": file_id},
                        proxies=pr,
                        timeout=20,
                    )
                    f.raise_for_status()
                    path = (f.json().get("result") or {}).get("file_path")
                    if path:
                        img = requests.get(
                            f"https://api.telegram.org/file/bot{TELEGRAM_TOKEN}/{path}",
                            proxies=pr,
                            timeout=25,
                        )
                        img.raise_for_status()
                        if img.content:
                            data_uri = "data:image/jpeg;base64," + base64.b64encode(img.content).decode()
                had_network_error = False
                break
            except requests.RequestException as e:
                had_network_error = True
                if attempt == 2:
                    raise
                time.sleep(1.0 + attempt * 0.5)
    except Exception as e:
        logger.error("tg photo fetch %s: %s", chat_id, e)
    if data_uri:
        _TG_PHOTO_CACHE[chat_id] = {"value": data_uri, "expires_at": now_ts + 24 * 3600}
    elif had_network_error:
        if c and c.get("value"):
            return c.get("value")
        _TG_PHOTO_CACHE.pop(chat_id, None)
    else:
        _TG_PHOTO_CACHE[chat_id] = {"value": None, "expires_at": now_ts + 3600}
    return data_uri


async def me_photo_handler(request: web.Request) -> web.Response:
    """POST /api/me/photo — Telegram-аватар авторизованного пользователя для пилюли."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"photo": None})
    uid = int(tg_user["id"])
    photo = await asyncio.to_thread(_fetch_tg_photo, uid)
    if not photo:
        photo = normalize_tg_user(tg_user).get("photo_url") or None
    return _cabinet_response({"photo": photo})


async def set_visit_mood_handler(request: web.Request) -> web.Response:
    """POST /api/set-visit-mood {record_id, mood} — клиент из приложения выбрал
    «настроение визита» (🔴 red — тишина / 🔵 blue — общение). Сохраняем на
    конкретную запись + дописываем пометку в комментарий записи YClients,
    чтобы барбер видел выбор. Авторизация — личность клиента (initData/сессия)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    mood = (body.get("mood") or "").strip().lower()
    if mood not in ("red", "blue"):
        return _cabinet_response({"error": "bad_mood"}, status=400)
    try:
        record_id = int(body.get("record_id") or 0)
    except Exception:
        record_id = 0
    if not record_id:
        return _cabinet_response({"error": "no_record"}, status=400)
    client_id = None
    caller_phone = ""
    try:
        dbc = await asyncio.to_thread(database.get_client, int(tg_user["id"]))
        if dbc:
            client_id = dbc.get("id")
            caller_phone = dbc.get("phone") or ""
    except Exception:
        client_id = None

    # Защита от IDOR: настроение можно ставить ТОЛЬКО на СВОЮ запись. record_id у
    # YClients последовательны и легко перебираются — без проверки любой
    # авторизованный клиент мог бы менять настроение/комментарий чужих записей.
    # Сверяем телефон записи с телефоном профиля звонящего.
    def _digits10(p):
        return "".join(ch for ch in str(p or "") if ch.isdigit())[-10:]
    try:
        rec = await asyncio.to_thread(_yc.get_record, record_id)
    except Exception:
        rec = None
    rec_phone = ((rec or {}).get("client") or {}).get("phone") if rec else None
    if not rec or not _digits10(caller_phone) or _digits10(rec_phone) != _digits10(caller_phone):
        return _cabinet_response({"error": "forbidden", "message": "Это не ваша запись."}, status=403)

    ok = await asyncio.to_thread(database.set_visit_mood, record_id, mood, "app", client_id)
    if not ok:
        return _cabinet_response({"error": "bad_mood"}, status=400)
    note = "🔴 Просит тишину" if mood == "red" else "🔵 Настроен общаться"
    try:
        await asyncio.to_thread(
            _yc.append_record_comment, record_id, note,
            ["🔴 Просит тишину", "🔵 Настроен общаться"],
        )
    except Exception as e:
        logger.error("set_visit_mood comment record_id=%s: %s", record_id, e)
    return _cabinet_response({"ok": True, "mood": mood})


_NEAREST_SLOT_CACHE = {"ts": 0.0, "data": None}


async def nearest_slot_handler(request: web.Request) -> web.Response:
    """GET /api/nearest-slot — ближайшее свободное окно по салону (среди ДЕЙСТВУЮЩИХ
    мастеров). Публично (тизер на кнопке «Записаться»). Кэш 15 минут — один расчёт
    на всех. Ответ: {ok, date, time 'HH:MM', label 'Сегодня'/'Завтра'/'dd.mm (день)'}."""
    import time as _t
    now = _t.time()
    c = _NEAREST_SLOT_CACHE
    if c["data"] is not None and (now - c["ts"]) < 900:
        return _cabinet_response(c["data"])
    try:
        from config import ACTIVE_MASTER_IDS as _ids
    except Exception:
        _ids = []
    best = None  # (sortKey, date, time, label)
    for sid in (_ids or []):
        try:
            days = await asyncio.to_thread(_yc.find_nearest_slots, int(sid), None, 7)
        except Exception:
            continue
        if not days or not isinstance(days[0], dict):
            continue
        d0 = days[0]
        slots = d0.get("slots") or []
        date_s = d0.get("date") or ""
        if not slots or not date_s:
            continue
        time_s = str(slots[0] or "")[:5]
        if not time_s:
            continue
        key = date_s + "T" + time_s
        if best is None or key < best[0]:
            best = (key, date_s, time_s, d0.get("label") or "")
    data = {"ok": True, "date": best[1], "time": best[2], "label": best[3]} if best else {"ok": False}
    c["ts"] = now
    c["data"] = data
    return _cabinet_response(data)


async def panel_journal_handler(request: web.Request) -> web.Response:
    """POST /api/panel/journal {date} — журнал записей за день (мастера колонками).
    Только персонал (owner/manager/master). Телефоны клиентов — ТОЛЬКО владельцу (152-ФЗ)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden"}, status=403)
    can_phone = (info.get("role") == "owner")   # телефоны клиентов — только владельцу
    day = (body.get("date") or "").strip() or date.today().isoformat()
    try:
        # Независимые запросы — параллельно (записи + графики), чтобы не складывать задержки.
        records, masters_raw = await asyncio.gather(
            asyncio.to_thread(_yc.get_company_records, day, day),
            asyncio.to_thread(_yc.get_working_masters, day),
        )
    except Exception as e:
        logger.error("panel_journal %s: %s", day, e)
        return _cabinet_response({"error": "yclients", "message": "Не удалось загрузить журнал"}, status=502)

    from datetime import datetime as _dt, timedelta as _td
    items = []
    for r in records or []:
        if not isinstance(r, dict) or r.get("deleted"):
            continue
        rid = r.get("id")
        staff = r.get("staff") or {}
        sid = r.get("staff_id") or staff.get("id")
        if not sid:
            continue
        dt = r.get("datetime") or r.get("date") or ""
        start_hm = dt[11:16] if len(dt) >= 16 else ""
        end_hm = ""
        length = r.get("length") or r.get("seance_length") or 0
        try:
            if start_hm and length:
                base = _dt.fromisoformat(dt[:19])
                end_hm = (base + _td(seconds=int(length))).strftime("%H:%M")
        except Exception:
            end_hm = ""
        client = r.get("client") or {}
        services = [s.get("title", "") for s in (r.get("services") or []) if isinstance(s, dict)]
        # Статус визита → цвет карточки в журнале.
        # attendance: -1 не пришёл, 0 ожидание, 1 пришёл, 2 подтвердил.
        att = r.get("attendance")
        vatt = r.get("visit_attendance")
        if att == -1 or vatt == -1:
            status = "noshow"                                    # красный
        elif att == 1 or vatt == 1 or r.get("paid_full") == 1:
            status = "done"                                      # оранжевый (проведён/оплачен)
        else:
            status = "waiting"                                   # зелёный (записан, ждём)
        items.append({
            "record_id": rid,
            "staff_id": sid,
            "start": start_hm,
            "end": end_hm,
            "client": (client.get("name") or "").strip() or "Клиент",
            "phone": ((client.get("phone") or "") if can_phone else None),
            "services": [t for t in services if t],
            "status": status,
            "attendance": att if isinstance(att, int) else 0,
            "attended": (att == 1) or (vatt == 1),   # обратная совместимость
        })
    # Настроение визита (🔴 тишина / 🔵 общение) — батч-чтение, чтобы барбер
    # видел выбор клиента прямо в карточке расписания.
    try:
        _moods = database.get_visit_moods([it["record_id"] for it in items])
        for it in items:
            try:
                it["mood"] = _moods.get(int(it["record_id"]))
            except Exception:
                it["mood"] = None
    except Exception:
        for it in items:
            it.setdefault("mood", None)
    items.sort(key=lambda x: x.get("start") or "")

    # Колонки журнала привязаны к РЕАЛЬНОМУ графику дня: показываем мастеров,
    # которые работают, ПЛЮС тех, у кого в этот день есть записи (чтобы ни одна
    # запись не пропала из вида, даже если мастер поставлен на выходной).
    rec_staff_ids = {it["staff_id"] for it in items}
    masters = []
    for m in (masters_raw or []):
        if not isinstance(m, dict) or not m.get("id"):
            continue
        # Показываем работающих + тех, у кого график не удалось получить
        # (schedule_unknown — не прячем, чтобы работающий мастер не исчез),
        # + тех, у кого в этот день есть записи.
        if m.get("is_working") or m.get("schedule_unknown") or m.get("id") in rec_staff_ids:
            masters.append({
                "id": m.get("id"),
                "name": m.get("name", ""),
                "avatar": m.get("avatar", ""),
                "is_working": bool(m.get("is_working")),
                "schedule_unknown": bool(m.get("schedule_unknown")),
                "work_start": m.get("work_start", ""),
                "work_end": m.get("work_end", ""),
                "work_slots": m.get("work_slots", []),
            })
    working_count = sum(1 for m in (masters_raw or [])
                        if isinstance(m, dict) and m.get("is_working"))
    # Полный список активных мастеров — для выбора при переносе записи
    # (можно перенести и на того, кто в этот день колонкой не показан).
    all_masters = [{"id": m.get("id"), "name": m.get("name", "")}
                   for m in (masters_raw or [])
                   if isinstance(m, dict) and m.get("id")]

    return _cabinet_response({
        "date": day,
        "role": info.get("role"),
        "can_see_phone": can_phone,
        "masters": masters,
        "all_masters": all_masters,
        "working_count": working_count,
        "records": items,
    })


async def panel_journal_create_handler(request: web.Request) -> web.Response:
    """POST /api/panel/journal_create — ручная запись клиента из журнала.
    ⚠️ Только ВЛАДЕЛЕЦ (вводится телефон клиента; по 152-ФЗ телефоны — только владельцу).
    Тело: {staff_id, service_ids[], datetime, client_name, client_phone, duration_minutes?}.
    duration_minutes — явная длительность сеанса (мастер «стянул» запись); без неё
    длительность = сумма длительностей услуг."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    is_owner = (info.get("role") == "owner")
    try:
        staff_id = int(body.get("staff_id") or 0)
    except Exception:
        staff_id = 0
    service_ids = []
    for x in (body.get("service_ids") or []):
        try:
            service_ids.append(int(x))
        except Exception:
            pass
    dt = (body.get("datetime") or "").strip()
    name = (body.get("client_name") or "").strip()
    # Телефон вводит/хранит только владелец (152-ФЗ). Мастер записывает клиента по имени.
    phone = (body.get("client_phone") or "").strip() if is_owner else ""
    if not (staff_id and service_ids and dt and name):
        return _cabinet_response({"error": "missing", "message": "Заполните мастера, услугу, время и имя."}, status=400)
    # Длительность сеанса: если персонал задал вручную (duration_minutes) — берём её,
    # иначе = сумма длительностей выбранных услуг. Если не вышло — 1 час.
    seance_length = 0
    explicit_min = body.get("duration_minutes")
    if explicit_min is not None:
        try:
            m = int(explicit_min)
            # 5 минут … 12 часов — защита от опечатки/мусора
            if 5 <= m <= 720:
                seance_length = m * 60
        except Exception:
            seance_length = 0
    if not seance_length:
        try:
            svcs = await asyncio.to_thread(_yc.get_services, staff_id)
            by_id = {s.get("id"): s for s in (svcs or []) if isinstance(s, dict)}
            for sid_ in service_ids:
                d = by_id.get(sid_, {}).get("duration") or 0
                seance_length += int(d) if d else 0
        except Exception:
            seance_length = 0
    try:
        # Админский эндпоинт — владелец может поставить запись на любой день/время
        # (book_record отклонял бы нерабочее время мастера).
        result = await asyncio.to_thread(
            _yc.create_record_admin, staff_id, service_ids, dt, name, phone,
            seance_length, bridge_origin="webhook.panel")
    except Exception as e:
        logger.error("journal_create: %s", e)
        return _cabinet_response({"error": "yclients", "message": "Не удалось создать запись."}, status=502)
    if result.get("success"):
        return _cabinet_response({"ok": True, "record_id": result.get("record_id")})
    if _action_outcome_unknown(result):
        return _cabinet_response(_action_unknown_payload(
            result,
            "Результат создания записи уточняется. Не повторяйте действие.",
        ), status=202)
    return _cabinet_response({"error": "create_failed", "message": result.get("error") or "YClients отклонил запись."}, status=400)


async def panel_client_search_handler(request: web.Request) -> web.Response:
    """POST /api/panel/client_search — подсказки клиентов по части телефона
    для ручной записи из журнала. ⚠️ Только ВЛАДЕЛЕЦ (телефоны — ПД, 152-ФЗ).
    Тело: {query}. Возвращает {clients:[{id,name,phone}]}. Запрос <4 цифр игнорируется
    (иначе YClients вернёт случайных клиентов — утечка ПД)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") != "owner":
        return _cabinet_response({"clients": []})   # телефоны видит только владелец
    q = (body.get("query") or "").strip()
    digits = "".join(ch for ch in q if ch.isdigit())
    if len(digits) < 4:
        return _cabinet_response({"clients": []})
    try:
        clients = await asyncio.to_thread(_yc.search_clients, q, 8)
    except Exception as e:
        logger.error("panel_client_search: %s", e)
        clients = []
    return _cabinet_response({"clients": clients})


async def panel_waitlist_handler(request: web.Request) -> web.Response:
    """POST /api/panel/waitlist — активный лист ожидания: на какие занятые слоты
    есть спрос (кто ждёт, что место освободится). ⚠️ Только владелец/аналитика."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if not info.get("permissions", {}).get("analytics"):
        return _cabinet_response({"error": "forbidden", "message": "Недостаточно прав."}, status=403)
    try:
        rows = await asyncio.to_thread(database.get_active_waitlist, 200)
    except Exception as e:
        logger.error(f"panel_waitlist: {e}")
        rows = []
    try:
        roster = _yc.get_masters() or []
    except Exception:
        roster = []
    names = {m.get("id"): m.get("name", "") for m in roster
             if isinstance(m, dict) and not m.get("error") and m.get("id") is not None}
    groups = {}
    for r in rows:
        key = (r["staff_id"], r["slot_datetime"])
        g = groups.get(key)
        if not g:
            g = {"staff_id": r["staff_id"],
                 "staff_name": names.get(r["staff_id"]) or f"Мастер #{r['staff_id']}",
                 "slot": r["slot_datetime"],
                 "when": _format_datetime(str(r["slot_datetime"]).replace("T", " ")),
                 "clients": []}
            groups[key] = g
        nm = ""
        try:
            cl = database.get_client(r["chat_id"]) if r.get("chat_id") else None
            nm = (cl.get("name") if cl else "") or ""
        except Exception:
            nm = ""
        g["clients"].append({"name": (nm.split()[0] if nm else "Клиент")})
    out = sorted(groups.values(), key=lambda x: x["slot"])
    for g in out:
        g["count"] = len(g["clients"])
    return _cabinet_response({"slots": out, "total": len(rows)})


async def _panel_record_guard(info: dict, record_id: int):
    """BOLA-страж операций журнала по перебираемому record_id (OWASP API1).

    Владелец/управляющий — полный доступ ко всем записям салона.
    Привязанный мастер — ТОЛЬКО к записям СВОЕЙ колонки: иначе, подставив чужой
    record_id, он мог бы читать/отменять/переносить/«оплачивать»/править любую
    запись салона и видеть ПДн чужого клиента (нарушение 152-ФЗ). Запись берём из
    YClients (источник истины) и сверяем её staff_id со staff_id мастера.

    Возвращает (rec | None, error_response | None):
      • (None, None)     — owner/manager: доступ разрешён, запись НЕ грузили;
      • (rec,  None)     — мастер: запись его (rec уже загружен — можно переиспользовать);
      • (None, response) — доступ запрещён / ошибка (вернуть response сразу).
    """
    role = info.get("role")
    # Полный доступ к журналу: владелец, управляющий и кассир/ресепшен (is_cashier —
    # доверенная роль: закрывает оплаты и ведёт записи всего салона). Телефоны
    # клиентов им всё равно НЕ показываются — это гейтится отдельно (can_phone=owner).
    if role in ("owner", "manager") or info.get("is_cashier"):
        return None, None
    if role != "master":
        return None, _cabinet_response(
            {"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    try:
        own_sid = int(info.get("staff_id") or 0)
    except Exception:
        own_sid = 0
    if not own_sid:
        return None, _cabinet_response(
            {"error": "forbidden", "message": "Запись недоступна."}, status=403)
    try:
        rec = await asyncio.to_thread(_yc.get_record, record_id)
    except Exception as e:
        logger.error("panel record guard %s: %s", record_id, e)
        return None, _cabinet_response(
            {"error": "yclients", "message": "Не удалось проверить запись."}, status=502)
    if not rec:
        return None, _cabinet_response(
            {"error": "not_found", "message": "Запись не найдена."}, status=404)
    staff = rec.get("staff") or {}
    try:
        rec_sid = int(rec.get("staff_id") or staff.get("id") or 0)
    except Exception:
        rec_sid = 0
    if rec_sid != own_sid:
        logger.warning(
            "BOLA заблокирован: мастер staff_id=%s обратился к record_id=%s (запись мастера %s)",
            own_sid, record_id, rec_sid)
        return None, _cabinet_response(
            {"error": "forbidden", "message": "Эта запись не из вашего расписания."}, status=403)
    return rec, None


async def panel_journal_reschedule_handler(request: web.Request) -> web.Response:
    """POST /api/panel/journal_reschedule — перенос записи (персонал owner/manager/master).
    Тело: {record_id, datetime, staff_id?}. service_ids не шлём — reschedule_booking
    сам подтягивает текущие услуги. Перенос идёт НЕразрушающим PUT — record_id
    СОХРАНЯЕТСЯ (та же запись); фронт всё равно делает refresh после ok."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    try:
        record_id = int(body.get("record_id") or 0)
    except Exception:
        record_id = 0
    dt = (body.get("datetime") or "").strip()
    staff_id = None
    if body.get("staff_id"):
        try:
            staff_id = int(body.get("staff_id"))
        except Exception:
            staff_id = None
    if not (record_id and dt):
        return _cabinet_response({"error": "missing", "message": "Нужны запись и новое время."}, status=400)
    _grec, _gerr = await _panel_record_guard(info, record_id)
    if _gerr:
        return _gerr
    try:
        result = await asyncio.to_thread(
            _yc.reschedule_booking, record_id, dt, None, staff_id,
            bridge_origin="webhook.panel",
        )
    except Exception as e:
        logger.error("journal_reschedule: %s", e)
        return _cabinet_response({"error": "yclients", "message": "Не удалось перенести запись."}, status=502)
    if result.get("success"):
        # Перенос из панели делает персонал (владелец/управляющий/мастер) → 'staff':
        # webhook record.update напишет мастеру «перенесено администратором», не «клиент сам».
        try:
            database.mark_reschedule_actor(result.get("record_id") or record_id, "staff")
        except Exception:
            pass
        return _cabinet_response({"ok": True, "record_id": result.get("record_id")})
    if _action_outcome_unknown(result):
        return _cabinet_response(_action_unknown_payload(
            result,
            "Результат переноса уточняется. Не повторяйте действие.",
        ), status=202)
    return _cabinet_response({"error": "reschedule_failed", "message": result.get("error") or "YClients отклонил перенос."}, status=400)


async def panel_journal_cancel_handler(request: web.Request) -> web.Response:
    """POST /api/panel/journal_cancel — отмена записи (только ВЛАДЕЛЕЦ).
    Тело: {record_id}."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    try:
        record_id = int(body.get("record_id") or 0)
    except Exception:
        record_id = 0
    if not record_id:
        return _cabinet_response({"error": "missing", "message": "Нужен ID записи."}, status=400)
    _grec, _gerr = await _panel_record_guard(info, record_id)
    if _gerr:
        return _gerr
    try:
        result = await asyncio.to_thread(
            _yc.cancel_booking, record_id, bridge_origin="webhook.panel",
        )
    except Exception as e:
        logger.error("journal_cancel: %s", e)
        return _cabinet_response({"error": "yclients", "message": "Не удалось отменить запись."}, status=502)
    if result.get("success"):
        return _cabinet_response({"ok": True, "record_id": result.get("record_id")})
    if _action_outcome_unknown(result):
        return _cabinet_response(_action_unknown_payload(
            result,
            "Результат отмены уточняется. Не повторяйте действие.",
        ), status=202)
    return _cabinet_response({"error": "cancel_failed", "message": result.get("error") or "YClients отклонил отмену."}, status=400)


# ─── Внутренний чат сотрудников (общий канал команды) ───────────────────────

# Вложения чата команды лежат статикой на Beget; принимаем только такие ссылки.
TEAM_MEDIA_URL_PREFIX = "https://malesthetic.pro/app/media/team/"
TEAM_MEDIA_TTL_SECONDS = 2 * 24 * 60 * 60


def _team_chat_mark_media_expiry(messages: list[dict]) -> list[dict]:
    for msg in messages:
        if not (msg.get("media_kind") and msg.get("media_url")):
            continue
        created_raw = str(msg.get("created_at") or "")
        try:
            created_at = datetime.fromisoformat(created_raw)
        except Exception:
            continue
        now = datetime.now(created_at.tzinfo) if created_at.tzinfo else datetime.now()
        expires_at = created_at + timedelta(seconds=TEAM_MEDIA_TTL_SECONDS)
        msg["media_expires_at"] = expires_at.isoformat(timespec="seconds")
        if (now - created_at).total_seconds() >= TEAM_MEDIA_TTL_SECONDS:
            msg["media_expired"] = True
    return messages

# ── Присутствие в чате команды (эфемерно, в памяти процесса) ──────────────
# Кто онлайн (держит чат открытым) и кто печатает. Обновляется на каждом
# поллинге team_chat_fetch — отдельных запросов не добавляет. Один процесс
# бот+webhook, поэтому простого dict достаточно (как _RESCHEDULE_ACTORS).
_TEAM_PRESENCE: dict = {}        # chat_id -> {"name", "last_seen", "typing_until"}
_PRESENCE_ONLINE_TTL = 14.0      # «в сети», если last_seen в пределах N сек
_PRESENCE_TYPING_TTL = 6.0       # «печатает», пока typing_until не истёк


def _presence_touch(chat_id: int, name: str, typing: bool = False, sending: bool = False) -> None:
    now = time.time()
    ent = _TEAM_PRESENCE.get(int(chat_id)) or {}
    ent["name"] = name or ent.get("name") or "Сотрудник"
    ent["last_seen"] = now
    if sending:
        ent["typing_until"] = 0.0                    # отправил — больше не «печатает»
    elif typing:
        ent["typing_until"] = now + _PRESENCE_TYPING_TTL
    _TEAM_PRESENCE[int(chat_id)] = ent
    # подчистка протухших записей (> 2 мин без активности)
    for k in [k for k, v in _TEAM_PRESENCE.items() if now - v.get("last_seen", 0) > 120]:
        _TEAM_PRESENCE.pop(k, None)


def _presence_snapshot(exclude_chat_id: int):
    """→ (online: [{chat_id,name}], typing: [name]) — typing без самого себя."""
    now = time.time()
    online, typing = [], []
    for cid, v in _TEAM_PRESENCE.items():
        if now - v.get("last_seen", 0) <= _PRESENCE_ONLINE_TTL:
            online.append({"chat_id": cid, "name": v.get("name") or "Сотрудник"})
        if cid != int(exclude_chat_id) and v.get("typing_until", 0) > now:
            typing.append(v.get("name") or "Сотрудник")
    return online, typing


def _is_staff_info(info: dict) -> bool:
    return bool(info and (info.get("is_master") or info.get("role") in ("owner", "manager", "master")))


_TEAM_MEDIA_LABEL = {
    "voice": "🎤 Голосовое сообщение",
    "image": "📷 Фото",
    "video": "🎬 Видео",
    "file": "📎 Файл",
}
_TEAM_MEDIA_PREFIX = {"voice": "🎤 ", "image": "📷 ", "video": "🎬 ", "file": "📎 "}


def _normalize_team_voice_bytes(raw: bytes) -> tuple[bytes, float]:
    """Convert any supported voice container to a small progressive AAC/M4A file."""
    import subprocess
    import tempfile

    if not raw:
        raise ValueError("empty_voice")
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError("voice_too_large")
    with tempfile.TemporaryDirectory(prefix="team_voice_") as td:
        src = os.path.join(td, "voice.in")
        dst = os.path.join(td, "voice.m4a")
        with open(src, "wb") as f:
            f.write(raw)
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-fflags", "+genpts",
            "-i", src,
            "-vn", "-map", "0:a:0",
            "-af", "aresample=async=1:first_pts=0",
            "-ac", "1", "-ar", "48000",
            "-c:a", "aac", "-b:a", "96k",
            "-movflags", "+faststart",
            dst,
        ]
        subprocess.run(cmd, check=True, timeout=30)
        with open(dst, "rb") as f:
            out = f.read()
        if not out or len(out) < 256:
            raise ValueError("normalize_empty")
        dur = 0.0
        try:
            p = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", dst],
                check=True, timeout=10, capture_output=True, text=True,
            )
            dur = float((p.stdout or "0").strip() or 0)
        except Exception:
            dur = 0.0
        return out, dur


async def team_chat_normalize_voice_handler(request: web.Request) -> web.Response:
    """POST /api/panel/team_chat/normalize_voice — prepare voice media for iOS-safe playback."""
    import base64 as _b64

    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if not _is_staff_info(info):
        return _cabinet_response({"error": "forbidden", "message": "Только для сотрудников."}, status=403)
    b64 = str(body.get("media_b64") or "")
    if "," in b64 and b64[:64].lower().startswith("data:"):
        b64 = b64.split(",", 1)[1]
    if not b64:
        return _cabinet_response({"error": "empty", "message": "Пустое голосовое."}, status=400)
    if len(b64) > 11 * 1024 * 1024:
        return _cabinet_response({"error": "too_large", "message": "Голосовое слишком большое."}, status=413)
    try:
        raw = _b64.b64decode(b64, validate=True)
    except Exception:
        return _cabinet_response({"error": "bad_base64", "message": "Не удалось прочитать голосовое."}, status=400)
    try:
        out, dur = await asyncio.to_thread(_normalize_team_voice_bytes, raw)
    except Exception as e:
        logger.warning("team voice normalize failed: %s", e)
        return _cabinet_response({"error": "normalize_failed", "message": "Не удалось подготовить голосовое."}, status=422)
    return _cabinet_response({
        "ok": True,
        "media_b64": _b64.b64encode(out).decode("ascii"),
        "media_name": "voice.m4a",
        "media_mime": "audio/mp4",
        "media_ext": "m4a",
        "media_size": len(out),
        "media_dur": dur,
    })


async def _push_team_message(app, sender_chat_id: int, sender_name: str, text: str,
                             media_kind: str = "") -> None:
    """Новое сообщение команды → всем сотрудникам, кроме отправителя:
    Telegram (у каждого привязан chat_id — доходит всегда) + Web Push (best-effort)."""
    # Текст уведомления: если есть подпись — её (с эмодзи-префиксом вложения),
    # иначе человекочитаемый ярлык вложения («Голосовое сообщение» и т.п.).
    label = (text or "").strip()
    if not label:
        label = _TEAM_MEDIA_LABEL.get(media_kind, "Вложение")
    elif media_kind:
        label = _TEAM_MEDIA_PREFIX.get(media_kind, "") + label
    recips: dict = {}  # chat_id -> master_dict | None
    try:
        for m in database.list_masters():
            cid = m.get("telegram_chat_id")
            if cid:
                recips[int(cid)] = m
    except Exception as e:
        logger.error(f"team_chat recips masters: {e}")
    try:
        for aid in database.list_admins():
            if int(aid) not in recips:
                recips[int(aid)] = None
    except Exception as e:
        logger.error(f"team_chat recips admins: {e}")
    recips.pop(int(sender_chat_id), None)
    snippet = label if len(label) <= 140 else label[:139] + "…"
    for cid, m in recips.items():
        try:
            await app.bot.send_message(
                chat_id=cid,
                text=(f"💬 *{sender_name}* — команда:\n{label}\n\n"
                      f"_Ответить — в приложении, вкладка «Чат»._"),
                parse_mode="Markdown",
            )
        except Exception as e:
            logger.info(f"team_chat tg → {cid}: {e}")
        try:
            if m is not None:
                await _send_master_push(m, title=f"💬 {sender_name}", body=snippet,
                                        url="/app/?team=1", tag="team-chat",
                                        data={"event": "team_chat"})
            else:
                await _send_client_push(cid, title=f"💬 {sender_name}", body=snippet,
                                        url="/app/?team=1", tag="team-chat",
                                        data={"event": "team_chat"})
        except Exception:
            pass


async def team_chat_send_handler(request: web.Request) -> web.Response:
    """POST /api/panel/team_chat/send — отправить сообщение во внутренний чат команды."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = int(tg_user["id"])
    info = _panel_resolve_role(tg_id)
    if not _is_staff_info(info):
        return _cabinet_response({"error": "forbidden", "message": "Только для сотрудников."}, status=403)
    text = (body.get("text") or "").strip()[:2000]
    # Вложение (фото/видео/голос/файл). Байты сюда НЕ приходят — прокси на Beget
    # уже записал файл и прислал только готовый media_url + метаданные.
    media_kind = (body.get("media_kind") or "").strip()[:16]
    media_url = (body.get("media_url") or "").strip()[:512]
    media_name = (body.get("media_name") or "").strip()[:200]
    media_mime = (body.get("media_mime") or "").strip()[:80]
    try:
        media_size = int(body.get("media_size") or 0)
    except Exception:
        media_size = 0
    try:
        media_dur = float(body.get("media_dur") or 0)
    except Exception:
        media_dur = 0
    # Анти-инъекция: ссылка обязана быть из нашего media-каталога (защита от
    # прямого POST в обход прокси с произвольным внешним URL).
    if media_url and not media_url.startswith(TEAM_MEDIA_URL_PREFIX):
        return _cabinet_response({"error": "bad_media", "message": "Недопустимое вложение."}, status=400)
    has_media = bool(media_kind and media_url)
    if not has_media:
        media_kind = media_url = media_name = media_mime = ""
        media_size = 0
        media_dur = 0
    if not text and not has_media:
        return _cabinet_response({"error": "empty", "message": "Пустое сообщение."}, status=400)
    sender_name = (info.get("master_name") or info.get("name")
                   or tg_user.get("first_name") or "Сотрудник")
    _presence_touch(tg_id, sender_name, sending=True)
    msg_id = await asyncio.to_thread(
        database.add_staff_message, tg_id, sender_name, text,
        media_kind, media_url, media_name, media_mime, media_size, media_dur)
    maya_query = ""
    if text and not has_media:
        try:
            import barber_knowledge
            maya_query = barber_knowledge.extract_team_query(text)
        except Exception as e:
            logger.error(f"team_chat maya extract: {e}")

    async def _maya_bg(query: str):
        try:
            import barber_knowledge
            payload = await asyncio.to_thread(barber_knowledge.answer_payload, query)
            reply = (payload.get("text") or "").strip()
            images = payload.get("images") or []
            if reply:
                await asyncio.to_thread(
                    database.add_staff_message,
                    0,
                    "MAYA · наставник",
                    reply,
                    "", "", "", "", 0, 0,
                )
            for img in images[:2]:
                url = (img.get("url") or "").strip()
                if not url:
                    continue
                await asyncio.to_thread(
                    database.add_staff_message,
                    0,
                    "MAYA · наставник",
                    img.get("title") or "Схема из базы знаний",
                    "image",
                    url,
                    img.get("name") or "",
                    "image/jpeg",
                    0,
                    0,
                )
        except Exception as e:
            logger.error(f"team_chat maya reply: {e}")

    if maya_query:
        _mt = asyncio.create_task(_maya_bg(maya_query))
        _panel_bg_tasks.add(_mt)
        _mt.add_done_callback(_panel_bg_tasks.discard)
    # Пуши шлём в фоне (fire-and-forget). Telegram идёт через единый прокси и может
    # тормозить × N получателей — нельзя держать ответ синхронно: Beget-прокси ждёт
    # max 25с, по таймауту считает медиафайл «осиротевшим» и удаляет его (@unlink),
    # хотя сообщение уже сохранено выше → потом голосовое отдаёт 404. Отвечаем сразу.
    async def _push_bg():
        try:
            await _push_team_message(request.app["bot_app"], tg_id, sender_name, text, media_kind)
        except Exception as e:
            logger.error(f"team_chat push: {e}")
    _pt = asyncio.create_task(_push_bg())
    _panel_bg_tasks.add(_pt)
    _pt.add_done_callback(_panel_bg_tasks.discard)
    return _cabinet_response({"ok": True, "id": msg_id})


async def team_chat_upload_auth_handler(request: web.Request) -> web.Response:
    """POST /api/panel/team_chat/upload_auth — lightweight staff auth before large media upload."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if not _is_staff_info(info):
        return _cabinet_response({"error": "forbidden", "message": "Только для сотрудников."}, status=403)
    return _cabinet_response({"ok": True})


async def team_chat_delete_handler(request: web.Request) -> web.Response:
    """POST /api/panel/team_chat/delete — удалить своё сообщение из чата команды."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = int(tg_user["id"])
    info = _panel_resolve_role(tg_id)
    if not _is_staff_info(info):
        return _cabinet_response({"error": "forbidden", "message": "Только для сотрудников."}, status=403)
    try:
        msg_id = int(body.get("id") or body.get("message_id") or 0)
    except Exception:
        msg_id = 0
    if msg_id <= 0:
        return _cabinet_response({"error": "bad_id", "message": "Не найдено сообщение."}, status=400)

    result = await asyncio.to_thread(database.delete_staff_message, msg_id, tg_id)
    if not result.get("ok"):
        reason = result.get("reason")
        if reason == "forbidden":
            return _cabinet_response({"error": "forbidden", "message": "Можно удалить только своё сообщение."}, status=403)
        return _cabinet_response({"error": "not_found", "message": "Сообщение уже удалено."}, status=404)
    msg = result.get("message") or {}
    return _cabinet_response({
        "ok": True,
        "id": msg_id,
        "media_url": msg.get("media_url") or "",
    })


async def team_chat_fetch_handler(request: web.Request) -> web.Response:
    """POST /api/panel/team_chat/fetch — забрать сообщения. Тело: {since_id?}.
    since_id=0 → последние 50, если не передан session_only=1.
    session_only=1 → начать новую пустую сессию и читать только новые сообщения."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    tg_id = int(tg_user["id"])
    info = _panel_resolve_role(tg_id)
    if not _is_staff_info(info):
        return _cabinet_response({"error": "forbidden"}, status=403)
    try:
        since_id = int(body.get("since_id") or 0)
    except Exception:
        since_id = 0
    session_only = bool(body.get("session_only"))
    sender_name = (info.get("master_name") or info.get("name")
                   or tg_user.get("first_name") or "Сотрудник")
    if since_id <= 0 and session_only:
        latest_id = await asyncio.to_thread(database.get_staff_latest_message_id)
        _presence_touch(tg_id, sender_name, typing=bool(body.get("typing")))
        online, typing = _presence_snapshot(tg_id)
        return _cabinet_response({
            "messages": [],
            "me": tg_id,
            "online": online,
            "typing": typing,
            "latest_id": latest_id,
            "session_only": True,
        })
    if since_id > 0:
        msgs = await asyncio.to_thread(database.get_staff_messages_since, since_id, 100)
    else:
        msgs = await asyncio.to_thread(database.get_staff_messages_recent, 50)
    msgs = _team_chat_mark_media_expiry(msgs)
    # присутствие: сам факт поллинга = «я онлайн»; флаг typing — что сейчас набираю
    _presence_touch(tg_id, sender_name, typing=bool(body.get("typing")))
    online, typing = _presence_snapshot(tg_id)
    return _cabinet_response({"messages": msgs, "me": tg_id, "online": online, "typing": typing})


async def panel_journal_attendance_handler(request: web.Request) -> web.Response:
    """POST /api/panel/journal_attendance — статус визита (только ВЛАДЕЛЕЦ).
    Тело: {record_id, attendance}. attendance: -1 не пришёл, 0 ожидание, 1 пришёл, 2 подтвердил."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    try:
        record_id = int(body.get("record_id") or 0)
    except Exception:
        record_id = 0
    try:
        attendance = int(body.get("attendance"))
    except Exception:
        attendance = None
    if not record_id or attendance not in (-1, 0, 1, 2):
        return _cabinet_response({"error": "missing", "message": "Нужны запись и корректный статус."}, status=400)
    _grec, _gerr = await _panel_record_guard(info, record_id)
    if _gerr:
        return _gerr
    try:
        result = await asyncio.to_thread(_yc.set_record_attendance, record_id, attendance)
    except Exception as e:
        logger.error("journal_attendance: %s", e)
        return _cabinet_response({"error": "yclients", "message": "Не удалось обновить статус."}, status=502)
    if result.get("success"):
        return _cabinet_response({"ok": True, "record_id": result.get("record_id"), "attendance": attendance})
    return _cabinet_response({"error": "attendance_failed", "message": result.get("error") or "YClients отклонил статус."}, status=400)


async def panel_journal_record_handler(request: web.Request) -> web.Response:
    """POST /api/panel/journal_record {record_id} — детали визита для карточки-чека.
    Персонал; телефон клиента — только владельцу (152-ФЗ)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden"}, status=403)
    can_phone = (info.get("role") == "owner")
    is_owner = (info.get("role") == "owner")
    try:
        record_id = int(body.get("record_id") or 0)
    except Exception:
        record_id = 0
    if not record_id:
        return _cabinet_response({"error": "missing", "message": "Нужен ID записи."}, status=400)
    _grec, _gerr = await _panel_record_guard(info, record_id)
    if _gerr:
        return _gerr
    try:
        # Для мастера запись уже загружена стражем (его собственная) — переиспользуем,
        # чтобы не дёргать YClients дважды. Для владельца/управляющего грузим здесь.
        rec = _grec or await asyncio.to_thread(_yc.get_record, record_id)
    except Exception as e:
        logger.error("journal_record %s: %s", record_id, e)
        return _cabinet_response({"error": "yclients", "message": "Не удалось загрузить визит."}, status=502)
    if not rec:
        return _cabinet_response({"error": "not_found", "message": "Запись не найдена."}, status=404)

    from datetime import datetime as _dt, timedelta as _td
    client = rec.get("client") or {}
    staff = rec.get("staff") or {}
    dt = rec.get("datetime") or ""
    start_hm = dt[11:16] if len(dt) >= 16 else ""
    length = rec.get("seance_length") or rec.get("length") or 0
    end_hm = ""
    try:
        if start_hm and length:
            base = _dt.fromisoformat(dt[:19])
            end_hm = (base + _td(seconds=int(length))).strftime("%H:%M")
    except Exception:
        end_hm = ""
    services = []
    total = 0
    for s in (rec.get("services") or []):
        if not isinstance(s, dict):
            continue
        cost = int(s.get("cost") or 0)
        total += cost
        services.append({"id": s.get("id"), "title": s.get("title", ""), "cost": cost})
    att = rec.get("attendance")
    paid = bool(rec.get("paid_full"))   # paid_full — единственный надёжный признак оплаты

    # Статистика клиента: визиты + неявки + история визитов.
    # Доступно всему персоналу (это про услуги/визиты, НЕ телефон) — мастер тоже
    # пользуется журналом. Телефон по-прежнему только владельцу (can_phone).
    visits = noshows = None
    history = []
    cid = client.get("id")
    if cid:
        try:
            cl, ns, hist = await asyncio.gather(
                asyncio.to_thread(_yc.get_client, cid),
                asyncio.to_thread(_yc.get_client_noshow_count, cid),
                asyncio.to_thread(_yc.get_client_history, cid, 12),
            )
            visits = (cl or {}).get("visits")
            if visits is None:
                visits = (cl or {}).get("visits_count")
            noshows = ns
            for h in (hist or []):
                if not isinstance(h, dict):
                    continue
                hdt = h.get("datetime") or ""
                hsvcs = [s.get("title", "") for s in (h.get("services") or []) if isinstance(s, dict)]
                hcost = sum(int(s.get("cost") or 0) for s in (h.get("services") or []) if isinstance(s, dict))
                history.append({
                    "date": hdt[:10],
                    "time": hdt[11:16] if len(hdt) >= 16 else "",
                    "services": hsvcs,
                    "master": (h.get("staff") or {}).get("name", ""),
                    "cost": hcost,
                })
            # свежие сверху
            history.sort(key=lambda x: x.get("date", ""), reverse=True)
        except Exception:
            visits = noshows = None
            history = []

    return _cabinet_response({
        "record_id": record_id,
        "client": (client.get("name") or "").strip() or "Клиент",
        "phone": ((client.get("phone") or "") if can_phone else None),
        "client_phone": ((client.get("phone") or "") if can_phone else None),
        "staff_id": staff.get("id"),
        "master_name": staff.get("name", ""),
        "start": start_hm,
        "end": end_hm,
        "date": dt[:10],
        "duration_minutes": (int(length) // 60) if length else 0,   # для «стянуть/растянуть» в карточке
        "services": services,
        "total": total,
        "paid": paid,
        "attendance": att if isinstance(att, int) else 0,
        "visits": visits,
        "noshows": noshows,
        "history": history,
        "mood": database.get_visit_mood(int(record_id)) if record_id else None,
        "can_edit": info.get("role") in ("owner", "manager", "master"),
        "can_edit_phone": is_owner,
    })


async def panel_journal_pay_handler(request: web.Request) -> web.Response:
    """POST /api/panel/journal_pay — disabled until the provider gate is reopened."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    try:
        record_id = int(body.get("record_id") or 0)
    except Exception:
        record_id = 0
    if not record_id:
        return _cabinet_response({"error": "missing", "message": "Нужен ID записи."}, status=400)
    return _cabinet_response(
        {
            "error": "visit_payment_write_provider_contract_deferred",
            "message": (
                "Проведение оплаты временно доступно только вручную в YClients. "
                "MAYA продолжает показывать текущий статус оплаты визита."
            ),
            "record_id": record_id,
            "manual_handoff": "yclients",
            "retry_allowed": False,
        },
        status=503,
    )


async def panel_journal_add_service_handler(request: web.Request) -> web.Response:
    """POST /api/panel/journal_add_service {record_id, service_ids[]} — добавить
    услугу(и) к визиту (только ВЛАДЕЛЕЦ)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    try:
        record_id = int(body.get("record_id") or 0)
    except Exception:
        record_id = 0
    add_ids = []
    for x in (body.get("service_ids") or []):
        try:
            add_ids.append(int(x))
        except Exception:
            pass
    if not record_id or not add_ids:
        return _cabinet_response({"error": "missing", "message": "Нужны запись и услуга."}, status=400)
    _grec, _gerr = await _panel_record_guard(info, record_id)
    if _gerr:
        return _gerr
    try:
        result = await asyncio.to_thread(_yc.add_services_to_record, record_id, add_ids)
    except Exception as e:
        logger.error("journal_add_service %s: %s", record_id, e)
        return _cabinet_response({"error": "yclients", "message": "Не удалось добавить услугу."}, status=502)
    if result.get("success"):
        return _cabinet_response({"ok": True, "record_id": record_id})
    return _cabinet_response({"error": "add_failed", "message": result.get("error") or "YClients отклонил добавление."}, status=400)


async def panel_journal_set_services_handler(request: web.Request) -> web.Response:
    """POST /api/panel/journal_set_services {record_id, service_ids[]} — задать
    полный список услуг визита (добавить/удалить/заменить). Персонал.
    Длительность визита пересчитывается = сумме длительностей услуг."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    try:
        record_id = int(body.get("record_id") or 0)
    except Exception:
        record_id = 0
    ids = []
    for x in (body.get("service_ids") or []):
        try:
            ids.append(int(x))
        except Exception:
            pass
    if not record_id:
        return _cabinet_response({"error": "missing", "message": "Нужен ID записи."}, status=400)
    if not ids:
        return _cabinet_response({"error": "missing", "message": "В визите должна остаться хотя бы одна услуга."}, status=400)
    _grec, _gerr = await _panel_record_guard(info, record_id)
    if _gerr:
        return _gerr
    try:
        result = await asyncio.to_thread(_yc.set_record_services, record_id, ids)
    except Exception as e:
        logger.error("journal_set_services %s: %s", record_id, e)
        return _cabinet_response({"error": "yclients", "message": "Не удалось изменить услуги."}, status=502)
    if result.get("success"):
        return _cabinet_response({"ok": True, "record_id": record_id})
    return _cabinet_response({"error": "set_failed", "message": result.get("error") or "YClients отклонил изменение."}, status=400)


async def panel_journal_set_duration_handler(request: web.Request) -> web.Response:
    """POST /api/panel/journal_set_duration {record_id, duration_minutes} — изменить
    длительность визита («стянуть»/растянуть запись в журнале). Персонал.
    Время начала, услуги, цены и клиент не меняются."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    try:
        record_id = int(body.get("record_id") or 0)
    except Exception:
        record_id = 0
    try:
        minutes = int(body.get("duration_minutes") or 0)
    except Exception:
        minutes = 0
    if not record_id:
        return _cabinet_response({"error": "missing", "message": "Нужен ID записи."}, status=400)
    if not (5 <= minutes <= 720):
        return _cabinet_response({"error": "bad_duration", "message": "Длительность — от 5 минут до 12 часов."}, status=400)
    _grec, _gerr = await _panel_record_guard(info, record_id)
    if _gerr:
        return _gerr
    try:
        result = await asyncio.to_thread(_yc.set_record_duration, record_id, minutes * 60)
    except Exception as e:
        logger.error("journal_set_duration %s: %s", record_id, e)
        return _cabinet_response({"error": "yclients", "message": "Не удалось изменить длительность."}, status=502)
    if result.get("success"):
        return _cabinet_response({"ok": True, "record_id": record_id, "duration_minutes": minutes})
    return _cabinet_response({"error": "set_failed", "message": result.get("error") or "YClients отклонил изменение."}, status=400)


async def panel_journal_set_client_name_handler(request: web.Request) -> web.Response:
    """POST /api/panel/journal_set_client_name {record_id, client_name?, client_phone?} —
    обновить имя и/или телефон клиента в карточке записи. Персонал."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    tg_user = _panel_auth(body, request.headers.get("X-Telegram-InitData", ""))
    if not tg_user or not tg_user.get("id"):
        return _cabinet_response({"error": "unauthorized"}, status=401)
    info = _panel_resolve_role(int(tg_user["id"]))
    if info.get("role") not in ("owner", "manager", "master"):
        return _cabinet_response({"error": "forbidden", "message": "Доступно только персоналу."}, status=403)
    try:
        record_id = int(body.get("record_id") or 0)
    except Exception:
        record_id = 0
    name = str(body.get("client_name") or body.get("name") or "").strip()
    phone = str(body.get("client_phone") or body.get("phone") or "").strip()
    if not record_id:
        return _cabinet_response({"error": "missing", "message": "Нужен ID записи."}, status=400)
    if not name and not phone:
        return _cabinet_response({"error": "missing", "message": "Введите имя или телефон клиента."}, status=400)
    if phone and info.get("role") != "owner":
        return _cabinet_response({"error": "forbidden", "message": "Телефон клиента может менять только владелец."}, status=403)
    _grec, _gerr = await _panel_record_guard(info, record_id)
    if _gerr:
        return _gerr
    try:
        result = await asyncio.to_thread(_yc.set_record_client_name, record_id, name or None, phone or None)
    except Exception as e:
        logger.error("journal_set_client_name %s: %s", record_id, e)
        return _cabinet_response({"error": "yclients", "message": "Не удалось сохранить данные клиента."}, status=502)
    if result.get("success"):
        return _cabinet_response({
            "ok": True,
            "record_id": record_id,
            "client": result.get("client") or name,
            "phone": result.get("phone") or phone,
        })
    return _cabinet_response({"error": "set_failed", "message": result.get("error") or "YClients отклонил изменение."}, status=400)


async def start_webhook_server(bot_app: Application):
    """
    Запускает aiohttp-сервер на WEBHOOK_PORT в том же event loop, что и бот.
    Вызывается из post_init() бота.
    """
    runner = globals().get("_WEBHOOK_RUNNER")
    if runner is not None:
        return
    # client_max_size: дефолт aiohttp = 1 МБ. Голосовое из приложения едет в JSON-теле
    # как base64-data-url; в нативном iOS-WKWebView (нет MediaRecorder) запись идёт
    # несжатым WAV (PCM) — крупнее webm/opus. Поднимаем лимит до 10 МБ, иначе запись
    # голоса с iPhone отбивается 413 ещё до распознавания.
    web_app = web.Application(client_max_size=10 * 1024 * 1024)
    web_app["bot_app"] = bot_app

    web_app.router.add_post("/yclients-webhook", handle_yclients_webhook)
    web_app.router.add_get("/yclients-webhook", health_handler)

    # API для Mini App / PWA — личный кабинет
    web_app.router.add_get("/api/cabinet/me", cabinet_me_handler)
    web_app.router.add_options("/api/cabinet/me", cabinet_options_handler)
    web_app.router.add_post(
        "/api/internal/loyalty-snapshot", internal_loyalty_snapshot_handler
    )
    web_app.router.add_post(
        "/api/internal/action-engine/privacy-telegram",
        internal_privacy_telegram_handler,
    )
    web_app.router.add_post(
        "/api/internal/action-engine/package2-telegram",
        internal_package2_telegram_handler,
    )

    # API для PWA через Telegram Login Widget (когда PWA открыта в браузере)
    web_app.router.add_post("/api/cabinet/me-via-login", cabinet_me_via_login_handler)
    web_app.router.add_options("/api/cabinet/me-via-login", cabinet_options_handler)

    # Веб-вход БЕЗ Telegram (без VPN): Yandex ID / VK ID + телефон по коду
    web_app.router.add_post("/api/auth/phone/start", auth_phone_start_handler)
    web_app.router.add_options("/api/auth/phone/start", cabinet_options_handler)
    web_app.router.add_post("/api/auth/phone/verify", auth_phone_verify_handler)
    web_app.router.add_options("/api/auth/phone/verify", cabinet_options_handler)
    web_app.router.add_post("/api/auth/vk", auth_vk_handler)
    web_app.router.add_options("/api/auth/vk", cabinet_options_handler)
    web_app.router.add_post("/api/auth/vk-sdk", auth_vk_sdk_handler)
    web_app.router.add_options("/api/auth/vk-sdk", cabinet_options_handler)
    web_app.router.add_post("/api/auth/yandex/start", auth_yandex_start_handler)
    web_app.router.add_options("/api/auth/yandex/start", cabinet_options_handler)
    web_app.router.add_post("/api/auth/yandex", auth_yandex_handler)
    web_app.router.add_options("/api/auth/yandex", cabinet_options_handler)
    web_app.router.add_post("/api/cabinet/me-via-session", cabinet_me_via_session_handler)
    web_app.router.add_options("/api/cabinet/me-via-session", cabinet_options_handler)
    web_app.router.add_post("/api/cabinet/link-phone", cabinet_link_phone_handler)
    web_app.router.add_options("/api/cabinet/link-phone", cabinet_options_handler)
    web_app.router.add_post("/api/booking/prefill", booking_prefill_handler)
    web_app.router.add_options("/api/booking/prefill", cabinet_options_handler)
    web_app.router.add_post("/api/client/cancel-record", client_cancel_record_handler)
    web_app.router.add_options("/api/client/cancel-record", cabinet_options_handler)
    web_app.router.add_post("/api/client/reschedule-record", client_reschedule_record_handler)
    web_app.router.add_options("/api/client/reschedule-record", cabinet_options_handler)
    web_app.router.add_post("/api/client/book-with-loyalty", client_book_with_loyalty_handler)
    web_app.router.add_options("/api/client/book-with-loyalty", cabinet_options_handler)
    web_app.router.add_post("/api/panel/team_chat/normalize_voice", team_chat_normalize_voice_handler)
    web_app.router.add_options("/api/panel/team_chat/normalize_voice", cabinet_options_handler)
    web_app.router.add_get("/api/auth/status", auth_status_handler)
    web_app.router.add_options("/api/auth/status", cabinet_options_handler)
    # /api/usage/fal (логирование расхода CutMatch/fal.ai) СНЯТ 2026-06-21 —
    # CutMatch удалён владельцем; расход больше не пишется и не показывается.
    web_app.router.add_post("/api/set-visit-mood", set_visit_mood_handler)
    web_app.router.add_get("/api/nearest-slot", nearest_slot_handler)
    # CutMatch УДАЛЁН 2026-06-18 (152-ФЗ): анализ/примерка лица сносили биометрию
    # клиента (фото анфас+профиль) в OpenAI/Claude/fal.ai (США). Маршруты сняты —
    # фото физически некуда отправить, даже если где-то остался старый UI.
    web_app.router.add_post("/api/me/photo", me_photo_handler)
    web_app.router.add_options("/api/me/photo", cabinet_options_handler)

    # API чата с ассистентом в приложении (тот же мозг и история, что у бота)
    web_app.router.add_get("/api/knowledge/image/{name}", knowledge_image_handler)
    web_app.router.add_post("/api/chat/history", chat_history_handler)
    web_app.router.add_options("/api/chat/history", chat_options_handler)
    web_app.router.add_post("/api/chat/delete", chat_delete_handler)
    web_app.router.add_options("/api/chat/delete", chat_options_handler)
    web_app.router.add_post("/api/chat", chat_handler)
    web_app.router.add_options("/api/chat", chat_options_handler)
    web_app.router.add_post("/api/chat/stream", chat_stream_handler)
    web_app.router.add_options("/api/chat/stream", chat_options_handler)
    web_app.router.add_get("/api/realtime", realtime_handler)   # голос «как ChatGPT» (WS)

    # API push-уведомлений для мастеров
    web_app.router.add_post("/api/push/subscribe", push_subscribe_handler)
    web_app.router.add_options("/api/push/subscribe", chat_options_handler)

    # API события чаевых с внутреннего экрана приложения
    web_app.router.add_post("/api/tips/sent", tip_sent_handler)
    web_app.router.add_options("/api/tips/sent", chat_options_handler)

    # API согласий 152-ФЗ для приложения (та же БД и логика, что у бота)
    web_app.router.add_post("/api/client-link/consume", client_link_consume_handler)
    web_app.router.add_post("/api/consent/status", consent_status_handler)
    web_app.router.add_options("/api/consent/status", chat_options_handler)
    web_app.router.add_post("/api/consent/submit", consent_submit_handler)
    web_app.router.add_options("/api/consent/submit", chat_options_handler)

    # Нативный вход через Telegram (deep-link) для standalone-приложения
    web_app.router.add_post("/api/applogin/start", applogin_start_handler)
    web_app.router.add_options("/api/applogin/start", chat_options_handler)
    web_app.router.add_post("/api/applogin/poll", applogin_poll_handler)
    web_app.router.add_options("/api/applogin/poll", chat_options_handler)

    # Персональные настройки уведомлений клиента
    web_app.router.add_post("/api/cabinet/notify-prefs", notify_prefs_handler)
    web_app.router.add_options("/api/cabinet/notify-prefs", chat_options_handler)

    # API покупки подарочного сертификата картой прямо в приложении (ЮKassa)
    web_app.router.add_post("/api/cert/create", cert_create_handler)
    web_app.router.add_options("/api/cert/create", chat_options_handler)

    # API покупки абонемента картой прямо в приложении (ЮKassa)
    web_app.router.add_post("/api/sub/create", sub_create_handler)
    web_app.router.add_options("/api/sub/create", chat_options_handler)

    # API панели управления (роли owner/manager/master)
    web_app.router.add_post("/api/panel/me", panel_me_handler)
    web_app.router.add_options("/api/panel/me", panel_options_handler)
    web_app.router.add_post("/api/panel/dashboard", panel_dashboard_handler)
    web_app.router.add_options("/api/panel/dashboard", panel_options_handler)
    web_app.router.add_post("/api/panel/command_center", panel_command_center_handler)
    web_app.router.add_options("/api/panel/command_center", panel_options_handler)
    web_app.router.add_post("/api/panel/plan_target", panel_plan_target_handler)
    web_app.router.add_options("/api/panel/plan_target", panel_options_handler)
    web_app.router.add_post("/api/panel/action/evaluate", panel_action_evaluate_handler)
    web_app.router.add_options("/api/panel/action/evaluate", panel_options_handler)
    web_app.router.add_post("/api/panel/control/create", panel_control_create_handler)
    web_app.router.add_options("/api/panel/control/create", panel_options_handler)
    web_app.router.add_post("/api/panel/autonomy/tick", panel_autonomy_tick_handler)
    web_app.router.add_options("/api/panel/autonomy/tick", panel_options_handler)
    web_app.router.add_post("/api/panel/autopilot/supervise", panel_autopilot_supervision_handler)
    web_app.router.add_options("/api/panel/autopilot/supervise", panel_options_handler)
    web_app.router.add_post("/api/panel/execution/loop", panel_execution_loop_handler)
    web_app.router.add_options("/api/panel/execution/loop", panel_options_handler)
    web_app.router.add_post("/api/panel/control/update", panel_control_update_handler)
    web_app.router.add_options("/api/panel/control/update", panel_options_handler)
    web_app.router.add_post("/api/panel/staff_tasks", panel_staff_tasks_handler)
    web_app.router.add_options("/api/panel/staff_tasks", panel_options_handler)
    web_app.router.add_post("/api/panel/staff_task/update", panel_staff_task_update_handler)
    web_app.router.add_options("/api/panel/staff_task/update", panel_options_handler)
    web_app.router.add_post("/api/panel/master/overview", panel_master_overview_handler)
    web_app.router.add_options("/api/panel/master/overview", panel_options_handler)
    web_app.router.add_post("/api/panel/master/day", panel_master_day_handler)

    web_app.router.add_post("/api/panel/master/clients", panel_master_clients_handler)
    web_app.router.add_options("/api/panel/master/day", panel_options_handler)
    web_app.router.add_post("/api/panel/redeem", panel_redeem_handler)
    web_app.router.add_options("/api/panel/redeem", panel_options_handler)
    web_app.router.add_post("/api/panel/job/run", panel_job_run_handler)
    web_app.router.add_options("/api/panel/job/run", panel_options_handler)
    web_app.router.add_post("/api/panel/reviews", panel_reviews_handler)
    web_app.router.add_options("/api/panel/reviews", panel_options_handler)
    web_app.router.add_post("/api/panel/external_reviews/import", panel_external_reviews_import_handler)
    web_app.router.add_options("/api/panel/external_reviews/import", panel_options_handler)
    web_app.router.add_post("/api/panel/reputation/refresh", panel_reputation_refresh_handler)
    web_app.router.add_options("/api/panel/reputation/refresh", panel_options_handler)
    web_app.router.add_post("/api/panel/master_day_brief", panel_master_day_brief_handler)
    web_app.router.add_options("/api/panel/master_day_brief", panel_options_handler)
    web_app.router.add_post("/api/panel/broadcast", panel_broadcast_handler)
    web_app.router.add_options("/api/panel/broadcast", panel_options_handler)
    web_app.router.add_post("/api/panel/team", panel_team_handler)
    web_app.router.add_options("/api/panel/team", panel_options_handler)
    web_app.router.add_post("/api/panel/managers", panel_managers_handler)
    web_app.router.add_options("/api/panel/managers", panel_options_handler)
    web_app.router.add_post("/api/panel/masters_stats", panel_masters_stats_handler)
    web_app.router.add_options("/api/panel/masters_stats", panel_options_handler)
    web_app.router.add_post("/api/panel/salary", panel_salary_handler)
    web_app.router.add_options("/api/panel/salary", panel_options_handler)
    web_app.router.add_post("/api/panel/my_earnings", panel_my_earnings_handler)
    web_app.router.add_options("/api/panel/my_earnings", panel_options_handler)
    # GOD-режим (founder-кабинет MAYA, только основатель)
    web_app.router.add_post("/api/god/overview", god_overview_handler)
    web_app.router.add_options("/api/god/overview", panel_options_handler)
    web_app.router.add_post("/api/god/health", god_health_handler)
    web_app.router.add_options("/api/god/health", panel_options_handler)
    web_app.router.add_post("/api/god/billing", god_billing_handler)
    web_app.router.add_options("/api/god/billing", panel_options_handler)
    web_app.router.add_post("/api/god/subscribers", god_subscribers_handler)
    web_app.router.add_options("/api/god/subscribers", panel_options_handler)
    web_app.router.add_post("/api/panel/daily_report", panel_daily_report_handler)
    web_app.router.add_options("/api/panel/daily_report", panel_options_handler)
    web_app.router.add_post("/api/panel/report_pdf", panel_report_pdf_handler)
    web_app.router.add_options("/api/panel/report_pdf", panel_options_handler)
    web_app.router.add_post("/api/panel/salon_stats", panel_salon_stats_handler)
    web_app.router.add_options("/api/panel/salon_stats", panel_options_handler)
    web_app.router.add_post("/api/panel/salon_today", panel_salon_today_handler)
    web_app.router.add_options("/api/panel/salon_today", panel_options_handler)
    web_app.router.add_post("/api/panel/journal", panel_journal_handler)
    web_app.router.add_options("/api/panel/journal", panel_options_handler)
    web_app.router.add_post("/api/panel/journal_create", panel_journal_create_handler)
    web_app.router.add_post("/api/panel/client_search", panel_client_search_handler)
    web_app.router.add_options("/api/panel/client_search", panel_options_handler)
    web_app.router.add_post("/api/panel/waitlist", panel_waitlist_handler)
    web_app.router.add_options("/api/panel/waitlist", panel_options_handler)
    web_app.router.add_post("/api/promo_gift", promo_gift_handler)
    web_app.router.add_options("/api/promo_gift", panel_options_handler)
    web_app.router.add_options("/api/panel/journal_create", panel_options_handler)
    web_app.router.add_post("/api/panel/journal_reschedule", panel_journal_reschedule_handler)
    web_app.router.add_options("/api/panel/journal_reschedule", panel_options_handler)
    web_app.router.add_post("/api/panel/journal_cancel", panel_journal_cancel_handler)
    web_app.router.add_options("/api/panel/journal_cancel", panel_options_handler)
    web_app.router.add_post("/api/panel/team_chat/send", team_chat_send_handler)
    web_app.router.add_options("/api/panel/team_chat/send", panel_options_handler)
    web_app.router.add_post("/api/panel/team_chat/upload_auth", team_chat_upload_auth_handler)
    web_app.router.add_options("/api/panel/team_chat/upload_auth", panel_options_handler)
    web_app.router.add_post("/api/panel/team_chat/delete", team_chat_delete_handler)
    web_app.router.add_options("/api/panel/team_chat/delete", panel_options_handler)
    web_app.router.add_post("/api/panel/team_chat/fetch", team_chat_fetch_handler)
    web_app.router.add_options("/api/panel/team_chat/fetch", panel_options_handler)
    web_app.router.add_post("/api/panel/journal_attendance", panel_journal_attendance_handler)
    web_app.router.add_options("/api/panel/journal_attendance", panel_options_handler)
    web_app.router.add_post("/api/panel/journal_record", panel_journal_record_handler)
    web_app.router.add_options("/api/panel/journal_record", panel_options_handler)
    web_app.router.add_post("/api/panel/journal_pay", panel_journal_pay_handler)
    web_app.router.add_options("/api/panel/journal_pay", panel_options_handler)
    web_app.router.add_post("/api/panel/journal_add_service", panel_journal_add_service_handler)
    web_app.router.add_options("/api/panel/journal_add_service", panel_options_handler)
    web_app.router.add_post("/api/panel/journal_set_services", panel_journal_set_services_handler)
    web_app.router.add_options("/api/panel/journal_set_services", panel_options_handler)
    web_app.router.add_post("/api/panel/journal_set_duration", panel_journal_set_duration_handler)
    web_app.router.add_options("/api/panel/journal_set_duration", panel_options_handler)
    web_app.router.add_post("/api/panel/journal_set_client_name", panel_journal_set_client_name_handler)
    web_app.router.add_options("/api/panel/journal_set_client_name", panel_options_handler)
    web_app.router.add_post("/api/panel/journal_set_client_data", panel_journal_set_client_name_handler)
    web_app.router.add_options("/api/panel/journal_set_client_data", panel_options_handler)

    runner = web.AppRunner(web_app)
    await runner.setup()
    # Адрес привязки. По умолчанию 0.0.0.0 (как было) — чтобы не сломать текущий
    # прод, где порт принимает запросы от PHP-прокси Beget и вебхуков YClients
    # напрямую. ⚠️ Безопасность: порт 8080 — обычный HTTP. Как только перед ботом
    # появится HTTPS-реверс-прокси (nginx) на самом VPS, поставь WEBHOOK_BIND="127.0.0.1"
    # в config/.env и закрой 8080 фаерволом — тогда наружу торчит только TLS.
    bind_host = getattr(config, "WEBHOOK_BIND", None) or "0.0.0.0"
    site = web.TCPSite(runner, bind_host, WEBHOOK_PORT)
    await site.start()
    globals()["_WEBHOOK_RUNNER"] = runner
    globals()["_WEBHOOK_SITE"] = site
    asyncio.create_task(master_day_brief_loop(bot_app))
    asyncio.create_task(client_retention_refresh_loop(bot_app))
    asyncio.create_task(reputation_monitor_loop(bot_app))
    asyncio.create_task(master_shift_reminder_loop(bot_app))
    asyncio.create_task(waitlist_admin_alert_loop(bot_app))
    asyncio.create_task(maya_operating_rhythm_loop(bot_app))
    logger.info(f"📡 Webhook-сервер слушает {bind_host}:{WEBHOOK_PORT}")
