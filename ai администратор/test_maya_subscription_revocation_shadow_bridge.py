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
        return {"outcome": "planned", "actionExecutionId": "revocation-shadow-1"}


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


class SubscriptionRevocationShadowBridgeTest(unittest.TestCase):
    def setUp(self):
        self._saved_env = os.environ.copy()
        os.environ[
            "MAYA_CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_ENABLED"
        ] = "true"
        os.environ["MAYA_BRIDGE_COMPANY_ID"] = "company-42"
        self._saved_aiohttp = sys.modules.get("aiohttp")
        fake_aiohttp = types.ModuleType("aiohttp")
        fake_aiohttp.ClientTimeout = lambda **_kwargs: object()
        fake_aiohttp.ClientSession = lambda **_kwargs: None
        sys.modules["aiohttp"] = fake_aiohttp
        sys.modules.pop("maya_subscription_revocation_shadow_bridge", None)
        self.bridge = importlib.import_module(
            "maya_subscription_revocation_shadow_bridge"
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
        sys.modules.pop("maya_subscription_revocation_shadow_bridge", None)
        if self._saved_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = self._saved_aiohttp

    def test_submits_evidence_without_actor_reason_effective_or_approval_authority(self):
        result = asyncio.run(
            self.bridge.plan_subscription_revocation(
                external_client_id="client-7",
                subscription_id="subscription-1",
                requester_identity_provider="telegram",
                external_requester_id="telegram-owner-1",
                revocation_decision_ref="decision-7001",
                revocation_evidence_ref="evidence-9001",
            )
        )

        self.assertEqual(result["outcome"], "planned")
        self.assertEqual(
            set(self.capture["json"]),
            {
                "contract",
                "initiator",
                "provider",
                "external_company_id",
                "external_client_id",
                "subscription_id",
                "requester_identity_provider",
                "external_requester_id",
                "revocation_decision_ref",
                "revocation_evidence_ref",
            },
        )
        for forbidden in (
            "requester_role",
            "requester_authority",
            "revocation_reason",
            "effective_date",
            "approval_binding",
            "approved",
            "entitled",
            "autonomy",
        ):
            self.assertNotIn(forbidden, self.capture["json"])

    def test_disabled_shadow_opens_no_http_session(self):
        os.environ[
            "MAYA_CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_ENABLED"
        ] = "false"
        self.bridge.aiohttp.ClientSession = lambda **_kwargs: self.fail(
            "disabled Shadow must not open a session"
        )

        result = asyncio.run(
            self.bridge.plan_subscription_revocation(
                external_client_id="client-7",
                subscription_id="subscription-1",
                requester_identity_provider="telegram",
                external_requester_id="telegram-owner-1",
                revocation_decision_ref="decision-7001",
                revocation_evidence_ref="evidence-9001",
            )
        )

        self.assertEqual(result["outcome"], "shadow_disabled")
        self.assertEqual(result["subscriptionsRevokedByNewPath"], 0)
        self.assertEqual(result["termMutationsByNewPath"], 0)
        self.assertEqual(result["providerWritesByNewPath"], 0)


if __name__ == "__main__":
    unittest.main()
