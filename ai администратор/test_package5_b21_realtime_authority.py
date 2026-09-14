import ast
import json
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

if "requests" not in sys.modules:
    sys.modules["requests"] = types.SimpleNamespace(post=mock.Mock())

import legacy_client_command_bridge as transport

ROOT = Path(__file__).parent


def function_source(filename: str, name: str) -> str:
    source = (ROOT / filename).read_text(encoding="utf-8")
    tree = ast.parse(source, filename=filename)
    lines = source.splitlines(keepends=True)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return "".join(lines[node.lineno - 1:(node.end_lineno or node.lineno)])
    raise AssertionError(f"missing {name}")


class Package5B21RealtimeAuthorityTest(unittest.TestCase):
    def test_legacy_session_is_not_a_channel_proof(self):
        with self.assertRaises(ValueError):
            transport.channel_proof({}, {"session_token": "legacy"})

    def test_maya_jwt_and_telegram_are_the_only_realtime_sources(self):
        self.assertEqual(
            {"type": "maya_jwt", "credential": "jwt"},
            json.loads(transport.channel_proof({}, {"maya_token": "jwt"})),
        )
        self.assertEqual(
            "telegram_init_data",
            json.loads(
                transport.channel_proof(
                    {"X-Telegram-InitData": "signed"}, {}
                )
            )["type"],
        )

    def test_staff_turn_requires_maya_jwt_and_uses_canonical_ai_core(self):
        with self.assertRaises(ValueError):
            transport.staff_ai_turn(
                json.dumps({"type": "telegram_widget", "credential": "x"}),
                [{"role": "user", "content": "hello"}],
                "rt_request_1",
            )
        response = mock.Mock(status_code=200)
        response.json.return_value = {"reply": "ok"}
        with mock.patch.object(transport.requests, "post", return_value=response) as post:
            result = transport.staff_ai_turn(
                json.dumps({"type": "maya_jwt", "credential": "jwt"}),
                [{"role": "user", "content": "hello"}],
                "rt_request_1",
            )
        self.assertEqual({"reply": "ok"}, result)
        self.assertEqual("Bearer jwt", post.call_args.kwargs["headers"]["Authorization"])
        self.assertEqual("staff", post.call_args.kwargs["json"]["audience"])

    def test_handler_and_session_have_no_legacy_authority_or_history(self):
        handler = function_source("webhook_server.py", "realtime_handler")
        session = function_source("realtime_bridge.py", "run_session")
        for forbidden in (
            "session_token", "resolve_session", "session_tg_user",
            "has_valid_consent_by_chat_id", "chat_id", "database.",
        ):
            self.assertNotIn(forbidden, handler)
        for forbidden in (
            "chat_id", "load_conversations", "save_conversations",
            "database.", "_resolve_role", "ClientRealtimeConversation",
        ):
            self.assertNotIn(forbidden, session)
        self.assertLess(
            handler.index('client_command, "realtime-authority"'),
            handler.index('"type": "ready"'),
        )
        self.assertIn("history: list[dict] = []", session)
        self.assertIn("history.clear()", session)
        ast.parse(session)


if __name__ == "__main__":
    unittest.main()
