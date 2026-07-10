"""Репутационный слой MAYA OS для публичных карточек Яндекс Карт и 2ГИС.

Монитор читает структурированное состояние общедоступных страниц с низкой
частотой. Автор, профиль, IP и прочие поля страницы не сохраняются: в базу
попадают только ID отзыва, оценка, дата и обезличенный текст.
"""
from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import warnings
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from html.parser import HTMLParser
from urllib.parse import urlparse

import requests

import anonymizer
import config
import database


_SOURCES = {"yandex": "Яндекс Карты", "2gis": "2ГИС"}
_PUBLIC_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
        "AppleWebKit/605.1.15 Mobile/15E148"
    ),
    "Accept-Language": "ru-RU,ru;q=0.9",
}
_THEMES = {
    "качество работы": ("стриж", "бород", "брить", "форма", "результат", "мастер", "барбер"),
    "сервис": ("сервис", "администратор", "отношение", "вежлив", "персонал", "обслуж"),
    "ожидание": ("ждал", "ждать", "ожидани", "опозд", "задерж"),
    "запись": ("запис", "приложен", "бот", "перенос", "отмен"),
    "цена": ("цен", "дорог", "стоим", "чек"),
    "чистота": ("чист", "гряз", "аккурат", "инструмент"),
    "атмосфера": ("атмосфер", "интерьер", "уют", "музык", "кофе", "напит"),
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


def _public_page_url(source: str) -> tuple[str, str]:
    if source == "yandex":
        base = str(getattr(config, "BARBERSHOP_YANDEX", "") or "").strip()
        match = re.search(r"/org/[^/]+/(\d+)", base)
        business_id = match.group(1) if match else ""
        url = base.rstrip("/") + "/reviews/"
        allowed_hosts = {"yandex.com", "www.yandex.com", "yandex.ru", "www.yandex.ru"}
        identity = business_id
    elif source == "2gis":
        base = str(getattr(config, "BARBERSHOP_2GIS", "") or "").strip()
        match = re.search(r"/(?:geo|firm)/(\d+)", base)
        branch_id = match.group(1) if match else ""
        url = re.sub(r"/(?:geo|firm)/(\d+).*", r"/firm/\1", base).rstrip("/") + "/tab/reviews"
        allowed_hosts = {"2gis.ru", "www.2gis.ru"}
        identity = branch_id
    else:
        raise ValueError("unsupported public source")
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts or not identity:
        raise ValueError("invalid public review URL")
    return url, identity


def fetch_public_source(source: str) -> dict:
    """Читает публичную карточку без авторизации, обхода CAPTCHA и профиля автора."""
    source = str(source or "").strip().lower()
    url, identity = _public_page_url(source)
    response = requests.get(url, headers=_PUBLIC_HEADERS, timeout=20)
    response.raise_for_status()
    if source == "2gis":
        return parse_2gis_public_page(response.text, branch_id=identity)

    result = parse_yandex_public_page(response.text, business_id=identity)
    by_id = {row["id"]: row for row in result.get("reviews") or []}
    total_pages = max(1, min(int(result.get("total_pages") or 1), 10))

    def _load_page(page: int) -> dict:
        page_response = requests.get(
            url,
            params={"page": page},
            headers=_PUBLIC_HEADERS,
            timeout=20,
        )
        page_response.raise_for_status()
        return parse_yandex_public_page(page_response.text, business_id=identity)

    # Два параллельных чтения держат ручное обновление в пределах HTTP timeout,
    # но не создают заметной нагрузки: полный обход запускается только раз в час.
    with ThreadPoolExecutor(max_workers=2) as executor:
        page_results = list(executor.map(_load_page, range(2, total_pages + 1)))
    for page_result in page_results:
        for row in page_result.get("reviews") or []:
            by_id[row["id"]] = row
    result["reviews"] = list(by_id.values())
    result["pages_fetched"] = total_pages
    return result


def _setting_snapshot(source: str) -> dict:
    try:
        raw = database.get_setting(f"external_reputation_snapshot:{source}")
        data = json.loads(raw) if raw else {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _public_monitor_status(source: str) -> dict:
    try:
        raw = database.get_setting(f"reputation_public_monitor_status:{source}")
        payload = json.loads(raw) if raw else {}
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def save_source_snapshot(
    source: str,
    *,
    rating=None,
    reviews_count=None,
    observed_at: str = "",
    origin: str = "authorized_import",
) -> dict:
    source = str(source or "").strip().lower()
    if source not in _SOURCES:
        return {"ok": False, "error": "unsupported_source"}
    payload = {
        "source": source,
        "rating": _float(rating),
        "reviews_count": _int(reviews_count),
        "observed_at": str(observed_at or datetime.now().isoformat(timespec="seconds"))[:32],
        "origin": str(origin or "authorized_import")[:40],
    }
    database.set_setting(
        f"external_reputation_snapshot:{source}",
        json.dumps(payload, ensure_ascii=False),
    )
    return {"ok": True, **payload}


def _config_snapshot(source: str) -> dict:
    name = "SALON_RATING_YANDEX" if source == "yandex" else "SALON_RATING_2GIS"
    raw = os.environ.get(name, str(getattr(config, name, "") or ""))
    parsed = parse_rating_label(raw)
    if not parsed.get("rating"):
        return {}
    return {
        "source": source,
        "rating": parsed.get("rating"),
        "reviews_count": parsed.get("reviews_count"),
        "observed_at": "",
        "origin": "configured_snapshot",
    }


def _two_gis_credentials() -> tuple[str, str]:
    key = (
        os.environ.get("TWOGIS_API_KEY", "")
        or os.environ.get("DGIS_API_KEY", "")
        or str(getattr(config, "TWOGIS_API_KEY", "") or "")
    )
    branch_id = (
        os.environ.get("TWOGIS_BRANCH_ID", "")
        or os.environ.get("DGIS_BRANCH_ID", "")
        or str(getattr(config, "TWOGIS_BRANCH_ID", "") or "")
    )
    if not branch_id:
        link = str(getattr(config, "BARBERSHOP_2GIS", "") or "")
        match = re.search(r"/(?:geo|firm)/(\d+)", link)
        branch_id = match.group(1) if match else ""
    return key.strip(), branch_id.strip()


def refresh_2gis_stats(*, force: bool = False) -> dict:
    cached = _setting_snapshot("2gis")
    if cached and not force:
        try:
            observed = datetime.fromisoformat(str(cached.get("observed_at") or "")[:19])
            if datetime.now() - observed < timedelta(hours=6):
                return {"ok": True, **cached, "cached": True}
        except Exception:
            pass
    key, branch_id = _two_gis_credentials()
    if not key or not branch_id:
        fallback = cached or _config_snapshot("2gis")
        return {
            "ok": bool(fallback),
            **fallback,
            "source": "2gis",
            "connection": "not_configured",
        }
    try:
        response = requests.get(
            "https://catalog.api.2gis.com/3.0/items/byid",
            params={
                "key": key,
                "id": branch_id,
                "fields": "items.reviews",
            },
            timeout=8,
        )
        response.raise_for_status()
        items = ((response.json() or {}).get("result") or {}).get("items") or []
        reviews = (items[0] if items else {}).get("reviews") or {}
        rating = _float(
            reviews.get("general_rating")
            or reviews.get("org_rating")
            or reviews.get("rating")
        )
        count = _int(
            reviews.get("general_review_count")
            or reviews.get("review_count")
            or reviews.get("org_review_count")
        )
        if rating is None:
            raise ValueError("2gis response has no rating")
        saved = save_source_snapshot(
            "2gis",
            rating=rating,
            reviews_count=count,
            origin="2gis_places_api",
        )
        return {**saved, "connection": "official_api", "cached": False}
    except Exception as error:
        return {
            "ok": bool(cached),
            **cached,
            "source": "2gis",
            "connection": "error",
            "error": type(error).__name__,
        }


def import_reviews(source: str, reviews: list[dict]) -> dict:
    source = str(source or "").strip().lower()
    if source not in _SOURCES:
        return {"ok": False, "error": "unsupported_source", "imported": 0}
    imported = 0
    skipped = 0
    new_reviews = []
    for item in (reviews or [])[:500]:
        if not isinstance(item, dict):
            skipped += 1
            continue
        rating = _float(item.get("rating"))
        text = anonymizer.redact_pii(str(item.get("text") or item.get("review") or "").strip())[:4000]
        published_at = str(item.get("published_at") or item.get("date") or "")[:32]
        if rating is None and not text:
            skipped += 1
            continue
        external_id = str(item.get("id") or item.get("external_id") or "").strip()
        if not external_id:
            material = f"{source}|{published_at}|{rating}|{text}".encode("utf-8")
            external_id = hashlib.sha256(material).hexdigest()[:40]
        saved = database.upsert_external_review(
            source=source,
            external_id=external_id,
            rating=rating,
            review_text=text,
            published_at=published_at,
            response_state=str(item.get("response_state") or "")[:32],
        )
        imported += 1
        if isinstance(saved, dict) and saved.get("created"):
            new_reviews.append({
                "id": saved.get("id"),
                "source": source,
                "external_id": external_id,
                "rating": rating,
                "review_text": text,
                "published_at": published_at,
            })
    return {
        "ok": True,
        "source": source,
        "imported": imported,
        "new": len(new_reviews),
        "new_reviews": new_reviews,
        "skipped": skipped,
    }


def refresh_public_reviews() -> dict:
    """Обновляет публичные отзывы и суточный рыночный снимок карт."""
    checked_at = datetime.now().isoformat(timespec="seconds")
    source_results = []
    for source in _SOURCES:
        bootstrap_key = f"reputation_public_bootstrap:{source}"
        bootstrapped = bool(database.get_setting(bootstrap_key))
        try:
            public = fetch_public_source(source)
            imported = import_reviews(source, public.get("reviews") or [])
            save_source_snapshot(
                source,
                rating=public.get("rating"),
                reviews_count=public.get("reviews_count"),
                observed_at=checked_at,
                origin="public_page",
            )
            if not bootstrapped:
                database.mark_external_reviews_alerted_for_source(source)
                database.set_setting(bootstrap_key, checked_at)
            database.set_setting(
                f"reputation_public_monitor_status:{source}",
                json.dumps({"ok": True, "checked_at": checked_at}, ensure_ascii=False),
            )
            source_results.append({
                "source": source,
                "ok": True,
                "reviews_found": len(public.get("reviews") or []),
                "reviews_count": public.get("reviews_count"),
                "rating": public.get("rating"),
                "new": 0 if not bootstrapped else imported.get("new", 0),
                "bootstrap": not bootstrapped,
                "connection": "public_page",
            })
        except Exception as error:
            database.set_setting(
                f"reputation_public_monitor_status:{source}",
                json.dumps({
                    "ok": False,
                    "checked_at": checked_at,
                    "error": type(error).__name__,
                }, ensure_ascii=False),
            )
            source_results.append({
                "source": source,
                "ok": False,
                "error": type(error).__name__,
                "connection": "public_page_error",
            })
    try:
        import market_intelligence
        market = market_intelligence.refresh_market_snapshot(force=False)
    except Exception as error:
        market = {
            "status": "warn",
            "refresh_error": type(error).__name__,
            "summary": {"competitors_scanned": 0, "reviews_analyzed": 0},
        }
    ready = [row for row in source_results if row.get("ok")]
    return {
        "ok": bool(ready),
        "checked_at": checked_at,
        "sources": source_results,
        "sources_ready": len(ready),
        "new": sum(int(row.get("new") or 0) for row in source_results),
        "market": {
            "status": market.get("status"),
            "cached": bool(market.get("cached")),
            "competitors_scanned": (market.get("summary") or {}).get("competitors_scanned", 0),
            "reviews_analyzed": (market.get("summary") or {}).get("reviews_analyzed", 0),
            "refresh_error": market.get("refresh_error"),
        },
    }


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
    by_source = {key: {"count": 0, "avg_rating": None} for key in _SOURCES}
    source_ratings = {key: [] for key in _SOURCES}
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
        "by_source": by_source,
        "themes": themes,
        "negative_excerpts": negative_excerpts,
    }


def reputation_snapshot(*, force_refresh: bool = False) -> dict:
    try:
        rows = database.list_external_reviews(days=365, limit=300)
    except Exception:
        rows = []
    text_analysis = analyze_reviews(rows)
    yandex = _setting_snapshot("yandex") or _config_snapshot("yandex")
    two_gis = refresh_2gis_stats(force=force_refresh)
    sources = []
    for key, snapshot in (("yandex", yandex), ("2gis", two_gis)):
        rating = _float((snapshot or {}).get("rating"))
        count = _int((snapshot or {}).get("reviews_count"))
        origin = str((snapshot or {}).get("origin") or "")
        monitor_status = _public_monitor_status(key)
        connection = (
            "public_page_error" if monitor_status and not monitor_status.get("ok")
            else ((snapshot or {}).get("connection") or (
                "public_page" if origin == "public_page"
                else ("configured_snapshot" if rating is not None else "not_configured")
            ))
        )
        public_monitoring = bool(database.get_setting(f"reputation_public_bootstrap:{key}"))
        sources.append({
            "key": key,
            "title": _SOURCES[key],
            "rating": rating,
            "reviews_count": count,
            "connection": connection,
            "observed_at": (snapshot or {}).get("observed_at") or "",
            "text_reviews_imported": (text_analysis.get("by_source") or {}).get(key, {}).get("count", 0),
            "text_api_available": False,
            "public_page_monitoring": public_monitoring,
            "last_public_check_at": monitor_status.get("checked_at") or "",
            "last_public_error": monitor_status.get("error") or "",
        })
    rated = [source for source in sources if source.get("rating") is not None]
    weighted_numerator = 0.0
    weighted_denominator = 0
    for source in rated:
        weight = source.get("reviews_count") or 1
        weighted_numerator += float(source["rating"]) * weight
        weighted_denominator += weight
    overall = round(weighted_numerator / weighted_denominator, 2) if weighted_denominator else None
    low_sources = [source for source in rated if float(source["rating"]) < 4.5]
    negative_count = int(text_analysis.get("negative_count") or 0)
    status = "risk" if low_sources or negative_count >= 3 else (
        "warn" if not rated or negative_count else "ok"
    )
    recommendations = []
    if low_sources:
        recommendations.append("Разобрать причины снижения рейтинга и ответить на свежий негатив.")
    negative_themes = [theme for theme in text_analysis.get("themes") or [] if theme.get("negative")]
    if negative_themes:
        recommendations.append(
            f"Главная повторяющаяся проблема: {negative_themes[0]['theme']}. Назначить корректирующее действие."
        )
    if not rows:
        recommendations.append(
            "Дождаться первого публичного сканирования карточек Яндекс Карт и 2ГИС."
        )
    return {
        "version": "maya_reputation_v1",
        "status": status,
        "headline": (
            "Репутация требует реакции" if status == "risk"
            else ("Репутационный контур подключён частично" if status == "warn" else "Репутация под контролем")
        ),
        "summary": {
            "overall_rating": overall,
            "rated_sources_count": len(rated),
            "text_reviews_count": text_analysis.get("reviews_count", 0),
            "negative_reviews_count": negative_count,
            "text_analysis_status": "ready" if rows else "awaiting_authorized_feed",
        },
        "sources": sources,
        "text_analysis": text_analysis,
        "recommendations": recommendations[:4],
        "limitations": [
            "Монитор читает только общедоступное состояние карточек и не обходит авторизацию или CAPTCHA.",
            "Если площадка изменит структуру страницы, MAYA сохранит последний снимок и покажет ошибку источника.",
        ],
    }
