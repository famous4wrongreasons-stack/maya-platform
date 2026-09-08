import asyncio
from datetime import datetime,timezone
import os
from pathlib import Path
import sys
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch
import canonical_expense_intake as bridge
import package5_expense_intake_runtime_guard as guard

class ExpenseProof(unittest.TestCase):
 def test_production_paths_and_indirect_mutants(self):
    root=Path(os.environ.get('MAYA_RC_PYTHON_CANDIDATE',Path(__file__).parent));self.assertEqual(guard.scan(root),[])
    for file,bad in [('database.py',"def bypass(conn):\n conn.execute('DELETE FROM salon_expenses WHERE date = 1')\n"),('bot.py','async def extra(ctx):\n fn = database.add_salon_expense\n fn()\n'),('webhook_server.py','def false_total():\n return DAILY_EXTRA_EXPENSES\n')]:self.assertTrue(guard.scan(root,{file:(root/file).read_text()+'\n'+bad}))
 def message(self,**changes):
    m=NS(from_user=NS(id=123,is_bot=False),chat=NS(id=123,type='private'),message_id=456,date=datetime.now(timezone.utc),text='/rashod 2026-09-08 | supplies | 12.34 | весь бизнес',reply_to_message=None,forward_origin=None,forward_date=None);vars(m).update(changes);return m
 def test_sender_forward_and_explicit_source(self):
    with patch.dict(sys.modules,{'config':NS(YCLIENTS_COMPANY_ID='synthetic')}):
     value=bridge.source_body(self.message());self.assertEqual(value['senderId'],value['chatId']);self.assertEqual(value['mode'],'standalone');self.assertIsNone(value['reminderRunId'])
     for m in [self.message(chat=NS(id=124,type='private')),self.message(forward_origin=object()),self.message(text='12.34 кофе'),self.message(from_user=NS(id=123,is_bot=True))]:
      with self.assertRaises(ValueError):bridge.source_body(m)
 def test_command_help_never_arms_next_message_or_creates_capsule(self):
    replies=[]
    class Message:
     text='/rashod'
     async def reply_text(self,text):replies.append(text)
    with patch.object(bridge,'_capsule',side_effect=AssertionError('No source call for missing input')):asyncio.run(bridge.initiate(NS(effective_message=Message())))
    self.assertEqual(len(replies),1);self.assertIn('подтверждения',replies[0])
 def test_report_unavailable_and_recorded_only_never_imply_complete(self):
    import canonical_staff_access
    p={'tenantId':'t','role':'tenant_owner'}
    response=NS(status_code=200,json=lambda:{'contract':'maya.expense-period-projection/1','tenantId':'t','day':'2026-09-08','readOnly':True,'ledger':{'totals_basis':'all_recorded_expenses_in_scope','totals':[{'currency':'RUB','amount_kopecks':1234}],'items':[],'truncated':False},'declaration':None,'completeness':'RECORDED_ONLY'})
    with patch.object(canonical_staff_access,'current',return_value=p),patch.object(canonical_staff_access,'current_credential',return_value='synthetic'),patch.dict(sys.modules,{'requests':NS(get=lambda *a,**kw:response)}):
     value=bridge.expense_report('2026-09-08');self.assertIsNone(value['total']);self.assertEqual(value['recorded_total'],12.34);self.assertEqual(value['completeness'],'RECORDED_ONLY')
    with patch.object(canonical_staff_access,'current',return_value=None):self.assertEqual(bridge.expense_report('2026-09-08')['completeness'],'UNAVAILABLE')

if __name__=='__main__':unittest.main()
