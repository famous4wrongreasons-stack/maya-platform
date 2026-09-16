"""K14 — the Telegram command probe, READ ONLY, over the canonical tree.

Replaces a first ledger that hard-coded the owner's Desktop working copy. That copy predates the R02
staff-principal cutover, so every figure it produced ("0 commands into an unreachable body",
"mute_master and scan_and_alert LIVE") described a tree production does not run.

What this reads, per command, from the canonical "ai администратор" tree:
  - the registration site (CommandHandler) and the handler's definition;
  - one level of same-file helpers, so a gate inside a helper is not missed;
  - the authority gate: canonical_staff_access.{is_admin,master_projection,is_staff}. Those read a
    ContextVar that only the aiohttp middleware sets (canonical_staff_access.py, "Native Telegram
    updates carry no accepted Maya session. They never acquire this context."), while the bot runs
    start_polling — so a command gated on them executes into a body it can never enter;
  - the body-level fences, read with an AST at their definition (first statement raises or returns).

Usage: python3 k14-telegram-probe.py <path to "ai администратор">   (prints JSON)
"""
import ast, json, os, re, sys
T = sys.argv[1]
def src(f):
    p = os.path.join(T, f)
    return open(p, encoding='utf8').read() if os.path.exists(p) else ''
bot = src('bot.py')
tree = ast.parse(bot)
funcs = {n.name: n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
def seg(n): return ast.get_source_segment(bot, n) or ''
def calls(n):
    out = set()
    for c in ast.walk(n):
        if isinstance(c, ast.Call):
            try: out.add(ast.unparse(c.func))
            except Exception: pass
    return out
def closure(name, depth=2):
    seen, frontier = {name}, [name]
    for _ in range(depth):
        nxt = []
        for f in frontier:
            for c in calls(funcs[f]):
                if c in funcs and c not in seen and not c.startswith('cmd_'):
                    seen.add(c); nxt.append(c)
        frontier = nxt
    return seen
def fence_state(file, name):
    s = src(file)
    if not s: return 'ABSENT', 'file absent'
    t = ast.parse(s)
    for n in ast.walk(t):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name:
            body = [b for b in n.body if not (isinstance(b, ast.Expr) and isinstance(getattr(b, 'value', None), ast.Constant))]
            body = [b for b in body if not isinstance(b, ast.Delete)]
            first = body[0] if body else None
            if isinstance(first, ast.Raise): return 'FENCED', f'{file}:{first.lineno} first statement raises: {ast.unparse(first)[:90]}'
            if isinstance(first, ast.Return):
                txt = ast.unparse(first)
                if 'disabled' in txt or 'retired' in txt or txt.strip() in ('return False',):
                    return 'FENCED', f'{file}:{first.lineno} first statement returns: {txt[:90]}'
            return 'LIVE', f'{file}:{n.lineno} body performs work (first stmt line {first.lineno if first else "-"})'
    return 'ABSENT', 'no definition'
FENCES = [('mute_master','database.py'),('unmute_master','database.py'),('run_loyalty_job','loyalty.py'),('run_backfill_job','loyalty.py'),('scan_and_alert','lead_alerts.py'),('can_redeem_codes','database.py'),('set_cashier_role','database.py')]
fences = {n: dict(zip(('state','why'), fence_state(f, n))) for n, f in FENCES}
reg = [(m.group(1), m.group(2), bot[:m.start()].count('\n')+1) for m in re.finditer(r'CommandHandler\("([a-z_]+)"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)', bot)]
csa_present = 'canonical_staff_access' in bot
rows = []
for cmd, h, regline in reg:
    fn = funcs.get(h)
    names = closure(h) if fn else set()
    text = '\n'.join(seg(funcs[x]) for x in names)
    gate = []
    for pat, lab in [(r'canonical_staff_access\.is_admin\(', 'csa.is_admin'), (r'canonical_staff_access\.master_projection\(', 'csa.master_projection'), (r'canonical_staff_access\.is_staff\(', 'csa.is_staff'), (r'database\.is_admin\(', 'db.is_admin'), (r'database\.get_master_by_chat_id\(|database\.is_master\(', 'db.master')]:
        if re.search(pat, text): gate.append(lab)
    reached = [n for n in fences if re.search(r'\b' + n + r'\(', text)]
    links = sorted(set(re.findall(r'https://malesthetic\.pro/app/\?[A-Za-z_=&-]+', text)))
    rows.append(dict(command=cmd, handler=h, registered_at=f'bot.py:{regline}', defined_at=f'bot.py:{fn.lineno}' if fn else None,
                     helpers=sorted(names - {h}), gate=gate,
                     unreachable_under_polling=any(g.startswith('csa.') for g in gate),
                     fences_reached=reached, fenced_reached=[n for n in reached if fences[n]['state']=='FENCED'],
                     app_url_handoff=('APP_URL' in text) or bool(links) or 'client_handoff_message' in text or 'confirmation_link' in text or 'mute_link' in text or 'confirmation_handoff' in text,
                     query_param_links=links))
out = dict(tree=T, commands=len(rows), canonical_staff_access_in_bot=csa_present, fences=fences,
           unreachable_under_polling=[r['command'] for r in rows if r['unreachable_under_polling']],
           reaching_fenced_body=[r['command'] for r in rows if r['fenced_reached']], rows=rows)
print(json.dumps(out, ensure_ascii=False, indent=1))
