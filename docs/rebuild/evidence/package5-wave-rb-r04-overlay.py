"""Bounded R04 Python overlay. Caller supplies hash-pinned active source.

Apply R03 claude and R07 native overlays separately; R04 owns composed database
and webhook function changes. No file/network/process mutation in transform().
"""
import ast
from pathlib import Path

BODIES = {
 'database.py': ['_ensure_owner_action_journal','create_owner_action','link_owner_control_task_action','finish_owner_action','update_owner_control_task','mark_owner_control_task_delivery','update_owner_assignment_work_state','evaluate_owner_action','list_owner_actions','evaluate_due_owner_actions','mark_subscription_renew_pushed'],
 'owner_ai.py': ['create_control_task','update_control_task','update_staff_task','run_operating_rhythm_tick','run_execution_loop_tick','run_autonomous_director_tick','run_autopilot_supervision_tick','staff_task_inbox'],
 'webhook_server.py': ['panel_control_create_handler','panel_control_update_handler','panel_staff_task_update_handler','panel_staff_tasks_handler','panel_action_evaluate_handler','panel_autonomy_tick_handler','panel_autopilot_supervision_handler','panel_execution_loop_handler','_deliver_owner_control_assignment','maya_operating_rhythm_loop','panel_job_run_handler','_run_owner_job_from_chat'],
}
TOOLS={'run_autonomous_director_tick','run_autopilot_supervision_tick','run_execution_loop_tick','run_operating_rhythm_tick','create_owner_control_task','update_owner_control_task'}


def functions(source):
 return {n.name:n for n in ast.parse(source).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}


def transform(name, source, canonical_root):
 """Return candidate text; preserve every byte outside owned statements/bodies."""
 canonical=(Path(canonical_root)/'ai администратор'/name).read_text()
 lines=source.splitlines(True);edits=[]
 if name in BODIES:
  before=functions(source);after=functions(canonical);newlines=canonical.splitlines(True)
  for key in BODIES[name]:
   node=before[key];replacement=after[key]
   edits.append((node.body[0].lineno-1,node.end_lineno,''.join(newlines[replacement.body[0].lineno-1:replacement.end_lineno])))
 if name=='database.py':
  matches=[]
  for node in ast.walk(ast.parse(source)):
   if isinstance(node,ast.Expr) and isinstance(node.value,ast.Call) and any(isinstance(a,ast.Constant) and isinstance(a.value,str) and 'CREATE TABLE IF NOT EXISTS owner_action_journal' in a.value for a in node.value.args):
    # Only the separate bootstrap script, never another table's DDL.
    if node.lineno < functions(source)['_ensure_owner_action_journal'].lineno:matches.append(node)
  if len(matches)!=1:raise ValueError('Expected exact journal bootstrap statement')
  node=matches[0];edits.append((node.lineno-1,node.end_lineno,'        # R04: historical journal remains untouched; no parallel owner schema.\n'))
 if name=='claude_ai.py':
  for node in ast.walk(ast.parse(source)):
   if isinstance(node,ast.Dict):
    key=next((v.value for k,v in zip(node.keys,node.values) if isinstance(k,ast.Constant) and k.value=='name' and isinstance(v,ast.Constant)),None)
    if key in TOOLS:edits.append((node.lineno-1,node.end_lineno,''))
   if isinstance(node,ast.If) and isinstance(node.test,ast.Compare) and isinstance(node.test.left,ast.Name) and node.test.left.id=='tool_name' and any(isinstance(c,ast.Constant) and c.value in TOOLS for c in node.test.comparators):
    indent=' '*(node.col_offset+4);edits.append((node.body[0].lineno-1,node.body[-1].end_lineno,indent+'import canonical_work_entry\n'+indent+'result = canonical_work_entry.owner_required()\n'))
 for start,end,replacement in sorted(edits,reverse=True):lines[start:end]=[replacement]
 result=''.join(lines)
 if name=='owner_ai.py':
  assert result.count('        database.evaluate_due_owner_actions(limit=5)\n')==2
  result=result.replace('        database.evaluate_due_owner_actions(limit=5)\n','').replace('        journal = database.list_owner_actions(limit=24)','        journal = []  # R04: historical journal is not current operational truth')
 if name=='webhook_server.py':
  old='    return _cabinet_response({"role": info["role"], **payload})'
  assert old in result
  result=result.replace(old,'''    import canonical_work_entry
    tasks = await canonical_work_entry.canonical_request(request, 'list')
    payload['canonical_tasks'] = tasks.get('tasks', [])
    payload['current_user_id'] = tasks.get('current_user_id')
    payload['canonical_task_error'] = tasks.get('error')
    return _cabinet_response({"role": info["role"], **payload})''',1)
 if name=='claude_ai.py':
  result=''.join(line for line in result.splitlines(True) if not any(('→ '+key) in line for key in TOOLS))
  start=result.index('                    "не заменяй его догадкой. create_owner_control_task')
  end=result.index('                    "задачу закрыть или отложить."',start)+len('                    "задачу закрыть или отложить."')
  result=result[:start]+'''                    "не заменяй его догадкой. Поручения создаются в каноническом кабинете MAYA "
                    "для конкретного исполнителя; там можно отметить выполнение своей задачи. "
                    "Автономные задачи, отмена, перенос и смена исполнителя здесь недоступны."'''+result[end:]
 ast.parse(result)
 return result
