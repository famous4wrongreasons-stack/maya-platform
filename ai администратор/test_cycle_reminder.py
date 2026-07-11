import json
import unittest
from datetime import date, timedelta
from unittest.mock import patch

import cycle_reminder


class CycleReminderQueueTests(unittest.TestCase):
    def _bookings(self):
        today = date.today()
        return [{
            "date": (today - timedelta(days=86)).isoformat(),
            "attendance": 1,
            "staff": {"id": 7, "name": "Мастер"},
        }, {
            "date": (today - timedelta(days=58)).isoformat(),
            "attendance": 1,
            "staff": {"id": 7, "name": "Мастер"},
        }, {
            "date": (today - timedelta(days=30)).isoformat(),
            "attendance": 1,
            "staff": {"id": 7, "name": "Мастер"},
        }]

    def test_find_due_clients_ranks_by_personal_cycle(self):
        client = {
            "id": 11,
            "telegram_chat_id": 1011,
            "name": "Иван Петров",
            "phone": "+7 999 111-22-33",
        }
        with (
            patch.object(cycle_reminder.database, "list_telegram_clients", return_value=[client]),
            patch.object(cycle_reminder.database, "has_marketing_consent", return_value=True),
            patch.object(cycle_reminder.database, "was_recently_cycle_reminded", return_value=False),
            patch.object(cycle_reminder.database, "was_recently_reactivated", return_value=False),
            patch.object(cycle_reminder.database, "was_recently_declined", return_value=False),
            patch.object(cycle_reminder._yc, "get_client_bookings", return_value=self._bookings()),
        ):
            rows = cycle_reminder.find_due_clients()

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["cycle_days"], 28)
        self.assertEqual(rows[0]["days_from_due"], 2)
        self.assertEqual(rows[0]["urgency"], "due")
        self.assertIn("прошёл 2 дн.", rows[0]["reason"])

    def test_persisted_queue_contains_no_names_phones_or_chat_ids(self):
        storage = {}
        candidate = {
            "client_id": 11,
            "chat_id": 1011,
            "name": "Иван Петров",
            "phone": "+7 999 111-22-33",
            "cycle_days": 28,
            "last_visit": "2026-06-08",
            "predicted_visit": "2026-07-06",
            "days_from_due": 2,
            "urgency": "due",
            "reason": "привычный срок прошёл 2 дн. назад · цикл 28 дн.",
            "visit_count": 4,
            "priority_score": 54,
            "last_staff_id": 7,
            "last_master": "Мастер",
        }

        with patch.object(
            cycle_reminder.database,
            "set_setting",
            side_effect=lambda key, value: storage.__setitem__(key, value),
        ):
            snapshot = cycle_reminder._persist_candidate_snapshot([candidate], mode="scan")

        persisted = storage[cycle_reminder.CANDIDATE_SNAPSHOT_KEY]
        self.assertEqual(snapshot["summary"]["pending"], 1)
        self.assertNotIn("Иван", persisted)
        self.assertNotIn("999", persisted)
        self.assertNotIn("chat_id", persisted)
        row = json.loads(persisted)["candidates"][0]
        self.assertEqual(row["client_id"], 11)
        self.assertEqual(row["contact_status"], "pending")


if __name__ == "__main__":
    unittest.main()
