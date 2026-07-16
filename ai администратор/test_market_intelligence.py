import json
import unittest

import market_intelligence


def _profile(branch_id, name, *, rating=5, reviews=100, price=800, promoted=False):
    return {
        "data": {
            "id": str(branch_id),
            "city_alias": "stavropol",
            "name": f"{name}, барбершоп",
            "name_ex": {"primary": name},
            "address_name": "Тестовая улица, 1",
            "org": {"id": f"org-{branch_id}", "primary": name, "branch_count": 1},
            "rubrics": [{"id": "110998", "name": "Барбершопы"}],
            "reviews": {
                "general_rating": rating,
                "general_review_count_with_stars": reviews,
            },
            "attribute_groups": [{
                "attributes": [{
                    "tag": "barbershop_male_haircut_price",
                    "name": f"Муж.стрижка от {price} ₽",
                }, {
                    "tag": "barbershop_details_child_haircut",
                    "name": "Детская стрижка",
                }],
            }],
            "schedule": {"Mon": {"working_hours": [{"from": "10:00", "to": "21:00"}]}},
            "external_content": [{"type": "photo_album", "count": 30}],
            "is_promoted": promoted,
        },
    }


class MarketIntelligenceTests(unittest.TestCase):
    def test_parse_search_page_extracts_business_data_and_promotion(self):
        initial = {
            "data": {
                "search": {"profile": {"search": {"data": {
                    "query": "барбершоп",
                    "currentPage": 1,
                    "pages": 4,
                    "total": 42,
                }}}},
                "entity": {"profile": {
                    "11": _profile("11", "Первый", rating=4.9, reviews=321, price=900, promoted=True),
                    "12": _profile("12", "Второй", rating=4.8, reviews=120, price=700),
                }},
            },
        }
        literal = json.dumps(json.dumps(initial, ensure_ascii=False), ensure_ascii=False)
        html = (
            '<a href="/stavropol/firm/11">Первый</a>'
            '<div>4.9</div><div>321 оценка</div><div>Муж.стрижка от 900 ₽</div>'
            '<div>Скидка 20% на первое посещение</div><span>Реклама</span>'
            '<a href="/stavropol/firm/12">Второй</a>'
            '<div>4.8</div><div>120 оценок</div>'
            '<script>var initialState = JSON.parse(' + literal + ');</script>'
        )

        result = market_intelligence.parse_2gis_search_page(html)

        self.assertEqual(result["total"], 42)
        self.assertEqual(len(result["companies"]), 2)
        first = result["companies"][0]
        self.assertEqual(first["name"], "Первый")
        self.assertEqual(first["haircut_price_from_rub"], 900)
        self.assertTrue(first["promoted"])
        self.assertEqual(first["promotion"], "Скидка 20% на первое посещение")
        self.assertEqual(first["search_position"], 1)
        self.assertIn("first_visit", first["promotion_kinds"])
        self.assertIn("discount", first["promotion_kinds"])
        self.assertEqual(first["photo_count"], 30)
        self.assertGreater(first["profile_completeness_score"], 0)
        self.assertNotIn("user", first)
        self.assertNotIn("author", first)

    def test_build_snapshot_compares_price_rating_and_review_themes(self):
        own = {
            "branch_id": "own",
            "name": "Мужская Эстетика",
            "rating": 5.0,
            "reviews_count": 500,
            "haircut_price_from_rub": 800,
        }
        competitors = []
        for index, price in enumerate((600, 700, 800, 900, 1000, 800, 700, 900), start=1):
            competitors.append({
                "branch_id": str(index),
                "organization_id": str(index),
                "name": f"Конкурент {index}",
                "rating": 4.8 + (index % 2) * 0.1,
                "reviews_count": 100 + index,
                "haircut_price_from_rub": price,
                "promoted": index <= 2,
                "promotion": "Скидка новичку" if index == 1 else "",
            })
        reviews = [
            {"source": "2gis", "rating": 5, "text": "Отличная стрижка и мастер"},
            {"source": "2gis", "rating": 2, "text": "Долго ждал после записи"},
        ]

        result = market_intelligence._build_snapshot(
            [own, *competitors], own, reviews, total_found=160
        )

        summary = result["summary"]
        self.assertEqual(summary["competitors_scanned"], 8)
        self.assertEqual(summary["market_median_haircut_price_rub"], 800)
        self.assertEqual(summary["price_position"], "middle")
        self.assertEqual(summary["reviews_analyzed"], 2)
        self.assertEqual(summary["negative_reviews_count"], 1)
        self.assertEqual(summary["review_volume_rank"], 1)
        self.assertEqual(summary["price_index_pct"], 100)
        self.assertIn("visibility_proxy_score", summary)
        self.assertTrue(result["review_themes"])
        self.assertTrue(result["insights"])
        self.assertTrue(result["recommendations"])
        self.assertEqual(result["source_coverage"]["2gis"]["status"], "active")
        self.assertEqual(
            result["source_coverage"]["yandex_business"]["status"],
            "owner_authorization_required",
        )

    def test_market_changes_track_price_promotions_reviews_and_rank(self):
        previous = {
            "competitors": [{
                "organization_id": "one", "name": "Первый",
                "reviews_count": 100, "haircut_price_from_rub": 800,
                "promotion": "", "search_rank": 5,
            }],
        }
        current = {
            "competitors": [{
                "organization_id": "one", "name": "Первый",
                "reviews_count": 112, "haircut_price_from_rub": 900,
                "promotion": "Скидка новичку", "search_rank": 3,
            }],
        }

        changes = market_intelligence._market_changes(previous, current)

        self.assertTrue(changes["has_baseline"])
        self.assertEqual(changes["price_changes"][0]["delta_rub"], 100)
        self.assertEqual(changes["promotion_changes"][0]["state"], "started")
        self.assertEqual(changes["fastest_review_growth"][0]["delta"], 12)
        self.assertEqual(changes["public_rank_changes"][0]["delta"], 2)

    def test_yandex_snapshot_keeps_only_business_aggregates(self):
        clean = market_intelligence._sanitise_yandex_business_snapshot({
            "organization_id": "20695024342",
            "organization_name": "Мужская Эстетика",
            "market": {
                "competitor_position": 8,
                "discovery_share_pct": 4,
                "private_note": "drop me",
            },
            "profile": {"profile_views": 1883, "calls": 33},
            "competitors": [{
                "name": "Гарлем",
                "position": 1,
                "discovery_share_pct": 48,
                "visitor_id": "drop me",
            }],
            "query_themes": [{
                "key": "category_generic", "label": "барбершоп", "visits_count": 15,
            }],
            "visits": [{"time": "23:52", "query": "raw visit must not persist"}],
        })

        self.assertEqual(clean["market"]["competitor_position"], 8)
        self.assertEqual(clean["profile"]["profile_views"], 1883)
        self.assertNotIn("private_note", clean["market"])
        self.assertNotIn("visitor_id", clean["competitors"][0])
        self.assertNotIn("visits", clean)
        self.assertEqual(clean["privacy"], "business_aggregates_only")

    def test_yandex_snapshot_replaces_proxy_position_with_real_traffic(self):
        base = {
            "version": "maya_market_intelligence_v1",
            "headline": "Позиция на рынке понятна",
            "source": "2gis_public_pages",
            "summary": {
                "competitors_scanned": 30,
                "review_volume_rank": 3,
                "visibility_proxy_score": 74,
            },
            "recommendations": [{"key": "review_visibility", "action": "Собирать отзывы"}],
            "insights": ["Снимок 2ГИС собран."],
            "source_coverage": {
                "yandex_business": {"status": "owner_authorization_required"},
            },
            "limitations": [
                "Данные доли трафика Яндекс появятся только после разрешённого подключения кабинета владельца.",
            ],
        }
        yandex = market_intelligence._sanitise_yandex_business_snapshot({
            "observed_at": market_intelligence.datetime.now().isoformat(timespec="seconds"),
            "market": {
                "competitor_position": 8,
                "competitor_set_size": 9,
                "discovery_share_pct": 4,
                "category_queries": 29495,
                "similar_companies": 78,
                "total_discovery_visits": 5254,
                "leader_discovery_visits": 657,
                "own_discovery_visits": 57,
                "own_vs_leader_pct": 9,
            },
            "profile": {
                "profile_views": 1883,
                "routes": 35,
                "calls": 33,
                "website_visits": 28,
            },
            "competitors": [{
                "name": "Гарлем", "position": 1, "photo_count": 132,
                "services_count": 22, "discovery_share_pct": 48,
            }, {
                "name": "Мужская Эстетика", "position": 8, "is_own": True,
                "photo_count": 61, "services_count": 12, "discovery_share_pct": 4,
            }],
            "query_themes": [{
                "key": "category_generic", "label": "барбершоп", "visits_count": 15,
            }, {
                "key": "brand", "label": "бренд", "visits_count": 9,
            }],
        })

        result = market_intelligence._merge_yandex_business(base, yandex)

        self.assertEqual(result["summary"]["yandex_competitor_position"], 8)
        self.assertEqual(result["summary"]["yandex_discovery_share_pct"], 4)
        self.assertEqual(result["summary"]["yandex_profile_actions_30d"], 96)
        self.assertEqual(result["summary"]["yandex_profile_action_rate_pct"], 5.1)
        self.assertEqual(result["source_coverage"]["yandex_business"]["status"], "active")
        self.assertEqual(result["recommendations"][0]["key"], "yandex_discovery_gap")
        self.assertNotIn("owner_authorization_required", json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
