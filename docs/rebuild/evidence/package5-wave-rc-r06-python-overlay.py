"""Finite R06 retirement/convergence overlay for certified Python source variants."""
import ast
from pathlib import Path


def replace_body(source,name,body):
    found=[n for n in ast.parse(source).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name]
    if len(found)!=1:raise ValueError('R06 exact producer required: '+name)
    n=found[0];lines=source.splitlines(keepends=True)
    result=''.join(lines[:n.body[0].lineno-1])+''.join('    '+line+'\n' for line in body.splitlines())+''.join(lines[n.end_lineno:]);ast.parse(result);return result


BODIES={
 'bot.py':{
  '_god_watch_job':"return {'status':'retired_no_canonical_operational_occurrence','messages':0}",
  '_dual_role_guard_job':"return {'status':'retired_identity_alert_not_authority','messages':0}",
  '_schedule_reminder':"# Existing B25 scheduler owns canonical Appointment reminder plans.\nreturn None",
  '_send_reminder':"return {'status':'canonical_B25_owner_required','messages':0}",
 },
 'lead_alerts.py':{'scan_and_alert':"return {'checked':0,'alerted':0,'status':'retired_unverified_lead_occurrence'}"},
 'freed_slot.py':{'alert_admins_new_waitlist':"from canonical_operational_alerts import trigger\ntriggered = await trigger()\nreturn {'triggered':triggered,'pending':0,'alerted':0,'authority':'canonical_wanted_interest_only'}"},
 'site_community.py':{'notify_owner':"return False"},
 'webhook_server.py':{
  '_send_shift_reminders_once':"from canonical_operational_alerts import trigger\nawait trigger()\nreturn 0",
  '_process_record_create':"from canonical_operational_alerts import trigger\nawait trigger()\nreturn {'status':'canonical_event_owner_pending','record_id':record_id}",
  '_process_record_update':"from canonical_operational_alerts import trigger\nawait trigger()\nreturn {'status':'canonical_event_owner_pending','record_id':record_id}",
  '_process_record_delete':"from canonical_operational_alerts import trigger\nawait trigger()\nreturn {'status':'canonical_event_owner_pending','record_id':record_id}",
 },
 'maya_inbox_bridge.py':{
  'publish_inbox_item':"# A generic payload cannot prove its business owner or delivery authority.\nreturn False",
  'publish_owner_message':"return False",
 },
}


def apply(directory,helper):
    directory=Path(directory);staged={}
    for name,bodies in BODIES.items():
        path=directory/name
        if not path.exists():
            if name=='site_community.py':continue
            raise ValueError('R06 missing artifact '+name)
        source=path.read_text()
        for name_,body in bodies.items():source=replace_body(source,name_,body)
        staged[path]=source
    for path,source in staged.items():path.write_text(source)
    (directory/'canonical_operational_alerts.py').write_text(Path(helper).read_text())


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('directory');parser.add_argument('helper');args=parser.parse_args();apply(args.directory,args.helper)
