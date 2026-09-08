import ast
import asyncio
import os
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import canonical_report_download as download
import package5_owner_reports_runtime_guard as guard

ROOT=Path(os.environ.get('MAYA_RC_PYTHON_CANDIDATE',Path(__file__).parent))
class OwnerReportsProof(unittest.TestCase):
 def test_complete_report_boundaries_and_mutants(self):
  self.assertEqual(guard.scan(ROOT),[])
  for filename,names in guard.EXPECTED.items():
   source=(ROOT/filename).read_text();nodes={n.name:n for n in ast.parse(source).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
   for name in names:
    node=nodes[name];lines=source.splitlines(keepends=True)
    for position in [node.body[0].lineno-1,node.end_lineno]:
     for bad in ["    await direct_send()\n","    db.execute('UPDATE business SET value=1')\n","    from external import sender as alias\n    alias()\n"]:
      self.assertTrue(guard.scan(ROOT,{filename:''.join(lines[:position])+bad+''.join(lines[position:])}))
 def test_exact_authorized_snapshot_and_no_transport_mutation(self):
  calls=[];state={'status':200,'snapshot':{'contract':'maya.owner-report-snapshot/1','runId':'run-a','content':{'title':'Snapshot','bodyText':'Stored only'},'periodLocalDate':'2026-09-08','timezone':'Europe/Moscow'}}
  class Response:
   async def __aenter__(self): self.status=state['status'];return self
   async def __aexit__(self,*args): pass
   async def json(self):return state['snapshot']
  class Session:
   def __init__(self,**kw):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*args):pass
   def get(self,url,**kw):calls.append((url,kw));return Response()
  fake=types.SimpleNamespace(ClientSession=Session,ClientTimeout=lambda **kw:None)
  with patch.dict('sys.modules',{'aiohttp':fake}),patch.object(download,'_render',return_value={'snapshot_only':True}) as render:
   self.assertEqual(asyncio.run(download.report_snapshot('canonical-credential','run-a')),{'snapshot_only':True})
   self.assertEqual(calls[0][0],'http://127.0.0.1:3107/api/owner-reports/run-a/snapshot');self.assertEqual(calls[0][1]['headers']['Authorization'],'Bearer canonical-credential')
   state['status']=403
   with self.assertRaises(ValueError):asyncio.run(download.report_snapshot('wrong','run-a'))
   state['status']=200;state['snapshot']['runId']='other'
   with self.assertRaises(ValueError):asyncio.run(download.report_snapshot('canonical-credential','run-a'))
   with self.assertRaises(ValueError):asyncio.run(download.report_snapshot('canonical-credential','../../other'))
   self.assertEqual(render.call_count,1)
if __name__=='__main__':unittest.main()
