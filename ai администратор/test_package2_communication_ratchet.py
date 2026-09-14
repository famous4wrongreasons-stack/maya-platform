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


PACKAGE2_PRODUCERS = {
    "webhook_server.py": {
        "_send_growth_role_briefs_once": "publish_inbox_item",
        "_send_master_day_briefs_once": "publish_inbox_item",
        "_send_shift_reminders_once": "publish_inbox_item",
        "notify_owner_cycle_candidates": "publish_inbox_item",
        "_notify_owner_reputation": "publish_inbox_item",
    },
    "bot.py": {
        "notify_owner": "publish_owner_message",
        "_director_briefing_job": "notify_owner",
        "_daily_report_job": "trigger_owner_daily_report",
        "_god_watch_job": "publish_inbox_item",
        "_dual_role_guard_job": "publish_inbox_item",
    },
    "lead_alerts.py": {"scan_and_alert": "publish_inbox_item"},
    "birthday.py": {"run_birthday_job": "publish_inbox_item"},
}

FORBIDDEN_DIRECT_SENDS = {
    "send_message",
    "_send_client_push",
    "_send_master_push",
    "_store_assistant_message_in_chat",
}


class Package2CommunicationRatchetTests(unittest.TestCase):
    def test_a11_a13_producers_have_one_canonical_owner_and_no_direct_send(self):
        for filename, producers in PACKAGE2_PRODUCERS.items():
            tree = parsed(filename)
            for function_name, canonical_call in producers.items():
                with self.subTest(file=filename, function=function_name):
                    node = function_node(tree, function_name)
                    calls = called_names(node)
                    source = ast.unparse(node)

                    self.assertIn(canonical_call, calls)
                    self.assertTrue(FORBIDDEN_DIRECT_SENDS.isdisjoint(calls))
                    self.assertNotIn("legacy fallback", source.lower())

    def test_protected_telegram_executor_dispatches_once_without_retry_or_fallback(self):
        handler = function_node(
            parsed("webhook_server.py"), "internal_package2_telegram_handler"
        )
        source = ast.unparse(handler)
        calls = called_names(handler)

        self.assertIn("hmac.compare_digest", source)
        self.assertEqual(
            source.count("_maya_original_send_message_for_chat_mirror"), 1
        )
        self.assertNotIn("publish_inbox_item", calls)
        self.assertNotIn("publish_owner_message", calls)
        self.assertNotIn("_send_client_push", calls)
        self.assertNotIn("_send_master_push", calls)
        self.assertNotIn("while ", source)


if __name__ == "__main__":
    unittest.main()
