import tempfile
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

import site_engagement


SLUG = "forma-kotoraya-rabotaet-kazhdy-den"


class SiteEngagementTests(unittest.TestCase):
    def setUp(self):
        self._tempdir = tempfile.TemporaryDirectory()
        self._db_patch = mock.patch.object(
            site_engagement,
            "DB_PATH",
            str(Path(self._tempdir.name) / "site-engagement.db"),
        )
        self._db_patch.start()
        site_engagement.init_schema()

    def tearDown(self):
        self._db_patch.stop()
        self._tempdir.cleanup()

    def test_view_is_counted_once_per_viewer_and_day(self):
        self.assertTrue(site_engagement.record_view(SLUG, "viewer-a"))
        self.assertFalse(site_engagement.record_view(SLUG, "viewer-a"))
        self.assertTrue(site_engagement.record_view(SLUG, "viewer-b"))
        self.assertEqual(site_engagement.event_status(SLUG)["stats"]["views"], 2)

    def test_like_toggles_and_remembers_current_user(self):
        self.assertTrue(site_engagement.toggle_like(SLUG, 17))
        self.assertEqual(
            site_engagement.event_status(SLUG, 17)["stats"],
            {"views": 0, "likes": 1, "comments": 0, "liked": True},
        )
        self.assertFalse(site_engagement.toggle_like(SLUG, 17))
        self.assertFalse(site_engagement.event_status(SLUG, 17)["stats"]["liked"])

    def test_public_status_hides_pending_and_counts_only_people(self):
        approved_id = site_engagement.add_comment(
            SLUG, 5, "Алексей", "Хороший разбор формы.", "approved", "clean"
        )
        site_engagement.add_comment(
            SLUG, 6, "Иван", "Этот текст ждёт проверки.", "pending", "ai_review"
        )
        site_engagement.add_brand_reply(
            SLUG, approved_id, "Спасибо. Рады, что было полезно."
        )

        payload = site_engagement.event_status(SLUG)
        self.assertEqual(payload["stats"]["comments"], 1)
        self.assertEqual(len(payload["comments"]), 2)
        self.assertTrue(payload["comments"][1]["is_brand_reply"])

    def test_obvious_abuse_and_personal_data_are_rejected(self):
        self.assertEqual(site_engagement.deterministic_moderation("Ты идиот")[0], "reject")
        self.assertEqual(site_engagement.deterministic_moderation("Какая-то блядь")[0], "reject")
        self.assertEqual(
            site_engagement.deterministic_moderation(
                "Перезвоните мне +7 999 123-45-67"
            ),
            ("reject", "personal_data"),
        )

    def test_healthy_criticism_reaches_context_review(self):
        decision, _ = site_engagement.deterministic_moderation(
            "Мне не понравилось, что пришлось ждать двадцать минут."
        )
        self.assertEqual(decision, "review")

    def test_moderation_uses_active_maya_model_without_tools(self):
        brain = types.SimpleNamespace(
            AI_PROVIDER="openai", CLAUDE_MODEL="deepseek-v4-pro",
            _uses_responses_api=lambda model: False,
            _is_deepseek_model=lambda model: model.startswith("deepseek-"),
            _chat_completion=mock.Mock(return_value={"choices": [{"message": {
                "content": '{"decision":"approve","reason":"healthy_criticism"}'}}]}),
        )
        billing = mock.Mock()
        with mock.patch.dict(sys.modules, {"claude_ai": brain, "ai_billing": billing}):
            result = site_engagement.moderate_comment("Пришлось долго ждать, это неудобно.")
        self.assertEqual(result[0], "approve")
        body = brain._chat_completion.call_args.args[0]
        self.assertEqual(body["model"], "deepseek-v4-pro")
        self.assertIn("max_tokens", body)
        self.assertNotIn("tools", body)
        self.assertNotIn("max_completion_tokens", body)
        billing.log_openai_usage.assert_called_once()

    def test_model_failure_holds_comment_for_review(self):
        with mock.patch.object(site_engagement, "_maya_text", side_effect=RuntimeError):
            self.assertEqual(site_engagement.moderate_comment("Мне не понравилась стрижка."),
                             ("review", "moderation_unavailable"))

    def test_hidden_parent_hides_reply_and_prevents_late_reply(self):
        parent = site_engagement.add_comment(SLUG, 5, "Гость", "Вопрос", "approved", "clean")
        site_engagement.add_brand_reply(SLUG, parent, "Ответ")
        with site_engagement._connect() as db:
            db.execute("UPDATE site_event_comments SET status='rejected' WHERE id=?", (parent,))
        self.assertEqual(site_engagement.event_status(SLUG)["comments"], [])
        self.assertIsNone(site_engagement.add_brand_reply(SLUG, parent, "Поздний ответ"))


if __name__ == "__main__":
    unittest.main()
