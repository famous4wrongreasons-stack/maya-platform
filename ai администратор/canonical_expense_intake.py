"""R13 initiator only. Native updates have no Maya business authority.

The source capsule is encrypted by the canonical backend. It carries the
original event into a separately authenticated Maya session; it is not approval.
"""
from __future__ import annotations
import asyncio
from datetime import timezone
import os
import re
from urllib.parse import quote

HELP = ('Для каждой строки укажите: YYYY-MM-DD | статья | рубли | ID филиала или весь бизнес | примечание. '
        'Статьи: rent, supplies, marketing, taxes, utilities, other. До 10 строк. '
        'Отправьте весь список одной командой /rashod. Каждая карточка потребует отдельного подтверждения в MAYA. '
        'Напоминания включаются отдельно: https://malesthetic.pro/app/?expenses=reminder')


def expense_reply(message):
    """A syntactic initiator filter only; canonical correlation is still required."""
    reply = getattr(message, 'reply_to_message', None)
    markup = getattr(reply, 'reply_markup', None)
    for row in getattr(markup, 'inline_keyboard', ()) or ():
        for button in row:
            url = str(getattr(button, 'url', '') or '')
            if url.startswith('https://malesthetic.pro/app/?expenses=reminder&run='):
                return True
    return False


def source_body(message):
    from config import YCLIENTS_COMPANY_ID
    sender, chat = getattr(message, 'from_user', None), getattr(message, 'chat', None)
    if (not sender or not chat or str(getattr(chat, 'type', '')) != 'private'
            or getattr(sender, 'is_bot', False) or sender.id != chat.id
            or getattr(message, 'forward_origin', None) or getattr(message, 'forward_date', None)
            or not getattr(message, 'date', None)):
        raise ValueError('original_private_expense_source_required')
    text = str(getattr(message, 'text', '') or '')
    if not text or len(text) > 8000:
        raise ValueError('bounded_expense_source_required')
    explicit = re.match(r'^/rashod(?:@[A-Za-z0-9_]+)?\s+@([A-Za-z0-9_-]{8,128}):([a-f0-9]{64})\s+', text)
    reply = getattr(message, 'reply_to_message', None)
    if not text.startswith('/rashod') and not expense_reply(message):
        raise ValueError('explicit_expense_initiator_required')
    return {'provider': 'yclients', 'externalCompanyId': str(YCLIENTS_COMPANY_ID),
            'chatType': 'private', 'forwarded': False, 'senderId': str(sender.id), 'chatId': str(chat.id),
            'messageId': str(message.message_id), 'sourceAt': message.date.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            'sourceText': text, 'mode': 'reply' if explicit or reply else 'standalone',
            'replyToMessageId': str(reply.message_id) if reply else None,
            'reminderRunId': explicit.group(1) if explicit else None,
            'reminderSlotKey': explicit.group(2) if explicit else None}


def _capsule(body):
    import requests
    token = os.getenv('MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN', '').strip()
    if len(token) < 24:
        raise ValueError('expense_source_disabled')
    response = requests.post('http://127.0.0.1:3107/api/internal/expense-intake/source',
                             headers={'x-maya-legacy-bridge': token}, json=body, timeout=8)
    if response.status_code != 201:
        raise ValueError('expense_source_unavailable')
    value = response.json()
    capsule = value.get('capsule')
    if (value.get('contract') != 'maya.expense-intake-source/1' or value.get('businessMutations') != 0
            or value.get('approvalCreated') is not False or not isinstance(capsule, str)
            or not re.fullmatch(r'[A-Za-z0-9_.-]{1,20000}', capsule)):
        raise ValueError('expense_source_invalid')
    return capsule


async def initiate(update):
    message = update.effective_message
    text = str(getattr(message, 'text', '') or '')
    if re.fullmatch(r'/rashod(?:@[A-Za-z0-9_]+)?\s*', text):
        await message.reply_text(HELP)
        return
    try:
        capsule = await asyncio.to_thread(_capsule, source_body(message))
    except Exception:
        await message.reply_text('Карточки не созданы. Повторите открытие этой команды. ' + HELP)
        return
    # A protocol handoff, never a financial receipt. No raw source text/identity
    # is exposed in the link; the fragment does not enter HTTP access logs.
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    await message.reply_text('Расходы ещё не записаны. Скопируйте эту команду, откройте MAYA тем же владельцем Telegram и вставьте её для проверки карточек. Подтвердите каждый расход отдельно.',
        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton('Открыть карточки MAYA',
            url='https://malesthetic.pro/app/?expenses=intake#expense_source=' + quote(capsule, safe=''))]]))


def expense_report(day):
    """Read canonical totals, never infer completeness from visible rows."""
    from canonical_staff_access import current, current_credential
    unavailable = {'items': [], 'total': None, 'recorded_total': None, 'completeness': 'UNAVAILABLE',
                   'source': 'P407', 'declaration': None}
    p, credential = current(), current_credential()
    if not p or p.get('role') not in {'tenant_owner', 'business_owner'} or not credential:
        return unavailable
    try:
        import requests
        response = requests.get('http://127.0.0.1:3107/api/expense-intake/report-period',
                                params={'day': day}, headers={'Authorization': 'Bearer ' + credential}, timeout=8)
        if response.status_code != 200:
            return unavailable
        result = response.json()
        if result.get('contract') != 'maya.expense-period-projection/1' or result.get('tenantId') != p['tenantId'] or result.get('day') != day or result.get('readOnly') is not True:
            return unavailable
        ledger = result.get('ledger') or {}
        if ledger.get('totals_basis') != 'all_recorded_expenses_in_scope':
            return unavailable
        totals = ledger.get('totals') or []
        if any(row.get('currency') != 'RUB' for row in totals):
            return unavailable
        total = sum(row['amount_kopecks'] for row in totals) / 100
        items = [{'id': row['id'], 'item': row['category'], 'amount': row['amount_kopecks'] / 100}
                 for row in ledger.get('items') or []]
        complete = result.get('completeness') == 'DECLARED_COMPLETE' and result.get('declaration') is not None
        return {'items': items, 'total': total if complete else None, 'recorded_total': total,
                'completeness': 'DECLARED_COMPLETE' if complete else 'RECORDED_ONLY',
                'source': 'P407', 'declaration': result.get('declaration'), 'truncated': ledger.get('truncated')}
    except Exception:
        return unavailable
