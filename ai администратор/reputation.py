"""Pure public-page parsers and retired legacy review-source compatibility.

B34 retires ingestion, synchronization and legacy fact projections. Pure
parsers remain available to market observations; they grant no review authority.
"""
from __future__ import annotations

import ast
import json
import re
import warnings
from datetime import datetime, timedelta
from html.parser import HTMLParser


_SOURCES = {"yandex": "Яндекс Карты", "2gis": "2ГИС"}
_THEMES = {
    "качество работы": ("стриж", "бород", "брить", "форма", "результат", "мастер", "барбер"),
    "сервис": ("сервис", "администратор", "отношение", "вежлив", "персонал", "обслуж"),
    "ожидание": ("ждал", "ждать", "ожидани", "опозд", "задерж"),
    "запись": ("запис", "приложен", "бот", "перенос", "отмен"),
    "цена": ("цен", "дорог", "стоим", "чек"),
    "чистота": ("чист", "гряз", "аккурат", "инструмент"),
    "атмосфера": ("атмосфер", "интерьер", "уют", "музык", "кофе", "напит"),
}


def retired_review_source() -> dict:
    """B34: one fixed compatibility result; never infer tenant/source authority."""
    return {
        "ok": False,
        "error": "LEGACY_REVIEW_SOURCE_RETIRED",
        "business_mutations": 0,
        "imported": 0,
        "new": 0,
        "new_reviews": [],
        "sources_ready": 0,
        "sources": [],
    }


def _float(value) -> float | None:
    try:
        number = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return round(number, 2) if 0 < number <= 5 else None


def _int(value) -> int | None:
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError):
        return None


def parse_rating_label(value: str) -> dict:
    """Понимает строку вида `4.9 (более 300 отзывов)`."""
    text = str(value or "").strip()
    rating_match = re.search(r"(?<!\d)([1-5](?:[.,]\d{1,2})?)(?!\d)", text)
    rating = _float(rating_match.group(1)) if rating_match else None
    tail = text[rating_match.end():] if rating_match else text
    count_match = re.search(r"(\d[\d\s]*)", tail)
    count = _int((count_match.group(1) or "").replace(" ", "")) if count_match else None
    return {"rating": rating, "reviews_count": count, "raw": text}


class _ScriptCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current_attrs = None
        self.current_body = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.current_attrs = dict(attrs)
            self.current_body = []

    def handle_data(self, data):
        if self.current_attrs is not None:
            self.current_body.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.current_attrs is not None:
            self.scripts.append((self.current_attrs, "".join(self.current_body)))
            self.current_attrs = None
            self.current_body = []


def _page_scripts(html: str) -> list[tuple[dict, str]]:
    parser = _ScriptCollector()
    parser.feed(str(html or ""))
    return parser.scripts


def _json_parse_assignment(html: str, marker: str) -> dict:
    """Читает JSON.parse('<json>') через безопасный parser строкового литерала."""
    start = str(html or "").find(marker)
    if start < 0:
        raise ValueError("structured state marker not found")
    start += len(marker)
    while start < len(html) and html[start].isspace():
        start += 1
    if start >= len(html) or html[start] not in ("'", '"'):
        raise ValueError("structured state string not found")
    quote = html[start]
    index = start + 1
    escaped = False
    while index < len(html):
        char = html[index]
        if escaped:
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == quote:
            break
        index += 1
    if index >= len(html):
        raise ValueError("structured state string is incomplete")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        decoded = ast.literal_eval(html[start:index + 1])
    payload = json.loads(decoded)
    if not isinstance(payload, dict):
        raise ValueError("structured state is not an object")
    return payload


def parse_yandex_public_page(html: str, *, business_id: str = "") -> dict:
    state = None
    for attrs, body in _page_scripts(html):
        classes = str(attrs.get("class") or "").split()
        if "state-view" not in classes:
            continue
        try:
            candidate = json.loads(body)
        except Exception:
            continue
        if isinstance(candidate, dict):
            state = candidate
            break
    if state is None:
        raise ValueError("yandex public state not found")

    selected = None
    fallback = None
    for stack in state.get("stack") or []:
        if not isinstance(stack, dict):
            continue
        response = stack.get("response") or {}
        for item in response.get("items") or []:
            if not isinstance(item, dict):
                continue
            if item.get("reviewResults"):
                fallback = fallback or item
            if business_id and str(item.get("id") or "") == str(business_id):
                selected = item
                break
        if selected is not None:
            break
    if business_id and selected is None:
        raise ValueError("yandex business id mismatch")
    selected = selected or fallback
    if not selected:
        raise ValueError("yandex business reviews not found")

    rating_data = selected.get("ratingData") or {}
    review_results = selected.get("reviewResults") or {}
    reviews = []
    for row in review_results.get("reviews") or []:
        if not isinstance(row, dict):
            continue
        external_id = str(row.get("reviewId") or "").strip()
        text = str(row.get("text") or "").strip()
        rating = _float(row.get("rating"))
        if not external_id or (rating is None and not text):
            continue
        reviews.append({
            "id": external_id,
            "rating": rating,
            "text": text,
            "published_at": str(row.get("updatedTime") or "")[:32],
        })
    params = review_results.get("params") or {}
    return {
        "source": "yandex",
        "rating": _float(rating_data.get("ratingValue")),
        "reviews_count": _int(rating_data.get("reviewCount")),
        "reviews": reviews,
        "page": _int(params.get("page")) or 1,
        "total_pages": _int(params.get("totalPages")) or 1,
    }


def parse_2gis_public_page(html: str, *, branch_id: str = "") -> dict:
    initial = _json_parse_assignment(html, "var initialState = JSON.parse(")
    react_state = _json_parse_assignment(html, "var __REACT_QUERY_STATE__ = JSON.parse(")
    profiles = (((initial.get("data") or {}).get("entity") or {}).get("profile") or {})
    profile = profiles.get(str(branch_id)) if branch_id else None
    if branch_id and not isinstance(profile, dict):
        raise ValueError("2gis branch id mismatch")
    if not branch_id and not isinstance(profile, dict) and profiles:
        profile = next(iter(profiles.values()))
    profile_data = (profile or {}).get("data") or {}
    rating_data = profile_data.get("reviews") or {}

    reviews = []
    page_meta = {}
    for query in react_state.get("queries") or []:
        key = query.get("queryKey") or []
        if not key or key[0] != "fetchEntityReviews":
            continue
        if branch_id and str(branch_id) not in json.dumps(key, ensure_ascii=False):
            continue
        data = (query.get("state") or {}).get("data") or {}
        for page in data.get("pages") or []:
            if not isinstance(page, dict):
                continue
            page_meta = page_meta or page
            for row in page.get("items") or []:
                if not isinstance(row, dict) or row.get("is_hidden"):
                    continue
                external_id = str(row.get("id") or "").strip()
                text = str(row.get("text") or "").strip()
                rating = _float(row.get("rating"))
                if not external_id or (rating is None and not text):
                    continue
                reviews.append({
                    "id": external_id,
                    "rating": rating,
                    "text": text,
                    "published_at": str(row.get("date_created") or "")[:32],
                })
        break
    if not reviews and not rating_data:
        raise ValueError("2gis public reviews not found")
    reviews_count = (
        _int(page_meta.get("total"))
        or _int(rating_data.get("general_review_count"))
        or _int(rating_data.get("review_count"))
    )
    return {
        "source": "2gis",
        "rating": _float(
            page_meta.get("rating")
            or rating_data.get("general_rating")
            or rating_data.get("org_rating")
            or rating_data.get("rating")
        ),
        "reviews_count": reviews_count,
        "reviews": reviews,
        "page": 1,
        "total_pages": 1,
    }


def fetch_public_source(source: str) -> dict:
    """B34: retired unverified review source; no input/state/provider access."""
    return retired_review_source()


def save_source_snapshot(
    source: str,
    *,
    rating=None,
    reviews_count=None,
    observed_at: str = "",
    origin: str = "authorized_import",
) -> dict:
    """B34: retired unverified review source; no input/state/provider access."""
    return retired_review_source()


def refresh_2gis_stats(*, force: bool = False) -> dict:
    """B34: retired unverified review source; no input/state/provider access."""
    return retired_review_source()


def import_reviews(source: str, reviews: list[dict]) -> dict:
    """B34: retired unverified review source; no input/state/provider access."""
    return retired_review_source()


def refresh_public_reviews() -> dict:
    """B34: retired unverified review source; no input/state/provider access."""
    return retired_review_source()


def _review_sentiment(rating) -> str:
    value = _float(rating)
    if value is None:
        return "neutral"
    return "positive" if value >= 4 else "negative"


def build_owner_review_alert(rows: list[dict], max_items: int = 5) -> dict:
    items = [row for row in (rows or []) if isinstance(row, dict)]
    positive = sum(_review_sentiment(row.get("rating")) == "positive" for row in items)
    negative = sum(_review_sentiment(row.get("rating")) == "negative" for row in items)
    lines = [
        "MAYA · новые отзывы на картах",
        "",
        f"Положительных: {positive}. Негативных: {negative}.",
    ]
    for row in items[:max(1, min(int(max_items or 5), 10))]:
        source = _SOURCES.get(str(row.get("source") or "").lower(), "Карты")
        rating = _float(row.get("rating"))
        sentiment = {
            "positive": "Положительный",
            "negative": "Негативный",
            "neutral": "Без оценки",
        }[_review_sentiment(rating)]
        date_label = str(row.get("published_at") or row.get("imported_at") or "")[:10]
        text = re.sub(r"\s+", " ", str(row.get("review_text") or "").strip())
        excerpt = text[:420].rstrip()
        if len(text) > 420:
            excerpt += "…"
        lines.extend([
            "",
            f"{source} · {int(rating) if rating is not None else '—'}/5"
            + (f" · {date_label}" if date_label else ""),
            f"{sentiment}: «{excerpt or 'Оценка без текста'}»",
        ])
    if negative:
        lines.extend(["", "Совет MAYA: разобрать причину негатива и подготовить спокойный предметный ответ."])
    elif positive:
        lines.extend(["", "Совет MAYA: поблагодарить клиента и отметить сильную сторону команды."])
    title = (
        "Новый негативный отзыв" if negative
        else ("Новый положительный отзыв" if positive else "Новый отзыв на картах")
    )
    if len(items) > 1:
        title = f"Новые отзывы: {len(items)}"
    body = f"Положительных {positive}, негативных {negative}. Откройте кабинет владельца."
    return {
        "text": "\n".join(lines).strip(),
        "push_title": title,
        "push_body": body,
        "positive": positive,
        "negative": negative,
        "count": len(items),
    }


def analyze_reviews(rows: list[dict]) -> dict:
    theme_stats = {
        theme: {"mentions": 0, "positive": 0, "negative": 0}
        for theme in _THEMES
    }
    ratings = []
    negative_excerpts = []
    by_source = {
        key: {
            "count": 0,
            "avg_rating": None,
            "new_7d": 0,
            "new_30d": 0,
            "negative_30d": 0,
        }
        for key in _SOURCES
    }
    source_ratings = {key: [] for key in _SOURCES}
    new_7d = new_30d = negative_30d = 0
    today = datetime.now().date()
    for row in (rows or []):
        source = str(row.get("source") or "").lower()
        rating = _float(row.get("rating"))
        text = str(row.get("review_text") or row.get("text") or "").strip()
        low = text.lower().replace("ё", "е")
        if rating is not None:
            ratings.append(rating)
            if source in source_ratings:
                source_ratings[source].append(rating)
        if source in by_source:
            by_source[source]["count"] += 1
        raw_day = str(row.get("published_at") or row.get("imported_at") or "")[:10]
        age_days = None
        try:
            age_days = max(0, (today - datetime.fromisoformat(raw_day).date()).days)
        except ValueError:
            pass
        if age_days is not None and age_days <= 7:
            new_7d += 1
            if source in by_source:
                by_source[source]["new_7d"] += 1
        if age_days is not None and age_days <= 30:
            new_30d += 1
            if source in by_source:
                by_source[source]["new_30d"] += 1
            if rating is not None and rating <= 3:
                negative_30d += 1
                if source in by_source:
                    by_source[source]["negative_30d"] += 1
        for theme, needles in _THEMES.items():
            if not any(needle in low for needle in needles):
                continue
            theme_stats[theme]["mentions"] += 1
            if rating is not None and rating <= 3:
                theme_stats[theme]["negative"] += 1
            elif rating is not None and rating >= 4:
                theme_stats[theme]["positive"] += 1
        if text and rating is not None and rating <= 3 and len(negative_excerpts) < 5:
            negative_excerpts.append({
                "source": source,
                "rating": rating,
                "text": text[:280],
                "published_at": row.get("published_at") or "",
            })
    for source, values in source_ratings.items():
        if values:
            by_source[source]["avg_rating"] = round(sum(values) / len(values), 2)
    themes = [
        {"theme": theme, **stats}
        for theme, stats in theme_stats.items()
        if stats["mentions"]
    ]
    themes.sort(key=lambda item: (-item["negative"], -item["mentions"], item["theme"]))
    return {
        "reviews_count": len(rows or []),
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "negative_count": len([rating for rating in ratings if rating <= 3]),
        "positive_count": len([rating for rating in ratings if rating >= 4]),
        "periods": {
            "new_7d": new_7d,
            "new_30d": new_30d,
            "negative_30d": negative_30d,
        },
        "by_source": by_source,
        "themes": themes,
        "negative_excerpts": negative_excerpts,
    }


def reputation_snapshot(*, force_refresh: bool = False) -> dict:
    """B34: unavailable projection; historical SQLite is not canonical evidence."""
    return {
        **retired_review_source(),
        "version": "maya_reputation_v1",
        "status": "unavailable",
        "headline": "Внешние отзывы недоступны",
        "canonical_review_authority": False,
        "legacy_data_retained": True,
        "summary": {
            "overall_rating": None,
            "rated_sources_count": 0,
            "text_reviews_count": None,
            "negative_reviews_count": None,
            "text_analysis_status": "unavailable",
        },
        "text_analysis": {},
        "recommendations": ["Внешние отзывы пока недоступны."],
    }
