"""B22 proof: execute production AST with zero network and a synthetic SQLite history."""
import ast
import asyncio
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from types import SimpleNamespace

from package5_control_plane_runtime_guard import scan_runtime

ROOT = Path(__file__).parent


def load_function(filename, name, env):
    tree = ast.parse((ROOT / filename).read_text())
    node = next(n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    exec(compile(ast.Module(body=[node], type_ignores=[]), filename, 'exec'), env)
    return env[name]


class B22TipRetirementTest(unittest.TestCase):
    def test_forged_repeated_concurrent_requests_never_touch_history_or_adapters(self):
        with tempfile.TemporaryDirectory(prefix='maya-b22-owned-') as directory:
            file = Path(directory) / 'synthetic.sqlite'
            db = sqlite3.connect(file)
            db.executescript('CREATE TABLE tips(amount INT, record_id INT); INSERT INTO tips VALUES (300, 7); CREATE TABLE clients(id INT); CREATE TABLE staff(id INT); CREATE TABLE delivery(id INT);')
            db.commit()
            before = file.read_bytes()
            calls = []

            def forbidden(*args, **kwargs):
                calls.append('forbidden')
                raise AssertionError('B22 touched a business/delivery adapter')

            class Request:
                app = property(lambda _: forbidden())
                async def json(self):
                    forbidden()

            env = {'web': SimpleNamespace(Request=object, Response=object),
                   '_cabinet_response': lambda data, status=200: (status, data),
                   'database': SimpleNamespace(save_tip=forbidden, get_or_create_client=forbidden),
                   '_master_by_tip_key': forbidden, '_send_master_push': forbidden}
            handler = load_function('webhook_server.py', 'tip_sent_handler', env)

            async def exercise():
                forged = [{'amount': 999999999, 'record_id': 99, 'clientId': 'foreign'}, None, 'invalid-json']
                reqs = []
                for body in forged:
                    request = Request()
                    request.untrusted_body = body
                    reqs.append(request)
                return await asyncio.gather(*(handler(r) for _ in range(25) for r in reqs))

            results = asyncio.run(exercise())
            for status, data in results:
                self.assertEqual(status, 410)
                self.assertFalse(data['ok'])
                self.assertFalse(data['payment_confirmed'])
                self.assertEqual(data['business_mutations'], 0)
                self.assertTrue(data['external_payment_available'])
            self.assertEqual(calls, [])
            self.assertEqual(file.read_bytes(), before)
            self.assertEqual(db.execute('SELECT COUNT(*), SUM(amount) FROM tips').fetchone(), (1, 300))
            for table in ('clients', 'staff', 'delivery'):
                self.assertEqual(db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0], 0)
            db.close()

    def test_direct_writer_and_legacy_totals_fail_closed_without_opening_database(self):
        for name, args in [('save_tip', ()), ('tips_totals_by_master', ()), ('tips_for_master', (8,))]:
            with self.subTest(name=name):
                env = {'_db': lambda: self.fail('Historical SQLite accessed')}
                fn = load_function('database.py', name, env)
                with self.assertRaisesRegex(RuntimeError, 'p5_b22_'):
                    fn(*args)

    def test_runtime_guard_accepts_retirement(self):
        self.assertEqual(scan_runtime(ROOT), [])

    def test_ratchet_rejects_endpoint_mutation_delivery_identity_and_fake_success(self):
        source = (ROOT / 'webhook_server.py').read_text()
        marker = '    # p5_b22_unverified_tip_signal_retired:'
        for injected in ['database.save_tip(amount=2)', 'database.get_or_create_client(1)',
                         'await _send_master_push(None)', 'await request.app["bot_app"].bot.send_message(chat_id=1)',
                         'await request.json()']:
            with self.subTest(injected=injected):
                changed = source.replace(marker, '    '+injected+'\n'+marker)
                self.assertTrue(scan_runtime(ROOT, {'webhook_server.py': changed}))
        self.assertTrue(scan_runtime(ROOT, {'webhook_server.py': source.replace('"payment_confirmed": False', '"payment_confirmed": True')}))

    def test_ratchet_covers_other_active_modules_and_preserves_narrow_test_exclusion(self):
        import shutil
        with tempfile.TemporaryDirectory(prefix='maya-b22-guard-') as directory:
            root = Path(directory)
            for file in ROOT.glob('*.py'):
                if not file.name.startswith('test_'):
                    shutil.copyfile(file, root/file.name)
            probe = root/'future_worker.py'
            for code in ['database.save_tip(amount=42)', 'conn.execute("INSERT INTO tips (amount) VALUES (42)")',
                         'conn.execute("SELECT * FROM tips WHERE amount > 0")']:
                probe.write_text(code)
                self.assertTrue(scan_runtime(root))
            probe.unlink()
            (root/'test_synthetic_tip.py').write_text('database.save_tip(amount=42)')
            self.assertEqual(scan_runtime(root), [])


if __name__ == '__main__':
    unittest.main()
