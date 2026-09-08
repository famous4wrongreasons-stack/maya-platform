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
    return None


def spend_limits(limits, now=None):
    # Existing durable protocol limit table only; no community business writer.
    import sqlite3
    from contextlib import closing
    now = now or time.time()
    with closing(sqlite3.connect(events.DB_PATH, timeout=30)) as db:
        with db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM site_community_limits WHERE created < ?', (now - 86400,))
            for bucket, seconds, maximum in limits:
                count = db.execute('SELECT COUNT(*) FROM site_community_limits WHERE bucket=? AND created>?', (bucket, now - seconds)).fetchone()[0]
                if count >= maximum:
                    raise CommunityError('rate_limited', 'Слишком много запросов. Попробуйте позже.', 429)
            db.executemany('INSERT INTO site_community_limits VALUES (?,?)', [(item[0], now) for item in limits])


def public_status(slug, visitor, user_id=None):
    raise PermissionError('canonical_public_community_owner_required')


def set_like(slug, visitor, user_id, liked):
    raise PermissionError('canonical_public_community_owner_required')


def check_author(value):
    author = events.normalize_author(value)
    # Guest names are public, unverified labels; never let them impersonate staff.
    normalized = re.sub(r"[^а-яa-z]", "", author.lower().replace("ё", "е"))
    if (anonymizer.redact_pii(author) != author or events._PROFANITY.search(author)
            or any(word in normalized for word in ("эстетик", "malesthetic", "админ", "admin", "moderator", "модератор", "майя", "maya"))):
        raise CommunityError("invalid_name", "Укажите другое имя или псевдоним.")
    return author


def reserve_comment(slug, visitor, user_id, request_key, author, text):
    raise PermissionError('canonical_public_community_owner_required')


def comment_result(comment_id):
    raise PermissionError('canonical_public_community_owner_required')


def mark_review(comment_id, reason="moderation_unavailable"):
    raise PermissionError('canonical_public_community_owner_required')


def review_queue():
    raise PermissionError('canonical_public_community_owner_required')


def resolve_comment(comment_id, decision):
    raise PermissionError('canonical_public_community_owner_required')


async def notify_owner(app, comment_id):
    return False


async def process_comment(app, comment_id, slug, text):
    return None


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
    import canonical_public_community as canonical
    
    secret = TELEGRAM_TOKEN
    
    async def handler(request):
        try:
            raw = await request.text()
            if len(raw) > 12000:
                raise CommunityError('too_large', 'Сообщение слишком длинное.', 413)
            action = request.match_info['action']
            body = verify_gateway(raw, request.headers, secret)
            if body.get('gateway_action') != action:
                raise CommunityError('forbidden', 'Исходное действие не подтверждено.', 403)
            visitor, network = body['visitor'], body['network']
            if action in {'moderation', 'resolve'}:
                # Raw Telegram/session/gateway identity cannot be a moderator.
                return response({'ok':False,'error':'canonical_moderation_required','url':'https://malesthetic.pro/app/?community_moderation=1'}, 410)
            if action == 'guest-chat':
                await asyncio.to_thread(spend_limits, [('chat-ip:' + network, 60, 12), ('chat-day:' + network, 86400, 80), ('chat-global', 86400, 400)])
                return response(await guest_chat.send(body))
            if action not in {'status', 'comment', 'view', 'like'}:
                raise CommunityError('not_found', 'Не найдено.', 404)
            # Ignore legacy optional auth/session metadata: every source is anonymous.
            slug = events.normalize_slug(body.get('slug'))
            if not slug:
                raise CommunityError('event_not_found', 'Публикация не найдена.', 404)
            command, key = {}, None
            if action != 'status':
                key = str(body.get('request_key', ''))
                if not REQUEST_ID.fullmatch(key):
                    raise CommunityError('invalid_request', 'Обновите страницу.', 400)
            if action == 'comment':
                if body.get('consent') is not True or body.get('consent_policy_version') != 'public-comment-consent/1':
                    raise CommunityError('consent_required', 'Подтвердите согласие перед публикацией.', 403)
                check_form(secret, visitor, body.get('form_token'))
                if body.get('website'):
                    raise CommunityError('spam', 'Не удалось отправить комментарий.', 422)
                text = events.normalize_comment(body.get('text'))
                author = check_author(body.get('display_name'))
                if events.deterministic_moderation(text)[0] == 'reject':
                    raise CommunityError('moderation_rejected', 'Уберите личные данные, оскорбления или спам.', 422)
                await asyncio.to_thread(spend_limits, [('comment-ip:' + network, 60, 3), ('comment-day:' + network, 86400, 20), ('comment-guest:' + visitor, 60, 2)])
                command = {'author': author, 'text': text, 'publicationConsent': True, 'consentPolicyVersion': body['consent_policy_version']}
            elif action == 'like':
                version = body.get('expected_version')
                if not isinstance(body.get('liked'), bool) or isinstance(version, bool) or not isinstance(version, int) or version < 0:
                    raise CommunityError('invalid_like', 'Обновите обсуждение.', 400)
                await asyncio.to_thread(spend_limits, [('like:' + network, 60, 30)])
                command = {'desiredLiked': body['liked'], 'expectedVersion': version}
            elif action == 'view':
                await asyncio.to_thread(spend_limits, [('view:' + network, 60, 90)])
            result = await canonical.request(action, slug, visitor, command, key)
            if action == 'status':
                result['comments'] = [{'id': item['id'], 'author': item['author'], 'text': item['text'], 'is_guest': item['sourceKind'] == 'GUEST', 'is_brand_reply': item['sourceKind'] == 'BRAND', 'parent_id': item['parentId'], 'created_at': item['createdAt'], 'date_label': item['createdAt'][:10]} for item in result['comments']]
            if action == 'comment':
                result['comment_id'] = result['commentId']; result['status'] = result['status'].lower()
            result.update(ok=True, form_token=form_token(secret, visitor))
            return response(result, 202 if action == 'comment' and result['status'] == 'pending' else 200)
        except canonical.CommunityReceiptError as error:
            return response({'ok':False, 'error':error.code, 'retry':'same_command_identity' if error.status >= 500 else None}, error.status)
        except (CommunityError, GuestError) as error:
            return response({'ok':False,'error':error.code,'message':getattr(error, 'message', 'Запрос не принят.')}, error.status)
        except (ValueError, TypeError, json.JSONDecodeError):
            return response({'ok':False,'error':'invalid_request','message':'Проверьте поля сообщения.'}, 400)
        except Exception as error:
            logger.warning('Canonical community source request: %s', type(error).__name__)
            return response({'ok':False,'error':'community_receipt_unconfirmed','retry':'same_command_identity'}, 503)
    
    app.router.add_post('/api/site/community/{action}', handler)
    if not any(route.resource.canonical == '/api/site/posts' for route in app.router.routes()):
        publications.register_routes(app)


def response(payload, status=200):
    return web.json_response(payload, status=status, headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
