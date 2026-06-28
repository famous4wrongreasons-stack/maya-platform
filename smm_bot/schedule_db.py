import json
import sqlite3
import logging
from datetime import datetime, timedelta
from typing import List, Tuple, Optional

log = logging.getLogger(__name__)
DB_PATH = "/opt/smm_bot/scheduled.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS scheduled_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id      TEXT NOT NULL,
            media_type   TEXT NOT NULL,
            caption      TEXT,
            scheduled_at TEXT NOT NULL,
            status       TEXT DEFAULT 'pending',
            published_at TEXT,
            error        TEXT,
            payload_json TEXT,
            created_at   TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("PRAGMA table_info(scheduled_posts)")
    columns = {row[1] for row in cur.fetchall()}
    if "payload_json" not in columns:
        cur.execute("ALTER TABLE scheduled_posts ADD COLUMN payload_json TEXT")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_status_time ON scheduled_posts(status, scheduled_at)")
    conn.commit()
    conn.close()


def add_post(file_id: str, media_type: str, caption: str, scheduled_at: datetime, payload: Optional[dict] = None) -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    payload_json = json.dumps(payload, ensure_ascii=False) if payload else None
    cur.execute(
        "INSERT INTO scheduled_posts (file_id, media_type, caption, scheduled_at, payload_json) VALUES (?, ?, ?, ?, ?)",
        (file_id, media_type, caption or "", scheduled_at.isoformat(), payload_json)
    )
    post_id = cur.lastrowid
    conn.commit()
    conn.close()
    return post_id


def add_post_payload(post: dict, scheduled_at: datetime) -> int:
    """Сохраняет пост целиком, включая альбомы и платформенные captions."""
    if post.get("media_type") == "album":
        first = post.get("files", [{}])[0]
        file_id = first.get("file_id", "")
    else:
        file_id = post.get("file_id", "")
    return add_post(
        file_id=file_id,
        media_type=post.get("media_type", "photo"),
        caption=post.get("caption", ""),
        scheduled_at=scheduled_at,
        payload=post,
    )


def get_due_posts() -> List[Tuple]:
    """Посты которые пора публиковать."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    now = datetime.now().isoformat()
    cur.execute(
        "SELECT id, file_id, media_type, caption FROM scheduled_posts "
        "WHERE status = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at",
        (now,)
    )
    rows = cur.fetchall()
    conn.close()
    return rows


def get_due_post_dicts() -> List[Tuple[int, dict]]:
    """Посты к публикации в формате (id, post_dict).

    Новые записи берутся из payload_json. Старые записи без payload_json
    собираются обратно из file_id/media_type/caption для совместимости.
    """
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    now = datetime.now().isoformat()
    cur.execute(
        "SELECT id, file_id, media_type, caption, payload_json FROM scheduled_posts "
        "WHERE status = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at",
        (now,)
    )
    rows = cur.fetchall()
    conn.close()

    result = []
    for post_id, file_id, media_type, caption, payload_json in rows:
        post = None
        if payload_json:
            try:
                post = json.loads(payload_json)
            except Exception as e:
                log.error(f"payload_json parse error for post #{post_id}: {e}")
        if not post:
            post = {"file_id": file_id, "media_type": media_type, "caption": caption or ""}
        result.append((post_id, post))
    return result


def get_pending_queue() -> List[Tuple]:
    """Вся очередь будущих публикаций."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "SELECT id, media_type, caption, scheduled_at FROM scheduled_posts "
        "WHERE status = 'pending' ORDER BY scheduled_at"
    )
    rows = cur.fetchall()
    conn.close()
    return rows


def mark_done(post_id: int, success: bool = True, error: Optional[str] = None):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    status = "published" if success else "failed"
    cur.execute(
        "UPDATE scheduled_posts SET status=?, published_at=?, error=? WHERE id=?",
        (status, datetime.now().isoformat(), error, post_id)
    )
    conn.commit()
    conn.close()


def cancel(post_id: int) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("DELETE FROM scheduled_posts WHERE id=? AND status='pending'", (post_id,))
    affected = cur.rowcount
    conn.commit()
    conn.close()
    return affected > 0


def parse_datetime(text: str) -> Optional[datetime]:
    """Парсит дату-время из строки. Поддерживает форматы:
    - 25.05 18:00
    - 25.05.2026 18:00
    - 18:00 (сегодня или завтра)
    - завтра 18:00
    """
    text = text.strip().lower()
    now = datetime.now()

    if text.startswith("завтра"):
        rest = text.replace("завтра", "").strip()
        try:
            t = datetime.strptime(rest, "%H:%M").time()
            return datetime.combine(now.date() + timedelta(days=1), t)
        except ValueError:
            return None

    if text.startswith("сегодня"):
        rest = text.replace("сегодня", "").strip()
        try:
            t = datetime.strptime(rest, "%H:%M").time()
            return datetime.combine(now.date(), t)
        except ValueError:
            return None

    formats = [
        ("%d.%m.%Y %H:%M", None),
        ("%d.%m %H:%M", "year"),
        ("%H:%M", "date"),
    ]

    for fmt, fill in formats:
        try:
            dt = datetime.strptime(text, fmt)
            if fill == "year":
                dt = dt.replace(year=now.year)
                if dt < now:
                    dt = dt.replace(year=now.year + 1)
            elif fill == "date":
                dt = datetime.combine(now.date(), dt.time())
                if dt < now:
                    dt = dt + timedelta(days=1)
            return dt
        except ValueError:
            continue
    return None


def format_datetime(iso_str: str) -> str:
    dt = datetime.fromisoformat(iso_str)
    return dt.strftime("%d.%m %H:%M")
