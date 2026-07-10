import unittest
from unittest import mock

import reputation


class ReputationTests(unittest.TestCase):
    def test_parse_rating_label(self):
        result = reputation.parse_rating_label("4.9 (более 327 отзывов)")
        self.assertEqual(result["rating"], 4.9)
        self.assertEqual(result["reviews_count"], 327)

    def test_review_theme_analysis(self):
        result = reputation.analyze_reviews([
            {"source": "yandex", "rating": 2, "review_text": "Долго ждал, запись перенесли"},
            {"source": "2gis", "rating": 5, "review_text": "Отличная стрижка и мастер"},
        ])
        self.assertEqual(result["negative_count"], 1)
        self.assertEqual(result["positive_count"], 1)
        themes = {row["theme"]: row for row in result["themes"]}
        self.assertEqual(themes["ожидание"]["negative"], 1)
        self.assertEqual(themes["качество работы"]["positive"], 1)

    @mock.patch("reputation.database.upsert_external_review")
    def test_import_redacts_personal_data_and_is_idempotent_ready(self, save):
        result = reputation.import_reviews("yandex", [{
            "id": "r-1",
            "rating": 3,
            "text": "Позвоните мне +7 999 123-45-67, долго ждал",
            "published_at": "2026-07-09T12:00:00",
        }])
        self.assertTrue(result["ok"])
        self.assertEqual(result["imported"], 1)
        saved_text = save.call_args.kwargs["review_text"]
        self.assertNotIn("999", saved_text)


if __name__ == "__main__":
    unittest.main()
