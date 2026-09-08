import ast
import os
from pathlib import Path
import unittest
import package5_operational_delivery_runtime_guard as guard
ROOT=Path(os.environ.get('MAYA_R06_PROOF_ROOT',Path(__file__).parent))
class OperationalDeliveryProof(unittest.TestCase):
    def test_whole_known_producer_closure(self):self.assertEqual(guard.scan(ROOT),[])
    def test_pre_and_post_admission_effect_mutants(self):
        source=(ROOT/'webhook_server.py').read_text();n=guard.functions(source)['_process_record_create'];lines=source.splitlines(keepends=True)
        for position in [n.body[0].lineno-1,n.end_lineno]:
            for body in ["    await bot.send_message(raw_chat_id, 'message')\n","    from legacy import send as alias\n    await alias()\n","    db.mark_record_notified(record_id)\n"]:
                changed=''.join(lines[:position])+body+''.join(lines[position:]);self.assertTrue(guard.scan(ROOT,{'webhook_server.py':changed}))
    def test_retired_jobs_cannot_delegate_or_mark_sent(self):
        source=(ROOT/'bot.py').read_text();n=guard.functions(source)['_god_watch_job'];lines=source.splitlines(keepends=True);changed=''.join(lines[:n.body[0].lineno-1])+"    await delegated_sender()\n"+''.join(lines[n.body[0].lineno-1:]);self.assertTrue(guard.scan(ROOT,{'bot.py':changed}))
    def test_generic_inbox_cannot_accept_arbitrary_payload(self):
        source=(ROOT/'maya_inbox_bridge.py').read_text();n=guard.functions(source)['publish_inbox_item'];lines=source.splitlines(keepends=True);changed=''.join(lines[:n.body[0].lineno-1])+"    await http.post('/inbox', json=payload)\n"+''.join(lines[n.body[0].lineno-1:]);self.assertTrue(guard.scan(ROOT,{'maya_inbox_bridge.py':changed}))
    def test_no_new_source_marker_owner(self):self.assertTrue(guard.scan(ROOT,{'new_worker.py':"def tick(db):\n    db.mark_lead_alerted(1)\n"}))
if __name__=='__main__':unittest.main()
