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

    def redeem_loyalty_points(
        self, *, client_id, points, visit_record_id, service_title
    ):
        balance = self.loyalty_balance(client_id)
        if balance < points:
            return {"ok": False, "reason": "insufficient", "balance": balance}
        self.add_loyalty_transaction(
            client_id=client_id,
            type_="redeem",
            points=-points,
            visit_record_id=visit_record_id,
            note=service_title,
        )
        return {"ok": True, "points": points, "balance": balance - points}

    def reserve_loyalty_points(self, *, client_id, points, request_id):
        balance = self.loyalty_balance(client_id)
        if balance < points:
            return {"ok": False, "state": "insufficient", "balance": balance}
        self.add_loyalty_transaction(
            client_id=client_id,
            type_="redeem_hold",
            points=-points,
            note=f"[request:{request_id}]",
        )
        return {"ok": True, "state": "reserved", "balance": balance - points}

    def finalize_loyalty_reservation(
        self, *, client_id, request_id, record_id, service_title, points
    ):
        marker = f"[request:{request_id}]"
        for tx in self.transactions:
            if (
                tx["client_id"] == client_id
                and tx["type"] == "redeem_hold"
                and marker in (tx.get("note") or "")
            ):
                tx.update(
                    type="redeem",
                    visit_record_id=record_id,
                    note=f"{service_title} {marker}",
                )
                return {"ok": True, "record_id": record_id}
        return {"ok": False, "reason": "hold_not_found"}

    def release_loyalty_reservation(self, *, client_id, request_id):
        marker = f"[request:{request_id}]"
        before = len(self.transactions)
        self.transactions = [
            tx for tx in self.transactions
            if not (
                tx["client_id"] == client_id
                and tx["type"] == "redeem_hold"
                and marker in (tx.get("note") or "")
            )
        ]
        return len(self.transactions) < before

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
        "requests": types.ModuleType("requests"),
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

    def test_retired_lazy_backfill_is_capped_and_idempotent(self):
        self.loyalty._yc_search_sold_amount = lambda _phone: 62_150

        # P4-03: legacy phone/LTV/card heuristics cannot mint canonical value.
        import copy
        before = copy.deepcopy(self.database.transactions)
        for _retry in range(2):
            with self.assertRaisesRegex(self.loyalty.LegacyLoyaltyCutoverError, "p4_03_legacy_mutation_disabled"):
                self.loyalty.lazy_backfill_for_client(25, "+70000000000")
            self.assertEqual(self.database.transactions, before)

    def test_retired_existing_yclients_card_replaces_capped_welcome_with_real_balance(self):
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

        # P4-03: legacy phone/LTV/card heuristics cannot mint canonical value.
        import copy
        before = copy.deepcopy(self.database.transactions)
        for _retry in range(2):
            with self.assertRaisesRegex(self.loyalty.LegacyLoyaltyCutoverError, "p4_03_legacy_mutation_disabled"):
                self.loyalty.import_yclients_loyalty_balance(25, "+70000000000")
            self.assertEqual(self.database.transactions, before)

    def test_retired_lazy_backfill_prefers_yclients_card_over_ltv_formula(self):
        self.loyalty._yc_search_sold_amount = lambda _phone: 62_150
        self.loyalty._yc.find_client_by_phone = lambda _phone: {"id": 104600668}
        self.loyalty._yc.get_client_loyalty_cards = lambda _client_id: [{
            "id": 25151230,
            "balance": 2133,
            "sold_amount": 62150,
            "programs": [{"loyalty_type": {"is_cashback": True}}],
        }]

        # P4-03: legacy phone/LTV/card heuristics cannot mint canonical value.
        import copy
        before = copy.deepcopy(self.database.transactions)
        for _retry in range(2):
            with self.assertRaisesRegex(self.loyalty.LegacyLoyaltyCutoverError, "p4_03_legacy_mutation_disabled"):
                self.loyalty.lazy_backfill_for_client(25, "+70000000000")
            self.assertEqual(self.database.transactions, before)

    def test_affordable_care_uses_current_yclients_titles_and_prices(self):
        catalog = [
            {"id": 1, "title": "Массаж", "price_min": 450, "price_max": 450},
            {"id": 2, "title": "Патчи", "price_min": 100, "price_max": 100},
            {"id": 3, "title": "Spa для лица", "price_min": 1200, "price_max": 1200},
            {"id": 4, "title": "Консультация", "price_min": 0, "price_max": 0},
        ]

        affordable = self.loyalty.affordable_care_services(600, catalog)

        self.assertEqual(
            [(item["title"], item["price"]) for item in affordable],
            [("Патчи", 100), ("Массаж", 450)],
        )

    def test_care_price_range_must_be_fully_covered(self):
        catalog = [{
            "id": 1,
            "title": "Уход за кожей головы",
            "price_min": 500,
            "price_max": 900,
        }]

        self.assertEqual(self.loyalty.affordable_care_services(700, catalog), [])
        self.assertEqual(
            self.loyalty.affordable_care_services(900, catalog)[0]["price"],
            900,
        )

    def test_spend_summary_selects_best_and_next_current_service(self):
        catalog = [
            {"id": 1, "title": "Патчи", "price_min": 100, "price_max": 100},
            {"id": 2, "title": "Массаж", "price_min": 450, "price_max": 450},
            {"id": 3, "title": "Spa для лица", "price_min": 1200, "price_max": 1200},
        ]

        summary = self.loyalty.loyalty_spend_summary(600, catalog)

        self.assertEqual(summary["balance"], 600)
        self.assertEqual(summary["best_service"]["title"], "Массаж")
        self.assertEqual(summary["next_service"]["title"], "Spa для лица")
        self.assertEqual(summary["next_service"]["points_needed"], 600)
        self.assertEqual(summary["redemption_rule"], "one_care_service_per_visit")

    def test_current_care_service_uses_catalog_price(self):
        catalog = [{
            "id": 9,
            "title": "Массаж",
            "price_min": 475,
            "price_max": 475,
        }]

        service = self.loyalty.current_care_service("массаж", catalog)

        self.assertEqual(service["id"], 9)
        self.assertEqual(service["price"], 475)

    def test_retired_booking_redemption_uses_the_confirmed_current_quote(self):
        self.database.add_loyalty_transaction(
            client_id=25, type_="yc_import", points=600,
        )
        self.database.loyalty_redemption_exists = lambda *_args: False
        self.loyalty._yc.mark_record_loyalty_redemption = lambda **_kwargs: {
            "success": True,
            "matched_service": True,
        }

        # P4-03: legacy phone/LTV/card heuristics cannot mint canonical value.
        import copy
        before = copy.deepcopy(self.database.transactions)
        for _retry in range(2):
            with self.assertRaisesRegex(self.loyalty.LegacyLoyaltyCutoverError, "p4_03_legacy_mutation_disabled"):
                self.loyalty.apply_redemption_for_booking(
                            client_id=25,
                            record_id=77,
                            service_titles=["Массаж"],
                            service_quotes=[{"title": "Массаж", "price": 475}],
                        )
            self.assertEqual(self.database.transactions, before)

    def test_retired_booking_redemption_refuses_an_insufficient_balance(self):
        self.database.add_loyalty_transaction(
            client_id=25, type_="yc_import", points=300,
        )
        self.database.loyalty_redemption_exists = lambda *_args: False

        # P4-03: legacy phone/LTV/card heuristics cannot mint canonical value.
        import copy
        before = copy.deepcopy(self.database.transactions)
        for _retry in range(2):
            with self.assertRaisesRegex(self.loyalty.LegacyLoyaltyCutoverError, "p4_03_legacy_mutation_disabled"):
                self.loyalty.apply_redemption_for_booking(
                            client_id=25,
                            record_id=78,
                            service_titles=["Массаж"],
                            service_quotes=[{"title": "Массаж", "price": 475}],
                        )
            self.assertEqual(self.database.transactions, before)

    def test_retired_booking_redemption_applies_only_one_service_per_visit(self):
        self.database.add_loyalty_transaction(
            client_id=25, type_="yc_import", points=1_000,
        )
        self.database.loyalty_redemption_exists = lambda *_args: False
        self.loyalty._yc.mark_record_loyalty_redemption = lambda **_kwargs: {
            "success": True,
            "matched_service": True,
        }

        # P4-03: legacy phone/LTV/card heuristics cannot mint canonical value.
        import copy
        before = copy.deepcopy(self.database.transactions)
        for _retry in range(2):
            with self.assertRaisesRegex(self.loyalty.LegacyLoyaltyCutoverError, "p4_03_legacy_mutation_disabled"):
                self.loyalty.apply_redemption_for_booking(
                            client_id=25,
                            record_id=79,
                            service_titles=["Патчи", "Массаж"],
                            service_quotes=[
                                {"title": "Патчи", "price": 100},
                                {"title": "Массаж", "price": 475},
                            ],
                        )
            self.assertEqual(self.database.transactions, before)

    def test_retired_booking_redemption_finalizes_a_reserved_balance(self):
        self.database.add_loyalty_transaction(
            client_id=25, type_="yc_import", points=600,
        )
        self.database.loyalty_redemption_exists = lambda *_args: False
        self.loyalty._yc.mark_record_loyalty_redemption = lambda **_kwargs: {
            "success": True,
            "matched_service": True,
        }
        hold = self.database.reserve_loyalty_points(
            client_id=25, points=475, request_id="booking_123",
        )

        # P4-03: legacy phone/LTV/card heuristics cannot mint canonical value.
        import copy
        before = copy.deepcopy(self.database.transactions)
        for _retry in range(2):
            with self.assertRaisesRegex(self.loyalty.LegacyLoyaltyCutoverError, "p4_03_legacy_mutation_disabled"):
                self.loyalty.apply_redemption_for_booking(
                            client_id=25,
                            record_id=80,
                            service_titles=["Массаж"],
                            service_quotes=[{"title": "Массаж", "price": 475}],
                            reservation_id="booking_123",
                        )
            self.assertEqual(self.database.transactions, before)

    def test_retired_real_card_import_works_when_fallback_backfill_is_disabled(self):
        self.loyalty.BACKFILL_ENABLED = False
        self.loyalty._yc.find_client_by_phone = lambda _phone: {"id": 104600668}
        self.loyalty._yc.get_client_loyalty_cards = lambda _client_id: [{
            "id": 25151230,
            "balance": 2133,
            "programs": [{"loyalty_type": {"is_cashback": True}}],
        }]

        # P4-03: legacy phone/LTV/card heuristics cannot mint canonical value.
        import copy
        before = copy.deepcopy(self.database.transactions)
        for _retry in range(2):
            with self.assertRaisesRegex(self.loyalty.LegacyLoyaltyCutoverError, "p4_03_legacy_mutation_disabled"):
                self.loyalty.lazy_backfill_for_client(25, "+70000000000")
            self.assertEqual(self.database.transactions, before)

    def test_retired_zero_balance_discount_card_does_not_replace_welcome_fallback(self):
        self.loyalty._yc_search_sold_amount = lambda _phone: 8_000
        self.loyalty._yc.find_client_by_phone = lambda _phone: {"id": 104600668}
        self.loyalty._yc.get_client_loyalty_cards = lambda _client_id: [{
            "id": 111,
            "balance": 0,
            "type": {"title": "Скидочная карта"},
            "programs": [{"loyalty_type": {"is_cashback": False}}],
        }]

        # P4-03: legacy phone/LTV/card heuristics cannot mint canonical value.
        import copy
        before = copy.deepcopy(self.database.transactions)
        for _retry in range(2):
            with self.assertRaisesRegex(self.loyalty.LegacyLoyaltyCutoverError, "p4_03_legacy_mutation_disabled"):
                self.loyalty.lazy_backfill_for_client(25, "+70000000000")
            self.assertEqual(self.database.transactions, before)

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

    def test_retired_lazy_backfill_skips_phone_claimed_by_another_identity(self):
        self.database.phone_claimed = True
        self.loyalty._yc_search_sold_amount = lambda _phone: 62_150

        # P4-03: legacy phone/LTV/card heuristics cannot mint canonical value.
        import copy
        before = copy.deepcopy(self.database.transactions)
        for _retry in range(2):
            with self.assertRaisesRegex(self.loyalty.LegacyLoyaltyCutoverError, "p4_03_legacy_mutation_disabled"):
                self.loyalty.lazy_backfill_for_client(25, "+70000000000")
            self.assertEqual(self.database.transactions, before)

    def test_retired_bulk_backfill_uses_cap_and_phone_deduplication(self):
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
        # P4-03: legacy phone/LTV/card heuristics cannot mint canonical value.
        import copy
        before = copy.deepcopy(self.database.transactions)
        for _retry in range(2):
            with self.assertRaisesRegex(self.loyalty.LegacyLoyaltyCutoverError, "p4_03_legacy_mutation_disabled"):
                asyncio.run(self.loyalty.run_backfill_job())
            self.assertEqual(self.database.transactions, before)


if __name__ == "__main__":
    unittest.main()
