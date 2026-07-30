import importlib
import sys
import types
import unittest


def _load_ai_billing():
    fake_config = types.ModuleType("config")
    fake_config.SERVER_COSTS_RUB = {}
    fake_config.FAL_COST_PER_IMAGE_USD = 0.15

    fake_database = types.ModuleType("database")
    fake_database.sum_ai_usage = lambda since=None: 0.0
    fake_database.aggregate_ai_usage_by_feature = lambda since=None: []
    fake_database.log_ai_usage = lambda *args, **kwargs: None

    sys.modules["config"] = fake_config
    sys.modules["database"] = fake_database
    sys.modules.pop("ai_billing", None)
    return importlib.import_module("ai_billing")


class AIBillingTests(unittest.TestCase):
    def test_gpt55_pro_uses_verified_pro_pricing(self):
        ai_billing = _load_ai_billing()

        cost = ai_billing.calculate_cost_usd(
            "gpt-5.5-pro",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )

        self.assertEqual(cost, 210.0)

    def test_gpt55_pro_cached_tokens_have_no_discount(self):
        ai_billing = _load_ai_billing()

        cost = ai_billing.calculate_cost_usd(
            "gpt-5.5-pro",
            input_tokens=0,
            output_tokens=0,
            cache_read_tokens=1_000_000,
            cache_write_tokens=1_000_000,
        )

        self.assertEqual(cost, 60.0)

    def test_deepseek_v4_prices_and_cache_counters(self):
        ai_billing = _load_ai_billing()
        logged = {}
        ai_billing.database.log_ai_usage = lambda **kwargs: logged.update(kwargs)

        ai_billing.log_openai_usage(
            "anton_chat",
            "deepseek-v4-pro",
            {
                "usage": {
                    "prompt_tokens": 1_000_000,
                    "prompt_cache_hit_tokens": 800_000,
                    "prompt_cache_miss_tokens": 200_000,
                    "completion_tokens": 10_000,
                }
            },
        )

        expected = round(0.2 * 0.435 + 0.8 * 0.003625 + 0.01 * 0.87, 6)
        self.assertEqual(logged["input_tokens"], 200_000)
        self.assertEqual(logged["cache_read_tokens"], 800_000)
        self.assertEqual(logged["output_tokens"], 10_000)
        self.assertEqual(logged["cost_usd"], expected)

if __name__ == "__main__":
    unittest.main()
