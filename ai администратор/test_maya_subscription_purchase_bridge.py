import importlib
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(__file__))


class _Response:
    status_code = 200

    def json(self):
        return {
            "outcome": "checkout_ready",
            "actionExecutionId": "execution-1",
            "confirmation_url": "https://provider.invalid/confirm",
        }


class SubscriptionPurchaseBridgeTests(unittest.TestCase):
    def setUp(self):
        self.saved_env = os.environ.copy()
        os.environ["MAYA_INBOX_BRIDGE_TOKEN"] = "t" * 32
        self.saved_config = sys.modules.get("config")
        config = types.ModuleType("config")
        config.YCLIENTS_COMPANY_ID = "company-42"
        sys.modules["config"] = config
        self.saved_requests = sys.modules.get("requests")
        requests = types.ModuleType("requests")
        requests.post = lambda *_args, **_kwargs: None
        sys.modules["requests"] = requests
        sys.modules.pop("maya_subscription_purchase_bridge", None)
        self.bridge = importlib.import_module("maya_subscription_purchase_bridge")
        self.capture = {}
        self.original_post = self.bridge.requests.post

        def post(url, *, headers, json, timeout):
            self.capture.update(
                url=url, headers=headers, json=json, timeout=timeout
            )
            return _Response()

        self.bridge.requests.post = post

    def tearDown(self):
        self.bridge.requests.post = self.original_post
        os.environ.clear()
        os.environ.update(self.saved_env)
        sys.modules.pop("maya_subscription_purchase_bridge", None)
        if self.saved_config is None:
            sys.modules.pop("config", None)
        else:
            sys.modules["config"] = self.saved_config
        if self.saved_requests is None:
            sys.modules.pop("requests", None)
        else:
            sys.modules["requests"] = self.saved_requests

    def test_submits_only_verified_channel_and_customer_intent(self):
        result = self.bridge.initiate_purchase(
            channel_proof="signed-channel-proof",
            purchase_intent_ref="pwa-sub:stable-intent-1",
            offer_code="haircut.senior",
        )

        self.assertEqual(result["actionExecutionId"], "execution-1")
        self.assertEqual(
            self.capture["json"],
            {
                "contract": "maya.customer-subscription-purchase-cutover-bridge/1",
                "initiator": "pwa_subscription_purchase",
                "provider": "yclients",
                "external_company_id": "company-42",
                "channel_proof": "signed-channel-proof",
                "purchase_intent_ref": "pwa-sub:stable-intent-1",
                "offer_code": "haircut.senior",
            },
        )
        for forbidden in ("clientId", "tenantId", "price", "currency", "phone"):
            self.assertNotIn(forbidden, self.capture["json"])

    def test_rejected_upstream_fails_closed(self):
        class Rejected(_Response):
            status_code = 403

        self.bridge.requests.post = lambda *_args, **_kwargs: Rejected()
        with self.assertRaisesRegex(ValueError, "verified_client_or_checkout_conflict"):
            self.bridge.initiate_purchase(
                channel_proof="proof",
                purchase_intent_ref="pwa-sub:stable-intent-1",
                offer_code="haircut.senior",
            )


if __name__ == "__main__":
    unittest.main()
