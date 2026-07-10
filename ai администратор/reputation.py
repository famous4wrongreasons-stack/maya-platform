"""Репутационный слой MAYA OS для Яндекс Карт и 2ГИС.

2ГИС Places API официально отдаёт статистику рейтинга, но не тексты отзывов.
Для анализа текстов используется только разрешённый импорт из кабинета/экспорта
или будущего почтового коннектора. Неофициальный scraping намеренно отсутствует.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timedelta

import requests

import anonymizer
import config
import database


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


def _setting_snapshot(source: str) -> dict:
    try:
        raw = database.get_setting(f"external_reputation_snapshot:{source}")
        data = json.loads(raw) if raw else {}
        return data if isinstance(data, dict) else {}
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
        database.upsert_external_review(
            source=source,
            external_id=external_id,
            rating=rating,
            review_text=text,
            published_at=published_at,
            response_state=str(item.get("response_state") or "")[:32],
        )
        imported += 1
    return {"ok": True, "source": source, "imported": imported, "skipped": skipped}


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
        connection = (snapshot or {}).get("connection") or (
            "configured_snapshot" if rating is not None else "not_configured"
        )
        sources.append({
            "key": key,
            "title": _SOURCES[key],
            "rating": rating,
            "reviews_count": count,
            "connection": connection,
            "observed_at": (snapshot or {}).get("observed_at") or "",
            "text_reviews_imported": (text_analysis.get("by_source") or {}).get(key, {}).get("count", 0),
            "text_api_available": False,
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
            "Подключить разрешённый импорт текстов из кабинетов или уведомлений: публичные API дают не все отзывы."
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
            "2ГИС Places API официально отдаёт рейтинг и количество, но не тексты отзывов.",
            "У Яндекс Бизнеса нет подключённого публичного server API текстов; нужен разрешённый импорт/коннектор.",
        ],
    }
