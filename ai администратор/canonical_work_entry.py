"""R04: authenticated A23 initiators. No local work owner, queue or provider effect."""
from __future__ import annotations

import asyncio
import re

import canonical_staff_access

BASE = 'http://127.0.0.1:3107/api/operational-work'
MESSAGE = 'Поручения доступны в MAYA: выберите конкретного исполнителя. Для задачи можно отметить только выполнение.'


def owner_required():
    return {'ok': False, 'error': 'canonical_operational_work_required',
            'message': MESSAGE, 'business_mutations': 0, 'retry_allowed': False}


def retired(*args, **kwargs):
    """No actor/key/assignee may be inferred from a native or background call."""
    return owner_required()


def _send(credential, operation, payload, identity):
    import requests
    headers = {'Authorization': 'Bearer ' + credential, 'Content-Type': 'application/json'}
    if identity:
        headers['Idempotency-Key'] = identity
    try:
        response = requests.request('GET' if operation == 'list' else 'POST',
            BASE if operation == 'list' else BASE + '/' + operation,
            headers=headers, json=None if operation == 'list' else payload, timeout=10)
        if response.status_code >= 500:
            raise requests.ConnectionError('Canonical outcome unavailable')
        value = response.json()
    except (requests.RequestException, ValueError):
        return {'ok': False, 'error': 'canonical_outcome_unresolved', 'unknown': operation != 'list',
                'retry_allowed': False, 'message': 'Результат уточняется. Сохраните исходное поручение; не создавайте новое.'}
    if response.status_code >= 400:
        return {'ok': False, 'error': 'IDEMPOTENCY_CONFLICT' if response.status_code == 409 else 'canonical_command_rejected',
                'http_status': response.status_code, 'business_mutations': 0,
                'retry_allowed': False, 'message': 'Поручение не принято. Проверьте исполнителя и доступ.'}
    if operation == 'list':
        if not isinstance(value, dict) or value.get('contract') != 'maya.operational-work/1':
            return owner_required()
        return value
    execution = value.get('result', value) if isinstance(value, dict) else {}
    if (not isinstance(execution, dict) or not execution.get('actionExecutionId')
            or execution.get('unknownApplicable') is not False):
        return {'ok': False, 'error': 'canonical_outcome_unresolved', 'unknown': True, 'retry_allowed': False}
    return {'ok': True, 'execution_id': execution['actionExecutionId'],
            'work_item_id': execution['targetRef'], 'unknown': False,
            'message': 'Поручение сохранено.' if operation == 'create' else 'Выполнение отмечено.'}


async def canonical_request(request, operation):
    """One awaited request forwards its session; backend rechecks current authority.

    The worker receives a single fixed HTTP call, not a reusable principal scope.
    """
    principal = canonical_staff_access.current()
    if not principal or principal.get('platform'):
        return owner_required()
    try:
        body = await request.json()
        if not isinstance(body, dict):
            return owner_required()
        credential = canonical_staff_access.bearer(request.headers, body)
    except (ValueError, TypeError):
        return owner_required()
    identity = ''
    payload = None
    if operation != 'list':
        header = request.headers.get('Idempotency-Key', '')
        identity = body.get('idempotency_key', '') or header
        if (not isinstance(identity, str) or not identity.strip() or len(identity) > 240
                or (header and header != identity)):
            return owner_required()
        identity = identity.strip()
    if operation == 'create':
        # Legacy role labels, relative deadlines, job metadata and auto-create
        # parameters are not normalized into an approved A23 command.
        unsupported = {'assigned_to', 'assignee_name', 'due_in_days', 'action_job', 'safe_autocreate',
                       'potential_rub', 'priority', 'owner_next_step', 'signal_key', 'signal_kind', 'signal_source'}
        if any(key in body for key in unsupported):
            return owner_required()
        payload = {'assigneeUserId': body.get('assignee_user_id'), 'title': body.get('title'),
                   'bodyText': body.get('detail'), 'dueAt': body.get('due_at')}
    elif operation == 'complete':
        if body.get('action') not in {'done', 'complete', 'finish'}:
            return owner_required()
        task_id = body.get('task_id')
        if not isinstance(task_id, str) or not task_id or re.fullmatch(r'\d+', task_id):
            return owner_required()
        if any(body.get(key) for key in ('note', 'due_at', 'due_in_days', 'assigned_to', 'assignee_name')):
            return owner_required()
        payload = {'inboxItemId': task_id}
    elif operation != 'list':
        return owner_required()
    return await asyncio.to_thread(_send, credential, operation, payload, identity)


async def handle(request, operation):
    from aiohttp import web
    value = await canonical_request(request, operation)
    if value.get('ok') and operation != 'list':
        value['inbox'] = await canonical_request(request, 'list')
    return web.json_response(value, status=200 if value.get('ok') else value.get('http_status', 409))
