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
            "actionExecutionId": "execution-issuance-1",
            "shadowDivergences": 0,
            "newPathRewardIssuances": 0,
            "newPathRewards": 0,
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


class ReferralRewardIssueShadowBridgeTests(unittest.TestCase):
    def setUp(self):
        self._saved_env = os.environ.copy()
        os.environ["MAYA_REFERRAL_REWARD_ISSUE_SHADOW_ENABLED"] = "true"
        os.environ["MAYA_BRIDGE_COMPANY_ID"] = "company-42"
        self._saved_aiohttp = sys.modules.get("aiohttp")
        fake_aiohttp = types.ModuleType("aiohttp")
        fake_aiohttp.ClientTimeout = lambda **_kwargs: object()
        fake_aiohttp.ClientSession = lambda **_kwargs: None
        sys.modules["aiohttp"] = fake_aiohttp
        sys.modules.pop("maya_referral_reward_issue_shadow_bridge", None)
        self.bridge = importlib.import_module(
            "maya_referral_reward_issue_shadow_bridge"
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
        sys.modules.pop("maya_referral_reward_issue_shadow_bridge", None)
        if self._saved_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = self._saved_aiohttp

    def test_submits_only_exact_identities_and_comparison_values(self):
        result = asyncio.run(self.bridge.plan_issuance(
            referrer_external_client_id=7007,
            referred_external_client_id=8008,
            legacy_claimed_inviter_reward_kopecks=1500,
            legacy_claimed_invitee_reward_kopecks=1500,
        ))

        self.assertEqual(result["actionExecutionId"], "execution-issuance-1")
        self.assertEqual(result["newPathRewardIssuances"], 0)
        self.assertEqual(result["newPathRewards"], 0)
        self.assertEqual(result["newPathLoyaltyValueMutations"], 0)
        self.assertEqual(result["newPathProviderWrites"], 0)
        self.assertEqual(result["newPathMessages"], 0)
        self.assertEqual(self.capture["json"], {
            "contract": "maya.referral-reward-issue-shadow-bridge/1",
            "initiator": "qualified_resolution",
            "provider": "yclients",
            "external_company_id": "company-42",
            "referrer_external_client_id": "7007",
            "referred_external_client_id": "8008",
            "legacy_claimed_inviter_reward_kopecks": 1500,
            "legacy_claimed_invitee_reward_kopecks": 1500,
        })
        for forbidden in (
            "tenantId",
            "entitled",
            "approved",
            "autonomy",
            "rewardPolicy",
            "rewardAmount",
            "expiresAt",
            "bearer",
        ):
            self.assertNotIn(forbidden, self.capture["json"])

    def test_disabled_shadow_opens_no_http_session(self):
        os.environ["MAYA_REFERRAL_REWARD_ISSUE_SHADOW_ENABLED"] = "false"
        self.bridge.aiohttp.ClientSession = lambda **_kwargs: self.fail(
            "disabled Shadow must not open a session"
        )

        result = asyncio.run(self.bridge.plan_issuance(
            referrer_external_client_id=7007,
            referred_external_client_id=8008,
        ))

        self.assertEqual(result["outcome"], "shadow_disabled")
        self.assertEqual(result["newPathRewardIssuances"], 0)
        self.assertEqual(result["newPathRewards"], 0)
        self.assertEqual(result["newPathLoyaltyValueMutations"], 0)


if __name__ == "__main__":
    unittest.main()
