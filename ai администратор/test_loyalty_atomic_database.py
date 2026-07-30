import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from concurrent.futures import ThreadPoolExecutor


def _load_database_for_ledger_test():
    """Load database.py in isolation without requiring the production crypto wheel."""
    fake_crypto = types.ModuleType("pii_crypto")
    fake_crypto.encrypt = lambda value: value
    fake_crypto.decrypt = lambda value: value
    fake_crypto.hash_phone = lambda value: str(value or "")
    previous = sys.modules.get("pii_crypto")
    sys.modules["pii_crypto"] = fake_crypto
    try:
        spec = importlib.util.spec_from_file_location(
            "maya_atomic_database_under_test", Path(__file__).with_name("database.py")
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        if previous is None:
            sys.modules.pop("pii_crypto", None)
        else:
            sys.modules["pii_crypto"] = previous


database = _load_database_for_ledger_test()


class LoyaltyAtomicDatabaseTests(unittest.TestCase):
    def setUp(self):
        handle, self.path = tempfile.mkstemp(prefix="maya-loyalty-", suffix=".db")
        os.close(handle)
        self.original_path = database.DB_PATH
        database.DB_PATH = self.path
        with database._db() as conn:
            conn.execute(
                "CREATE TABLE loyalty_transactions ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, "
                "type TEXT NOT NULL, points INTEGER NOT NULL, visit_record_id INTEGER, "
                "note TEXT, at TEXT NOT NULL)"
            )
            conn.execute(
                "INSERT INTO loyalty_transactions "
                "(client_id, type, points, visit_record_id, note, at) "
                "VALUES (25, 'yc_import', 600, NULL, 'seed', ?)",
                (database._now(),),
            )

    def tearDown(self):
        database.DB_PATH = self.original_path
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(self.path + suffix)
            except FileNotFoundError:
                pass

    def test_reservation_finalize_and_retry_are_idempotent(self):
        first = database.reserve_loyalty_points(
            client_id=25, points=475, request_id="booking_atomic_01",
        )
        duplicate = database.reserve_loyalty_points(
            client_id=25, points=475, request_id="booking_atomic_01",
        )
        finalized = database.finalize_loyalty_reservation(
            client_id=25,
            request_id="booking_atomic_01",
            record_id=7001,
            service_title="Массаж",
            points=475,
        )
        retry = database.reserve_loyalty_points(
            client_id=25, points=475, request_id="booking_atomic_01",
        )

        self.assertEqual(first["state"], "reserved")
        self.assertEqual(duplicate["state"], "in_progress")
        self.assertTrue(finalized["ok"])
        self.assertEqual(retry["state"], "finalized")
        self.assertEqual(retry["record_id"], 7001)
        self.assertEqual(database.loyalty_balance(25), 125)

    def test_concurrent_requests_cannot_overspend_one_balance(self):
        barrier = threading.Barrier(2)

        def reserve(token):
            barrier.wait(timeout=3)
            return database.reserve_loyalty_points(
                client_id=25, points=500, request_id=token,
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(reserve, ["booking_atomic_a", "booking_atomic_b"]))

        self.assertEqual(sum(1 for item in results if item.get("state") == "reserved"), 1)
        self.assertEqual(sum(1 for item in results if item.get("state") == "insufficient"), 1)
        self.assertEqual(database.loyalty_balance(25), 100)


if __name__ == "__main__":
    unittest.main()
