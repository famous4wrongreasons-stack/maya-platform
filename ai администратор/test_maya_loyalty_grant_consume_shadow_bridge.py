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
            "actionExecutionId": "execution-grant-consume-1",
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


class LegacyLoyaltyGrantConsumeShadowBridgeTests(unittest.TestCase):
    def setUp(self):
        self._saved_env = os.environ.copy()
        os.environ["MAYA_LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_ENABLED"] = "true"
        os.environ["MAYA_BRIDGE_COMPANY_ID"] = "company-42"
        self._saved_aiohttp = sys.modules.get("aiohttp")
        fake_aiohttp = types.ModuleType("aiohttp")
        fake_aiohttp.ClientTimeout = lambda **_kwargs: object()
        fake_aiohttp.ClientSession = lambda **_kwargs: None
        sys.modules["aiohttp"] = fake_aiohttp
        sys.modules.pop("maya_loyalty_grant_consume_shadow_bridge", None)
        self.bridge = importlib.import_module(
            "maya_loyalty_grant_consume_shadow_bridge"
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
        sys.modules.pop("maya_loyalty_grant_consume_shadow_bridge", None)
        if self._saved_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = self._saved_aiohttp

    def test_submits_transient_bearer_without_authority_or_mutation_fields(self):
        result = asyncio.run(
            self.bridge.plan_grant_consume(
                external_requester_id=8008,
                initiator_kind="telegram_cashier",
                redemption_code="loy-one-time-8008",
                legacy_claimed_points=1200,
                legacy_claimed_balance_points=1500,
                legacy_claimed_used=False,
                legacy_claimed_expired=False,
            )
        )

        self.assertEqual(
            result["actionExecutionId"], "execution-grant-consume-1"
        )
        self.assertEqual(result["newPathValueMutations"], 0)
        self.assertEqual(result["newPathProviderWrites"], 0)
        self.assertEqual(
            self.capture["json"],
            {
                "contract": "maya.legacy-loyalty-grant-consume-shadow-bridge/1",
                "provider": "yclients",
                "external_company_id": "company-42",
                "requester_identity_provider": "telegram",
                "external_requester_id": "8008",
                "initiator_kind": "telegram_cashier",
                "redemption_code": "LOY-ONE-TIME-8008",
                "legacy_claimed_points": 1200,
                "legacy_claimed_balance_points": 1500,
                "legacy_claimed_used": False,
                "legacy_claimed_expired": False,
            },
        )
        for forbidden in (
            "tenantId",
            "canonicalGrantId",
            "requesterRole",
            "entitled",
            "approved",
            "autonomy",
            "policyDecision",
            "approvalBindingHash",
            "codeHash",
            "perRedemptionCapPoints",
            "executor",
        ):
            self.assertNotIn(forbidden, self.capture["json"])

    def test_missing_requester_or_bearer_opens_no_http_session(self):
        self.bridge.aiohttp.ClientSession = lambda **_kwargs: self.fail(
            "unresolved consume identity must not open a session"
        )

        result = asyncio.run(
            self.bridge.plan_grant_consume(
                external_requester_id=None,
                initiator_kind="panel_cashier",
                redemption_code="LOY-ONE-TIME-8008",
                legacy_claimed_points=1200,
                legacy_claimed_balance_points=1500,
                legacy_claimed_used=False,
                legacy_claimed_expired=False,
            )
        )

        self.assertEqual(result["outcome"], "identity_unresolved")
        self.assertEqual(result["newPathValueMutations"], 0)
        self.assertEqual(result["newPathProviderWrites"], 0)


if __name__ == "__main__":
    unittest.main()
