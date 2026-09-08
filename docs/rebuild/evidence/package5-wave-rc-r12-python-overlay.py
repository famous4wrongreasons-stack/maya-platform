"""Bounded B53/B58 overlay of both inventoried Python variants. No deployment."""
import ast
from pathlib import Path

BODIES = {
 'bot.py': {'cmd_clear': '''async def cmd_clear(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text("Серверная история сохранена. Удаление общей истории через /clear недоступно.")'''},
 'database.py': {},
 'webhook_server.py': {
  '_push_team_message': '''async def _push_team_message(*args, **kwargs):
    raise PermissionError('canonical_TeamMessage_Communication_Delivery_required')''',
  '_team_chat_mark_media_expiry': '''def _team_chat_mark_media_expiry(messages):
    raise PermissionError('canonical_private_team_media_required')''',
  'team_chat_normalize_voice_handler': '''async def team_chat_normalize_voice_handler(request: web.Request) -> web.Response:
    from canonical_team_communications import retired
    return _cabinet_response(retired(), status=410)''',
 }
}
for name in ['_staff_messages_ensure','add_staff_message','get_staff_messages_since','get_staff_messages_recent','get_staff_latest_message_id','delete_staff_message']:
    BODIES['database.py'][name] = f"def {name}(*args, **kwargs):\n    raise PermissionError('canonical_TeamMessage_owner_required')"
for name,operation in [('team_chat_send_handler','send'),('team_chat_delete_handler','withdraw'),('team_chat_fetch_handler','feed'),('team_chat_upload_auth_handler','reserve')]:
    BODIES['webhook_server.py'][name] = f"async def {name}(request: web.Request) -> web.Response:\n    from canonical_team_communications import handle\n    return await handle(request, '{operation}')"


def transform(name, source):
    if name not in BODIES:
        raise ValueError('R12 file outside approved overlay')
    for function, replacement in BODIES[name].items():
        nodes=[n for n in ast.parse(source).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==function]
        if len(nodes)!=1:raise ValueError('R12 exact known function required: '+function)
        node=nodes[0]; lines=source.splitlines(keepends=True)
        source=''.join(lines[:node.lineno-1])+replacement+'\n\n'+''.join(lines[node.end_lineno:])
    ast.parse(source);return source


def apply(directory, helper):
    directory=Path(directory)
    result={name:transform(name,(directory/name).read_text()) for name in BODIES}
    for name,source in result.items():(directory/name).write_text(source)
    (directory/'canonical_team_communications.py').write_text(Path(helper).read_text())


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('helper');a=p.parse_args();apply(a.directory,a.helper)
