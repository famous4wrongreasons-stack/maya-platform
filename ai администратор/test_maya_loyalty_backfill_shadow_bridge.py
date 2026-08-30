import asyncio
import importlib
import os
import sys
import types
import unittest


sys.path.insert(0, os.path.dirname(__file__))


class _FakeResponse:
    status = 200

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _traceback):
        return False

    async def json(self):
        return {
            "outcome": "planned",
            "actionExecutionId": "execution-backfill-1",
            "shadowDivergences": 0,
            "newPathValueMutations": 0,
            "newPathProviderWrites": 0,
        }


class _FakeSession:
    def __init__(self, capture, **_kwargs):
        self.capture = capture

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _traceback):
        return False

    def post(self, url, *, json, headers):
        self.capture.update(url=url, json=json, headers=headers)
        return _FakeResponse()


class LegacyLoyaltyBackfillShadowBridgeTests(unittest.TestCase):
    def setUp(self):
        self._saved_env = os.environ.copy()
        os.environ["MAYA_LEGACY_LOYALTY_BACKFILL_SHADOW_ENABLED"] = "true"
        os.environ["MAYA_BRIDGE_COMPANY_ID"] = "company-42"
        self._saved_aiohttp = sys.modules.get("aiohttp")
        fake_aiohttp = types.ModuleType("aiohttp")
        fake_aiohttp.ClientTimeout = lambda **_kwargs: object()
        fake_aiohttp.ClientSession = lambda **_kwargs: None
        sys.modules["aiohttp"] = fake_aiohttp
        sys.modules.pop("maya_loyalty_backfill_shadow_bridge", None)
        self.bridge = importlib.import_module(
            "maya_loyalty_backfill_shadow_bridge"
        )
        self.bridge._BRIDGE_TOKEN = "t" * 32
        self.bridge._PROVIDER = "yclients"
        self.capture = {}
        self.bridge.aiohttp.ClientSession = lambda **kwargs: _FakeSession(
            self.capture, **kwargs
        )

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._saved_env)
        sys.modules.pop("maya_loyalty_backfill_shadow_bridge", None)
        if self._saved_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = self._saved_aiohttp

    def test_submits_only_pii_free_legacy_comparison_evidence(self):
        result = asyncio.run(
            self.bridge.plan_backfill(
                external_client_id=7007,
                initiator_kind="lazy_access",
                legacy_claimed_sold_amount_rubles=6000,
                legacy_claimed_points=300,
            )
        )

        self.assertEqual(result["actionExecutionId"], "execution-backfill-1")
        self.assertEqual(result["newPathValueMutations"], 0)
        self.assertEqual(result["newPathProviderWrites"], 0)
        self.assertEqual(
            self.capture["json"],
            {
                "contract": "maya.legacy-loyalty-backfill-shadow-bridge/1",
                "provider": "yclients",
                "external_company_id": "company-42",
                "external_client_id": "7007",
                "initiator_kind": "lazy_access",
                "legacy_claimed_sold_amount_rubles": 6000,
                "legacy_claimed_points": 300,
            },
        )
        for forbidden in (
            "tenantId",
            "approved",
            "autonomy",
            "policyDecision",
            "approvalBindingHash",
            "perClientCapPoints",
            "perRunCapPoints",
            "phone",
        ):
            self.assertNotIn(forbidden, self.capture["json"])

    def test_missing_exact_client_identity_opens_no_http_session(self):
        self.bridge.aiohttp.ClientSession = lambda **_kwargs: self.fail(
            "unresolved client identity must not open a session"
        )

        result = asyncio.run(
            self.bridge.plan_backfill(
                external_client_id=None,
                initiator_kind="admin_batch",
                legacy_claimed_sold_amount_rubles=6000,
                legacy_claimed_points=300,
            )
        )

        self.assertEqual(result["outcome"], "identity_unresolved")
        self.assertEqual(result["newPathValueMutations"], 0)
        self.assertEqual(result["newPathProviderWrites"], 0)


if __name__ == "__main__":
    unittest.main()
