"""First-party activity for the public «Лента событий».

The public site owns the content. This module stores counters and discussion,
keeps personal data out of model prompts, and uses the existing assistant only
as an internal moderation/reply layer.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import unicodedata
from contextlib import contextmanager
from datetime import datetime
from typing import Any

import anonymizer
import site_publications


DB_PATH = os.path.join(os.path.dirname(__file__), "barbershop.db")
MAX_COMMENT_LENGTH = 1200
ALLOWED_EVENTS = {
    "forma-kotoraya-rabotaet-kazhdy-den": "Форма, которая работает каждый день",
    "pyat-masterov-odin-standart": "Пять мастеров. Один стандарт",
    "kak-sohranit-formu-mezhdu-vizitami": "Как сохранить форму между визитами",
}

_PROFANITY = re.compile(
    r"(?:\b|_)(?:"
    r"бл[яяиеё][дть]?|"
    r"еб(?:а|ан|ат|у|н|л|уч|ут|ё)|"
    r"ёб(?:а|ан|ат|у|н|л|уч|ут)|"
    r"пизд|ху[йиеяё]|мудак|долбоёб|"
    r"мразь|ублюдок|сука|"
    r"fuck|shit|bitch"
    r")[a-zа-яё]*",
    re.IGNORECASE,
)
_INSULTS = re.compile(
    r"\b(?:ты|вы|мастер|барбер|салон)\s+"
    r"(?:идиот|дебил|тупой|конченый|ничтожество)",
    re.IGNORECASE,
)
_URL = re.compile(r"(?:https?://|www\.|t\.me/|vk\.com/)", re.IGNORECASE)


@contextmanager
def _connect():
    raise PermissionError('canonical_public_community_owner_required')


def init_schema() -> None:
    return None


def normalize_slug(value: Any) -> str | None:
    slug = unicodedata.normalize("NFC", str(value or "")).strip().lower()
    if slug in ALLOWED_EVENTS:
        return slug
    if re.fullmatch(r"post-[a-f0-9]{32}", slug) and site_publications.public_post(slug):
        return slug
    return None


def normalize_author(value: Any) -> str:
    author = re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(value or "")).strip())
    author = re.sub(r"[^0-9a-zA-Zа-яА-ЯёЁ .'-]", "", author).strip()
    return author or "Гость"


def normalize_comment(value: Any) -> str:
    text = unicodedata.normalize("NFC", str(value or "")).replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "").strip()
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    if not text:
        raise ValueError("empty")
    if len(text) > MAX_COMMENT_LENGTH:
        raise ValueError("too_long")
    return text


def deterministic_moderation(text: str) -> tuple[str, str]:
    """Reject obvious abuse/spam while deliberately allowing criticism."""
    if anonymizer.redact_pii(text) != text:
        return "reject", "personal_data"
    if _PROFANITY.search(text):
        return "reject", "profanity"
    if _INSULTS.search(text):
        return "reject", "insult"
    if len(_URL.findall(text)) > 1:
        return "reject", "link_spam"
    if re.search(r"(.)\1{8,}", text, re.IGNORECASE):
        return "reject", "character_spam"
    return "review", "needs_context"


def _parse_json_object(raw: str) -> dict:
    cleaned = (raw or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        return {}
    try:
        value = json.loads(match.group(0))
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def _maya_text(prompt: str, max_tokens: int) -> str:
    raise PermissionError('canonical_public_community_owner_required')


def moderate_comment(text: str) -> tuple[str, str]:
    return 'review', 'human_moderation_required'


def generate_brand_reply(slug: str, comment: str) -> str:
    return ''


def record_view(slug: str, viewer_hash: str) -> bool:
    raise PermissionError('canonical_public_community_owner_required')


def toggle_like(slug: str, user_id: int) -> bool:
    raise PermissionError('canonical_public_community_owner_required')


def add_comment(
    slug: str,
    user_id: int,
    author: str,
    text: str,
    status: str,
    reason: str,
) -> int:
    raise PermissionError('canonical_public_community_owner_required')


def add_brand_reply(slug: str, parent_id: int, text: str) -> int | None:
    raise PermissionError('canonical_public_community_owner_required')


def _date_label(value: str) -> str:
    try:
        dt = datetime.fromisoformat(value)
    except Exception:
        return ""
    return dt.strftime("%d.%m.%Y · %H:%M")


def event_status(slug: str, user_id: int | None = None) -> dict:
    raise PermissionError('canonical_public_community_owner_required')
