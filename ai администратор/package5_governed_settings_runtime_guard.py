"""R11 permanent whole-function and writer-class guard; no runtime imports."""
import ast
from pathlib import Path
import re

OWNED = {
    'database.py': {'mute_master': {'PermissionError'}, 'unmute_master': {'PermissionError'},
                    'add_salon_rule': {'PermissionError'}, 'deactivate_salon_rule': {'PermissionError'},
                    'is_master_muted': {'telegram_muted'}, 'list_salon_rules': {'rules'}},
    'masters_ai.py': {'get_current_provider': {'provider'}, 'set_current_provider': {'PermissionError'}},
    'maya_capabilities.py': {'is_enabled': {'_definition', 'client_history_enabled'}, 'set_enabled': {'PermissionError'}},
    'webhook_server.py': {'_founder_learning_reply': {'owner_command_reply','_founder_rule_command'},
                          '_founder_permission_reply': {'owner_command_reply','_founder_permission_command'}},
    'bot.py': {'cmd_mute': {'update.effective_message.reply_text','mute_link'},
              'cmd_ai_provider': {'str','str.strip','str.strip.lower','update.effective_message.reply_text','confirmation_link'}},
}


def functions(source):
    return {n.name:n for n in ast.parse(source).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}


def call_name(node):
    if isinstance(node,ast.Name): return node.id
    if isinstance(node,ast.Attribute): return call_name(node.value)+'.'+node.attr
    if isinstance(node,ast.Call): return call_name(node.func)
    return '?'


def validate(sources):
    errors=[]
    for filename,owners in OWNED.items():
        found=functions(sources[filename])
        for name,allowed in owners.items():
            if name not in found: errors.append(filename+': missing '+name);continue
            node=found[name]
            calls={call_name(n.func) for n in ast.walk(node) if isinstance(n,ast.Call)}
            if not calls<=allowed: errors.append(filename+':'+name+': unowned call '+str(sorted(calls-allowed)))
            if any(isinstance(n,(ast.With,ast.AsyncWith,ast.Global,ast.Nonlocal)) for n in ast.walk(node)):
                errors.append(filename+':'+name+': ownership bypass')
            if allowed=={'PermissionError'} and not (len(node.body)==1 and isinstance(node.body[0],ast.Raise)):
                errors.append(filename+':'+name+': retired writer must fail before any work')
    for filename,source in sources.items():
        if filename.startswith(('test_','package5_governed_settings_runtime_guard')):continue
        tree=ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node,ast.Constant) and isinstance(node.value,str) and re.search(r'\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+["\x27`]?salon_rules\b|\bUPDATE\s+masters_telegram\s+SET\s+mute_until\b',node.value,re.I):
                errors.append(filename+': legacy configuration SQL writer')
    database=functions(sources['database.py'])
    for name in ['get_setting','set_setting']:
        statements=database[name].body
        if not (len(statements)>2 and isinstance(statements[2],ast.Expr) and isinstance(statements[2].value,ast.Call) and call_name(statements[2].value.func)=='reject_legacy_setting_key'):
            errors.append('database.py:'+name+': global key fallback not fenced first')
    entry=sources['canonical_governed_settings.py'];found=functions(entry)
    calls={call_name(n.func) for n in ast.walk(found['_read']) if isinstance(n,ast.Call)}
    if calls != {'canonical_staff_access.current_credential','PermissionError','requests.get','response.json','isinstance','ValueError'}:
        errors.append('canonical_governed_settings.py: read transport gained an effect')
    if 'http://127.0.0.1:3107/api/governed-settings/' not in entry or re.search(r'(?:database|yclients)\.|requests\.(?:post|put|patch|delete)|send_message|create_task',entry):
        errors.append('canonical_governed_settings.py: parallel owner or mutable routing')
    principal=sources['canonical_staff_access.py']
    if 'return _principal.get().get(\'credential\') if current() else None' not in principal:
        errors.append('canonical_staff_access.py: credential escaped current request lifetime')
    advice=ast.unparse(functions(sources['masters_ai.py'])['generate_upsell_advice'])
    if "if provider not in SUPPORTED_PROVIDERS:" not in advice or "return (None, 'unavailable')" not in advice:
        errors.append('masters_ai.py: missing tenant provider permits fallback')
    return errors


def scan(root,overrides=None):
    root=Path(root)
    sources={p.name:p.read_text() for p in root.glob('*.py') if not p.name.startswith(('test_','package5_governed_settings_runtime_guard'))}
    sources.update(overrides or {})
    return validate(sources)


if __name__=='__main__':
    import json,sys
    errors=scan(sys.argv[1] if len(sys.argv)>1 else Path(__file__).parent)
    print(json.dumps({'package':'R11','pass':not errors,'errors':errors}));sys.exit(bool(errors))
