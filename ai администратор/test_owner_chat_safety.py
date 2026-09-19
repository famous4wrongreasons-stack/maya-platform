from test_support_canonical_principal import verified_request
import json
import os
import sys
import time
import unittest
from datetime import datetime


sys.path.insert(0, os.path.dirname(__file__))

from maya_identity import enforce_maya_feminine
from test_chat_routing import _load_webhook_server


class MayaIdentityTests(unittest.TestCase):
    def test_first_person_masculine_forms_are_corrected(self):
        self.assertEqual(
            enforce_maya_feminine(
                "Понял. Я был уверен и сам всё проверил. Не расслышал вас."
            ),
            "Поняла. Я была уверена и сама всё проверила. Не расслышала вас.",
        )

    def test_third_person_masculine_forms_are_not_changed(self):
        text = "Клиент должен прийти, мастер сделал стрижку."
        self.assertEqual(enforce_maya_feminine(text), text)

    def test_explicit_identity_is_always_feminine(self):
        self.assertEqual(
            enforce_maya_feminine("Я мужчина и говорю о себе в мужском роде."),
            "Я женщина и говорю о себе в женском роде.",
        )


class OwnerChatSafetyTests(unittest.TestCase):
    def setUp(self):
        self._saved_modules = sys.modules.copy()
        self.ws = _load_webhook_server()
        self.db = sys.modules["database"]
        self.settings = {}
        self.db.get_setting = lambda key, default=None: self.settings.get(key, default)
        self.db.set_setting = lambda key, value: self.settings.__setitem__(key, value)
        self.db.log_tool_call = lambda *args, **kwargs: None
        self.db.list_owner_actions = lambda limit=20: []

    def tearDown(self):
        sys.modules.clear()
        sys.modules.update(self._saved_modules)

    def test_natural_confirmation_requires_recent_pending_card(self):
        self.assertEqual(
            self.ws._pending_owner_job_decision(948205934, "Да, запускай", "staff"),
            (None, None),
        )

        self.ws._remember_pending_owner_job(948205934, "cycle")

        self.assertEqual(
            self.ws._pending_owner_job_decision(948205934, "Да, запускай рассылку", "staff"),
            ("confirm", "cycle"),
        )
        self.assertEqual(
            self.ws._pending_owner_job_decision(948205934, "Да", "staff"),
            (None, None),
        )

    def test_expired_or_cancelled_approval_cannot_run(self):
        key = self.ws._owner_pending_job_key(948205934)
        self.settings[key] = json.dumps({
            "job": "cycle",
            "created_at": time.time() - self.ws._OWNER_JOB_APPROVAL_TTL_SECONDS - 1,
        })
        self.assertEqual(
            self.ws._pending_owner_job_decision(948205934, "Запускай", "staff"),
            (None, None),
        )

        self.ws._remember_pending_owner_job(948205934, "cycle")
        self.assertEqual(
            self.ws._pending_owner_job_decision(948205934, "Не надо", "staff"),
            ("cancel", "cycle"),
        )

    def test_zero_audience_suppresses_action_card(self):
        self.ws.cycle_reminder.load_candidate_snapshot = lambda: {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "summary": {"pending": 0},
        }
        action, reply = self.ws._owner_job_action_card({
            "kind": "run_job",
            "job": "cycle",
            "label": "Написать клиентам",
        }, 948205934)

        self.assertIsNone(action)
        self.assertIn("нет клиентов", reply)
        self.assertIn("никому ничего не отправила", reply)

    def test_positive_audience_creates_one_pending_action(self):
        self.ws.cycle_reminder.load_candidate_snapshot = lambda: {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "summary": {"pending": 3},
        }
        action, reply = self.ws._owner_job_action_card({
            "kind": "run_job",
            "job": "cycle",
        }, 948205934)

        self.assertIsNone(reply)
        self.assertEqual(action["confirm"], "__runjob:cycle")
        pending = json.loads(self.settings[self.ws._owner_pending_job_key(948205934)])
        self.assertEqual(pending["job"], "cycle")

    def test_job_result_never_claims_zero_send_was_delivered(self):
        zero = self.ws._owner_job_result_reply(
            "cycle", "Вернуть клиентов", {"candidates": 0, "sent": 0}
        )
        sent = self.ws._owner_job_result_reply(
            "cycle", "Вернуть клиентов", {"candidates": 2, "sent": 2}
        )
        unverified = self.ws._owner_job_result_reply(
            "cycle", "Вернуть клиентов", {}
        )

        self.assertIn("никому ничего не отправила", zero)
        self.assertNotIn("рассылка ушла", zero.lower())
        self.assertEqual(sent, "Готово. Отправила сообщения: 2.")
        self.assertIn("не вернул подтверждённое число", unverified)

    @verified_request('platform_owner', 948205934)
    def test_status_question_uses_server_journal(self):
        self.db.list_owner_actions = lambda limit=20: [{
            "job": "cycle",
            "title": "Вернуть клиентов",
            "status": "done",
            "summary": {"candidates": 0, "sent": 0},
        }]

        reply = self.ws._owner_job_status_reply(
            948205934, "Почему рассылка не ушла?", "staff"
        )

        self.assertIn("никому ничего не отправила", reply)

    def test_owner_job_result_is_saved_in_staff_history(self):
        self.ws._cabinet_response = lambda data, status=200: {"data": data, "status": status}

        response = self.ws._owner_job_chat_response(
            948205934, "Да, запускай", "Проверила. Отправлено: 0."
        )

        history = sys.modules["memory"].load_conversations()["pwa:staff:948205934"]
        self.assertEqual([item["role"] for item in history], ["user", "assistant"])
        self.assertIn("Проверила", response["data"]["reply"])
        self.assertTrue(response["data"]["message_id"].startswith("msg_"))


if __name__ == "__main__":
    unittest.main()
