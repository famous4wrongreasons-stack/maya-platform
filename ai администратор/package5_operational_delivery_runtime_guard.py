"""R06 permanent producer/closure and effect-before-admission ratchet."""
import ast
from package5_wave_rc_guard_contracts import contract
from pathlib import Path


def functions(source):return {n.name:n for n in ast.parse(source).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
def calls(node):return {ast.unparse(n.func) for n in ast.walk(node) if isinstance(n,ast.Call)}

def expected():
    return contract("r06").BODIES


def scan(root,overrides=None):
    root=Path(root);sources={p.name:p.read_text() for p in root.glob('*.py') if not p.name.startswith(('test_','package5_'))};sources.update(overrides or {});errors=[]
    for filename,bodies in expected().items():
        if filename=='site_community.py' and filename not in sources:continue
        if filename not in sources:errors.append('missing '+filename);continue
        actual=functions(sources[filename])
        for name,body in bodies.items():
            target=actual.get(name);candidate=ast.parse('async def reference():\n'+''.join('    '+line+'\n' for line in body.splitlines())).body[0]
            if not target or ast.dump(ast.Module(body=target.body,type_ignores=[]))!=ast.dump(ast.Module(body=candidate.body,type_ignores=[])):errors.append(filename+': '+name+' canonical handoff/retirement changed')
    source=sources['webhook_server.py'];handler=next(n for n in functions(source).values() if 'maya_shadow_bridge.forward_delivery' in calls(n))
    serialized=ast.unparse(handler)
    if serialized.index('maya_shadow_bridge.forward_delivery')>serialized.index('_process_record_create'):errors.append('effect before canonical fact ingestion')
    if not any(isinstance(n,ast.Await) and isinstance(n.value,ast.Call) and ast.unparse(n.value.func)=='maya_shadow_bridge.forward_delivery' for n in ast.walk(handler)):errors.append('canonical fact admission not awaited')
    if not any(isinstance(n,ast.If) and '_webhook_secret_ok' in ast.unparse(n.test) for n in handler.body):errors.append('webhook missing transport verification')
    trigger=functions(sources['canonical_operational_alerts.py'])['trigger'];text=ast.unparse(trigger)
    if trigger.args.args or 'http://127.0.0.1:3107/api/internal/legacy/operational-alerts/tick' not in text:errors.append('unbounded alert trigger')
    for name,source in sources.items():
        tree=ast.parse(source)
        if any(isinstance(n,ast.Call) and ast.unparse(n.func).endswith(('mark_lead_alerted','mark_waitlist_admin_notified','_send_reminder')) for n in ast.walk(tree)):errors.append(name+': retired delivery/marker is reachable')
    return errors

if __name__=='__main__':
    import json,sys
    errors=scan(sys.argv[1] if len(sys.argv)>1 else Path(__file__).parent);print(json.dumps({'package':'R06','result':'FAIL' if errors else 'PASS','errors':errors}));sys.exit(bool(errors))
