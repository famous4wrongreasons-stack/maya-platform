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

    def test_owner_alert_is_emitted_only_for_a_new_queue(self):
        first_rows = [{"client_id": 11, "contact_status": "pending"}]
        first = cycle_reminder._owner_alert_for_snapshot(
            {}, first_rows, generated_at="2026-07-11T11:00:00", mode="scan",
        )
        self.assertTrue(first["active"])
        self.assertTrue(first["notify_required"])
        self.assertEqual(first["new_count"], 1)

        first["notify_required"] = False
        previous = {"candidates": first_rows, "owner_alert": first}
        repeated = cycle_reminder._owner_alert_for_snapshot(
            previous, first_rows, generated_at="2026-07-12T11:00:00", mode="scan",
        )
        self.assertEqual(repeated["event_id"], first["event_id"])
        self.assertFalse(repeated["notify_required"])

        grown_rows = first_rows + [{"client_id": 12, "contact_status": "pending"}]
        grown = cycle_reminder._owner_alert_for_snapshot(
            previous, grown_rows, generated_at="2026-07-12T11:05:00", mode="scan",
        )
        self.assertNotEqual(grown["event_id"], first["event_id"])
        self.assertTrue(grown["notify_required"])
        self.assertEqual(grown["candidate_count"], 2)
        self.assertEqual(grown["new_count"], 1)

    def test_empty_queue_allows_same_client_to_trigger_later(self):
        rows = [{"client_id": 11, "contact_status": "pending"}]
        first = cycle_reminder._owner_alert_for_snapshot(
            {}, rows, generated_at="2026-07-11T11:00:00", mode="scan",
        )
        empty = cycle_reminder._owner_alert_for_snapshot(
            {"candidates": rows, "owner_alert": first},
            [], generated_at="2026-07-11T12:00:00", mode="scan",
        )
        self.assertFalse(empty["active"])
        returned = cycle_reminder._owner_alert_for_snapshot(
            {"candidates": [], "owner_alert": empty},
            rows, generated_at="2026-07-11T13:00:00", mode="scan",
        )
        self.assertTrue(returned["notify_required"])
        self.assertNotEqual(returned["event_id"], first["event_id"])

    def test_mark_owner_alert_notified_is_event_scoped(self):
        storage = {
            cycle_reminder.CANDIDATE_SNAPSHOT_KEY: json.dumps({
                "version": "maya_cycle_candidates_v1",
                "generated_at": "2026-07-11T11:00:00",
                "summary": {"pending": 1},
                "candidates": [{"client_id": 11, "contact_status": "pending"}],
                "owner_alert": {
                    "event_id": "cycle-one",
                    "active": True,
                    "notify_required": True,
                },
            }),
        }
        with (
            patch.object(cycle_reminder.database, "get_setting", side_effect=lambda key: storage.get(key)),
            patch.object(
                cycle_reminder.database,
                "set_setting",
                side_effect=lambda key, value: storage.__setitem__(key, value),
            ),
        ):
            self.assertFalse(cycle_reminder.mark_owner_alert_notified("cycle-other"))
            self.assertTrue(cycle_reminder.mark_owner_alert_notified(
                "cycle-one", {"owners": 1, "push": 1, "attempted": True},
            ))
        saved = json.loads(storage[cycle_reminder.CANDIDATE_SNAPSHOT_KEY])
        self.assertFalse(saved["owner_alert"]["notify_required"])
        self.assertEqual(saved["owner_alert"]["delivery"]["push"], 1)

    def test_owner_push_payload_is_actionable_and_pii_free(self):
        snapshot = {
            "summary": {"pending": 2, "overdue": 1},
            "owner_alert": {
                "event_id": "cycle-20260711T110000-abc",
                "active": True,
                "notify_required": True,
                "candidate_count": 2,
                "new_count": 1,
            },
            "candidates": [{"client_id": 11, "name": "Иван", "phone": "+79990000000"}],
        }
        payload = cycle_reminder.owner_alert_push_payload(snapshot)
        serialized = json.dumps(payload, ensure_ascii=False)
        self.assertIn("owner.cycle_candidates", serialized)
        self.assertIn("owner_alert=cycle-", serialized)
        self.assertNotIn("Иван", serialized)
        self.assertNotIn("7999", serialized)


if __name__ == "__main__":
    unittest.main()
