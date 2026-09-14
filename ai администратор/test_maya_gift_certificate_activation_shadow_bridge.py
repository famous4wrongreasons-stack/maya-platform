import asyncio
import importlib
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class _Response:
    status = 200

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def json(self):
        return {"outcome": "planned", "actionExecutionId": "shadow-1"}


class _Session:
    def __init__(self, captured, **kwargs):
        self.captured = captured
        self.captured["session_kwargs"] = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def post(self, url, **kwargs):
        self.captured["url"] = url
        self.captured["post_kwargs"] = kwargs
        return _Response()


class GiftCertificateActivationShadowBridgeTest(unittest.TestCase):
    def setUp(self):
        self._saved_env = os.environ.copy()
        self._saved_aiohttp = sys.modules.get("aiohttp")

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._saved_env)
        sys.modules.pop("maya_gift_certificate_activation_shadow_bridge", None)
        if self._saved_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = self._saved_aiohttp

    def _load(self, *, enabled="true"):
        env = {
            "MAYA_GIFT_CERTIFICATE_ACTIVATION_SHADOW_ENABLED": enabled,
            "MAYA_INBOX_BRIDGE_TOKEN": "x" * 32,
            "MAYA_BRIDGE_PROVIDER": "yclients",
            "MAYA_BRIDGE_COMPANY_ID": "company-42",
        }
        os.environ.update(env)
        fake_aiohttp = types.ModuleType("aiohttp")
        fake_aiohttp.ClientTimeout = lambda **_kwargs: object()
        fake_aiohttp.ClientSession = lambda **_kwargs: None
        sys.modules["aiohttp"] = fake_aiohttp
        sys.modules.pop("maya_gift_certificate_activation_shadow_bridge", None)
        return importlib.import_module(
            "maya_gift_certificate_activation_shadow_bridge"
        )

    def test_submits_only_checkout_and_client_evidence(self):
        module = self._load()
        captured = {}

        with patch.object(
            module.aiohttp,
            "ClientSession",
            side_effect=lambda **kwargs: _Session(captured, **kwargs),
        ):
            result = asyncio.run(
                module.plan_activation(
                    external_client_id="provider-client-7",
                    checkout_execution_id="checkout-execution-1",
                    initiator="provider_webhook",
                )
            )

        self.assertEqual(result["outcome"], "planned")
        body = captured["post_kwargs"]["json"]
        self.assertEqual(
            body,
            {
                "contract": "maya.gift-certificate-activation-shadow-bridge/1",
                "initiator": "provider_webhook",
                "provider": "yclients",
                "external_company_id": "company-42",
                "external_client_id": "provider-client-7",
                "checkout_execution_id": "checkout-execution-1",
            },
        )
        forbidden = {
            "paid",
            "payment_status",
            "price",
            "value",
            "currency",
            "expires_at",
            "presentation_key_version",
            "bearer",
            "code",
            "code_hash",
            "authority",
            "approved",
        }
        self.assertTrue(forbidden.isdisjoint(body))

    def test_disabled_bridge_is_inert(self):
        module = self._load(enabled="false")

        with patch.object(module.aiohttp, "ClientSession") as session:
            result = asyncio.run(
                module.plan_activation(
                    external_client_id="provider-client-7",
                    checkout_execution_id="checkout-execution-1",
                )
            )

        self.assertEqual(result["outcome"], "shadow_disabled")
        session.assert_not_called()

    def test_incomplete_evidence_fails_before_http(self):
        module = self._load()

        with patch.object(module.aiohttp, "ClientSession") as session:
            result = asyncio.run(
                module.plan_activation(
                    external_client_id="",
                    checkout_execution_id="checkout-execution-1",
                )
            )

        self.assertEqual(result["outcome"], "identity_unresolved")
        session.assert_not_called()


if __name__ == "__main__":
    unittest.main()
