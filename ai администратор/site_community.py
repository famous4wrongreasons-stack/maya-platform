"""Guest website discussion adapter using the existing MAYA brain.

Only the trusted website gateway supplies visitor/network identities. No polling,
booking tools, customer data, or financial background jobs are started here.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import re
import time
from datetime import datetime

from aiohttp import web

import anonymizer
import site_engagement as events
import site_publications as publications

logger = logging.getLogger(__name__)
PUBLIC_ACTIONS = {"status", "view", "like", "comment", "guest-chat", "moderation", "resolve"}
ID = re.compile(r"^[a-f0-9]{64}$")
REQUEST_ID = re.compile(r"^[a-zA-Z0-9-]{16,64}$")
SERIOUS = re.compile(r"жалоб|порез|ожог|травм|зараз|кров|компенсац|возврат|испортил|испортили", re.I)
GENERIC = re.compile(r"^(?:спасибо|круто|класс|супер|отлично|огонь|красиво)[!.\s]*$", re.I)


class TelegramTokenFilter(logging.Filter):
    def filter(self, record):
        message = record.getMessage()
        redacted = re.sub(r"/bot\d+:[A-Za-z0-9_-]+", "/bot[REDACTED]", message)
        if redacted != message:
            record.msg, record.args = redacted, ()
        return True


class CommunityError(Exception):
    def __init__(self, code, message, status=400):
        self.code, self.message, self.status = code, message, status


def digest(secret, text):
    return hmac.new(secret.encode(), text.encode(), hashlib.sha256).hexdigest()


def verify_gateway(raw, headers, secret, now=None):
    stamp = headers.get("X-Site-Time", "")
    if not stamp.isdigit() or abs((now or time.time()) - int(stamp)) > 90:
        raise CommunityError("forbidden", "Запрос не подтверждён.", 403)
    expected = digest(secret, "site-gateway-v1:" + stamp + ":" + raw)
    if not hmac.compare_digest(expected, headers.get("X-Site-Signature", "")):
        raise CommunityError("forbidden", "Запрос не подтверждён.", 403)
    body = json.loads(raw)
    if not isinstance(body, dict) or not ID.fullmatch(str(body.get("visitor", ""))) or not ID.fullmatch(str(body.get("network", ""))):
        raise CommunityError("invalid_request", "Обновите страницу.")
    return body


def init_schema():
    events.init_schema()
    publications.init_schema()
    with events._connect() as db:
        existing = {row["name"] for row in db.execute("PRAGMA table_info(site_event_comments)")}
        for column, declaration in {
            "visitor_hash": "TEXT", "request_key": "TEXT", "needs_owner": "INTEGER NOT NULL DEFAULT 0",
            "owner_notified": "INTEGER NOT NULL DEFAULT 0",
        }.items():
            if column not in existing:
                db.execute(f"ALTER TABLE site_event_comments ADD COLUMN {column} {declaration}")
        db.executescript("""
            CREATE UNIQUE INDEX IF NOT EXISTS site_comment_request
                ON site_event_comments(visitor_hash, request_key) WHERE request_key IS NOT NULL;
            CREATE TABLE IF NOT EXISTS site_guest_likes (
                slug TEXT NOT NULL, visitor_hash TEXT NOT NULL, created_at TEXT NOT NULL,
                PRIMARY KEY(slug, visitor_hash));
            CREATE TABLE IF NOT EXISTS site_community_limits (
                bucket TEXT NOT NULL, created REAL NOT NULL);
            CREATE INDEX IF NOT EXISTS site_community_limits_bucket
                ON site_community_limits(bucket, created);
        """)
        db.execute("UPDATE site_event_comments SET moderation_reason='interrupted', needs_owner=1 "
                   "WHERE status='pending' AND moderation_reason='processing'")


def spend_limits(limits, now=None):
    """Atomic, durable limits survive restarts and cover cleared browser cookies."""
    now = now or time.time()
    with events._connect() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM site_community_limits WHERE created < ?", (now - 86400,))
        for bucket, seconds, maximum in limits:
            count = db.execute("SELECT COUNT(*) FROM site_community_limits WHERE bucket=? AND created>?",
                               (bucket, now - seconds)).fetchone()[0]
            if count >= maximum:
                raise CommunityError("rate_limited", "Слишком много запросов. Попробуйте позже.", 429)
        db.executemany("INSERT INTO site_community_limits VALUES (?,?)", [(item[0], now) for item in limits])


def public_status(slug, visitor, user_id=None):
    payload = events.event_status(slug, user_id)
    with events._connect() as db:
        payload["stats"]["likes"] += db.execute("SELECT COUNT(*) FROM site_guest_likes WHERE slug=?", (slug,)).fetchone()[0]
        if not user_id:
            payload["stats"]["liked"] = bool(db.execute("SELECT 1 FROM site_guest_likes WHERE slug=? AND visitor_hash=?", (slug, visitor)).fetchone())
        guests = {row[0] for row in db.execute("SELECT id FROM site_event_comments WHERE slug=? AND visitor_hash IS NOT NULL AND user_id IS NULL", (slug,))}
    for comment in payload["comments"]:
        comment["is_guest"] = comment["id"] in guests and not comment["is_brand_reply"]
    return payload


def set_like(slug, visitor, user_id, liked):
    with events._connect() as db:
        db.execute("BEGIN IMMEDIATE")
        table, column, identity = ("site_event_likes", "user_id", user_id) if user_id else ("site_guest_likes", "visitor_hash", visitor)
        if user_id:
            db.execute("DELETE FROM site_guest_likes WHERE slug=? AND visitor_hash=?", (slug, visitor))
        if liked:
            db.execute(f"INSERT OR IGNORE INTO {table}(slug,{column},created_at) VALUES (?,?,?)",
                       (slug, identity, datetime.now().isoformat(timespec="seconds")))
        else:
            db.execute(f"DELETE FROM {table} WHERE slug=? AND {column}=?", (slug, identity))


def check_author(value):
    author = events.normalize_author(value)
    # Guest names are public, unverified labels; never let them impersonate staff.
    normalized = re.sub(r"[^а-яa-z]", "", author.lower().replace("ё", "е"))
    if (anonymizer.redact_pii(author) != author or events._PROFANITY.search(author)
            or any(word in normalized for word in ("эстетик", "malesthetic", "админ", "admin", "moderator", "модератор", "майя", "maya"))):
        raise CommunityError("invalid_name", "Укажите другое имя или псевдоним.")
    return author


def reserve_comment(slug, visitor, user_id, request_key, author, text):
    with events._connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT id, slug, text, status FROM site_event_comments WHERE visitor_hash=? AND request_key=?", (visitor, request_key)).fetchone()
        if row:
            if row["slug"] != slug or row["text"] != text:
                raise CommunityError("request_conflict", "Обновите страницу и повторите отправку.", 409)
            return row["id"], False
        if db.execute("SELECT 1 FROM site_event_comments WHERE visitor_hash=? AND slug=? AND text=? AND status IN ('pending','approved')", (visitor, slug, text)).fetchone():
            raise CommunityError("duplicate", "Такой комментарий уже отправлен.", 409)
        cur = db.execute("""INSERT INTO site_event_comments
            (slug,user_id,author,text,status,moderation_reason,created_at,visitor_hash,request_key)
            VALUES (?,?,?,?,'pending','processing',?,?,?)""",
            (slug, user_id, author, text, datetime.now().isoformat(timespec="seconds"), visitor, request_key))
        return cur.lastrowid, True


def comment_result(comment_id):
    with events._connect() as db:
        row = db.execute("SELECT status, moderation_reason FROM site_event_comments WHERE id=?", (comment_id,)).fetchone()
        return dict(row)


def mark_review(comment_id, reason="moderation_unavailable"):
    with events._connect() as db:
        db.execute("UPDATE site_event_comments SET status='pending', moderation_reason=?, needs_owner=1 WHERE id=? AND status='pending'", (reason, comment_id))


def review_queue():
    with events._connect() as db:
        return [dict(row) for row in db.execute("""SELECT id,slug,author,text,status,moderation_reason,created_at
            FROM site_event_comments WHERE needs_owner=1 ORDER BY id DESC LIMIT 100""")]


def resolve_comment(comment_id, decision):
    if decision not in {"approve", "reject", "acknowledge"}:
        raise CommunityError("invalid_decision", "Выберите решение.")
    with events._connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT status,needs_owner FROM site_event_comments WHERE id=?", (comment_id,)).fetchone()
        if not row or not row["needs_owner"]:
            raise CommunityError("not_found", "Сообщение уже обработано.", 404)
        status = row["status"] if decision == "acknowledge" else "approved" if decision == "approve" else "rejected"
        if status == "pending" and decision == "acknowledge":
            raise CommunityError("decision_required", "Сначала разрешите или отклоните публикацию.")
        db.execute("UPDATE site_event_comments SET status=?, needs_owner=0, moderation_reason='owner_reviewed' WHERE id=?", (status, comment_id))


async def notify_owner(app, comment_id):
    """Use the existing bot only for outgoing owner alerts, never consume updates."""
    import database
    from config import INITIAL_ADMIN_IDS, TELEGRAM_TOKEN
    from bot import _telegram_httpx_request
    from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup
    with events._connect() as db:
        row = db.execute("SELECT owner_notified FROM site_event_comments WHERE id=?", (comment_id,)).fetchone()
    if not row or row[0]:
        return
    try:
        spend_limits([("owner-alert-minute", 60, 1), ("owner-alert-day", 86400, 12)])
    except CommunityError:
        return  # All messages remain in the inbox; avoid flooding the owner.
    try:
        async with Bot(TELEGRAM_TOKEN, request=_telegram_httpx_request()) as bot:
            delivered = False
            for owner in INITIAL_ADMIN_IDS:
                if database.is_admin(owner):
                    await bot.send_message(
                        chat_id=owner,
                        text=f"Лента Мужской Эстетики: комментарий №{comment_id} требует вашего внимания. "
                             "Спорные сообщения скрыты до проверки; здоровая критика остаётся видимой.",
                        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("Проверить комментарии", url="https://malesthetic.pro/events/moderation/")]]),
                    )
                    delivered = True
            if delivered:
                with events._connect() as db:
                    db.execute("UPDATE site_event_comments SET owner_notified=1 WHERE id=?", (comment_id,))
    except Exception as exc:
        logger.warning("Site moderation notification: %s", type(exc).__name__)


async def process_comment(app, comment_id, slug, text):
    try:
        decision, reason = await asyncio.to_thread(events.moderate_comment, text)
        status = {"approve": "approved", "reject": "rejected"}.get(decision, "pending")
        serious = status == "approved" and bool(SERIOUS.search(text))
        with events._connect() as db:
            # A human decision always wins over a slow model response.
            changed = db.execute("UPDATE site_event_comments SET status=?, moderation_reason=?, needs_owner=? "
                                 "WHERE id=? AND status='pending' AND moderation_reason='processing'",
                                 (status, reason, int(status == "pending" or serious), comment_id)).rowcount
        if not changed:
            return
        if status == "pending" or serious:
            await notify_owner(app, comment_id)
        if status == "approved" and not GENERIC.fullmatch(text):
            reply = await asyncio.to_thread(events.generate_brand_reply, slug, text)
            if reply:
                await asyncio.to_thread(events.add_brand_reply, slug, comment_id, reply)
    except Exception as exc:
        await asyncio.to_thread(mark_review, comment_id)
        logger.warning("Site moderation: %s", type(exc).__name__)
        await notify_owner(app, comment_id)


def form_token(secret, visitor, now=None):
    stamp = str(int(now or time.time()))
    return stamp + "." + digest(secret, "site-form:" + visitor + ":" + stamp)


def check_form(secret, visitor, value, now=None):
    parts = str(value or "").split(".")
    if len(parts) != 2 or not parts[0].isdigit():
        raise CommunityError("form_expired", "Обновите обсуждение и отправьте ещё раз.", 403)
    expected = digest(secret, "site-form:" + visitor + ":" + parts[0])
    age = (now or time.time()) - int(parts[0])
    if not hmac.compare_digest(expected, parts[1]) or age < 2 or age > 7200:
        raise CommunityError("form_expired", "Обновите обсуждение и отправьте ещё раз.", 403)


def register_routes(app, authenticate):
    from config import TELEGRAM_TOKEN
    from site_guest_chat import GuestError, guest_chat
    import database

    http_logger = logging.getLogger("httpx")
    if not any(isinstance(item, TelegramTokenFilter) for item in http_logger.filters):
        http_logger.addFilter(TelegramTokenFilter())

    secret = TELEGRAM_TOKEN
    running = set()

    async def handler(request):
        try:
            raw = await request.text()
            if len(raw) > 12000:
                raise CommunityError("too_large", "Сообщение слишком длинное.", 413)
            body = verify_gateway(raw, request.headers, secret)
            action = request.match_info["action"]
            if action not in PUBLIC_ACTIONS:
                raise CommunityError("not_found", "Не найдено.", 404)
            visitor, network = body["visitor"], body["network"]
            user_id = authenticate(request, body)
            if action in {"moderation", "resolve"}:
                if not user_id or not await asyncio.to_thread(database.is_admin, user_id):
                    raise CommunityError("unauthorized", "Войдите с аккаунтом администратора.", 401)
                if action == "resolve":
                    await asyncio.to_thread(resolve_comment, int(body.get("comment_id", 0)), body.get("decision"))
                return response({"ok": True, "queue": await asyncio.to_thread(review_queue)})
            if action == "guest-chat":
                await asyncio.to_thread(spend_limits, [("chat-ip:" + network, 60, 12), ("chat-day:" + network, 86400, 80), ("chat-global", 86400, 400)])
                return response(await guest_chat.send(body))
            slug = events.normalize_slug(body.get("slug"))
            if not slug:
                raise CommunityError("event_not_found", "Публикация не найдена.", 404)
            result = {}
            if action == "view":
                await asyncio.to_thread(spend_limits, [("view:" + network, 60, 90)])
                await asyncio.to_thread(events.record_view, slug, network)
            elif action == "like":
                if not isinstance(body.get("liked"), bool):
                    raise CommunityError("invalid_like", "Обновите страницу.")
                await asyncio.to_thread(spend_limits, [("like:" + network, 60, 30)])
                await asyncio.to_thread(set_like, slug, visitor, user_id, body["liked"])
            elif action == "comment":
                if body.get("consent") is not True:
                    raise CommunityError("consent_required", "Подтвердите согласие перед публикацией.", 403)
                check_form(secret, visitor, body.get("form_token"))
                if body.get("website"):
                    raise CommunityError("spam", "Не удалось отправить комментарий.", 422)
                text = events.normalize_comment(body.get("text"))
                author = check_author(body.get("display_name"))
                request_key = str(body.get("request_key", ""))
                if not REQUEST_ID.fullmatch(request_key):
                    raise CommunityError("invalid_request", "Обновите страницу.")
                await asyncio.to_thread(spend_limits, [("comment-ip:" + network, 60, 3), ("comment-day:" + network, 86400, 20), ("comment-guest:" + visitor, 60, 2)])
                decision, reason = events.deterministic_moderation(text)
                if decision == "reject":
                    message = "Не публикуйте личные данные." if reason == "personal_data" else "Уберите мат, оскорбления или спам."
                    raise CommunityError("moderation_rejected", message, 422)
                comment_id, created = await asyncio.to_thread(reserve_comment, slug, visitor, user_id, request_key, author, text)
                if created:
                    try:
                        await asyncio.to_thread(spend_limits, [("moderation-global", 86400, 120)])
                        if len(running) >= 2:
                            raise CommunityError("capacity", "Проверка отложена.", 429)
                        task = asyncio.create_task(process_comment(app, comment_id, slug, text))
                        running.add(task)
                        task.add_done_callback(running.discard)
                        try:
                            await asyncio.wait_for(asyncio.shield(task), timeout=35)
                        except asyncio.TimeoutError:
                            pass
                    except CommunityError:
                        await asyncio.to_thread(mark_review, comment_id, "capacity")
                        await notify_owner(app, comment_id)
                result = await asyncio.to_thread(comment_result, comment_id)
                result["comment_id"] = comment_id
                if result["status"] == "rejected":
                    raise CommunityError("moderation_rejected", "Комментарий не опубликован: уберите оскорбления, мат или спам.", 422)
            payload = await asyncio.to_thread(public_status, slug, visitor, user_id)
            payload.update(result)
            payload["form_token"] = form_token(secret, visitor)
            return response(payload, 202 if result.get("status") == "pending" else 200)
        except (CommunityError, GuestError) as exc:
            return response({"ok": False, "error": exc.code, "message": getattr(exc, "message", "Сейчас ответ недоступен. Попробуйте позже.")}, exc.status)
        except (ValueError, TypeError, json.JSONDecodeError):
            return response({"ok": False, "error": "invalid_request", "message": "Проверьте поля сообщения."}, 400)
        except Exception as exc:
            logger.warning("Site community request: %s", type(exc).__name__)
            return response({"ok": False, "error": "unavailable", "message": "Сервис временно недоступен."}, 503)

    async def startup(_app):
        await asyncio.to_thread(init_schema)

    async def cleanup(_app):
        if running:
            await asyncio.gather(*list(running), return_exceptions=True)

    app.on_startup.append(startup)
    app.on_cleanup.append(cleanup)
    app.router.add_post("/api/site/community/{action}", handler)
    if not any(route.resource.canonical == "/api/site/posts" for route in app.router.routes()):
        publications.register_routes(app)


def response(payload, status=200):
    return web.json_response(payload, status=status, headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
