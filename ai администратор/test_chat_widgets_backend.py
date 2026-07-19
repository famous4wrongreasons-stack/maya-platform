import json
import os
import sys
import unittest
from datetime import datetime


sys.path.insert(0, os.path.dirname(__file__))

import client_record_actions
from chat_widgets import (
    CHAT_WIDGETS,
    normalize_chat_widget,
    widget_for_action,
    widget_from_signal,
)
from test_claude_ai_rbac import _load_claude_ai


class _FakeYClients:
    def __init__(self, record=None, cancel_result=None, reschedule_result=None):
        self.record = record
        self.cancel_result = cancel_result or {"success": True}
        self.reschedule_result = reschedule_result or {"success": True}
        self.cancelled = []
        self.rescheduled = []

    def get_record(self, record_id):
        return self.record

    def cancel_booking(self, record_id):
        self.cancelled.append(record_id)
        return self.cancel_result

    def reschedule_booking(self, record_id, new_datetime, service_ids, staff_id):
        self.rescheduled.append((record_id, new_datetime, service_ids, staff_id))
        return {"record_id": record_id, **self.reschedule_result}


def _future_record(phone="+7 999 123-45-67"):
    return {
        "id": 77,
        "datetime": "2026-07-20T15:00:00+03:00",
        "client": {"phone": phone},
        "staff": {"id": 5},
        "services": [{"id": 9}],
    }


class ChatWidgetContractTests(unittest.TestCase):
    def test_contract_accepts_only_eight_known_widgets(self):
        self.assertEqual(len(CHAT_WIDGETS), 8)
        for widget in CHAT_WIDGETS:
            self.assertEqual(normalize_chat_widget(widget.upper()), widget)
        self.assertIsNone(normalize_chat_widget("payments"))
        self.assertIsNone(normalize_chat_widget({"book": True}))

    def test_legacy_actions_map_to_widget_contract(self):
        self.assertEqual(widget_for_action({"type": "open_booking"}), "book")
        self.assertEqual(widget_for_action({"type": "open_cabinet"}), "mybookings")
        self.assertEqual(widget_for_action({"type": "open_certs"}), "shop")
        self.assertIsNone(widget_for_action({"type": "run_job"}))

    def test_model_signal_wins_and_unknown_signal_falls_back_safely(self):
        self.assertEqual(
            widget_from_signal({"kind": "widget", "widget": "loyalty"}),
            "loyalty",
        )
        self.assertEqual(
            widget_from_signal(
                {"kind": "widget", "widget": "invalid"},
                {"type": "open_booking"},
            ),
            "book",
        )

    def test_widget_tool_is_always_available_to_client_context(self):
        claude_ai, _ = _load_claude_ai()
        self.assertIn(
            "show_chat_widget",
            claude_ai._client_relevant_tool_names([
                {"role": "user", "content": "Хочу привести себя в порядок к субботе"},
            ]),
        )
        self.assertTrue(claude_ai._authorize("client", "show_chat_widget", "client"))
        self.assertFalse(claude_ai._authorize("client", "show_chat_widget", "staff"))

    def test_widget_tool_emits_backend_signal_without_terminal_text(self):
        claude_ai, _ = _load_claude_ai()
        use = claude_ai._ToolUse(
            id="widget-1",
            name="show_chat_widget",
            input={"widget": "book"},
        )
        results, contact, signal = claude_ai._run_tool_uses(
            [use],
            [{"role": "user", "content": "Хочу записаться"}],
            user_id=123,
            mode="client",
        )
        self.assertIsNone(contact)
        self.assertEqual(signal, {"kind": "widget", "widget": "book"})
        self.assertEqual(json.loads(results[0]["content"])["status"], "ready")
        self.assertIsNone(
            claude_ai._client_terminal_action_text("client", "client", None, signal)
        )


class ClientRecordActionTests(unittest.TestCase):
    NOW = datetime.fromisoformat("2026-07-19T12:00:00+03:00")

    def test_cancel_checks_ownership_before_delete(self):
        yc = _FakeYClients(record=_future_record())
        markers = []

        result = client_record_actions.cancel_for_client(
            yc,
            77,
            "8 (999) 123-45-67",
            now=self.NOW,
            before_write=markers.append,
        )

        self.assertTrue(result["success"])
        self.assertEqual(markers, [77])
        self.assertEqual(yc.cancelled, [77])

    def test_foreign_record_is_rejected_without_write_or_marker(self):
        yc = _FakeYClients(record=_future_record("+7 900 000-00-00"))
        markers = []

        with self.assertRaises(client_record_actions.ClientRecordError) as raised:
            client_record_actions.cancel_for_client(
                yc,
                77,
                "+7 999 123-45-67",
                now=self.NOW,
                before_write=markers.append,
            )

        self.assertEqual(raised.exception.code, "not_yours")
        self.assertEqual(raised.exception.status, 403)
        self.assertEqual(markers, [])
        self.assertEqual(yc.cancelled, [])

    def test_started_record_returns_action_specific_machine_code(self):
        record = _future_record()
        record["datetime"] = "2026-07-19T11:59:00+03:00"
        yc = _FakeYClients(record=record)

        with self.assertRaises(client_record_actions.ClientRecordError) as cancel_error:
            client_record_actions.cancel_for_client(
                yc, 77, "+79991234567", now=self.NOW,
            )
        with self.assertRaises(client_record_actions.ClientRecordError) as move_error:
            client_record_actions.reschedule_for_client(
                yc,
                77,
                "+79991234567",
                {"date": "2026-07-21", "time": "16:30"},
                now=self.NOW,
            )

        self.assertEqual(cancel_error.exception.code, "too_late_to_cancel")
        self.assertEqual(move_error.exception.code, "too_late_to_reschedule")
        self.assertEqual(yc.cancelled, [])
        self.assertEqual(yc.rescheduled, [])

    def test_reschedule_uses_nondestructive_update_and_preserves_record_id(self):
        yc = _FakeYClients(record=_future_record())
        markers = []

        result = client_record_actions.reschedule_for_client(
            yc,
            77,
            "+79991234567",
            {"date": "2026-07-21", "time": "16:30"},
            now=self.NOW,
            before_write=markers.append,
        )

        self.assertEqual(result["record_id"], 77)
        self.assertEqual(result["datetime"], "2026-07-21 16:30:00")
        self.assertEqual(markers, [77])
        self.assertEqual(yc.rescheduled, [(77, "2026-07-21 16:30:00", None, None)])
        self.assertEqual(yc.cancelled, [])

    def test_invalid_or_past_new_time_is_rejected_before_write(self):
        yc = _FakeYClients(record=_future_record())

        for payload in (
            {"date": "21.07.2026", "time": "16:30"},
            {"date": "2026-07-18", "time": "16:30"},
        ):
            with self.subTest(payload=payload):
                with self.assertRaises(client_record_actions.ClientRecordError) as raised:
                    client_record_actions.reschedule_for_client(
                        yc, 77, "+79991234567", payload, now=self.NOW,
                    )
                self.assertEqual(raised.exception.code, "invalid_datetime")
        self.assertEqual(yc.rescheduled, [])


if __name__ == "__main__":
    unittest.main()
