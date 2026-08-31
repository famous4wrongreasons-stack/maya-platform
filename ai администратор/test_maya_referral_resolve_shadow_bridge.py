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
            "actionExecutionId": "execution-resolution-1",
            "shadowDivergences": 0,
            "newPathReferralMutations": 0,
            "newPathRewardValueMutations": 0,
            "newPathProviderWrites": 0,
            "newPathMessages": 0,
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


class ReferralResolveShadowBridgeTests(unittest.TestCase):
    def setUp(self):
        self._saved_env = os.environ.copy()
        os.environ["MAYA_REFERRAL_RESOLVE_SHADOW_ENABLED"] = "true"
        os.environ["MAYA_BRIDGE_COMPANY_ID"] = "company-42"
        self._saved_aiohttp = sys.modules.get("aiohttp")
        fake_aiohttp = types.ModuleType("aiohttp")
        fake_aiohttp.ClientTimeout = lambda **_kwargs: object()
        fake_aiohttp.ClientSession = lambda **_kwargs: None
        sys.modules["aiohttp"] = fake_aiohttp
        sys.modules.pop("maya_referral_resolve_shadow_bridge", None)
        self.bridge = importlib.import_module("maya_referral_resolve_shadow_bridge")
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
        sys.modules.pop("maya_referral_resolve_shadow_bridge", None)
        if self._saved_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = self._saved_aiohttp

    def test_submits_only_exact_evidence_without_authority(self):
        result = asyncio.run(self.bridge.plan_resolution(
            referrer_external_client_id=7007,
            referred_external_client_id=8008,
            provider_read_status="succeeded",
            visit_record_id=9001,
            visit_occurred_on="2026-08-31",
            visit_attendance=1,
            legacy_claimed_outcome="qualified",
        ))

        self.assertEqual(result["actionExecutionId"], "execution-resolution-1")
        self.assertEqual(result["newPathReferralMutations"], 0)
        self.assertEqual(result["newPathRewardValueMutations"], 0)
        self.assertEqual(result["newPathProviderWrites"], 0)
        self.assertEqual(result["newPathMessages"], 0)
        self.assertEqual(self.capture["json"]["contract"],
                         "maya.referral-resolve-shadow-bridge/1")
        self.assertEqual(self.capture["json"]["visit_record_id"], "9001")
        self.assertNotIn("tenantId", self.capture["json"])
        self.assertNotIn("eligible", self.capture["json"])
        self.assertNotIn("approved", self.capture["json"])
        self.assertNotIn("autonomy", self.capture["json"])
        self.assertNotIn("terminalOutcome", self.capture["json"])
        self.assertNotIn("phone", self.capture["json"])

    def test_disabled_shadow_opens_no_http_session(self):
        os.environ["MAYA_REFERRAL_RESOLVE_SHADOW_ENABLED"] = "false"
        self.bridge.aiohttp.ClientSession = lambda **_kwargs: self.fail(
            "disabled Shadow must not open a session"
        )

        result = asyncio.run(self.bridge.plan_resolution(
            referrer_external_client_id=7007,
            referred_external_client_id=8008,
            provider_read_status="not_run",
        ))

        self.assertEqual(result["outcome"], "shadow_disabled")
        self.assertEqual(result["newPathReferralMutations"], 0)
        self.assertEqual(result["newPathRewardValueMutations"], 0)
        self.assertEqual(result["newPathProviderWrites"], 0)


if __name__ == "__main__":
    unittest.main()
