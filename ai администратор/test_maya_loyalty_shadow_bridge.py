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
            "actionExecutionId": "execution-earn-1",
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


class LegacyLoyaltyShadowBridgeTests(unittest.TestCase):
    def setUp(self):
        self._saved_env = os.environ.copy()
        os.environ["MAYA_LEGACY_LOYALTY_EARN_SHADOW_ENABLED"] = "true"
        os.environ["MAYA_BRIDGE_COMPANY_ID"] = "company-42"
        self._saved_aiohttp = sys.modules.get("aiohttp")
        fake_aiohttp = types.ModuleType("aiohttp")
        fake_aiohttp.ClientTimeout = lambda **_kwargs: object()
        fake_aiohttp.ClientSession = lambda **_kwargs: None
        sys.modules["aiohttp"] = fake_aiohttp
        sys.modules.pop("maya_loyalty_shadow_bridge", None)
        self.bridge = importlib.import_module("maya_loyalty_shadow_bridge")
        self.bridge._BRIDGE_TOKEN = "t" * 32
        self.bridge._PROVIDER = "yclients"
        self.capture = {}
        self._client_timeout = self.bridge.aiohttp.ClientTimeout
        self._client_session = self.bridge.aiohttp.ClientSession
        self.bridge.aiohttp.ClientTimeout = lambda **_kwargs: object()
        self.bridge.aiohttp.ClientSession = lambda **kwargs: _FakeSession(
            self.capture, **kwargs
        )

    def tearDown(self):
        self.bridge.aiohttp.ClientTimeout = self._client_timeout
        self.bridge.aiohttp.ClientSession = self._client_session
        os.environ.clear()
        os.environ.update(self._saved_env)
        sys.modules.pop("maya_loyalty_shadow_bridge", None)
        if self._saved_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = self._saved_aiohttp

    def test_submits_only_the_exact_pii_free_shadow_candidate(self):
        result = asyncio.run(self.bridge.plan_earn(
            external_client_id=7007,
            visit_record_id=9001,
            visit_occurred_on="2026-08-29",
            visit_amount_rubles=2_000,
            legacy_claimed_points=100,
        ))

        self.assertEqual(result["actionExecutionId"], "execution-earn-1")
        self.assertEqual(result["newPathValueMutations"], 0)
        self.assertEqual(result["newPathProviderWrites"], 0)
        self.assertEqual(self.capture["json"], {
            "contract": "maya.legacy-loyalty-earn-shadow-bridge/1",
            "provider": "yclients",
            "external_company_id": "company-42",
            "external_client_id": "7007",
            "visit_record_id": "9001",
            "visit_occurred_on": "2026-08-29",
            "visit_amount_rubles": 2_000,
            "legacy_claimed_points": 100,
        })
        self.assertNotIn("tenantId", self.capture["json"])
        self.assertNotIn("approved", self.capture["json"])
        self.assertNotIn("autonomy", self.capture["json"])
        self.assertNotIn("phone", self.capture["json"])

    def test_disabled_shadow_opens_no_http_session(self):
        os.environ["MAYA_LEGACY_LOYALTY_EARN_SHADOW_ENABLED"] = "false"
        self.bridge.aiohttp.ClientSession = lambda **_kwargs: self.fail(
            "disabled Shadow must not open a session"
        )

        result = asyncio.run(self.bridge.plan_earn(
            external_client_id=7007,
            visit_record_id=9001,
            visit_occurred_on="2026-08-29",
            visit_amount_rubles=2_000,
            legacy_claimed_points=100,
        ))

        self.assertEqual(result["outcome"], "shadow_disabled")
        self.assertEqual(result["newPathValueMutations"], 0)
        self.assertEqual(result["newPathProviderWrites"], 0)


if __name__ == "__main__":
    unittest.main()
