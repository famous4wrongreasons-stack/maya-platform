"""R09 exact known production-only community runtime overlay. No SQL execution."""
import ast
from pathlib import Path


def replace_body(source, name, body):
    nodes = [node for node in ast.parse(source).body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name]
    if len(nodes) != 1:
        raise ValueError('R09 exact function required: ' + name)
    node = nodes[0]; lines = source.splitlines(keepends=True)
    result = ''.join(lines[:node.body[0].lineno - 1]) + ''.join('    ' + line + '\n' for line in body.splitlines()) + ''.join(lines[node.end_lineno:])
    ast.parse(result); return result


RETIRE = "raise PermissionError('canonical_public_community_owner_required')"
BODIES = {
    'site_community.py': {
        'init_schema': 'return None', 'public_status': RETIRE, 'set_like': RETIRE,
        'reserve_comment': RETIRE, 'comment_result': RETIRE, 'mark_review': RETIRE,
        'review_queue': RETIRE, 'resolve_comment': RETIRE, 'notify_owner': 'return False',
        'process_comment': 'return None',
        'spend_limits': '''# Existing durable protocol limit table only; no community business writer.
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
        db.executemany('INSERT INTO site_community_limits VALUES (?,?)', [(item[0], now) for item in limits])''',
    },
    'site_engagement.py': {
        '_connect': RETIRE, 'init_schema': 'return None', '_maya_text': RETIRE,
        'moderate_comment': "return 'review', 'human_moderation_required'",
        'generate_brand_reply': "return ''", 'record_view': RETIRE,
        'toggle_like': RETIRE, 'add_comment': RETIRE, 'add_brand_reply': RETIRE,
        'event_status': RETIRE,
    },
}

REGISTER = '''from config import TELEGRAM_TOKEN
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
'''


def transform(name, source):
    for function, body in BODIES.get(name, {}).items():
        source = replace_body(source, function, body)
    if name == 'site_community.py':
        source = replace_body(source, 'register_routes', REGISTER)
    if name == 'site_engagement.py':
        # Align accepted source normalization with the canonical UTF-8 hash.
        source = source.replace('import sqlite3\n', 'import sqlite3\nimport unicodedata\n')
        source = source.replace('str(value or "").strip()', 'unicodedata.normalize("NFC", str(value or "")).strip()')
        source = source.replace('str(value or "").replace("\\x00", "").strip()', 'unicodedata.normalize("NFC", str(value or "")).replace("\\r\\n", "\\n").replace("\\r", "\\n").replace("\\x00", "").strip()')
        source = source.replace('str(value or "").strip())[:40]', 'str(value or "").strip())')
        # Do not silently truncate an anonymous label before intent comparison.
        source = source.replace('unicodedata.normalize("NFC", str(value or "")).strip())[:40]', 'unicodedata.normalize("NFC", str(value or "")).strip())')
    ast.parse(source); return source


def apply(root):
    root = Path(root)
    staged = {root/name: transform(name, (root/name).read_text()) for name in BODIES}
    for path, text in staged.items():
        path.write_text(text)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(); parser.add_argument('directory'); args = parser.parse_args(); apply(args.directory)
