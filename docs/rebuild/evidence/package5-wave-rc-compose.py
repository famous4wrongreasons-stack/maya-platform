"""Compose bounded approved R-C overlays over hash-verified production sources.
Local release-artifact construction only: no application imports or remote I/O.
"""
import argparse, ast, base64, hashlib, importlib.util, json, shutil, subprocess, sys
from pathlib import Path

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m

def replace_function(source, canonical, name, allow_new=False):
    def find(text): return [n for n in ast.parse(text).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))and n.name==name]
    before,after=find(source),find(canonical);assert len(after)==1,name
    new=ast.get_source_segment(canonical,after[0])+'\n\n'
    if not before:
        assert allow_new,name;return source+'\n\n'+new
    assert len(before)==1,name
    n=before[0];lines=source.splitlines(keepends=True)
    return ''.join(lines[:n.lineno-1])+new+''.join(lines[n.end_lineno:])

def main():
    p=argparse.ArgumentParser();p.add_argument('--repository',type=Path,required=True);p.add_argument('--evidence-root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--node',required=True);a=p.parse_args()
    repo,ev,out=a.repository.resolve(),a.evidence_root.resolve(),a.output.resolve();assert not out.exists()
    tools=repo/'docs/rebuild/evidence';canonical=repo/'ai администратор';base=ev/'production-python-baseline';stage=out/'python';edge=out/'edge';stage.mkdir(parents=True);edge.mkdir()
    meta=json.loads((ev/'production-metadata-preflight.json').read_text());assert meta['release']=='/opt/maya-saas/releases/20260908-a18-security-consent-0867ecea'
    for f in base.glob('*.py'):
        assert sha(f)==meta['pythonHashes'][f.name],f.name;shutil.copy2(f,stage/f.name)
    # Existing package overlays preserve the unowned production variant bodies.
    load(tools/'package5-wave-rc-r06-python-overlay.py','compose_r06').apply(stage,canonical/'canonical_operational_alerts.py')
    load(tools/'package5-wave-rc-r08-python-overlay.py','compose_r08').apply(stage)
    load(tools/'package5-wave-rc-r09-python-overlay.py','compose_r09').apply(stage)
    for package,helper in [('r11','canonical_governed_settings.py'),('r12','canonical_team_communications.py'),('r13','canonical_expense_intake.py'),('r14','canonical_cash_declaration.py')]:
        load(tools/f'package5-wave-rc-{package}-python-overlay.py','compose_'+package).apply(stage,canonical/helper)
    # R05 complete reviewed functions include the B36 runtime held out of R-A/R-B.
    r05={'bot.py':['_daily_report_job','_director_briefing_job','cmd_admin_pdf'],
         'maya_inbox_bridge.py':['trigger_owner_daily_report','trigger_owner_report'],
         'webhook_server.py':['_send_growth_role_briefs_once','_send_master_day_briefs_once','panel_report_pdf_handler']}
    for name,functions in r05.items():
        source=(stage/name).read_text()
        for fn in functions: source=replace_function(source,(canonical/name).read_text(),fn,fn in {'trigger_owner_report','trigger_owner_daily_report'})
        (stage/name).write_text(source)
    # Existing R06 entry: await the verified fact before any bounded alert trigger.
    name='webhook_server.py';source=(stage/name).read_text();target=(canonical/name).read_text()
    handlers=[n.name for n in ast.parse(target).body if isinstance(n,ast.AsyncFunctionDef)and 'maya_shadow_bridge.forward_delivery' in ast.get_source_segment(target,n)]
    assert len(handlers)==1;source=replace_function(source,target,handlers[0]);(stage/name).write_text(source)
    # R08 removes only the exact obsolete next-message correlation block.
    source=(stage/'bot.py').read_text();nodes=[]
    for n in ast.walk(ast.parse(source)):
        if isinstance(n,ast.If)and 'pending_review_comment_id' in ast.unparse(n.test):nodes.append(n)
    lines=source.splitlines(keepends=True)
    for n in sorted(nodes,key=lambda n:n.lineno,reverse=True):lines[n.lineno-1:n.end_lineno]=[]
    (stage/'bot.py').write_text(''.join(lines))
    # New standalone helpers/ratchets; no production test/config artifacts copied.
    for f in canonical.glob('*.py'):
        if f.name.startswith('test_'):continue
        if f.name=='package4_value_runtime_guard.py' or f.name.startswith(('canonical_report_download','canonical_public_community','package5_wave_rc_guard_contracts')) or (f.name.startswith('package5_')and f.name not in meta['pythonHashes']):shutil.copy2(f,stage/f.name)
    for f in stage.glob('*.py'):ast.parse(f.read_text())
    # Fail composition if any package owner or the preserved prior owner rejects it.
    guard_map={'package4_value_runtime_guard.py':'scan_runtime','package5_control_plane_runtime_guard.py':'scan_runtime','package5_bulk_runtime_guard.py':'scan_bulk_sources','package5_staff_authority_guard.py':'scan_staff_authority','package5_staff_schedule_guard.py':'scan_staff_schedule','package5_operational_work_runtime_guard.py':'scan_operational_work','package5_retention_runtime_guard.py':'scan_retention_sources',**{f'package5_{n}_runtime_guard.py':'scan'for n in ['owner_reports','operational_delivery','native_feedback','public_community','governed_settings','team_communications','expense_intake','cash_declaration']}}
    sys.path.insert(0,str(stage));guards=[]
    for name,fn in guard_map.items():
        m=load(stage/name,'candidate_'+Path(name).stem);errors=getattr(m,fn)(stage);assert not errors,(name,[str(e)for e in errors]);guards.append({'file':name,'function':fn,'sha256':sha(stage/name)})
    rows=[]
    for f in sorted(stage.glob('*.py')):
        before=meta['pythonHashes'].get(f.name)
        if before!=sha(f):rows.append({'file':f.name,'artifact':f.name,'destination':'/home/botadmin/barbershop-bot/'+f.name,'before':before,'after':sha(f)})
    (out/'python-manifest.json').write_text(json.dumps({'wave':'R-C','baselineBackendRelease':Path(meta['release']).name,'kind':'python','files':rows,'guards':guards},indent=2)+'\n')
    # Current exact aliases include the approved security-consent overlay.
    aliases=json.loads((ev/'edge-current.private.json').read_text());edge_rows=[]
    for idx,item in enumerate(aliases+[{'target':'vps/app.html','path':'/var/www/maya-platform/app.html','sha256':sha(base/'app.html'),'sourceBase64':base64.b64encode((base/'app.html').read_bytes()).decode()}]):
        raw=base64.b64decode(item['sourceBase64']);assert hashlib.sha256(raw).hexdigest()==item['sha256'];dest=edge/('candidate-'+str(idx)+Path(item['path']).suffix);dest.write_bytes(raw)
        if dest.suffix=='.html':
            for package in ['r05','r11','r14','r08','r09','r12','r13']:
                script="const fs=require('fs'),m=require(process.argv[1]),p=process.argv[2];fs.writeFileSync(p,m.transform(fs.readFileSync(p,'utf8'),process.argv[3]));"
                subprocess.run([a.node,'-e',script,str(tools/f'package5-wave-rc-{package}-pwa-overlay.cjs'),str(dest),str(repo)],check=True)
        else:
            # R08/R12 address the two generic API switch variants only.
            if "case 'notify_prefs':" in dest.read_text():dest.write_text(load(tools/'package5-wave-rc-r08-php-overlay.py','rc_php_r08').transform(dest.read_text()))
            if 'function team_media_dir(): string {' in dest.read_text():dest.write_text(load(tools/'package5-wave-rc-r12-php-overlay.py','rc_php_r12').transform(dest.read_text()))
        edge_rows.append({'file':item['target'],'artifact':dest.name,'destination':item['path'],'before':item['sha256'],'after':sha(dest)})
    # R08/R09 fixed relays/public consumer and R12 exact legacy media subtree.
    aux=json.loads((ev/'edge-auxiliary.private.json').read_text())
    for item in aux:
        if item['file']=='app/media/.htaccess':continue # unrelated parent controls preserved
        raw=base64.b64decode(item['sourceBase64']);assert hashlib.sha256(raw).hexdigest()==item['sha256']
        if item['file'].endswith('package5-client-consent-proxy.php'):
            dest=edge/'package5-client-consent-proxy.php';shutil.copy2(repo/'maya-saas-backend/deploy/vps/package5-client-consent-proxy.php',dest)
        elif item['file'].endswith('site-community-proxy.php'):
            dest=edge/'site-community-proxy.php';shutil.copy2(repo/'maya-saas-backend/deploy/platform/beget-edge/rc/r09-site-community-proxy.php',dest)
        else:
            dest=edge/'r09-public-community-chunk.js';before=edge/'r09-public-community-base.js';before.write_bytes(raw)
            subprocess.run([a.node,str(tools/'package5-wave-rc-r09-public-overlay.cjs'),str(before),str(dest)],check=True)
        edge_rows.append({'file':'salon/'+item['file'],'artifact':dest.name,'destination':item['path'],'before':item['sha256'],'after':sha(dest)})
    denial=json.loads((ev/'team-media-denial-before.json').read_text());dest=edge/'r12-team-media.htaccess'
    shutil.copy2(repo/'maya-saas-backend/deploy/platform/beget-edge/rc/r12-legacy-team-media.htaccess',dest)
    edge_rows.append({'file':'salon/'+denial['file'],'artifact':dest.name,'destination':denial['path'],'before':denial['sha256'],'after':sha(dest)})
    (out/'edge-manifest.json').write_text(json.dumps({'wave':'R-C','kind':'edge','files':edge_rows},indent=2)+'\n')
    result={'status':'PASS','pythonChanges':len(rows),'pythonGuards':len(guards),'edgeAliases':len(edge_rows),'productionWrites':0};(out/'composition.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':main()
