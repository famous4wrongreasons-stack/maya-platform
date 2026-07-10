import json
import os
import tempfile
import unittest
from unittest import mock
from datetime import datetime, timedelta

import reputation


class ReputationTests(unittest.TestCase):
    def test_external_review_outbox_is_idempotent(self):
        database = reputation.database
        original_path = database.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as directory:
                database.DB_PATH = os.path.join(directory, "reviews.db")
                database.init_db()
                first = database.upsert_external_review(
                    source="yandex",
                    external_id="one",
                    rating=5,
                    review_text="Отлично",
                    published_at="2026-07-10T12:00:00",
                )
                second = database.upsert_external_review(
                    source="yandex",
                    external_id="one",
                    rating=5,
                    review_text="Отлично",
                    published_at="2026-07-10T12:00:00",
                )
                self.assertTrue(first["created"])
                self.assertFalse(second["created"])
                pending = database.list_unalerted_external_reviews()
                self.assertEqual(len(pending), 1)
                database.mark_external_reviews_alerted([pending[0]["id"]])
                self.assertEqual(database.list_unalerted_external_reviews(), [])
        finally:
            database.DB_PATH = original_path

    def test_parse_rating_label(self):
        result = reputation.parse_rating_label("4.9 (более 327 отзывов)")
        self.assertEqual(result["rating"], 4.9)
        self.assertEqual(result["reviews_count"], 327)

    def test_review_theme_analysis(self):
        result = reputation.analyze_reviews([
            {
                "source": "yandex", "rating": 2,
                "review_text": "Долго ждал, запись перенесли",
                "published_at": datetime.now().isoformat(timespec="seconds"),
            },
            {
                "source": "2gis", "rating": 5,
                "review_text": "Отличная стрижка и мастер",
                "published_at": datetime.now().isoformat(timespec="seconds"),
            },
        ])
        self.assertEqual(result["negative_count"], 1)
        self.assertEqual(result["positive_count"], 1)
        themes = {row["theme"]: row for row in result["themes"]}
        self.assertEqual(themes["ожидание"]["negative"], 1)
        self.assertEqual(themes["качество работы"]["positive"], 1)
        self.assertEqual(result["periods"]["new_7d"], 2)
        self.assertEqual(result["by_source"]["yandex"]["negative_30d"], 1)

    def test_source_trend_keeps_platforms_separate(self):
        settings = {}
        old_day = (datetime.now() - timedelta(days=31)).isoformat(timespec="seconds")
        settings[reputation._HISTORY_PREFIX + "yandex"] = json.dumps([{
            "date": old_day[:10],
            "observed_at": old_day,
            "rating": 4.8,
            "reviews_count": 100,
        }])

        with mock.patch.object(
            reputation.database, "get_setting",
            side_effect=lambda key, default=None: settings.get(key, default),
        ), mock.patch.object(
            reputation.database, "set_setting",
            side_effect=lambda key, value: settings.__setitem__(key, value),
        ):
            saved = reputation.save_source_snapshot(
                "yandex", rating=4.9, reviews_count=112,
                observed_at=datetime.now().isoformat(timespec="seconds"),
                origin="test",
            )
            trend = reputation._source_trend("yandex", saved)

        self.assertEqual(trend["reviews_delta_30d"], 12)
        self.assertEqual(trend["rating_delta_30d"], 0.1)
        self.assertGreaterEqual(trend["history_days"], 2)

    @mock.patch("reputation.database.upsert_external_review")
    def test_import_redacts_personal_data_and_is_idempotent_ready(self, save):
        save.return_value = {"id": 7, "created": True}
        result = reputation.import_reviews("yandex", [{
            "id": "r-1",
            "rating": 3,
            "text": "Позвоните мне +7 999 123-45-67, долго ждал",
            "published_at": "2026-07-09T12:00:00",
        }])
        self.assertTrue(result["ok"])
        self.assertEqual(result["imported"], 1)
        self.assertEqual(result["new"], 1)
        saved_text = save.call_args.kwargs["review_text"]
        self.assertNotIn("999", saved_text)

    def test_parse_yandex_public_page_ignores_author(self):
        state = {
            "stack": [{
                "response": {
                    "items": [{
                        "id": "42",
                        "ratingData": {"ratingValue": 4.8, "reviewCount": 12},
                        "reviewResults": {
                            "params": {"page": 1, "totalPages": 2},
                            "reviews": [{
                                "reviewId": "y-1",
                                "author": {"name": "Не сохранять"},
                                "rating": 2,
                                "text": "Долго ждал",
                                "updatedTime": "2026-07-10T12:00:00Z",
                            }],
                        },
                    }],
                },
            }],
        }
        html = (
            '<script type="application/json" class="state-view">'
            + json.dumps(state, ensure_ascii=False)
            + "</script>"
        )

        result = reputation.parse_yandex_public_page(html, business_id="42")

        self.assertEqual(result["rating"], 4.8)
        self.assertEqual(result["reviews_count"], 12)
        self.assertEqual(result["total_pages"], 2)
        self.assertEqual(result["reviews"][0]["id"], "y-1")
        self.assertNotIn("author", result["reviews"][0])
        with self.assertRaises(ValueError):
            reputation.parse_yandex_public_page(html, business_id="999")

    def test_parse_2gis_public_page_uses_structured_state(self):
        initial = {
            "data": {
                "entity": {
                    "profile": {
                        "77": {"data": {"reviews": {
                            "general_rating": 4.9,
                            "general_review_count": 31,
                        }}},
                    },
                },
            },
        }
        react = {
            "queries": [{
                "queryKey": ["fetchEntityReviews", ["77", "branch"]],
                "state": {"data": {"pages": [{
                    "total": 31,
                    "rating": 4.9,
                    "items": [{
                        "id": "d-1",
                        "rating": 5,
                        "text": "Отличная стрижка",
                        "date_created": "2026-07-10T10:00:00+03:00",
                        "user": {"name": "Не сохранять"},
                    }],
                }]}},
            }],
        }
        initial_literal = json.dumps(json.dumps(initial, ensure_ascii=False), ensure_ascii=False)
        react_literal = json.dumps(json.dumps(react, ensure_ascii=False), ensure_ascii=False)
        html = (
            "<script>var initialState = JSON.parse(" + initial_literal + ");"
            "var __REACT_QUERY_STATE__ = JSON.parse(" + react_literal + ");</script>"
        )

        result = reputation.parse_2gis_public_page(html, branch_id="77")

        self.assertEqual(result["rating"], 4.9)
        self.assertEqual(result["reviews_count"], 31)
        self.assertEqual(result["reviews"][0]["id"], "d-1")
        self.assertNotIn("user", result["reviews"][0])
        with self.assertRaises(ValueError):
            reputation.parse_2gis_public_page(html, branch_id="999")

    def test_owner_alert_classifies_reviews_by_stars(self):
        alert = reputation.build_owner_review_alert([
            {"source": "yandex", "rating": 5, "review_text": "Всё отлично"},
            {"source": "2gis", "rating": 2, "review_text": "Долго ждал"},
        ])

        self.assertEqual(alert["positive"], 1)
        self.assertEqual(alert["negative"], 1)
        self.assertIn("Негативных: 1", alert["text"])
        self.assertIn("разобрать причину", alert["text"])


if __name__ == "__main__":
    unittest.main()
