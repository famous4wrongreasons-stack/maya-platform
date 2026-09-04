import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import legacy_client_command_bridge as bridge


ROOT = Path(__file__).parent


def functions_from_source(filename, names, extra=None):
    tree = ast.parse((ROOT / filename).read_text())
    selected = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
    scope = {"web": SimpleNamespace(Request=object, Response=dict), "asyncio": asyncio,
             "logger": Mock(), "database": SimpleNamespace(CONSENT_VERSION="existing-policy"),
             "_PRIVACY_SHORT": "existing privacy text", "CONSENT_VERSION": "existing-policy",
             "_cabinet_response": lambda body, status=200: {"body": body, "status": status}}
    scope.update(extra or {})
    exec(compile(ast.Module(body=selected, type_ignores=[]), filename, "exec"), scope)
    return scope


class Request:
    def __init__(self, body, headers=None):
        self.body, self.headers = body, headers or {}

    async def json(self):
        return self.body


class ClientBridgeTests(unittest.TestCase):
    def setUp(self):
        self.handlers = functions_from_source("webhook_server.py", {"consent_submit_handler", "consent_status_handler"})

    def test_phone_derived_session_is_not_channel_authority(self):
        for body in [{"session_token": "legacy"}, {"phone": "+79990001001"}, {"clientId": "chosen"}]:
            with self.assertRaises(ValueError):
                bridge.channel_proof({}, body)

    def test_original_channel_credential_is_forwarded_without_resolution(self):
        import json
        self.assertEqual(json.loads(bridge.channel_proof({"X-Telegram-InitData": "original-signed-proof"}, {})),
                         {"type": "telegram_init_data", "credential": "original-signed-proof"})
        self.assertEqual(json.loads(bridge.channel_proof({"Authorization": "Bearer original-jwt"}, {}))["type"], "maya_jwt")

    def test_endpoint_rejects_forged_client_tenant_user_and_nonboolean_consent(self):
        for extra in [{"clientId": "chosen"}, {"tenantId": "other"}, {"userId": "chosen"}, {"accept_pdn": "true"}]:
            with patch.object(bridge, "command") as command:
                request = Request({"accept_pdn": True, "accept_marketing": False, "idempotency_key": "same-command", **extra}, {"X-Telegram-InitData": "signed"})
                result = asyncio.run(self.handlers["consent_submit_handler"](request))
                self.assertEqual(result["status"], 403)
                command.assert_not_called()

    def test_submit_and_retry_keep_identical_canonical_intent(self):
        calls = []
        def command(operation, proof, payload):
            calls.append((operation, proof, payload))
            return {"privacy": True, "marketing": False, "marketing_decided": True}
        with patch.object(bridge, "command", side_effect=command):
            request = Request({"accept_pdn": True, "accept_marketing": False, "idempotency_key": "same-command"}, {"X-Telegram-InitData": "signed"})
            for _ in range(2):
                result = asyncio.run(self.handlers["consent_submit_handler"](request))
                self.assertEqual(result["body"]["status"], "pass")
        self.assertEqual(calls[0], calls[2])
        self.assertEqual(calls[0][2], {"privacy": True, "marketing": False, "idempotencyKey": "same-command"})

    def test_transport_failure_has_no_sql_fallback(self):
        with patch.object(bridge, "command", side_effect=RuntimeError("unavailable")):
            result = asyncio.run(self.handlers["consent_submit_handler"](Request({"accept_pdn": True, "accept_marketing": False, "idempotency_key": "same-command"}, {"X-Telegram-InitData": "signed"})))
            self.assertEqual(result["status"], 503)

    def test_status_is_read_only_and_observes_canonical_revocation(self):
        with patch.object(bridge, "command", return_value={"privacy": False, "marketing": False}) as command:
            result = asyncio.run(self.handlers["consent_status_handler"](Request({}, {"X-Telegram-InitData": "signed"})))
            self.assertEqual(result["body"]["status"], "need_pdn")
            self.assertEqual(command.call_args.args[0], "status")

    def test_legacy_sql_writers_are_fail_closed(self):
        db = functions_from_source("database.py", {"save_consent", "set_marketing_consent"})
        for name in ["save_consent", "set_marketing_consent"]:
            with self.assertRaisesRegex(RuntimeError, "canonical_client_consent_required"):
                db[name](1, True)

    def test_delivery_reader_fails_closed_without_link_or_backend(self):
        with patch.object(bridge, "command", side_effect=RuntimeError("unavailable")):
            self.assertEqual(bridge.delivery_consent("12345"), {})
        self.assertEqual(bridge.delivery_consent("-79990001001"), {})


if __name__ == "__main__":
    unittest.main()
