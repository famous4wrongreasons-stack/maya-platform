import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def parsed(filename: str) -> ast.Module:
    path = ROOT / filename
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def function_node(tree: ast.Module, name: str):
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError(f"function {name} not found")


def called_names(node) -> set[str]:
    names: set[str] = set()
    for item in ast.walk(node):
        if not isinstance(item, ast.Call):
            continue
        if isinstance(item.func, ast.Attribute):
            names.add(item.func.attr)
        elif isinstance(item.func, ast.Name):
            names.add(item.func.id)
    return names


class ProvenCommunicationCutoverRatchetTests(unittest.TestCase):
    def test_privacy_command_has_one_action_engine_dispatch_and_no_direct_send(self):
        command = function_node(parsed("bot.py"), "cmd_privacy")
        command_source = ast.unparse(command)
        calls = called_names(command)

        self.assertEqual(command_source.count("deliver_privacy_telegram"), 1)
        self.assertNotIn("reply_text", calls)
        self.assertNotIn("send_message", calls)
        self.assertNotIn("PRIVACY_TEXT", command_source)
        self.assertIn("telegram_chat_id=message.chat_id", command_source)
        self.assertNotIn("telegram_chat_id=user.id", command_source)

    def test_privacy_bridge_is_fail_closed_and_cannot_send_to_telegram(self):
        bridge = function_node(
            parsed("maya_inbox_bridge.py"), "deliver_privacy_telegram"
        )
        bridge_source = ast.unparse(bridge)
        calls = called_names(bridge)

        self.assertIn("_PRIVACY_DELIVERY_URL", bridge_source)
        self.assertIn("_BRIDGE_TOKEN", bridge_source)
        self.assertNotIn("send_message", calls)
        self.assertNotIn("reply_text", calls)
        self.assertNotIn("PRIVACY_TEXT", bridge_source)
        self.assertNotIn("body_text", bridge_source)

    def test_privacy_executor_uses_canonical_policy_and_rejects_body_text(self):
        handler = function_node(
            parsed("webhook_server.py"), "internal_privacy_telegram_handler"
        )
        handler_source = ast.unparse(handler)

        self.assertIn("PRIVACY_TEXT", handler_source)
        self.assertNotIn("body.get('body_text'", handler_source)
        self.assertNotIn('body.get("body_text"', handler_source)
        self.assertIn("hmac.compare_digest", handler_source)
        self.assertIn("_maya_original_send_message_for_chat_mirror", handler_source)

    def test_unproven_privacy_callback_stays_outside_the_cutover_command(self):
        callback = function_node(parsed("bot.py"), "handle_callback")
        callback_source = ast.unparse(callback)

        self.assertIn("pdn_policy", callback_source)
        self.assertIn("reply_text(PRIVACY_TEXT", callback_source)
        self.assertNotIn("deliver_privacy_telegram", callback_source)


if __name__ == "__main__":
    unittest.main()
