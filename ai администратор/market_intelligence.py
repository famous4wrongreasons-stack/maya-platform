"""Market intelligence for MAYA's owner briefing.

The collector reads low-frequency, public 2GIS pages for Stavropol. It stores
only business-level aggregates: company name, public rating, review volume,
advertised haircut price, promotion text and anonymised review themes. Review
authors and profile data are never persisted. Owner-authorised Yandex Business
snapshots are reduced to an allow-list of aggregate market, profile and campaign
metrics before storage; visit-level rows are deliberately discarded.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from html.parser import HTMLParser
from statistics import median
from urllib.parse import quote, urlparse

import requests

import config
import database
import reputation


_SNAPSHOT_KEY = "maya_market_intelligence_snapshot_v1"
_STATUS_KEY = "maya_market_intelligence_status_v1"
_HISTORY_KEY = "maya_market_intelligence_history_v2"
_YANDEX_BUSINESS_KEY = "maya_yandex_business_snapshot_v1"
_CACHE_HOURS = 20
_YANDEX_MAX_AGE_DAYS = 45
_CITY_ALIAS = "stavropol"
_CITY_NAME = "Ставрополь"
_BARBERSHOP_RUBRIC = "110998"
_SEARCH_QUERY = "барбершоп"
_PUBLIC_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
        "AppleWebKit/605.1.15 Mobile/15E148"
    ),
    "Accept-Language": "ru-RU,ru;q=0.9",
}


def _num(value, default=0):
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return default


def _integer(value, default=0):
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return default


def _money(value) -> str:
    return f"{_integer(value):,}".replace(",", " ") + " ₽"


def _normalise_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\xa0", " ")).strip()


def _optional_integer(value) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _optional_number(value) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return round(float(str(value).replace(",", ".")), 2)
    except (TypeError, ValueError):
        return None


def _limited_text(value, limit: int = 120) -> str:
    return _normalise_text(value)[:limit]


def _sanitise_numeric_section(payload, *, integer_fields=(), number_fields=()) -> dict:
    payload = payload if isinstance(payload, dict) else {}
    result = {}
    for key in integer_fields:
        value = _optional_integer(payload.get(key))
        if value is not None:
            result[key] = value
    for key in number_fields:
        value = _optional_number(payload.get(key))
        if value is not None:
            result[key] = value
    return result


def _sanitise_yandex_business_snapshot(payload: dict) -> dict:
    """Keeps only owner-authorised, business-level aggregate metrics."""
    if not isinstance(payload, dict):
        raise ValueError("Yandex Business snapshot must be an object")

    periods = {}
    period_payload = payload.get("periods") if isinstance(payload.get("periods"), dict) else {}
    for key in ("competitors", "profile", "advertising", "search_visits"):
        source = period_payload.get(key)
        if not isinstance(source, dict):
            continue
        period = {
            field: _limited_text(source.get(field), 40)
            for field in ("start", "end", "label", "data_through")
            if source.get(field)
        }
        if period:
            periods[key] = period

    market = _sanitise_numeric_section(
        payload.get("market"),
        integer_fields=(
            "competitor_position", "competitor_set_size", "category_queries",
            "similar_companies", "total_discovery_visits", "leader_discovery_visits",
            "own_discovery_visits",
        ),
        number_fields=("discovery_share_pct", "own_share_of_all_pct", "own_vs_leader_pct"),
    )
    profile = _sanitise_numeric_section(
        payload.get("profile"),
        integer_fields=(
            "profile_views", "routes", "calls", "website_visits",
            "search_views", "maps_views", "navigator_views",
        ),
    )
    advertising = _sanitise_numeric_section(
        payload.get("advertising"),
        integer_fields=(
            "views", "clicks", "target_clients", "target_actions", "spend_rub",
            "bonus_rub", "cost_per_click_rub", "cost_per_client_rub",
            "cost_per_action_rub", "action_button_clicks", "routes", "phone_clicks",
            "website_clicks", "social_shares", "panorama_views", "bookmarks",
        ),
        number_fields=("click_rate_pct", "client_rate_pct"),
    )
    if isinstance(payload.get("advertising"), dict) and payload["advertising"].get("campaign_id"):
        advertising["campaign_id"] = _limited_text(payload["advertising"].get("campaign_id"), 40)

    competitors = []
    competitor_rows = payload.get("competitors") if isinstance(payload.get("competitors"), list) else []
    for row in competitor_rows[:30]:
        if not isinstance(row, dict) or not row.get("name"):
            continue
        clean = {
            "name": _limited_text(row.get("name"), 120),
            "category": _limited_text(row.get("category"), 80),
            "is_own": bool(row.get("is_own")),
            "advertising_active": bool(row.get("advertising_active")),
            "profile_current": bool(row.get("profile_current")),
        }
        clean.update(_sanitise_numeric_section(
            row,
            integer_fields=(
                "position", "ratings_count", "reviews_count", "promotions_count",
                "photo_count", "services_count",
            ),
            number_fields=("discovery_share_pct", "rating"),
        ))
        competitors.append(clean)

    query_themes = []
    query_rows = payload.get("query_themes") if isinstance(payload.get("query_themes"), list) else []
    for row in query_rows[:20]:
        if not isinstance(row, dict) or not row.get("label"):
            continue
        count = _optional_integer(row.get("visits_count"))
        if count is None:
            continue
        query_themes.append({
            "key": _limited_text(row.get("key"), 60),
            "label": _limited_text(row.get("label"), 100),
            "visits_count": count,
        })

    if not any((market, profile, advertising, competitors, query_themes)):
        raise ValueError("Yandex Business snapshot has no aggregate metrics")

    return {
        "version": "maya_yandex_business_snapshot_v1",
        "source": "yandex_business_owner_authorized",
        "organization_id": _limited_text(payload.get("organization_id"), 40),
        "organization_name": _limited_text(payload.get("organization_name"), 120),
        "observed_at": _limited_text(
            payload.get("observed_at") or datetime.now().isoformat(timespec="seconds"),
            40,
        ),
        "periods": periods,
        "market": market,
        "profile": profile,
        "advertising": advertising,
        "competitors": competitors,
        "query_themes": query_themes,
        "privacy": "business_aggregates_only",
    }


def save_yandex_business_snapshot(payload: dict) -> dict:
    snapshot = _sanitise_yandex_business_snapshot(payload)
    database.set_setting(_YANDEX_BUSINESS_KEY, json.dumps(snapshot, ensure_ascii=False))
    return snapshot


def _load_yandex_business_snapshot() -> dict:
    try:
        raw = database.get_setting(_YANDEX_BUSINESS_KEY)
        payload = json.loads(raw) if raw else {}
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


class _FirmTextCollector(HTMLParser):
    """Groups server-rendered search-card text by the public branch link."""

    def __init__(self):
        super().__init__()
        self.current_id = ""
        self.tokens: dict[str, list[str]] = {}
        self._ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._ignored += 1
            return
        if self._ignored or tag != "a":
            return
        href = str(dict(attrs).get("href") or "")
        match = re.search(r"/stavropol/firm/(\d+)", href)
        if match:
            self.current_id = match.group(1)
            self.tokens.setdefault(self.current_id, [])

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._ignored:
            self._ignored -= 1

    def handle_data(self, data):
        if self._ignored or not self.current_id:
            return
        value = _normalise_text(data)
        if value:
            self.tokens.setdefault(self.current_id, []).append(value)


def _public_card_tokens(html: str) -> dict[str, list[str]]:
    parser = _FirmTextCollector()
    parser.feed(str(html or ""))
    return parser.tokens


def _haircut_price(attribute_groups) -> int | None:
    values = []
    for group in attribute_groups or []:
        if not isinstance(group, dict):
            continue
        for attribute in group.get("attributes") or []:
            if not isinstance(attribute, dict):
                continue
            tag = str(attribute.get("tag") or "")
            name = _normalise_text(attribute.get("name") or "")
            if tag != "barbershop_male_haircut_price" and "муж.стрижка от" not in name.lower():
                continue
            match = re.search(r"(\d[\d\s]*)", name)
            if match:
                values.append(_integer(match.group(1).replace(" ", "")))
    values = [value for value in values if value > 0]
    return min(values) if values else None


def _flatten_attributes(attribute_groups) -> list[dict]:
    rows = []
    for group in attribute_groups or []:
        if not isinstance(group, dict):
            continue
        for attribute in group.get("attributes") or []:
            if isinstance(attribute, dict):
                rows.append(attribute)
    return rows


def _public_profile_signals(data: dict, tokens: list[str]) -> dict:
    attributes = _flatten_attributes(data.get("attribute_groups"))
    tags = {str(row.get("tag") or "") for row in attributes}
    awards = [
        _normalise_text(row.get("name"))[:100]
        for row in attributes
        if str(row.get("tag") or "").startswith("awards_") and row.get("name")
    ]
    photos = sum(
        _integer(row.get("count"))
        for row in (data.get("external_content") or [])
        if isinstance(row, dict) and row.get("type") == "photo_album"
    )
    contacts = [
        contact
        for group in (data.get("contact_groups") or [])
        if isinstance(group, dict)
        for contact in (group.get("contacts") or [])
        if isinstance(contact, dict)
    ]
    contact_types = {str(row.get("type") or "").lower() for row in contacts}
    social_types = {"vkontakte", "telegram", "instagram", "youtube", "tiktok"}
    has_website = "website" in contact_types
    social_channels = len(contact_types & social_types)
    has_online_booking = any("записаться онлайн" in token.lower() for token in tokens)
    promotion = _promotion_from_tokens(tokens)
    promotion_kinds = []
    low = promotion.lower()
    if any(word in low for word in ("перв", "welcome", "нович")):
        promotion_kinds.append("first_visit")
    if "%" in low or "скид" in low or re.search(r"-\s*\d+\s*р", low):
        promotion_kinds.append("discount")
    if any(word in low for word in ("подар", "бонус", "бесплат")):
        promotion_kinds.append("gift")
    if any(word in low for word in ("комплекс", "комбо", "абонем")):
        promotion_kinds.append("bundle")
    meaningful_attributes = [
        row for row in attributes
        if not str(row.get("tag") or "").startswith("general_payment_type_")
    ]
    components = [
        bool(data.get("schedule")),
        bool(data.get("reviews")),
        bool(_haircut_price(data.get("attribute_groups"))),
        photos >= 10,
        has_website,
        social_channels > 0,
        has_online_booking,
        len(meaningful_attributes) >= 3,
        bool(awards),
        bool(promotion),
    ]
    return {
        "photo_count": photos,
        "has_website": has_website,
        "social_channels_count": social_channels,
        "has_online_booking": has_online_booking,
        "profile_features_count": len(meaningful_attributes),
        "profile_completeness_score": sum(bool(value) for value in components) * 10,
        "awards": awards[:4],
        "has_child_haircut": "barbershop_details_child_haircut" in tags,
        "has_home_service": "covid_services_home" in tags,
        "promotion_kinds": promotion_kinds,
    }


def _promotion_from_tokens(tokens: list[str]) -> str:
    if "Реклама" not in tokens:
        return ""
    index = tokens.index("Реклама")
    for candidate in reversed(tokens[max(0, index - 6):index]):
        low = candidate.lower()
        if len(candidate) < 12:
            continue
        if any(term in low for term in (
            "оцен", "филиал", "барбершопы", "муж.стрижка от", "ставрополь",
            "открыто", "закрыто", "ежедневно",
        )):
            continue
        if re.fullmatch(r"[\d.,\s]+", candidate):
            continue
        return re.sub(r"^[^0-9A-Za-zА-Яа-яЁё]+", "", candidate)[:240]
    return ""


def _company_from_profile(branch_id: str, wrapper: dict, tokens: list[str] | None = None) -> dict | None:
    data = (wrapper or {}).get("data") or {}
    if not isinstance(data, dict):
        return None
    city_alias = str(data.get("city_alias") or "").lower()
    rubrics = data.get("rubrics") or []
    rubric_ids = {str(row.get("id") or "") for row in rubrics if isinstance(row, dict)}
    if city_alias and city_alias != _CITY_ALIAS:
        return None
    if rubric_ids and _BARBERSHOP_RUBRIC not in rubric_ids:
        return None

    reviews = data.get("reviews") or {}
    org = data.get("org") or {}
    name_ex = data.get("name_ex") or {}
    public_name = (
        name_ex.get("primary")
        or org.get("primary")
        or str(data.get("name") or "").split(",", 1)[0]
    )
    name = _normalise_text(public_name)
    if not name:
        return None
    rating = _num(reviews.get("general_rating"), None)
    review_count = _integer(
        reviews.get("general_review_count_with_stars")
        or reviews.get("general_review_count")
    )
    org_review_count = _integer(
        reviews.get("org_review_count_with_stars")
        or reviews.get("org_review_count")
    )
    tokens = tokens or []
    promoted = bool(data.get("is_promoted") or "Реклама" in tokens)
    signals = _public_profile_signals(data, tokens)
    return {
        "branch_id": str(data.get("id") or branch_id),
        "organization_id": str(org.get("id") or data.get("id") or branch_id),
        "name": name[:120],
        "address": _normalise_text(data.get("address_name") or "")[:180],
        "rating": round(rating, 2) if rating is not None else None,
        "reviews_count": max(review_count, org_review_count if _integer(org.get("branch_count")) <= 1 else 0),
        "branch_reviews_count": review_count,
        "branch_count": max(1, _integer(org.get("branch_count"), 1)),
        "haircut_price_from_rub": _haircut_price(data.get("attribute_groups")),
        "promoted": promoted,
        "promotion": _promotion_from_tokens(tokens) if promoted else "",
        **signals,
        "url": f"https://2gis.ru/{_CITY_ALIAS}/firm/{branch_id}",
    }


def parse_2gis_search_page(html: str) -> dict:
    """Parses public 2GIS search state without personal/user fields."""
    initial = reputation._json_parse_assignment(html, "var initialState = JSON.parse(")
    data = initial.get("data") or {}
    search = data.get("search") or {}
    profile_cache = search.get("profile") or {}
    search_payload = next(iter(profile_cache.values()), {}) if profile_cache else {}
    search_data = (search_payload or {}).get("data") or {}
    entity_profiles = ((data.get("entity") or {}).get("profile") or {})
    tokens = _public_card_tokens(html)
    companies = []
    for position, (branch_id, wrapper) in enumerate(entity_profiles.items(), start=1):
        company = _company_from_profile(str(branch_id), wrapper, tokens.get(str(branch_id)) or [])
        if company:
            company["search_page"] = _integer(search_data.get("currentPage"), 1)
            company["search_position"] = position
            companies.append(company)
    return {
        "query": _normalise_text(search_data.get("query") or _SEARCH_QUERY),
        "page": _integer(search_data.get("currentPage"), 1),
        "pages": _integer(search_data.get("pages"), 1),
        "total": _integer(search_data.get("total")),
        "companies": companies,
    }


def parse_2gis_profile_page(html: str, branch_id: str) -> dict:
    initial = reputation._json_parse_assignment(html, "var initialState = JSON.parse(")
    profiles = (((initial.get("data") or {}).get("entity") or {}).get("profile") or {})
    wrapper = profiles.get(str(branch_id))
    if not isinstance(wrapper, dict):
        raise ValueError("2gis market branch id mismatch")
    company = _company_from_profile(str(branch_id), wrapper, [])
    if not company:
        raise ValueError("2gis market profile missing")
    return company


def _own_branch_id() -> str:
    link = str(getattr(config, "BARBERSHOP_2GIS", "") or "")
    match = re.search(r"/(?:geo|firm)/(\d+)", link)
    return match.group(1) if match else ""


def _search_url(page: int = 1) -> str:
    base = f"https://2gis.ru/{_CITY_ALIAS}/search/{quote(_SEARCH_QUERY)}"
    return base if page <= 1 else f"{base}/page/{page}"


def _get(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {"2gis.ru", "www.2gis.ru"}:
        raise ValueError("unsupported market source")
    response = requests.get(url, headers=_PUBLIC_HEADERS, timeout=22)
    response.raise_for_status()
    return response.text


def _merge_brands(companies: list[dict]) -> list[dict]:
    brands: dict[str, dict] = {}
    for company in companies:
        key = str(company.get("organization_id") or company.get("branch_id") or "")
        if not key:
            continue
        current = brands.get(key)
        if current is None:
            brands[key] = dict(company)
            continue
        if _integer(company.get("reviews_count")) > _integer(current.get("reviews_count")):
            keep = dict(company)
            if not keep.get("promotion"):
                keep["promotion"] = current.get("promotion") or ""
            keep["promoted"] = bool(keep.get("promoted") or current.get("promoted"))
            prices = [p for p in (
                keep.get("haircut_price_from_rub"), current.get("haircut_price_from_rub")
            ) if p]
            keep["haircut_price_from_rub"] = min(prices) if prices else None
            ranks = [value for value in (
                keep.get("search_rank"), current.get("search_rank")
            ) if value]
            keep["search_rank"] = min(ranks) if ranks else None
            brands[key] = keep
        else:
            current["promoted"] = bool(current.get("promoted") or company.get("promoted"))
            current["promotion"] = current.get("promotion") or company.get("promotion") or ""
            prices = [p for p in (
                current.get("haircut_price_from_rub"), company.get("haircut_price_from_rub")
            ) if p]
            current["haircut_price_from_rub"] = min(prices) if prices else None
            ranks = [value for value in (
                current.get("search_rank"), company.get("search_rank")
            ) if value]
            current["search_rank"] = min(ranks) if ranks else None
    return list(brands.values())


def _merge_profile_details(company: dict, detailed: dict | None) -> dict:
    if not detailed:
        return dict(company)
    merged = dict(company)
    for key in (
        "photo_count", "has_website", "social_channels_count",
        "profile_features_count", "profile_completeness_score", "awards",
        "has_child_haircut", "has_home_service",
    ):
        if detailed.get(key) not in (None, "", [], 0, False):
            merged[key] = detailed.get(key)
    merged["has_online_booking"] = bool(
        company.get("has_online_booking") or detailed.get("has_online_booking")
    )
    return merged


def _enrich_public_profile(company: dict) -> dict:
    branch_id = str(company.get("branch_id") or "")
    if not branch_id:
        return dict(company)
    try:
        detailed = parse_2gis_profile_page(
            _get(f"https://2gis.ru/{_CITY_ALIAS}/firm/{branch_id}"),
            branch_id,
        )
        return _merge_profile_details(company, detailed)
    except Exception:
        return dict(company)


def _review_summary(company: dict) -> dict:
    branch_id = str(company.get("branch_id") or "")
    if not branch_id:
        return {"branch_id": branch_id, "reviews": []}
    html = _get(f"https://2gis.ru/{_CITY_ALIAS}/firm/{branch_id}/tab/reviews")
    parsed = reputation.parse_2gis_public_page(html, branch_id=branch_id)
    rows = [
        {
            "source": "2gis",
            "rating": row.get("rating"),
            "text": row.get("text") or "",
            "published_at": row.get("published_at") or "",
        }
        for row in (parsed.get("reviews") or [])
    ]
    analysis = reputation.analyze_reviews(rows)
    return {
        "branch_id": branch_id,
        "reviews": rows,
        "analysis": analysis,
    }


def _position(own_value, market_value, tolerance: float) -> str:
    if own_value is None or market_value is None:
        return "unknown"
    if float(own_value) > float(market_value) + tolerance:
        return "above"
    if float(own_value) < float(market_value) - tolerance:
        return "below"
    return "middle"


def _build_snapshot(companies: list[dict], own: dict | None, review_rows: list[dict], *, total_found: int) -> dict:
    own = own or {}
    own_id = str(own.get("branch_id") or _own_branch_id())
    competitors = [row for row in companies if str(row.get("branch_id") or "") != own_id]
    competitors.sort(key=lambda row: (
        -_integer(row.get("reviews_count")),
        -_num(row.get("rating")),
        row.get("name") or "",
    ))
    competitors = competitors[:30]
    ratings = [float(row["rating"]) for row in competitors if row.get("rating") is not None]
    prices = [_integer(row.get("haircut_price_from_rub")) for row in competitors if row.get("haircut_price_from_rub")]
    volumes = [_integer(row.get("reviews_count")) for row in competitors if row.get("reviews_count")]
    market_rating = round(float(median(ratings)), 2) if ratings else None
    market_price = _integer(median(prices)) if prices else None
    market_reviews = _integer(median(volumes)) if volumes else None
    review_analysis = reputation.analyze_reviews(review_rows)
    promoted = [row for row in competitors if row.get("promoted")]
    online_booking = [row for row in competitors if row.get("has_online_booking")]
    photo_counts = [_integer(row.get("photo_count")) for row in competitors if row.get("photo_count")]
    profile_scores = [
        _integer(row.get("profile_completeness_score"))
        for row in competitors if row.get("profile_completeness_score") is not None
    ]
    market_photos = _integer(median(photo_counts)) if photo_counts else None
    market_profile_score = _integer(median(profile_scores)) if profile_scores else None
    own_price = own.get("haircut_price_from_rub")
    own_rating = own.get("rating")
    price_position = _position(own_price, market_price, 100)
    rating_position = _position(own_rating, market_rating, 0.05)
    price_index_pct = (
        round(float(own_price) * 100 / float(market_price))
        if own_price and market_price else None
    )

    tracked = ([own] if own else []) + competitors
    by_reviews = sorted(tracked, key=lambda row: (-_integer(row.get("reviews_count")), row.get("name") or ""))
    by_rating = sorted(tracked, key=lambda row: (-_num(row.get("rating")), -_integer(row.get("reviews_count"))))

    def business_rank(rows: list[dict], branch_id: str) -> int | None:
        for index, row in enumerate(rows, start=1):
            if str(row.get("branch_id") or "") == str(branch_id or ""):
                return index
        return None

    own_review_rank = business_rank(by_reviews, own_id) if own else None
    own_rating_rank = business_rank(by_rating, own_id) if own else None
    own_search_rank = _integer(own.get("search_rank")) or None
    tracked_count = len(tracked)

    def percentile_from_rank(rank: int | None) -> float:
        if not rank or tracked_count <= 1:
            return 50.0
        return max(0.0, min(100.0, (tracked_count - rank) * 100 / (tracked_count - 1)))

    search_score = (
        max(0.0, min(100.0, (31 - own_search_rank) * 100 / 30))
        if own_search_rank else 50.0
    )
    own_profile_score = _integer(own.get("profile_completeness_score"))
    visibility_proxy_score = round(
        percentile_from_rank(own_review_rank) * 0.35
        + percentile_from_rank(own_rating_rank) * 0.20
        + own_profile_score * 0.25
        + search_score * 0.20
    ) if own else None
    total_tracked_reviews = sum(_integer(row.get("reviews_count")) for row in tracked)
    own_review_share_pct = (
        round(_integer(own.get("reviews_count")) * 100 / total_tracked_reviews, 1)
        if own and total_tracked_reviews else None
    )
    promotion_patterns = {}
    for row in promoted:
        kinds = row.get("promotion_kinds") or ["other"]
        for kind in kinds:
            promotion_patterns[str(kind)] = promotion_patterns.get(str(kind), 0) + 1

    recommendations = []

    def recommend(key: str, fact: str, action: str, confidence: str = "medium") -> None:
        recommendations.append({
            "key": key,
            "fact": fact,
            "action": action,
            "confidence": confidence,
        })

    insights = []
    if own_price and market_price:
        if price_position == "above":
            insights.append(
                f"Стрижка от {_money(own_price)} — выше медианы рынка {_money(market_price)}. "
                "Важно объяснять разницу качеством, сервисом и результатом."
            )
        elif price_position == "below":
            insights.append(
                f"Стрижка от {_money(own_price)} — ниже медианы рынка {_money(market_price)}. "
                "Есть пространство проверить повышение цены без ухода в премиум-сегмент."
            )
        else:
            insights.append(
                f"Стрижка от {_money(own_price)} находится около рыночной медианы {_money(market_price)}."
            )
        recommend(
            "price_position",
            f"Индекс цены {price_index_pct}% к медиане отслеживаемого рынка.",
            (
                "Тестировать повышение цены только на части услуг и сравнить запись, чек и повторный визит."
                if price_position == "below" else (
                    "Подкреплять цену отзывами, результатом и сервисом, а не массовой скидкой."
                    if price_position == "above" else
                    "Сохранять базовую цену и искать рост в комплексах, допродажах и загрузке."
                )
            ),
            "high",
        )
    if own_rating is not None and market_rating is not None:
        if rating_position == "below":
            insights.append(
                f"Рейтинг {own_rating:.1f} ниже медианы конкурентов {market_rating:.1f}: приоритет — свежие отзывы и разбор причин негатива."
            )
        else:
            insights.append(
                f"Рейтинг {own_rating:.1f} не ниже рыночной медианы {market_rating:.1f}; это сильная сторона позиционирования."
            )
    if own_review_rank:
        insights.append(
            f"По объёму отзывов бизнес занимает место {own_review_rank} из {tracked_count} отслеживаемых брендов; "
            f"доля отзывов в выборке — {own_review_share_pct or 0}%."
        )
        recommend(
            "review_visibility",
            f"Место по объёму отзывов: {own_review_rank} из {tracked_count}.",
            "Увеличивать скорость появления свежих отзывов после подтверждённо успешных визитов.",
            "high",
        )
    if market_profile_score is not None:
        if own_profile_score < market_profile_score:
            insights.append(
                f"Наполнение карточки {own_profile_score}/100 ниже медианы рынка {market_profile_score}/100."
            )
            recommend(
                "profile_completeness",
                f"Карточка заполнена на {own_profile_score}/100 против медианы {market_profile_score}/100.",
                "Добавить недостающие услуги, фотографии, способы связи и актуальное предложение.",
                "medium",
            )
        else:
            insights.append(
                f"Наполнение карточки {own_profile_score}/100 не ниже медианы рынка {market_profile_score}/100."
            )
    if promoted:
        examples = [row.get("promotion") for row in promoted if row.get("promotion")][:2]
        detail = (" Например: " + "; ".join(examples) + ".") if examples else ""
        insights.append(
            f"В верхней части открытой выдачи продвигаются {len(promoted)} из {len(competitors)} просмотренных брендов.{detail}"
        )
        leading_pattern = max(promotion_patterns, key=promotion_patterns.get) if promotion_patterns else "other"
        pattern_labels = {
            "first_visit": "предложение на первый визит",
            "discount": "прямая скидка",
            "gift": "подарок или бонус",
            "bundle": "комплекс или абонемент",
            "other": "имиджевое обещание",
        }
        recommend(
            "promotion_landscape",
            f"Продвигаются {len(promoted)} брендов; частый формат — {pattern_labels.get(leading_pattern, leading_pattern)}.",
            "Не копировать рынок автоматически: проверить узкое предложение на свободные часы без скидки на заполненное время.",
            "medium",
        )
    themes = review_analysis.get("themes") or []
    if themes:
        top = themes[0]
        insights.append(
            f"В отзывах конкурентов чаще всего обсуждают «{top['theme']}» ({top['mentions']} упоминаний)."
        )
    if not insights:
        insights.append("Первый рыночный снимок собран; MAYA продолжит накапливать динамику цен, рейтингов и рекламы.")

    leaders = sorted(
        competitors,
        key=lambda row: (
            -_integer(row.get("reviews_count")),
            -_integer(row.get("profile_completeness_score")),
            _integer(row.get("search_rank"), 999),
        ),
    )[:6]

    status = "ok" if len(competitors) >= 8 else "warn"
    return {
        "version": "maya_market_intelligence_v1",
        "methodology_version": "maya_market_intelligence_v2",
        "status": status,
        "headline": (
            "Позиция на рынке Ставрополя понятна"
            if status == "ok" else "Рыночный снимок собран частично"
        ),
        "source": "2gis_public_pages",
        "observed_at": datetime.now().isoformat(timespec="seconds"),
        "summary": {
            "city": _CITY_NAME,
            "public_results_found": _integer(total_found),
            "competitors_scanned": len(competitors),
            "market_median_rating": market_rating,
            "market_median_reviews_count": market_reviews,
            "market_median_haircut_price_rub": market_price,
            "market_median_photo_count": market_photos,
            "market_median_profile_score": market_profile_score,
            "promoted_competitors_count": len(promoted),
            "online_booking_competitors_count": len(online_booking),
            "reviews_analyzed": review_analysis.get("reviews_count", 0),
            "negative_reviews_count": review_analysis.get("negative_count", 0),
            "own_rating": own_rating,
            "own_reviews_count": _integer(own.get("reviews_count")),
            "own_haircut_price_rub": own_price,
            "price_position": price_position,
            "rating_position": rating_position,
            "price_index_pct": price_index_pct,
            "review_volume_rank": own_review_rank,
            "rating_rank": own_rating_rank,
            "public_search_rank": own_search_rank,
            "tracked_businesses_count": tracked_count,
            "own_review_share_pct": own_review_share_pct,
            "own_profile_score": own_profile_score,
            "visibility_proxy_score": visibility_proxy_score,
        },
        "own_business": own,
        "leaders": leaders,
        "competitors": competitors,
        "review_themes": themes[:6],
        "promotion_patterns": promotion_patterns,
        "recommendations": recommendations[:6],
        "insights": insights[:6],
        "source_coverage": {
            "2gis": {
                "status": "active",
                "metrics": [
                    "price_from", "rating", "review_volume", "public_search_rank",
                    "promotion", "photos", "profile_completeness", "public_review_themes",
                ],
            },
            "yandex_business": {
                "status": "owner_authorization_required",
                "metrics": ["discovery_share", "category_demand", "competitor_position", "profile_actions"],
            },
        },
        "limitations": [
            "Рыночный снимок использует общедоступную выдачу и карточки 2ГИС.",
            "Индекс видимости — прозрачная косвенная оценка, а не реальный трафик или доля рынка.",
            "Публично доступна цена мужской стрижки «от»; полная корзина услуг требует дополнительного источника.",
            "Данные доли трафика Яндекс появятся только после разрешённого подключения кабинета владельца.",
        ],
    }


def _merge_yandex_business(snapshot: dict, yandex_snapshot: dict | None = None) -> dict:
    result = dict(snapshot or {})
    yandex = yandex_snapshot if yandex_snapshot is not None else _load_yandex_business_snapshot()
    if not isinstance(yandex, dict) or not yandex.get("observed_at"):
        return result

    try:
        observed = datetime.fromisoformat(str(yandex.get("observed_at") or "")[:19])
        source_status = (
            "active" if datetime.now() - observed <= timedelta(days=_YANDEX_MAX_AGE_DAYS)
            else "stale"
        )
    except (TypeError, ValueError):
        source_status = "warn"

    market = yandex.get("market") if isinstance(yandex.get("market"), dict) else {}
    profile = yandex.get("profile") if isinstance(yandex.get("profile"), dict) else {}
    advertising = yandex.get("advertising") if isinstance(yandex.get("advertising"), dict) else {}
    summary = dict(result.get("summary") or {})
    market_fields = {
        "competitor_position": "yandex_competitor_position",
        "competitor_set_size": "yandex_competitor_set_size",
        "discovery_share_pct": "yandex_discovery_share_pct",
        "category_queries": "yandex_category_queries_week",
        "similar_companies": "yandex_similar_companies_5km",
        "total_discovery_visits": "yandex_total_discovery_visits_week",
        "leader_discovery_visits": "yandex_leader_discovery_visits_week",
        "own_discovery_visits": "yandex_own_discovery_visits_week",
        "own_share_of_all_pct": "yandex_own_share_of_all_pct",
        "own_vs_leader_pct": "yandex_own_vs_leader_pct",
    }
    profile_fields = {
        "profile_views": "yandex_profile_views_30d",
        "routes": "yandex_routes_30d",
        "calls": "yandex_calls_30d",
        "website_visits": "yandex_website_visits_30d",
        "search_views": "yandex_search_views_30d",
        "maps_views": "yandex_maps_views_30d",
        "navigator_views": "yandex_navigator_views_30d",
    }
    advertising_fields = {
        "views": "yandex_ad_views",
        "clicks": "yandex_ad_clicks",
        "target_clients": "yandex_ad_target_clients",
        "target_actions": "yandex_ad_target_actions",
        "spend_rub": "yandex_ad_spend_rub",
        "cost_per_client_rub": "yandex_ad_cost_per_client_rub",
    }
    for source, destination in (
        *market_fields.items(), *profile_fields.items(), *advertising_fields.items()
    ):
        source_payload = (
            market if source in market_fields else
            profile if source in profile_fields else
            advertising
        )
        if source_payload.get(source) is not None:
            summary[destination] = source_payload.get(source)

    profile_actions = sum(
        _integer(profile.get(key)) for key in ("routes", "calls", "website_visits")
    )
    profile_views = _integer(profile.get("profile_views"))
    if profile_actions:
        summary["yandex_profile_actions_30d"] = profile_actions
    if profile_views and profile_actions:
        summary["yandex_profile_action_rate_pct"] = round(profile_actions * 100 / profile_views, 1)
    if market.get("competitor_position") is not None:
        summary["market_position_basis"] = "yandex_discovery_traffic"
    result["summary"] = summary
    result["source"] = "2gis_public_pages+yandex_business_owner_authorized"
    if market.get("competitor_position") is not None:
        result["headline"] = "Фактическая позиция в Яндексе и рынок Ставрополя понятны"
    result["yandex_business"] = yandex

    coverage = dict(result.get("source_coverage") or {})
    coverage["yandex_business"] = {
        "status": source_status,
        "observed_at": yandex.get("observed_at"),
        "privacy": "business_aggregates_only",
        "metrics": [
            "discovery_share", "category_demand", "competitor_position", "profile_actions",
            "traffic_sources", "advertising_performance", "aggregate_search_themes",
        ],
    }
    result["source_coverage"] = coverage

    position = _integer(market.get("competitor_position"))
    set_size = _integer(market.get("competitor_set_size"))
    share = market.get("discovery_share_pct")
    own_visits = _integer(market.get("own_discovery_visits"))
    leader_visits = _integer(market.get("leader_discovery_visits"))
    total_visits = _integer(market.get("total_discovery_visits"))
    category_queries = _integer(market.get("category_queries"))
    yandex_insights = []
    if position and set_size:
        yandex_insights.append(
            f"Яндекс ставит бизнес на место {position} из {set_size} в выбранной группе конкурентов; "
            f"доля дискавери-переходов — {share if share is not None else '—'}%."
        )
    if own_visits and total_visits:
        yandex_insights.append(
            f"За неделю получено {own_visits} из {_money(total_visits).replace(' ₽', '')} переходов "
            f"в похожие компании; лидер получил {_money(leader_visits).replace(' ₽', '')}."
        )
    if category_queries:
        yandex_insights.append(
            f"За неделю в радиусе 5 км было {_money(category_queries).replace(' ₽', '')} "
            "запросов по категориям бизнеса."
        )
    if profile_views:
        yandex_insights.append(
            f"За 30 дней профиль открыли {_money(profile_views).replace(' ₽', '')} раз; "
            f"маршрут, звонок или переход на сайт совершили {profile_actions} раз "
            f"({summary.get('yandex_profile_action_rate_pct', 0)}%)."
        )
    existing_insights = [str(row) for row in (result.get("insights") or []) if row]
    result["insights"] = (
        yandex_insights + [row for row in existing_insights if row not in yandex_insights]
    )[:8]

    competitors = [row for row in (yandex.get("competitors") or []) if isinstance(row, dict)]
    own_row = next((row for row in competitors if row.get("is_own")), {})
    leader = next((row for row in competitors if _integer(row.get("position")) == 1), {})
    profile_gap = []
    if own_row and leader:
        if _integer(leader.get("photo_count")) > _integer(own_row.get("photo_count")):
            profile_gap.append(
                f"фото {own_row.get('photo_count', 0)} против {leader.get('photo_count', 0)} у лидера"
            )
        if _integer(leader.get("services_count")) > _integer(own_row.get("services_count")):
            profile_gap.append(
                f"услуг {own_row.get('services_count', 0)} против {leader.get('services_count', 0)}"
            )
    gap_detail = ("; " + ", ".join(profile_gap)) if profile_gap else ""
    yandex_recommendations = []
    if own_visits and leader_visits:
        yandex_recommendations.append({
            "key": "yandex_discovery_gap",
            "fact": (
                f"Яндекс: {own_visits} дискавери-переходов против {leader_visits} у лидера; "
                f"текущая доля {share if share is not None else '—'}%{gap_detail}."
            ),
            "action": (
                "Сначала закрыть измеримые разрывы карточки, затем провести четырёхнедельный тест "
                "продвижения только на незаполненные часы и считать записи и выручку, а не клики."
            ),
            "confidence": "high",
        })
    if profile_views and profile_actions:
        yandex_recommendations.append({
            "key": "yandex_profile_conversion",
            "fact": (
                f"Из {profile_views} открытий профиля получено {profile_actions} измеримых действий "
                f"({summary.get('yandex_profile_action_rate_pct')}%)."
            ),
            "action": (
                "Связать переходы Яндекса с источником записи в YClients и ежемесячно считать "
                "конверсию в состоявшийся визит, выручку и возврат клиента."
            ),
            "confidence": "high",
        })
    query_themes = [row for row in (yandex.get("query_themes") or []) if isinstance(row, dict)]
    generic_theme = next((row for row in query_themes if row.get("key") == "category_generic"), {})
    branded_theme = next((row for row in query_themes if row.get("key") == "brand"), {})
    if generic_theme:
        yandex_recommendations.append({
            "key": "yandex_generic_demand",
            "fact": (
                f"Среди последних обработанных визитов запросы категории дали "
                f"{generic_theme.get('visits_count')} входов, брендовые — {branded_theme.get('visits_count', 0)}."
            ),
            "action": (
                "Усилить карточку под намерение «барбершоп в Ставрополе»: актуальные услуги и цены, "
                "регулярные результаты работ и предложение с прямым переходом к записи."
            ),
            "confidence": "medium",
        })
    existing_recommendations = [
        row for row in (result.get("recommendations") or [])
        if isinstance(row, dict) and not str(row.get("key") or "").startswith("yandex_")
    ]
    result["recommendations"] = (yandex_recommendations + existing_recommendations)[:8]

    limitations = [
        str(row) for row in (result.get("limitations") or [])
        if "Данные доли трафика Яндекс" not in str(row)
    ]
    yandex_limitation = (
        "Позиция и доля переходов Яндекса обновляются раз в неделю и относятся к выбранной "
        "группе похожих компаний, а не к доле выручки всего рынка."
    )
    if yandex_limitation not in limitations:
        limitations.append(yandex_limitation)
    result["limitations"] = limitations
    return result


def _load_cached() -> dict:
    try:
        raw = database.get_setting(_SNAPSHOT_KEY)
        payload = json.loads(raw) if raw else {}
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _load_history() -> list[dict]:
    try:
        raw = database.get_setting(_HISTORY_KEY)
        rows = json.loads(raw) if raw else []
        return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []
    except Exception:
        return []


def _compact_history_point(snapshot: dict) -> dict:
    return {
        "observed_at": snapshot.get("observed_at") or "",
        "summary": snapshot.get("summary") or {},
        "competitors": [
            {
                "organization_id": row.get("organization_id"),
                "branch_id": row.get("branch_id"),
                "name": row.get("name"),
                "rating": row.get("rating"),
                "reviews_count": row.get("reviews_count"),
                "haircut_price_from_rub": row.get("haircut_price_from_rub"),
                "promotion": row.get("promotion") or "",
                "promoted": bool(row.get("promoted")),
                "search_rank": row.get("search_rank"),
                "profile_completeness_score": row.get("profile_completeness_score"),
            }
            for row in (snapshot.get("competitors") or [])
            if isinstance(row, dict)
        ],
    }


def _market_changes(previous: dict | None, current: dict) -> dict:
    previous = previous or {}
    old_rows = {
        str(row.get("organization_id") or row.get("branch_id") or row.get("name") or ""): row
        for row in (previous.get("competitors") or []) if isinstance(row, dict)
    }
    new_rows = {
        str(row.get("organization_id") or row.get("branch_id") or row.get("name") or ""): row
        for row in (current.get("competitors") or []) if isinstance(row, dict)
    }
    price_changes = []
    promotion_changes = []
    fastest_review_growth = []
    rank_changes = []
    for key, row in new_rows.items():
        old = old_rows.get(key)
        if not old:
            continue
        old_price = _integer(old.get("haircut_price_from_rub"))
        new_price = _integer(row.get("haircut_price_from_rub"))
        if old_price and new_price and old_price != new_price:
            price_changes.append({
                "name": row.get("name"), "from_rub": old_price, "to_rub": new_price,
                "delta_rub": new_price - old_price,
            })
        old_promotion = str(old.get("promotion") or "")
        new_promotion = str(row.get("promotion") or "")
        if old_promotion != new_promotion:
            promotion_changes.append({
                "name": row.get("name"),
                "state": "started" if new_promotion and not old_promotion else (
                    "ended" if old_promotion and not new_promotion else "changed"
                ),
                "promotion": new_promotion[:240],
            })
        review_delta = _integer(row.get("reviews_count")) - _integer(old.get("reviews_count"))
        if review_delta:
            fastest_review_growth.append({"name": row.get("name"), "delta": review_delta})
        old_rank = _integer(old.get("search_rank"))
        new_rank = _integer(row.get("search_rank"))
        if old_rank and new_rank and old_rank != new_rank:
            rank_changes.append({
                "name": row.get("name"), "from": old_rank, "to": new_rank,
                "delta": old_rank - new_rank,
            })
    fastest_review_growth.sort(key=lambda row: -row["delta"])
    rank_changes.sort(key=lambda row: -abs(row["delta"]))
    return {
        "has_baseline": bool(old_rows),
        "new_competitors": [new_rows[key].get("name") for key in new_rows.keys() - old_rows.keys()][:10],
        "missing_competitors": [old_rows[key].get("name") for key in old_rows.keys() - new_rows.keys()][:10],
        "price_changes": price_changes[:10],
        "promotion_changes": promotion_changes[:10],
        "fastest_review_growth": fastest_review_growth[:10],
        "public_rank_changes": rank_changes[:10],
    }


def _append_history(snapshot: dict) -> None:
    rows = _load_history()
    point = _compact_history_point(snapshot)
    day = str(point.get("observed_at") or "")[:10]
    if rows and str(rows[-1].get("observed_at") or "")[:10] == day:
        rows[-1] = point
    else:
        rows.append(point)
    database.set_setting(_HISTORY_KEY, json.dumps(rows[-90:], ensure_ascii=False))


def market_snapshot(*, force_refresh: bool = False) -> dict:
    """Returns the cached market layer; network refresh is background-only by default."""
    if force_refresh:
        return refresh_market_snapshot(force=True)
    cached = _load_cached()
    if cached:
        return _merge_yandex_business(cached)
    return {
        "version": "maya_market_intelligence_v1",
        "status": "warn",
        "headline": "MAYA готовит первый снимок рынка Ставрополя",
        "source": "2gis_public_pages",
        "observed_at": "",
        "summary": {
            "city": _CITY_NAME,
            "competitors_scanned": 0,
            "reviews_analyzed": 0,
        },
        "leaders": [],
        "review_themes": [],
        "insights": ["Первый анализ появится после фонового чтения открытой выдачи 2ГИС."],
    }


def refresh_market_snapshot(*, force: bool = False, pages: int = 3, review_competitors: int = 5) -> dict:
    cached = _load_cached()
    if cached and not force:
        try:
            observed = datetime.fromisoformat(str(cached.get("observed_at") or "")[:19])
            if datetime.now() - observed < timedelta(hours=_CACHE_HOURS):
                return {**_merge_yandex_business(cached), "cached": True}
        except Exception:
            pass

    checked_at = datetime.now().isoformat(timespec="seconds")
    try:
        page_count = max(1, min(_integer(pages, 3), 5))
        parsed_pages = []
        for page in range(1, page_count + 1):
            parsed_pages.append(parse_2gis_search_page(_get(_search_url(page))))
        total_found = max([row.get("total") or 0 for row in parsed_pages] or [0])
        flat_companies = []
        global_rank = 0
        for page in parsed_pages:
            for company in (page.get("companies") or []):
                global_rank += 1
                company = dict(company)
                company["search_rank"] = global_rank
                flat_companies.append(company)
        companies = _merge_brands(flat_companies)

        enrich_targets = sorted(
            companies,
            key=lambda row: -_integer(row.get("reviews_count")),
        )[:12]
        if enrich_targets:
            with ThreadPoolExecutor(max_workers=2) as executor:
                enriched = list(executor.map(_enrich_public_profile, enrich_targets))
            enriched_by_id = {
                str(row.get("branch_id") or ""): row for row in enriched if row.get("branch_id")
            }
            companies = [
                enriched_by_id.get(str(row.get("branch_id") or ""), row)
                for row in companies
            ]

        own_id = _own_branch_id()
        own = next((row for row in companies if str(row.get("branch_id")) == own_id), None)
        if own_id:
            try:
                detailed_own = parse_2gis_profile_page(
                    _get(f"https://2gis.ru/{_CITY_ALIAS}/firm/{own_id}"),
                    own_id,
                )
                own = _merge_profile_details(own or detailed_own, detailed_own)
            except Exception:
                pass

        competitors = [row for row in companies if str(row.get("branch_id")) != own_id]
        competitors.sort(key=lambda row: -_integer(row.get("reviews_count")))
        review_targets = competitors[:max(0, min(_integer(review_competitors, 5), 8))]
        review_rows = []
        if review_targets:
            with ThreadPoolExecutor(max_workers=2) as executor:
                for result in executor.map(_review_summary, review_targets):
                    review_rows.extend(result.get("reviews") or [])

        snapshot = _build_snapshot(companies, own, review_rows, total_found=total_found)
        previous = _compact_history_point(cached) if cached else (
            _load_history()[-1] if _load_history() else {}
        )
        snapshot["changes"] = _market_changes(previous, snapshot)
        database.set_setting(_SNAPSHOT_KEY, json.dumps(snapshot, ensure_ascii=False))
        _append_history(snapshot)
        database.set_setting(_STATUS_KEY, json.dumps({
            "ok": True,
            "checked_at": checked_at,
            "competitors": (snapshot.get("summary") or {}).get("competitors_scanned", 0),
        }, ensure_ascii=False))
        return {**_merge_yandex_business(snapshot), "cached": False}
    except Exception as error:
        database.set_setting(_STATUS_KEY, json.dumps({
            "ok": False,
            "checked_at": checked_at,
            "error": type(error).__name__,
        }, ensure_ascii=False))
        if cached:
            return {
                **_merge_yandex_business(cached),
                "status": "warn",
                "stale": True,
                "refresh_error": type(error).__name__,
            }
        return {
            "version": "maya_market_intelligence_v1",
            "status": "warn",
            "headline": "Рыночный источник временно недоступен",
            "source": "2gis_public_pages",
            "observed_at": "",
            "summary": {"city": _CITY_NAME, "competitors_scanned": 0, "reviews_analyzed": 0},
            "leaders": [],
            "review_themes": [],
            "insights": ["MAYA повторит анализ рынка автоматически."],
            "refresh_error": type(error).__name__,
        }
