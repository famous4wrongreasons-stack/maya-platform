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
                }],
            }],
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
        self.assertTrue(result["review_themes"])
        self.assertTrue(result["insights"])


if __name__ == "__main__":
    unittest.main()
