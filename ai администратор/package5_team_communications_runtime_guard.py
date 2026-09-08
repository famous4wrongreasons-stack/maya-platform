"""Permanent R12 writer/delivery/identity/retention boundary, all known Python."""
import ast
import importlib.util
import re
from pathlib import Path


def overlay():
    path=Path(__file__).resolve().parents[1]/'docs/rebuild/evidence/package5-wave-rc-r12-python-overlay.py'
    spec=importlib.util.spec_from_file_location('r12_overlay',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


def scan(root, overrides=None):
    root=Path(root);sources={p.name:p.read_text() for p in root.glob('*.py') if not p.name.startswith(('test_','package5_'))};sources.update(overrides or {});errors=[]
    for filename,bodies in overlay().BODIES.items():
        nodes={n.name:n for n in ast.parse(sources[filename]).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
        for name,body in bodies.items():
            if name not in nodes or ast.dump(nodes[name])!=ast.dump(ast.parse(body).body[0]):errors.append(filename+': '+name+' differs from canonical team boundary')
    retired={'add_staff_message','delete_staff_message','get_staff_messages_since','get_staff_messages_recent','get_staff_latest_message_id','_staff_messages_ensure','_push_team_message','_team_chat_mark_media_expiry'}
    for filename,source in sources.items():
        for node in ast.walk(ast.parse(source)):
            if isinstance(node,ast.Constant) and isinstance(node.value,str) and re.search(r'\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM|(?:CREATE|ALTER)\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+["`]?staff_messages\b',node.value,re.I):errors.append(filename+': legacy team SQL writer/DDL')
            if isinstance(node,ast.Attribute) and node.attr in retired:errors.append(filename+': retired team helper reference')
            if isinstance(node,ast.Name) and isinstance(node.ctx,ast.Load) and node.id in retired:errors.append(filename+': indirect retired team helper reference')
    bridge=sources.get('canonical_team_communications.py','')
    for marker in ['canonical_staff_access.current()',"BASE = 'http://127.0.0.1:3107/api/team-communications'","'Idempotency-Key'","'retry_same_identity_only': True"]:
        if marker not in bridge:errors.append('team adapter missing '+marker)
    if re.search(r'sqlite|\.execute\(|\.unlink\(|os\.remove|send_message|send_document|asyncio\.create_task|while True|for .*range',bridge):errors.append('team adapter owns an effect/retry loop')
    return errors


if __name__=='__main__':
    import json,sys
    errors=scan(sys.argv[1] if len(sys.argv)>1 else Path(__file__).parent);print(json.dumps({'package':'R12','result':'FAIL' if errors else 'PASS','errors':errors}));sys.exit(bool(errors))
