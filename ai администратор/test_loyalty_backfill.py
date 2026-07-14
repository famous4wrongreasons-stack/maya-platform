import asyncio
import importlib
import os
import sys
import types
import unittest


sys.path.insert(0, os.path.dirname(__file__))


class _FakeDatabase(types.ModuleType):
    def __init__(self):
        super().__init__("database")
        self.transactions = []
        self.phone_claimed = False
        self.clients = []
        self.settings = {}

    def client_has_loyalty_backfill(self, client_id):
        return any(
            tx["client_id"] == client_id and tx["type"] == "backfill"
            for tx in self.transactions
        )

    def client_has_loyalty_yclients_import(self, client_id):
        return any(
            tx["client_id"] == client_id and tx["type"] == "yc_import"
            for tx in self.transactions
        )

    def loyalty_balance(self, client_id):
        return sum(
            tx["points"] for tx in self.transactions if tx["client_id"] == client_id
        )

    def loyalty_backfill_exists_for_phone(self, _phone):
        return self.phone_claimed

    def add_loyalty_transaction(
        self, *, client_id, type_, points, visit_record_id=None, note=None
    ):
        self.transactions.append(
            {
                "client_id": client_id,
                "type": type_,
                "points": points,
                "visit_record_id": visit_record_id,
                "note": note,
            }
        )

    def list_telegram_clients(self):
        return self.clients

    def get_setting(self, key, default=None):
        return self.settings.get(key, default)

    def set_setting(self, key, value):
        self.settings[key] = value


def _load_loyalty():
    fake_telegram = types.ModuleType("telegram")
    fake_telegram.InlineKeyboardButton = type("InlineKeyboardButton", (), {})
    fake_telegram.InlineKeyboardMarkup = type("InlineKeyboardMarkup", (), {})

    fake_telegram_error = types.ModuleType("telegram.error")
    fake_telegram_error.Forbidden = type("Forbidden", (Exception,), {})
    fake_telegram_error.BadRequest = type("BadRequest", (Exception,), {})

    fake_telegram_ext = types.ModuleType("telegram.ext")
    fake_telegram_ext.Application = type("Application", (), {})

    fake_config = types.ModuleType("config")
    fake_config.YCLIENTS_COMPANY_ID = "company"
    fake_config.YCLIENTS_PARTNER_TOKEN = "partner"
    fake_config.YCLIENTS_USER_TOKEN = "user"

    fake_yclients = types.ModuleType("yclients")

    class FakeYClientsAPI:
        def find_client_by_phone(self, _phone):
            return None

        def get_client_loyalty_cards(self, _client_id):
            return []

    fake_yclients.YClientsAPI = FakeYClientsAPI

    fake_database = _FakeDatabase()
    modules = {
        "telegram": fake_telegram,
        "telegram.error": fake_telegram_error,
        "telegram.ext": fake_telegram_ext,
        "config": fake_config,
        "database": fake_database,
        "subscriptions": types.ModuleType("subscriptions"),
        "yclients": fake_yclients,
    }
    for name, module in modules.items():
        sys.modules[name] = module

    sys.modules.pop("loyalty", None)
    return importlib.import_module("loyalty"), fake_database


class LoyaltyBackfillTests(unittest.TestCase):
    def setUp(self):
        self._saved_modules = sys.modules.copy()
        self.loyalty, self.database = _load_loyalty()
        self.loyalty.get_launch_date = lambda: None

    def tearDown(self):
        sys.modules.clear()
        sys.modules.update(self._saved_modules)

    def test_welcome_points_use_five_percent_below_cap(self):
        self.assertEqual(self.loyalty._welcome_points(8_000), 400)

    def test_welcome_points_are_capped_at_one_thousand(self):
        self.assertEqual(self.loyalty._welcome_points(62_150), 1_000)

    def test_lazy_backfill_is_capped_and_idempotent(self):
        self.loyalty._yc_search_sold_amount = lambda _phone: 62_150

        first = self.loyalty.lazy_backfill_for_client(25, "+70000000000")
        second = self.loyalty.lazy_backfill_for_client(25, "+70000000000")

        self.assertEqual(first, {"points": 1_000, "sold_amount": 62_150})
        self.assertIsNone(second)
        self.assertEqual(len(self.database.transactions), 1)
        self.assertEqual(self.database.transactions[0]["points"], 1_000)

    def test_existing_yclients_card_replaces_capped_welcome_with_real_balance(self):
        self.database.add_loyalty_transaction(
            client_id=25,
            type_="backfill",
            points=1_000,
            note="old capped welcome",
        )
        self.loyalty._yc.find_client_by_phone = lambda _phone: {"id": 104600668}
        self.loyalty._yc.get_client_loyalty_cards = lambda _client_id: [{
            "id": 25151230,
            "balance": 2133,
            "sold_amount": 62150,
            "type": {"title": "Кешбек карта"},
        }]

        first = self.loyalty.import_yclients_loyalty_balance(25, "+70000000000")
        second = self.loyalty.import_yclients_loyalty_balance(25, "+70000000000")

        self.assertEqual(first["previous_balance"], 1_000)
        self.assertEqual(first["balance"], 2_133)
        self.assertEqual(first["delta"], 1_133)
        self.assertIsNone(second)
        self.assertEqual(self.database.loyalty_balance(25), 2_133)
        self.assertEqual(
            [tx["type"] for tx in self.database.transactions],
            ["backfill", "yc_import"],
        )

    def test_lazy_backfill_prefers_yclients_card_over_ltv_formula(self):
        self.loyalty._yc_search_sold_amount = lambda _phone: 62_150
        self.loyalty._yc.find_client_by_phone = lambda _phone: {"id": 104600668}
        self.loyalty._yc.get_client_loyalty_cards = lambda _client_id: [{
            "id": 25151230,
            "balance": 2133,
            "sold_amount": 62150,
            "programs": [{"loyalty_type": {"is_cashback": True}}],
        }]

        result = self.loyalty.lazy_backfill_for_client(25, "+70000000000")

        self.assertEqual(result["source"], "yclients_card")
        self.assertEqual(result["balance"], 2_133)
        self.assertEqual(self.database.loyalty_balance(25), 2_133)
        self.assertEqual(len(self.database.transactions), 1)
        self.assertEqual(self.database.transactions[0]["type"], "yc_import")

    def test_real_card_import_works_when_fallback_backfill_is_disabled(self):
        self.loyalty.BACKFILL_ENABLED = False
        self.loyalty._yc.find_client_by_phone = lambda _phone: {"id": 104600668}
        self.loyalty._yc.get_client_loyalty_cards = lambda _client_id: [{
            "id": 25151230,
            "balance": 2133,
            "programs": [{"loyalty_type": {"is_cashback": True}}],
        }]

        result = self.loyalty.lazy_backfill_for_client(25, "+70000000000")

        self.assertEqual(result["source"], "yclients_card")
        self.assertEqual(self.database.loyalty_balance(25), 2_133)

    def test_zero_balance_discount_card_does_not_replace_welcome_fallback(self):
        self.loyalty._yc_search_sold_amount = lambda _phone: 8_000
        self.loyalty._yc.find_client_by_phone = lambda _phone: {"id": 104600668}
        self.loyalty._yc.get_client_loyalty_cards = lambda _client_id: [{
            "id": 111,
            "balance": 0,
            "type": {"title": "Скидочная карта"},
            "programs": [{"loyalty_type": {"is_cashback": False}}],
        }]

        result = self.loyalty.lazy_backfill_for_client(25, "+70000000000")

        self.assertEqual(result, {"points": 400, "sold_amount": 8_000})
        self.assertEqual(self.database.loyalty_balance(25), 400)

    def test_cashback_card_wins_over_discount_card_even_with_zero_balance(self):
        selected = self.loyalty.select_yclients_cashback_card([
            {
                "id": 111,
                "balance": 500,
                "type": {"title": "Скидочная карта"},
                "programs": [{"loyalty_type": {"is_cashback": False}}],
            },
            {
                "id": 222,
                "balance": 0,
                "type": {"title": "Кешбек карта"},
                "programs": [{"loyalty_type": {"is_cashback": True}}],
            },
        ])

        self.assertEqual(selected["id"], 222)

    def test_lazy_backfill_skips_phone_claimed_by_another_identity(self):
        self.database.phone_claimed = True
        self.loyalty._yc_search_sold_amount = lambda _phone: 62_150

        result = self.loyalty.lazy_backfill_for_client(25, "+70000000000")

        self.assertIsNone(result)
        self.assertEqual(self.database.transactions, [])

    def test_bulk_backfill_uses_cap_and_phone_deduplication(self):
        self.database.clients = [
            {"id": 25, "phone": "+70000000000"},
            {"id": 26, "phone": "+70000000000"},
        ]
        self.database.phone_claimed = False
        self.loyalty._yc_search_sold_amount = lambda _phone: 62_150

        original_add = self.database.add_loyalty_transaction

        def add_and_claim(**kwargs):
            original_add(**kwargs)
            self.database.phone_claimed = True

        self.database.add_loyalty_transaction = add_and_claim
        summary = asyncio.run(self.loyalty.run_backfill_job())

        self.assertEqual(summary["backfilled"], 1)
        self.assertEqual(summary["already_done"], 1)
        self.assertEqual(summary["total_points"], 1_000)


if __name__ == "__main__":
    unittest.main()
