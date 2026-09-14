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
            "actionExecutionId": "execution-fulfillment-1",
            "shadowDivergences": 0,
            "newPathFulfillments": 0,
            "newPathLoyaltyValueMutations": 0,
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


class ReferralRewardFulfillShadowBridgeTests(unittest.TestCase):
    def setUp(self):
        self._saved_env = os.environ.copy()
        os.environ["MAYA_REFERRAL_REWARD_FULFILL_SHADOW_ENABLED"] = "true"
        os.environ["MAYA_BRIDGE_COMPANY_ID"] = "company-42"
        self._saved_aiohttp = sys.modules.get("aiohttp")
        fake_aiohttp = types.ModuleType("aiohttp")
        fake_aiohttp.ClientTimeout = lambda **_kwargs: object()
        fake_aiohttp.ClientSession = lambda **_kwargs: None
        sys.modules["aiohttp"] = fake_aiohttp
        sys.modules.pop("maya_referral_reward_fulfill_shadow_bridge", None)
        self.bridge = importlib.import_module(
            "maya_referral_reward_fulfill_shadow_bridge"
        )
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
        sys.modules.pop("maya_referral_reward_fulfill_shadow_bridge", None)
        if self._saved_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = self._saved_aiohttp

    def test_submits_transient_bearer_and_no_caller_authority(self):
        result = asyncio.run(self.bridge.plan_fulfillment(
            requester_identity_provider="telegram",
            external_requester_id=1001,
            recipient_external_client_id=8008,
            target_external_record_id=9009,
            reward_claim="MAYA-RR-ABC12345",
            legacy_claimed_value_kopecks=1500,
        ))

        self.assertEqual(result["actionExecutionId"], "execution-fulfillment-1")
        self.assertEqual(result["newPathFulfillments"], 0)
        self.assertEqual(result["newPathLoyaltyValueMutations"], 0)
        self.assertEqual(result["newPathProviderWrites"], 0)
        self.assertEqual(result["newPathMessages"], 0)
        self.assertEqual(self.capture["json"], {
            "contract": "maya.referral-reward-fulfill-shadow-bridge/1",
            "initiator": "cashier_claim",
            "provider": "yclients",
            "external_company_id": "company-42",
            "requester_identity_provider": "telegram",
            "external_requester_id": "1001",
            "recipient_external_client_id": "8008",
            "target_external_record_id": "9009",
            "reward_claim": "MAYA-RR-ABC12345",
            "legacy_claimed_value_kopecks": 1500,
            "legacy_claimed_fulfilled": False,
        })
        for forbidden in (
            "tenantId",
            "entitled",
            "approved",
            "autonomy",
            "policyDecision",
            "approvalBindingHash",
            "canonicalRewardId",
            "codeHash",
            "rewardAmountKopecks",
            "executor",
        ):
            self.assertNotIn(forbidden, self.capture["json"])

    def test_disabled_shadow_opens_no_http_session(self):
        os.environ["MAYA_REFERRAL_REWARD_FULFILL_SHADOW_ENABLED"] = "false"
        self.bridge.aiohttp.ClientSession = lambda **_kwargs: self.fail(
            "disabled Shadow must not open a session"
        )

        result = asyncio.run(self.bridge.plan_fulfillment(
            requester_identity_provider="telegram",
            external_requester_id=1001,
            recipient_external_client_id=8008,
            target_external_record_id=9009,
            reward_claim="MAYA-RR-ABC12345",
        ))

        self.assertEqual(result["outcome"], "shadow_disabled")
        self.assertEqual(result["newPathFulfillments"], 0)
        self.assertEqual(result["newPathLoyaltyValueMutations"], 0)


if __name__ == "__main__":
    unittest.main()
