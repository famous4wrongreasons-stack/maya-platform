"""Actual retired function bodies, isolated storage, no external dependencies."""
import ast
import asyncio
from concurrent.futures import ThreadPoolExecutor
import hashlib
from contextlib import closing
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

import reputation
from package5_review_source_guard import RETURNS, scan_review_sources

ROOT = Path(__file__).parent


def forbidden(*args, **kwargs):
    raise AssertionError("retired source accessed request/state/provider")


def load_boundaries(file, names):
    tree = ast.parse((ROOT / file).read_text())
    nodes = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    assert len(nodes) == len(names)
    future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
    selected = ast.fix_missing_locations(ast.Module(body=[future, *nodes], type_ignores=[]))
    namespace = {"reputation": reputation, "_db": forbidden, "_panel_auth": forbidden,
                 "_cabinet_response": lambda body, status: {"status": status, "body": body}}
    exec(compile(selected, str(ROOT / file), "exec"), namespace)
    return namespace


class Request:
    def __init__(self, payload):
        self.payload = payload

    def __getattr__(self, name):
        return forbidden(name)


def attempt(payload):
    db = load_boundaries("database.py", RETURNS["database.py"])
    web = load_boundaries("webhook_server.py", RETURNS["webhook_server.py"])
    source = payload.get("source", "yandex")
    outcomes = [
        reputation.import_reviews(source, [payload]),
        reputation.fetch_public_source(source),
        reputation.refresh_public_reviews(),
        reputation.refresh_2gis_stats(force=True),
        reputation.save_source_snapshot(source, rating=payload.get("rating")),
    ]
    assert all(x["ok"] is False and x["business_mutations"] == 0 for x in outcomes)
    assert db["upsert_external_review"](source=source, external_id="one", rating=payload.get("rating"), review_text=payload.get("text", ""))["created"] is False
    assert db["list_external_reviews"]() == []
    assert db["list_unalerted_external_reviews"]() == []
    assert db["mark_external_reviews_alerted"]([1]) == 0
    assert db["mark_external_reviews_alerted_for_source"](source) == 0
    assert db["_external_reviews_ensure"](object()) is None

    async def run():
        for name in ("panel_external_reviews_import_handler", "panel_reputation_refresh_handler"):
            response = await web[name](Request(payload))
            assert response["status"] == 410 and response["body"]["business_mutations"] == 0
        assert await web["reputation_monitor_loop"](object()) is None
        assert (await web["_notify_owner_reputation"](object(), [payload]))["delivered"] is False
    asyncio.run(run())
    projection = reputation.reputation_snapshot(force_refresh=True)
    assert projection["canonical_review_authority"] is False
    assert projection["status"] == "unavailable"
    assert projection["summary"]["overall_rating"] is None
    return True


class ReviewRetirementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="maya-b34-review-proof-")
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "history.sqlite"
        with closing(sqlite3.connect(self.path)) as db:
            db.execute("CREATE TABLE external_reviews (id INTEGER PRIMARY KEY, source TEXT, external_id TEXT, rating REAL, review_text TEXT, published_at TEXT, imported_at TEXT, response_state TEXT, alerted_at TEXT)")
            db.execute("INSERT INTO external_reviews VALUES (1, 'yandex', 'one', 5, 'Original synthetic evidence', '2026-09-01T12:00:00Z', '2026-09-01', 'original', NULL)")
            db.commit()
        self.before = hashlib.sha256(self.path.read_bytes()).hexdigest()

    def assert_history_untouched(self):
        self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), self.before)

    def test_identical_changed_and_unverified_contexts_never_access_storage(self):
        base = {"id": "one", "source": "yandex", "rating": 5, "text": "Original synthetic evidence"}
        for changes in ({}, {}, {"text": "Changed"}, {"rating": 1}, {"author": "Different"},
                        {"published_at": "2026-09-02T00:00:00Z"}, {"source": "2gis"},
                        {"tenantId": "other", "cardId": "other-card", "provider": "yclients"},
                        {"id": None}, {"auth_data": {"id": 42}}, {"maya_token": "untrusted"}):
            with self.subTest(changes=changes):
                self.assertTrue(attempt({**base, **changes}))
                self.assert_history_untouched()

    def test_concurrent_divergent_replays_never_mutate_history(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, [{"id": "one", "text": f"variant-{i % 3}", "rating": i % 5 + 1} for i in range(24)]))
        self.assertTrue(all(results))
        self.assert_history_untouched()

    def test_new_process_restart_and_replay_has_no_write(self):
        code = "from test_package5_b34_review_retirement import attempt; assert attempt({'id':'one','rating':1,'text':'changed after restart'})"
        for _ in range(2):
            subprocess.run([sys.executable, "-B", "-c", code], cwd=ROOT, check=True, capture_output=True)
        self.assert_history_untouched()

    def test_active_root_includes_background_and_nested_surfaces(self):
        self.assertEqual(scan_review_sources(ROOT), [])
        for source in (
            "def sync():\n conn.execute('UPDATE external_reviews SET rating=1')",
            "def sync():\n conn.execute('UP' + 'DATE external_' + 'reviews SET rating=1')",
            "from database import upsert_external_review as save\nsave()",
            "def sync():\n worker(database.upsert_external_review, data)",
            "def sync():\n requests.post('/api/business-content/reviews', json={'tenantId':card})",
            "def sync():\n reputation.refresh_public_reviews()",
            "asyncio.create_task(reputation_monitor_loop(app))",
            "from backups import review_owner",
            "runpy.run_path('backups/review_owner.py')",
            "sys.path.append('/home/botadmin/barbershop-bot/backups')",
        ):
            with self.subTest(source=source):
                self.assertTrue(scan_review_sources(ROOT, {"jobs/later_source.py": source}))

    def test_restored_owner_or_metadata_writer_is_rejected(self):
        for filename, original, restored in (
            ("database.py", 'return {"ok": False, "error": "LEGACY_REVIEW_SOURCE_RETIRED", "created": False, "business_mutations": 0}', "return _db().execute('UPDATE external_reviews SET rating=1')"),
            ("database.py", "    return 0\n\n\ndef mark_external_reviews_alerted_for_source", "    return _db().execute('UPDATE external_reviews SET alerted_at=1')\n\n\ndef mark_external_reviews_alerted_for_source"),
            ("reputation.py", "    return retired_review_source()", "    return {'ok': True, 'tenantId': source}"),
            ("reputation.py", '"canonical_review_authority": False', '"canonical_review_authority": True'),
            ("webhook_server.py", "return _cabinet_response(reputation.retired_review_source(), status=410)", "return reputation.import_reviews('yandex', [])"),
        ):
            source = (ROOT / filename).read_text()
            self.assertIn(original, source)
            self.assertTrue(scan_review_sources(ROOT, {filename: source.replace(original, restored, 1)}))


if __name__ == "__main__":
    unittest.main()
