"""R11 initiator/read adapter. No SQLite settings or business mutation owner."""
from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlencode
import canonical_staff_access


def reject_legacy_setting_key(key):
    value = str(key).strip().lower()
    if value == 'masters_ai_provider' or value.startswith('maya_capability:'):
        raise PermissionError('canonical_A22_configuration_has_no_global_fallback')


def _read(path):
    import requests
    credential = canonical_staff_access.current_credential()
    if not credential:
        raise PermissionError('canonical_current_staff_session_required')
    response = requests.get('http://127.0.0.1:3107/api/governed-settings/' + path,
                            headers={'Authorization': 'Bearer ' + credential}, timeout=8)
    if response.status_code != 200:
        raise PermissionError('canonical_settings_unavailable')
    value = response.json()
    if not isinstance(value, dict):
        raise ValueError('canonical_settings_invalid')
    return value


def tenant_content(namespace):
    if namespace not in {'business_rules', 'client_capabilities', 'staff_ai_provider'}:
        raise ValueError('configuration_namespace_not_allowlisted')
    result = _read('tenant/' + namespace)
    if result.get('namespace') != namespace:
        raise ValueError('canonical_namespace_mismatch')
    return result.get('content')


def rules(limit=40):
    if not canonical_staff_access.current():
        return []
    content = tenant_content('business_rules')
    rows = content.get('rules') if isinstance(content, dict) else None
    if not isinstance(rows, list):
        raise ValueError('canonical_rules_unavailable')
    return [{'id': row['id'], 'rule_text': row['text'], 'active': 1}
            for row in rows[:max(0, min(int(limit), 40))]]


def provider():
    if not canonical_staff_access.current():
        return None
    content = tenant_content('staff_ai_provider')
    selected = content.get('provider') if isinstance(content, dict) else None
    return selected if selected in {'claude', 'openai'} else None


def client_history_enabled():
    if not canonical_staff_access.current():
        return False
    content = tenant_content('client_capabilities')
    return isinstance(content, dict) and content.get('client_self_visit_history') is True


def telegram_muted(chat_id):
    principal = canonical_staff_access.current(chat_id)
    if not principal:
        return True
    try:
        value = _read('personal').get('config')
        if not isinstance(value, dict) or value.get('membershipId') != principal.get('membershipId') or value.get('schema_version') != 1:
            return True
        until = value.get('telegramMutedUntil')
        return until is not None and datetime.fromisoformat(until.replace('Z', '+00:00')) > datetime.now(timezone.utc)
    except Exception:
        return True


def confirmation_link(namespace, proposal=None):
    if namespace not in {'business_rules', 'client_capabilities', 'staff_ai_provider', 'staff_notifications'}:
        raise ValueError('configuration_namespace_not_allowlisted')
    query = {'governed_settings': namespace}
    if proposal is not None:
        query['proposal'] = str(proposal)
    return 'Откройте Maya и подтвердите изменение для своего аккаунта/бизнеса: https://malesthetic.pro/app/?' + urlencode(query)


def mute_link(args):
    raw = str((args or ['120m'])[0]).strip().lower()
    if raw == 'off':
        return confirmation_link('staff_notifications', 'off')
    try:
        multiplier = 1 if raw.endswith(('m', 'м')) else 60
        amount = float(raw[:-1] if raw.endswith(('m', 'м', 'h', 'ч')) else raw) * multiplier
        if not amount.is_integer() or not 1 <= amount <= 1440:
            raise ValueError()
    except ValueError:
        return 'Формат: /mute 30m, /mute 2h или /mute off. Максимум 24 часа.'
    return confirmation_link('staff_notifications', int(amount))


def owner_command_reply(kind, command):
    if not command:
        return None
    principal = canonical_staff_access.current()
    if not principal or principal.get('role') not in {'tenant_owner', 'business_owner'}:
        return 'Требуется текущий владелец бизнеса и авторизованный вход в Maya.'
    if kind == 'rules':
        action, value = command
        if action == 'list':
            return '\n'.join([row['id'] + '. ' + row['rule_text'] for row in rules()]) or 'Правил для этого бизнеса пока нет.'
        return confirmation_link('business_rules', value if action == 'add' else None)
    if kind == 'capability':
        code, value = command
        if code == 'list':
            return 'Собственная история посещений: ' + ('включена' if client_history_enabled() else 'отключена')
        return confirmation_link('client_capabilities', 'on' if value else 'off')
    raise ValueError('unlisted_owner_command')
