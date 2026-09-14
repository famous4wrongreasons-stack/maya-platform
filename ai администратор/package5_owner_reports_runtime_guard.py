"""R05/B36/B43 complete report initiator and read-only download boundary.
Frozen reviewed AST bodies detect extra writers before/after valid delegation;
closed helper calls cannot be replaced with a compatibility sender.
"""
import ast
import hashlib
import json
from pathlib import Path

def _ast_digest(node):
    # Python 3.14 omits empty AST fields by default; the semantic contract is
    # stable across supported interpreters and never depends on dump formatting.
    def value(item):
        if isinstance(item, ast.AST):
            return [type(item).__name__, {key: value(field) for key, field in ast.iter_fields(item)
                                         if field is not None and field != []}]
        if isinstance(item, list):
            return [value(child) for child in item]
        return item
    return hashlib.sha256(json.dumps(value(node), ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode()).hexdigest()


EXPECTED = {'bot.py': {'_daily_report_job': '893899536d4ac5a40604282d5fa8846e1e1bb6704ab68115fc542ff3f2b8f5d3',
            '_director_briefing_job': '23fc7de4423ff505d222b35d7ffcfea60653268e31a3c70c3db4e4d416375d9f',
            'cmd_admin_pdf': '38973c6bf92b5d4bc62a3b78f7027977daabf3e5a792edd1a7d906874358c54f'},
 'canonical_report_download.py': {'_render': '1d9ccf2be361b62c8901ffb40fcb7fcd3488952ddedf1d04d06ad45f3d7d4f21',
                                  'report_snapshot': '9d817c7d58a5050b3f5c87aa8099b78a858fcd1dae12ed353e4c8db1a145d737',
                                  'static_help': '9ae812adfedcff9e5ad9d6aa7a3d43ddc3c0de6f38a9213b3ad973f3c6f523c4'},
 'maya_inbox_bridge.py': {'trigger_owner_daily_report': 'ae404c3082822af541c278131029dd08799997503b15d6386d201fa32d9ea997',
                          'trigger_owner_report': '6aeee4372c0c907335120ca71600f5a83b4b573250d3db36569ddc2a6d30caa1'},
 'webhook_server.py': {'_send_growth_role_briefs_once': 'cf3f9f5aa25065e15af469835a452d3a6978ae09105cdff35555cb107bb8946c',
                       '_send_master_day_briefs_once': '01fb6ef187f659728a5fdbbe3dd5766c7b7fe26ea5e0f084b84ae40d6254c504',
                       'panel_report_pdf_handler': 'a929e9394b47786ed52ff7033b23d86aa15385fe20cd7de7ab140a0033ad46c0'}}

def scan(root, overrides=None):
    root = Path(root)
    sources = {p.name:p.read_text() for p in root.glob('*.py') if not p.name.startswith(('test_', 'package5_'))}
    sources.update(overrides or {})
    errors = []
    for filename, expected in EXPECTED.items():
        nodes = {n.name:n for n in ast.parse(sources.get(filename, '')).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
        for name, digest in expected.items():
            node = nodes.get(name)
            observed = _ast_digest(ast.Module(body=node.body,type_ignores=[])) if node else None
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
