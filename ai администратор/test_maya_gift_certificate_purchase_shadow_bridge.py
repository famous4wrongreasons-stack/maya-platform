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
            "actionExecutionId": "execution-gift-certificate-checkout-1",
            "shadowDivergences": 0,
            "providerCheckoutsCreatedByNewPath": 0,
            "paymentMutationsByNewPath": 0,
            "certificatesCreatedOrActivatedByNewPath": 0,
            "redemptionsCreatedByNewPath": 0,
            "providerValueWritesByNewPath": 0,
            "messagesSentByNewPath": 0,
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


class GiftCertificatePurchaseShadowBridgeTests(unittest.TestCase):
    def setUp(self):
        self._saved_env = os.environ.copy()
        os.environ["MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_ENABLED"] = "true"
        os.environ["MAYA_BRIDGE_COMPANY_ID"] = "company-42"
        self._saved_aiohttp = sys.modules.get("aiohttp")
        fake_aiohttp = types.ModuleType("aiohttp")
        fake_aiohttp.ClientTimeout = lambda **_kwargs: object()
        fake_aiohttp.ClientSession = lambda **_kwargs: None
        sys.modules["aiohttp"] = fake_aiohttp
        sys.modules.pop("maya_gift_certificate_purchase_shadow_bridge", None)
        self.bridge = importlib.import_module(
            "maya_gift_certificate_purchase_shadow_bridge"
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
        sys.modules.pop("maya_gift_certificate_purchase_shadow_bridge", None)
        if self._saved_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = self._saved_aiohttp

    def test_submits_only_intent_and_opaque_identity_evidence(self):
        result = asyncio.run(
            self.bridge.plan_purchase(
                external_client_id=7007,
                purchase_intent_ref="telegram-update-101",
                offer_code="gift-certificate.3000",
                recipient_subject_ref="a" * 64,
            )
        )

        self.assertEqual(
            result["actionExecutionId"], "execution-gift-certificate-checkout-1"
        )
        self.assertEqual(result["providerCheckoutsCreatedByNewPath"], 0)
        self.assertEqual(result["paymentMutationsByNewPath"], 0)
        self.assertEqual(result["certificatesCreatedOrActivatedByNewPath"], 0)
        self.assertEqual(result["redemptionsCreatedByNewPath"], 0)
        self.assertEqual(result["providerValueWritesByNewPath"], 0)
        self.assertEqual(
            self.capture["json"],
            {
                "contract": "maya.gift-certificate-purchase-shadow-bridge/1",
                "initiator": "telegram_gift_certificate_purchase",
                "provider": "yclients",
                "external_company_id": "company-42",
                "external_client_id": "7007",
                "purchase_intent_ref": "telegram-update-101",
                "offer_code": "gift-certificate.3000",
                "recipient_subject_ref": "a" * 64,
            },
        )
        for forbidden in (
            "tenantId",
            "price",
            "value",
            "currency",
            "entitled",
            "approved",
            "autonomy",
            "executor",
            "certificate_code",
            "bearer",
            "recipient_phone",
            "recipient_name",
        ):
            self.assertNotIn(forbidden, self.capture["json"])

    def test_disabled_shadow_opens_no_http_session(self):
        os.environ["MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_ENABLED"] = "false"
        self.bridge.aiohttp.ClientSession = lambda **_kwargs: self.fail(
            "disabled Shadow must not open a session"
        )

        result = asyncio.run(
            self.bridge.plan_purchase(
                external_client_id=7007,
                purchase_intent_ref="telegram-update-101",
                offer_code="gift-certificate.3000",
                recipient_subject_ref="a" * 64,
            )
        )

        self.assertEqual(result["outcome"], "shadow_disabled")
        self.assertEqual(result["providerCheckoutsCreatedByNewPath"], 0)
        self.assertEqual(result["certificatesCreatedOrActivatedByNewPath"], 0)
        self.assertEqual(result["providerValueWritesByNewPath"], 0)

    def test_raw_recipient_identity_is_rejected_before_http(self):
        self.bridge.aiohttp.ClientSession = lambda **_kwargs: self.fail(
            "raw recipient identity must not leave the legacy boundary"
        )

        result = asyncio.run(
            self.bridge.plan_purchase(
                external_client_id=7007,
                purchase_intent_ref="telegram-update-101",
                offer_code="gift-certificate.3000",
                recipient_subject_ref="+7 999 123-45-67",
            )
        )

        self.assertEqual(result["outcome"], "identity_unresolved")
        self.assertEqual(result["providerValueWritesByNewPath"], 0)


if __name__ == "__main__":
    unittest.main()
