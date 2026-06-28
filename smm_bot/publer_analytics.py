"""Модуль для работы с аналитикой Publer — best times, top hashtags, competitors."""
import aiohttp
import time
import logging
from typing import List, Dict, Optional

import config

log = logging.getLogger(__name__)
BASE_URL = "https://app.publer.com/api/v1"

# Кэш на 6 часов чтобы не дёргать API каждый раз
_CACHE = {
    "hashtags":      {"data": None, "fetched_at": 0},
    "best_times":    {"data": None, "fetched_at": 0},
    "competitors":   {"data": None, "fetched_at": 0},
}
CACHE_TTL = 6 * 3600  # 6 часов


def _headers() -> dict:
    return {
        "Authorization": f"Bearer-API {config.PUBLER_API_KEY}",
        "Publer-Workspace-Id": config.PUBLER_WORKSPACE_ID,
    }


def _is_cached(key: str) -> bool:
    entry = _CACHE.get(key, {})
    return bool(entry.get("data")) and (entry.get("fetched_at", 0) + CACHE_TTL > time.time())


async def get_best_times(account_id: str, force_refresh: bool = False) -> List[Dict]:
    """Лучшее время для публикации. Возвращает [{day, hour, score}, ...]."""
    if not force_refresh and _is_cached("best_times"):
        return _CACHE["best_times"]["data"]

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{BASE_URL}/analytics/{account_id}/best_times",
                headers=_headers(),
                timeout=aiohttp.ClientTimeout(total=10)
            ) as r:
                if r.status != 200:
                    return []
                data = await r.json()
                result = data if isinstance(data, list) else []
                _CACHE["best_times"] = {"data": result, "fetched_at": time.time()}
                return result
    except Exception as e:
        log.error(f"Publer best_times error: {e}")
        return []


async def get_top_hashtags(account_id: str, limit: int = 15, force_refresh: bool = False) -> List[Dict]:
    """Топ хэштегов по охвату."""
    if not force_refresh and _is_cached("hashtags"):
        return _CACHE["hashtags"]["data"]

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{BASE_URL}/analytics/{account_id}/hashtag_insights",
                headers=_headers(),
                params={"limit": limit, "sort": "reach"},
                timeout=aiohttp.ClientTimeout(total=10)
            ) as r:
                if r.status != 200:
                    return []
                data = await r.json()
                result = data.get("records", []) if isinstance(data, dict) else []
                _CACHE["hashtags"] = {"data": result, "fetched_at": time.time()}
                return result
    except Exception as e:
        log.error(f"Publer hashtags error: {e}")
        return []


async def get_top_hashtags_string(account_id: str, count: int = 15) -> Optional[str]:
    """Возвращает топ хэштеги как готовую строку для поста, или None если данных нет."""
    records = await get_top_hashtags(account_id)
    if not records:
        return None
    tags = []
    for h in records[:count]:
        name = h.get("name") or h.get("hashtag")
        if name:
            tags.append(f"#{name.lstrip('#')}")
    if not tags:
        return None
    return " ".join(tags)


async def get_competitor_analysis(force_refresh: bool = False) -> List[Dict]:
    """Анализ конкурентов из Publer."""
    if not force_refresh and _is_cached("competitors"):
        return _CACHE["competitors"]["data"]

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{BASE_URL}/analytics/competitors",
                headers=_headers(),
                timeout=aiohttp.ClientTimeout(total=10)
            ) as r:
                if r.status != 200:
                    return []
                data = await r.json()
                result = data if isinstance(data, list) else data.get("records", [])
                _CACHE["competitors"] = {"data": result, "fetched_at": time.time()}
                return result
    except Exception as e:
        log.error(f"Publer competitors error: {e}")
        return []


def format_best_time_slots(times: List[Dict], top_n: int = 7) -> str:
    """Форматирует best_times для отображения."""
    if not times:
        return "Данных пока нет"

    days_ru = {0: "Пн", 1: "Вт", 2: "Ср", 3: "Чт", 4: "Пт", 5: "Сб", 6: "Вс",
               "monday": "Пн", "tuesday": "Вт", "wednesday": "Ср", "thursday": "Чт",
               "friday": "Пт", "saturday": "Сб", "sunday": "Вс"}

    lines = []
    sorted_times = sorted(times, key=lambda t: t.get("score", 0), reverse=True)
    for t in sorted_times[:top_n]:
        day_raw = t.get("day")
        day = days_ru.get(day_raw, str(day_raw))
        hour = t.get("hour", 0)
        score = t.get("score", 0)
        lines.append(f"• {day} {hour:02d}:00 — рейтинг {score:.1f}")
    return "\n".join(lines)


def get_next_best_slot(times: List[Dict], from_dt) -> Optional[object]:
    """Возвращает ближайший лучший слот после указанной даты."""
    from datetime import datetime, timedelta
    if not times:
        return None
    sorted_times = sorted(times, key=lambda t: t.get("score", 0), reverse=True)[:5]
    # Ищем ближайший слот в эти "лучшие" часы
    for days_ahead in range(7):
        check_date = from_dt + timedelta(days=days_ahead)
        weekday = check_date.weekday()
        for t in sorted_times:
            t_day = t.get("day")
            if isinstance(t_day, str):
                day_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
                           "friday": 4, "saturday": 5, "sunday": 6}
                t_day = day_map.get(t_day.lower(), -1)
            if t_day == weekday:
                slot = check_date.replace(hour=t.get("hour", 18), minute=0, second=0, microsecond=0)
                if slot > from_dt:
                    return slot
    return None
