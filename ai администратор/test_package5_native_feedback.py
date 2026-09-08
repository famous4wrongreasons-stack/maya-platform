import ast
import asyncio
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
import package5_native_feedback_runtime_guard as guard

ROOT = Path(os.environ.get('MAYA_R08_PROOF_ROOT', Path(__file__).parent))


class NativeFeedbackProof(unittest.TestCase):
    def test_whole_inventoried_scope(self):
        self.assertEqual(guard.scan(ROOT), [])

    def test_direct_and_delegated_effect_mutants(self):
        source = (ROOT / 'reviews.py').read_text()
        node = guard.functions(source)['send_pending_review_requests']
        lines = source.splitlines(keepends=True)
        for effect in ['await bot.send_message(raw_id, "rating")', 'await delegated_sender()', 'database.record_review_response(raw_id, rating=5)']:
            changed = ''.join(lines[:node.body[0].lineno - 1]) + '    ' + effect + '\n' + ''.join(lines[node.body[0].lineno - 1:])
            self.assertTrue(guard.scan(ROOT, {'reviews.py': changed}))

    def test_unknown_retry_and_sql_mutants(self):
        for source in ['def tick(db):\n    db.execute("UPDATE review_requests SET status=1")\n', 'def reply(context):\n    context.user_data["pending_review_comment_id"] = 4\n']:
            self.assertTrue(guard.scan(ROOT, {'new_worker.py': source}))

    def test_rating_is_handoff_and_unrelated_text_is_not_consumed(self):
        nodes = guard.functions((ROOT / 'reviews.py').read_text())
        namespace = {'ContextTypes': SimpleNamespace(DEFAULT_TYPE=object)}
        module = ast.Module(body=[nodes['handle_rating_callback'], nodes['handle_negative_comment']], type_ignores=[])
        exec(compile(ast.fix_missing_locations(module), 'synthetic_replies', 'exec'), namespace)
        acknowledgements = []
        async def answer(text):
            acknowledgements.append(text)
        async def run():
            query = SimpleNamespace(data='rev_5_untrusted', answer=answer)
            self.assertTrue(await namespace['handle_rating_callback'](SimpleNamespace(callback_query=query), SimpleNamespace()))
            self.assertFalse(await namespace['handle_negative_comment'](SimpleNamespace(), SimpleNamespace(user_data={'pending_review_comment_id': 1})))
        asyncio.run(run())
        self.assertEqual(len(acknowledgements), 1)
        self.assertIn('MAYA', acknowledgements[0])


if __name__ == '__main__':
    unittest.main()
