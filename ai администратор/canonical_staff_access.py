"""Request-scoped canonical staff authority; no legacy role fallback.

HTTP requests resolve a signed Maya session. Native bot updates resolve their
trusted Telegram subject through the installation-bound, read-only canonical
AuthIdentity adapter. Neither path caches authority by chat or accepts a local
ID allowlist.
"""
from __future__ import annotations

import asyncio
from contextvars import ContextVar
import os
import re
import threading

_principal = ContextVar('maya_r02_current_principal', default=None)
_ROLE = {'tenant_owner': 'owner', 'business_owner': 'owner', 'tenant_admin': 'owner',
         'administrator': 'manager', 'staff': 'master', 'platform_owner': 'owner'}


def bearer(headers, body):
    authorization = str(headers.get('Authorization', '') or '')
    header = authorization[7:] if authorization.startswith('Bearer ') else ''
    payload = (body or {}).get('maya_token', '')
    if not isinstance(payload, str) or (header and payload and header != payload):
        raise ValueError('canonical_staff_session_required')
    credential = header or payload
    if not credential or len(credential) > 4096:
        raise ValueError('canonical_staff_session_required')
    return credential


def read_principal(credential):
    import requests
    from config import YCLIENTS_COMPANY_ID
    token = os.getenv('MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN', '').strip()
    if not token:
        raise ValueError('canonical_staff_session_required')
    response = requests.post(
        'http://127.0.0.1:3107/api/internal/legacy/staff-principal',
        headers={'Authorization': 'Bearer ' + credential, 'x-maya-legacy-bridge': token},
        json={'provider': 'yclients', 'externalCompanyId': str(YCLIENTS_COMPANY_ID)}, timeout=8,
    )
    if response.status_code >= 400:
        raise ValueError('canonical_staff_session_required')
    principal = response.json()
    if (not isinstance(principal, dict) or principal.get('contract') != 'maya.canonical-staff-principal/1'
            or principal.get('role') not in _ROLE or not principal.get('userId')
            or not principal.get('tenantId') or principal.get('businessMutations') != 0
            or principal.get('platform') != (principal.get('role') == 'platform_owner')
            or (not principal.get('platform') and not principal.get('membershipId'))):
        raise ValueError('canonical_staff_session_required')
    return principal


def read_telegram_principal(chat_id):
    """Resolve one Bot API-authenticated subject through canonical identity."""
    import requests
    from config import YCLIENTS_COMPANY_ID
    token = os.getenv('MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN', '').strip()
    if not token or not re.fullmatch(r'[1-9][0-9]{0,19}', str(chat_id or '')):
        return None
    response = requests.post(
        'http://127.0.0.1:3107/api/internal/legacy/telegram-staff-principal',
        headers={'x-maya-legacy-bridge': token},
        json={'provider': 'yclients', 'externalCompanyId': str(YCLIENTS_COMPANY_ID),
              'providerUserId': str(chat_id)}, timeout=8,
    )
    if response.status_code >= 400:
        return None
    principal = response.json()
    if isinstance(principal, dict) and principal.get('principal') is None:
        return None
    if (not isinstance(principal, dict)
            or principal.get('contract') != 'maya.canonical-telegram-staff-principal/1'
            or principal.get('role') not in _ROLE or not principal.get('userId')
            or not principal.get('tenantId') or not principal.get('membershipId')
            or principal.get('businessMutations') != 0 or principal.get('platform')
            or str(principal.get('telegramId') or '') != str(chat_id)
            or not principal.get('authIdentityId')):
        return None
    return principal


async def bind_telegram_update(chat_id):
    """Bind canonical authority to the current PTB process_update task only."""
    _principal.set(None)
    principal = await asyncio.to_thread(read_telegram_principal, chat_id)
    if not principal:
        return False
    _principal.set({'principal': principal, 'credential': None, 'active': True,
                    'owner_task': asyncio.current_task()})
    return True


def current(chat_id=None):
    scope = _principal.get()
    if not scope or not scope['active']:
        return None
    if scope.get('parent') is not None and not scope['parent']['active']:
        return None
    try:
        task = asyncio.current_task()
    except RuntimeError:
        task = None
    if scope.get('owner_task') is not task:
        return None
    if task is None and scope.get('owner_thread') != threading.get_ident():
        return None
    principal = scope['principal']
    if chat_id is not None and str(chat_id) != str(principal.get('telegramId') or ''):
        return None
    return principal


def synchronous_request_callback(callback):
    """Single-use adapter for the existing awaited SSE producer thread.

    Creating a task never transfers authority. Only the owning request may
    explicitly hand its synchronous producer this bounded, single-use scope.
    """
    p = current()
    parent = _principal.get() if p else None
    claimed = False
    lock = threading.Lock()
    def run():
        nonlocal claimed
        with lock:
            if claimed:
                raise ValueError('canonical_principal_callback_already_used')
            claimed = True
        scope = ({'principal': p, 'credential': parent.get('credential'), 'active': True, 'parent': parent,
                  'owner_task': None, 'owner_thread': threading.get_ident()}
                 if p and parent['active'] else None)
        token = _principal.set(scope)
        try:
            return callback()
        finally:
            if scope:
                scope['active'] = False
            _principal.reset(token)
    return run


def panel_user():
    principal = current()
    if not principal or not principal.get('telegramId') or not principal.get('authIdentityId'):
        return None
    return {'id': int(principal['telegramId']), 'first_name': '', 'canonicalUserId': principal['userId']}


def panel_role(chat_id):
    from maya_roles import panel_permissions
    p = current(chat_id)
    role = _ROLE.get(p['role']) if p else None
    return {'role': role, 'is_master': role == 'master', 'is_cashier': False,
            'staff_id': p.get('externalStaffId') if p else None,
            'canonical_staff_id': p.get('staffId') if p else None,
            'master_name': '', 'permissions': panel_permissions(role),
            'is_founder': bool(p and p.get('platform')), 'is_admin': is_admin(chat_id),
            'staff_authority': 'CrmStaffAccess'}


def is_admin(chat_id):
    p = current(chat_id)
    return bool(p and p['role'] in {'tenant_owner', 'business_owner', 'tenant_admin', 'administrator', 'platform_owner'})


def is_staff(chat_id):
    return current(chat_id) is not None


def is_platform(chat_id=None):
    p = current(chat_id)
    return bool(p and p.get('platform'))


def ai_role(chat_id):
    p = current(chat_id)
    return ('founder' if p.get('platform') else _ROLE[p['role']]) if p else 'client'


def master_projection(chat_id):
    """Canonical binding first; legacy caller receives only its own staff key."""
    p = current(chat_id)
    if not p or p['role'] != 'staff' or not p.get('staffId') or not p.get('externalStaffId'):
        return None
    return {'yclients_staff_id': p['externalStaffId'], 'telegram_chat_id': int(p['telegramId']),
            'canonical_staff_id': p['staffId'], 'name': '', 'is_active': 1}


def protected_surface(path, body):
    return (path.startswith('/api/panel/') or path.startswith('/api/god/')
            or (path in {'/api/chat', '/api/chat/stream', '/api/chat/history'}
                and str((body or {}).get('mode', '')).strip().lower() == 'staff'))


async def middleware(request, handler):
    """The context lasts for one awaited request; it is never persisted/reused."""
    from aiohttp import web
    marker = _principal.set(None)
    scope = None
    try:
        if request.method == 'OPTIONS':
            return await handler(request)
        body = {}
        if request.can_read_body:
            try:
                body = await request.json()
            except Exception:
                body = {}
        if not isinstance(body, dict):
            body = {}
        if not protected_surface(request.path, body):
            return await handler(request)
        try:
            credential = bearer(request.headers, body)
            principal = await asyncio.to_thread(read_principal, credential)
        except ValueError:
            return web.json_response({'error': 'canonical_staff_session_required', 'business_mutations': 0}, status=403)
        except Exception:
            return web.json_response({'error': 'canonical_staff_authority_unavailable', 'business_mutations': 0}, status=503)
        if request.path.startswith('/api/god/') and not principal.get('platform'):
            return web.json_response({'error': 'canonical_platform_authority_required', 'business_mutations': 0}, status=403)
        # Legacy projections are keyed by Telegram. Only the exact existing
        # canonical AuthIdentity may supply that presentation key.
        if not request.path.startswith('/api/god/') and (not principal.get('authIdentityId')
                or not re.fullmatch(r'[1-9][0-9]{0,19}', str(principal.get('telegramId') or ''))):
            return web.json_response({'error': 'canonical_staff_channel_required', 'business_mutations': 0}, status=403)
        # The account is canonical, but this legacy staff-only view needs an
        # exact active CRM projection. Never substitute a historical access ID.
        if principal.get('role') == 'staff' and (not principal.get('staffId')
                or not principal.get('externalStaffId')):
            return web.json_response({'error': 'canonical_staff_projection_required', 'business_mutations': 0}, status=403)
        scope = {'principal': principal, 'credential': credential, 'active': True, 'owner_task': asyncio.current_task()}
        _principal.set(scope)
        return await handler(request)
    finally:
        if scope:
            scope['active'] = False
        _principal.reset(marker)


middleware.__middleware_version__ = 1


def current_credential():
    return _principal.get().get('credential') if current() else None
