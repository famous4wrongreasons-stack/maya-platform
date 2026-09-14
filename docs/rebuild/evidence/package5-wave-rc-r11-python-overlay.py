"""Deterministic R11 transformation of inventoried canonical/production variants.
No deployment, imports of production code, DB or provider calls.
"""
import ast
from pathlib import Path


def replace_function(source, name, replacement):
    nodes = [node for node in ast.parse(source).body
             if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name]
    if len(nodes) != 1:
        raise ValueError('R11 exact function base required: ' + name)
    node = nodes[0]
    lines = source.splitlines(keepends=True)
    result = ''.join(lines[:node.lineno - 1]) + replacement.strip() + '\n\n' + ''.join(lines[node.end_lineno:])
    ast.parse(result)
    return result


def transform(name, source):
    if name == 'canonical_staff_access.py':
        old="scope = {'principal': principal, 'active': True, 'owner_task': asyncio.current_task()}"
        if source.count(old) != 1 or 'def current_credential(' in source:
            raise ValueError('R11 exact R02 principal scope required')
        source=source.replace(old,"scope = {'principal': principal, 'credential': credential, 'active': True, 'owner_task': asyncio.current_task()}")
        source=source.replace("scope = ({'principal': p, 'active': True, 'parent': parent,", "scope = ({'principal': p, 'credential': parent.get('credential'), 'active': True, 'parent': parent,")
        source += "\n\ndef current_credential():\n    return _principal.get().get('credential') if current() else None\n"
    elif name == 'bot.py':
        source=replace_function(source,'cmd_mute','''async def cmd_mute(update: Update, context: ContextTypes.DEFAULT_TYPE):
    from canonical_governed_settings import mute_link
    await update.effective_message.reply_text(mute_link(context.args))''')
        source=replace_function(source,'cmd_ai_provider','''async def cmd_ai_provider(update: Update, context: ContextTypes.DEFAULT_TYPE):
    from canonical_governed_settings import confirmation_link
    selected = str((context.args or [''])[0]).strip().lower()
    if selected and selected not in {'claude', 'openai'}:
        await update.effective_message.reply_text('Допустимые варианты: claude, openai.')
        return
    await update.effective_message.reply_text(confirmation_link('staff_ai_provider', selected or None))''')
    elif name == 'webhook_server.py':
        source=replace_function(source,'_founder_learning_reply','''def _founder_learning_reply(chat_id: int, message: str, mode: str = 'staff') -> str | None:
    from canonical_governed_settings import owner_command_reply
    return owner_command_reply('rules', _founder_rule_command(message)) if mode == 'staff' else None''')
        source=replace_function(source,'_founder_permission_reply','''def _founder_permission_reply(chat_id: int, message: str, mode: str = 'staff') -> str | None:
    from canonical_governed_settings import owner_command_reply
    return owner_command_reply('capability', _founder_permission_command(message)) if mode == 'staff' else None''')
    elif name == 'database.py':
        for name, signature in [('mute_master','telegram_chat_id: int, hours: float'),('unmute_master','telegram_chat_id: int'),('add_salon_rule','rule_text: str, created_by=None'),('deactivate_salon_rule','rule_id: int')]:
            source=replace_function(source,name,f"def {name}({signature}):\n    raise PermissionError('canonical_A22_confirmed_configuration_required')")
        source=replace_function(source,'is_master_muted','''def is_master_muted(telegram_chat_id: int) -> bool:
    from canonical_governed_settings import telegram_muted
    return telegram_muted(telegram_chat_id)''')
        source=replace_function(source,'list_salon_rules','''def list_salon_rules(active_only: bool = True, limit: int = 40) -> list:
    from canonical_governed_settings import rules
    return rules(limit)''')
        for function in ['get_setting','set_setting']:
            node = next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name==function)
            lines=source.splitlines(keepends=True); i=node.body[0].end_lineno
            source=''.join(lines[:i])+"    from canonical_governed_settings import reject_legacy_setting_key\n    reject_legacy_setting_key(key)\n"+''.join(lines[i:])
    elif name == 'masters_ai.py':
        source=replace_function(source,'get_current_provider','''def get_current_provider() -> str | None:
    from canonical_governed_settings import provider
    return provider()''')
        source=replace_function(source,'set_current_provider','''def set_current_provider(provider: str) -> bool:
    raise PermissionError('canonical_A22_confirmed_configuration_required')''')
        old='    provider = get_current_provider()\n    prompt = _format_history_for_ai(history, current_record)'
        if source.count(old)!=1: raise ValueError('R11 exact advice provider entry required')
        source=source.replace(old,"    provider = get_current_provider()\n    if provider not in SUPPORTED_PROVIDERS:\n        return None, 'unavailable'\n    prompt = _format_history_for_ai(history, current_record)")
    elif name == 'maya_capabilities.py':
        source=replace_function(source,'is_enabled','''def is_enabled(code: str) -> bool:
    from canonical_governed_settings import client_history_enabled
    _definition(code)
    return client_history_enabled()''')
        source=replace_function(source,'set_enabled','''def set_enabled(code: str, enabled: bool, actor_id: int) -> dict:
    raise PermissionError('canonical_A22_confirmed_configuration_required')''')
    else:
        raise ValueError('R11 file not allowlisted')
    ast.parse(source)
    return source


def apply(directory, helper):
    directory=Path(directory)
    names=['canonical_staff_access.py','bot.py','webhook_server.py','database.py','masters_ai.py','maya_capabilities.py']
    staged={name:transform(name,(directory/name).read_text()) for name in names}
    for name, source in staged.items(): (directory/name).write_text(source)
    (directory/'canonical_governed_settings.py').write_text(Path(helper).read_text())


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('directory');parser.add_argument('helper')
    args=parser.parse_args();apply(args.directory,args.helper)
