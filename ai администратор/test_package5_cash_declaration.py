import ast
import os
from pathlib import Path
import unittest
import package5_cash_declaration_runtime_guard as guard
import canonical_cash_declaration as helper
ROOT=Path(os.environ.get('MAYA_R14_PROOF_ROOT',Path(__file__).parent))


class CashProof(unittest.TestCase):
    def test_all_inventoried_writers_and_report(self):self.assertEqual(guard.scan(ROOT),[])
    def test_negative_aliased_writers_before_and_after_handoff(self):
        source=(ROOT/'bot.py').read_text();node=guard.functions(source)['cmd_kassa'];lines=source.splitlines(keepends=True)
        for position in [node.body[0].lineno-1,node.end_lineno]:
            changed=''.join(lines[:position])+"    from database import set_cash_log as writer\n    writer('2026-09-08', 1, 2)\n"+''.join(lines[position:])
            self.assertTrue(guard.scan(ROOT,{'bot.py':changed}))
    def test_negative_sql_writer_any_module(self):
        self.assertTrue(guard.scan(ROOT,{'invented.py':"def bypass(db):\n    db.execute('INSERT OR REPLACE INTO cash_log VALUES (?)', [1])\n"}))
    def test_false_reconciliation_negative_fixture(self):
        source=(ROOT/'webhook_server.py').read_text().replace('    cash_reported = None','    cash_reported = None\n    _cash_expected = revenue - expenses\n',1)
        self.assertTrue(guard.scan(ROOT,{'webhook_server.py':source}))
    def test_handoff_has_no_raw_identity_or_default_count(self):
        self.assertIn('?cash_declaration=1',helper.confirmation_handoff());value=helper.report_unavailable();self.assertEqual(value['state'],'UNAVAILABLE');self.assertFalse(value['reconciled']);self.assertNotIn('amount',value)


if __name__=='__main__':unittest.main()
