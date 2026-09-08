"""R05/B36/B43 complete report initiator and read-only download boundary.
Frozen reviewed AST bodies detect extra writers before/after valid delegation;
closed helper calls cannot be replaced with a compatibility sender.
"""
import ast
import hashlib
from pathlib import Path

EXPECTED = {'bot.py': {'_director_briefing_job': 'd0c14c498995d0f416b841fd968d9f68873ab272fbe27ae8eb55b3199e904476',
            'cmd_admin_pdf': 'b2a98b2666879576d402def60adf85d4732d4052492ccacf523e85866f884236'},
 'canonical_report_download.py': {'_render': '6194d82235a7c7cb2f6bea3475f56d4ae7f7b2c6f1e6c15d5caefeaf471722ca',
                                  'report_snapshot': '090aaa6bbb57cd78eb04e0af1cf29f3d7b2fb75af248c3896cb78775ff61026a',
                                  'static_help': '6468e73035330afa636d754ab39e42fdf1c0f57401b116351dacc44a136598f6'},
 'maya_inbox_bridge.py': {'trigger_owner_daily_report': '10e9db63924ca62b5099b79e13a9ea900362a13dc592f17dce48b8aa96d49c3a',
                          'trigger_owner_report': '71798fda42cc723abe0b5090f23e9a3fda3e00981f9c7c19916abe3c270b115b'},
 'webhook_server.py': {'_send_growth_role_briefs_once': '351f112f2328ba6cfe86f78bae5abeef20e7c89ac198111d3a5f9511c553467f',
                       '_send_master_day_briefs_once': '225b0f3389994d8bd354aaaef7001ca5b2a418c77b45450d1e462dbb912b1bfa',
                       'panel_report_pdf_handler': '438434e8308abdbb12c2f3598a1be150fb6a530544f68754e7cd3dad882d3866'}}

def scan(root, overrides=None):
    root = Path(root)
    sources = {p.name:p.read_text() for p in root.glob('*.py') if not p.name.startswith(('test_', 'package5_'))}
    sources.update(overrides or {})
    errors = []
    for filename, expected in EXPECTED.items():
        nodes = {n.name:n for n in ast.parse(sources.get(filename, '')).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
        for name, digest in expected.items():
            node = nodes.get(name)
            observed = hashlib.sha256(ast.dump(ast.Module(body=node.body,type_ignores=[])).encode()).hexdigest() if node else None
            if observed != digest: errors.append(filename+': '+name+' report ownership changed')
    renderer = ast.parse(sources.get('canonical_report_download.py', ''))
    for node in ast.walk(renderer):
        if isinstance(node, ast.Call):
            call = ast.unparse(node.func)
            if call.endswith(('.post','.put','.delete','.execute','.executemany','.send_message','.send_document','.unlink','.write_bytes','.write_text')):
                errors.append('report download owns a mutation: '+call)
    return errors

if __name__ == '__main__':
    import json,sys
    errors=scan(sys.argv[1] if len(sys.argv)>1 else Path(__file__).parent)
    print(json.dumps({'package':'R05','result':'FAIL' if errors else 'PASS','errors':errors}));sys.exit(bool(errors))
