"""R08 transforms only inventoried native feedback leaves and fixed initiators.
Historical rows and B34 external review owner are not modified.
"""
import ast
from pathlib import Path


def replace_body(source, name, body):
    nodes = [n for n in ast.parse(source).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name]
    if len(nodes) != 1:
        raise ValueError('R08 exact function required: ' + name)
    node = nodes[0]
    lines = source.splitlines(keepends=True)
    result = ''.join(lines[:node.body[0].lineno - 1]) + ''.join('    ' + line + '\n' for line in body.splitlines()) + ''.join(lines[node.end_lineno:])
    ast.parse(result)
    return result


BODIES = {
    'reviews.py': {
        'schedule_after_close': "# A payment/record update cannot attest arrived attendance or admit feedback.\nreturn False",
        'send_pending_review_requests': "return {'status':'retired_canonical_explicit_request_required','checked':0,'sent':0,'blocked':0,'skipped_no_consent':0}",
        'handle_rating_callback': "query = update.callback_query\nif not query or not str(query.data or '').startswith('rev_'):\n    return False\nawait query.answer('Оставьте или исправьте отзыв в личном кабинете MAYA.')\nreturn True",
        'handle_negative_comment': "# An unrelated next message never establishes feedback intent or authority.\nreturn False",
        '_notify_admins_positive': 'return None',
        '_notify_admins_negative': 'return None',
        '_fetch_client_minimal': 'return None',
    },
    'bot.py': {
        'cmd_reviews_now': "await update.effective_message.reply_text('Запрос отзыва доступен для отмеченного визита в MAYA: https://malesthetic.pro/app/?native_feedback=management')",
        'cmd_reviews_stats': "await update.effective_message.reply_text('Проверенные ответы клиентов доступны в MAYA: https://malesthetic.pro/app/?native_feedback=management')",
        '_reviews_job': "return {'status':'canonical_admitted_request_scheduler','messages':0}",
    },
    'database.py': {
        **{name: "raise PermissionError('canonical_native_feedback_executor_required')" for name in ['schedule_review_request', 'mark_review_request_sent', 'mark_review_request_failed', 'record_review_response', 'expire_stale_review_requests']},
        'pending_review_requests_to_send': 'return []',
        'get_review_request_by_id': 'return None',
        'review_stats': "return {'available':False,'source':'quarantined_legacy_feedback','avg_rating':None,'total_rated':None,'requested':None,'responded':None}",
        'list_recent_reviews': 'return []',
        'reviews_by_master': 'return {}',
    },
}

HANDLER = '''async def client_native_feedback_handler(request: web.Request) -> web.Response:
    """R08 verified-channel initiator. No local request/revision/send owner."""
    import legacy_client_command_bridge as client_commands
    try:
        body = await request.json()
        if not isinstance(body, dict) or set(body) - {'operation', 'command', 'idempotencyKey', 'auth_data', 'maya_token'}:
            raise ValueError('invalid_feedback_envelope')
        operation = body.get('operation')
        if operation not in {'projection', 'response', 'withdraw'}:
            raise ValueError('invalid_feedback_operation')
        proof = client_commands.channel_proof(request.headers, body)
        if operation == 'projection':
            if 'command' in body or 'idempotencyKey' in body:
                raise ValueError('feedback_read_has_no_command')
            payload = {}
        else:
            payload = {'command': body.get('command'), 'idempotencyKey': body.get('idempotencyKey')}
        result = await asyncio.to_thread(client_commands.command, 'feedback-' + operation, proof, payload)
        return _cabinet_response(result)
    except ValueError as error:
        code = str(error)
        return _cabinet_response({'error': 'IDEMPOTENCY_CONFLICT' if code == 'IDEMPOTENCY_CONFLICT' else 'feedback_identity_or_command_rejected'}, status=409 if code == 'IDEMPOTENCY_CONFLICT' else 403)
    except Exception:
        return _cabinet_response({'error':'feedback_outcome_unconfirmed','retry':'same_command_identity'}, status=503)


'''


def transform(name, source):
    for function, body in BODIES.get(name, {}).items():
        source = replace_body(source, function, body)
    if name == 'legacy_client_command_bridge.py':
        anchor = '"consent", "status", "issue", "consume",'
        if source.count(anchor) != 1:
            raise ValueError('R08 client command allowlist anchor')
        source = source.replace(anchor, '"feedback-projection", "feedback-response", "feedback-withdraw", ' + anchor)
        source = source.replace('{"appointment-create", "chat-appointment-create"}', '{"appointment-create", "chat-appointment-create", "feedback-response", "feedback-withdraw"}')
        source = source.replace('{"booking-confirmation", "chat-appointment-create"}', '{"booking-confirmation", "chat-appointment-create", "feedback-response", "feedback-withdraw"}')
    if name == 'webhook_server.py':
        anchor = '_PACKAGE2_TELEGRAM_MESSAGE_TYPES = frozenset({'
        if source.count(anchor) != 1 or 'async def client_native_feedback_handler' in source:
            raise ValueError('R08 finite transport anchor')
        source = source.replace(anchor, anchor + '\n    "native_feedback_invitation",')
        anchor = 'async def client_cancel_record_handler('
        if source.count(anchor) != 1:
            raise ValueError('R08 verified client handler anchor')
        source = source.replace(anchor, HANDLER + anchor)
        anchor = '    web_app.router.add_post("/api/client/cancel-record", client_cancel_record_handler)'
        if source.count(anchor) != 1:
            raise ValueError('R08 route anchor')
        source = source.replace(anchor, '    web_app.router.add_post("/api/client/feedback", client_native_feedback_handler)\n    web_app.router.add_options("/api/client/feedback", cabinet_options_handler)\n' + anchor)
    ast.parse(source)
    return source


def apply(directory):
    root = Path(directory)
    staged = {root / name: transform(name, (root / name).read_text()) for name in [*BODIES, 'legacy_client_command_bridge.py', 'webhook_server.py']}
    for path, text in staged.items():
        path.write_text(text)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(); parser.add_argument('directory'); args = parser.parse_args(); apply(args.directory)
