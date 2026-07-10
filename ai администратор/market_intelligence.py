"""Public market intelligence for MAYA's owner briefing.

The collector reads low-frequency, public 2GIS pages for Stavropol. It stores
only business-level aggregates: company name, public rating, review volume,
advertised haircut price, promotion text and anonymised review themes. Review
authors and profile data are never persisted.
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
_CACHE_HOURS = 20
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
    for branch_id, wrapper in entity_profiles.items():
        company = _company_from_profile(str(branch_id), wrapper, tokens.get(str(branch_id)) or [])
        if company:
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
            brands[key] = keep
        else:
            current["promoted"] = bool(current.get("promoted") or company.get("promoted"))
            current["promotion"] = current.get("promotion") or company.get("promotion") or ""
            prices = [p for p in (
                current.get("haircut_price_from_rub"), company.get("haircut_price_from_rub")
            ) if p]
            current["haircut_price_from_rub"] = min(prices) if prices else None
    return list(brands.values())


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
    leaders = competitors[:6]
    own_price = own.get("haircut_price_from_rub")
    own_rating = own.get("rating")
    price_position = _position(own_price, market_price, 100)
    rating_position = _position(own_rating, market_rating, 0.05)

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
    if own_rating is not None and market_rating is not None:
        if rating_position == "below":
            insights.append(
                f"Рейтинг {own_rating:.1f} ниже медианы конкурентов {market_rating:.1f}: приоритет — свежие отзывы и разбор причин негатива."
            )
        else:
            insights.append(
                f"Рейтинг {own_rating:.1f} не ниже рыночной медианы {market_rating:.1f}; это сильная сторона позиционирования."
            )
    if promoted:
        examples = [row.get("promotion") for row in promoted if row.get("promotion")][:2]
        detail = (" Например: " + "; ".join(examples) + ".") if examples else ""
        insights.append(
            f"В верхней части открытой выдачи продвигаются {len(promoted)} из {len(competitors)} просмотренных брендов.{detail}"
        )
    themes = review_analysis.get("themes") or []
    if themes:
        top = themes[0]
        insights.append(
            f"В отзывах конкурентов чаще всего обсуждают «{top['theme']}» ({top['mentions']} упоминаний)."
        )
    if not insights:
        insights.append("Первый рыночный снимок собран; MAYA продолжит накапливать динамику цен, рейтингов и рекламы.")

    status = "ok" if len(competitors) >= 8 else "warn"
    return {
        "version": "maya_market_intelligence_v1",
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
            "promoted_competitors_count": len(promoted),
            "reviews_analyzed": review_analysis.get("reviews_count", 0),
            "negative_reviews_count": review_analysis.get("negative_count", 0),
            "own_rating": own_rating,
            "own_reviews_count": _integer(own.get("reviews_count")),
            "own_haircut_price_rub": own_price,
            "price_position": price_position,
            "rating_position": rating_position,
        },
        "own_business": own,
        "leaders": leaders,
        "review_themes": themes[:6],
        "insights": insights[:4],
        "limitations": [
            "Рыночный снимок использует общедоступную выдачу и карточки 2ГИС.",
            "Цены с пометкой «от» и рекламные предложения могут меняться между проверками.",
        ],
    }


def _load_cached() -> dict:
    try:
        raw = database.get_setting(_SNAPSHOT_KEY)
        payload = json.loads(raw) if raw else {}
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def market_snapshot(*, force_refresh: bool = False) -> dict:
    """Returns the cached market layer; network refresh is background-only by default."""
    if force_refresh:
        return refresh_market_snapshot(force=True)
    cached = _load_cached()
    if cached:
        return cached
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
                return {**cached, "cached": True}
        except Exception:
            pass

    checked_at = datetime.now().isoformat(timespec="seconds")
    try:
        page_count = max(1, min(_integer(pages, 3), 5))
        parsed_pages = []
        for page in range(1, page_count + 1):
            parsed_pages.append(parse_2gis_search_page(_get(_search_url(page))))
        total_found = max([row.get("total") or 0 for row in parsed_pages] or [0])
        companies = _merge_brands([
            company
            for page in parsed_pages
            for company in (page.get("companies") or [])
        ])

        own_id = _own_branch_id()
        own = next((row for row in companies if str(row.get("branch_id")) == own_id), None)
        if own_id:
            try:
                own = parse_2gis_profile_page(
                    _get(f"https://2gis.ru/{_CITY_ALIAS}/firm/{own_id}"),
                    own_id,
                )
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
        database.set_setting(_SNAPSHOT_KEY, json.dumps(snapshot, ensure_ascii=False))
        database.set_setting(_STATUS_KEY, json.dumps({
            "ok": True,
            "checked_at": checked_at,
            "competitors": (snapshot.get("summary") or {}).get("competitors_scanned", 0),
        }, ensure_ascii=False))
        return {**snapshot, "cached": False}
    except Exception as error:
        database.set_setting(_STATUS_KEY, json.dumps({
            "ok": False,
            "checked_at": checked_at,
            "error": type(error).__name__,
        }, ensure_ascii=False))
        if cached:
            return {**cached, "status": "warn", "stale": True, "refresh_error": type(error).__name__}
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
