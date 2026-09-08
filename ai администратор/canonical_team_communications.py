"""Finite R12 initiator adapter. No SQL, object storage, model or fan-out owner."""
from __future__ import annotations

import asyncio
import re
import canonical_staff_access

BASE = 'http://127.0.0.1:3107/api/team-communications'
CONTRACT = 'maya.team-communications/1'


def retired():
    return {'ok': False, 'error': 'canonical_team_owner_required',
            'message': 'Откройте командный чат MAYA. Старые сообщения и файлы не изменены.',
            'url': 'https://malesthetic.pro/app/?team=main', 'business_mutations': 0}


def _request(credential, operation, command, key):
    import requests
    if operation not in {'feed', 'send', 'withdraw', 'reserve', 'finalize'}:
        raise ValueError('team_operation_not_allowlisted')
    headers = {'Authorization': 'Bearer ' + credential, 'Content-Type': 'application/json'}
    if key:
        headers['Idempotency-Key'] = key
    try:
        response = requests.request('GET' if operation == 'feed' else 'POST',
            BASE + '/messages' if operation == 'feed' else BASE + '/commands/' + operation,
            headers=headers, json=None if operation == 'feed' else command, timeout=20)
        if response.status_code >= 500:
            raise requests.ConnectionError('Canonical team receipt unavailable')
        value = response.json()
        if response.status_code >= 400:
            return {'ok': False, 'error': 'IDEMPOTENCY_CONFLICT' if response.status_code == 409 else 'canonical_team_rejected',
                    'http_status': response.status_code, 'retry_new_identity': False}
        if not isinstance(value, dict) or value.get('contract') != CONTRACT:
            raise ValueError('canonical_team_receipt_required')
        return value
    except (requests.RequestException, ValueError):
        return {'ok': False, 'error': 'canonical_team_receipt_unknown', 'unknown': operation != 'feed',
                'retry_same_identity_only': True, 'retry_new_identity': False, 'http_status': 503}


async def handle(request, operation):
    from aiohttp import web
    principal = canonical_staff_access.current()
    if (not principal or principal.get('platform') or principal.get('role') not in
            {'tenant_owner', 'business_owner', 'tenant_admin', 'administrator', 'staff'}):
        return web.json_response(retired(), status=403)
    try:
        body = await request.json()
        if not isinstance(body, dict):
            raise ValueError()
        credential = canonical_staff_access.bearer(request.headers, body)
        command = body.get('command')
        key = body.get('idempotency_key') or request.headers.get('Idempotency-Key')
        if operation != 'feed' and (not isinstance(command, dict) or not isinstance(key, str)
                or not re.fullmatch(r'[0-9a-fA-F-]{36}', key)
                or (request.headers.get('Idempotency-Key') and request.headers['Idempotency-Key'] != key)):
            raise ValueError()
        value = await asyncio.to_thread(_request, credential, operation, command, key)
        return web.json_response(value, status=value.get('http_status', 200))
    except (ValueError, TypeError):
        return web.json_response(retired(), status=400)
