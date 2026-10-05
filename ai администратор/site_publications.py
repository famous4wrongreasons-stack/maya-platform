"""Durable, owner-authored website posts. No model or booking mutations."""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
import subprocess
import tempfile
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = str(Path(__file__).with_name("barbershop.db"))
MEDIA_DIR = Path(__file__).with_name("site-post-media")
MAX_TEXT = 50000
MAX_MEDIA = 10
MAX_DOWNLOAD = 20 * 1024 * 1024
SITE_URL = os.environ.get("SITE_PUBLICATIONS_URL", "https://malesthetic.pro").rstrip("/")
MEDIA_NAME = re.compile(r"^[a-f0-9]{64}\.(?:jpg|mp4)$")


@contextmanager
def _connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _now():
    return datetime.now(timezone.utc).isoformat()


def init_schema():
    with _connect() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS site_posts (
            id TEXT PRIMARY KEY,
            owner_id INTEGER NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'draft',
            created_at TEXT NOT NULL,
            published_at TEXT,
            CHECK (status IN ('draft', 'published', 'cancelled'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS site_posts_one_draft
            ON site_posts(owner_id) WHERE status = 'draft';
        CREATE INDEX IF NOT EXISTS site_posts_published
            ON site_posts(status, published_at DESC);
        CREATE TABLE IF NOT EXISTS site_post_parts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id TEXT NOT NULL REFERENCES site_posts(id),
            source_id TEXT NOT NULL UNIQUE,
            text TEXT NOT NULL DEFAULT '',
            media_json TEXT NOT NULL DEFAULT '[]'
        );
        """)


def active_draft(owner_id):
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM site_posts WHERE owner_id=? AND status='draft'", (owner_id,)
        ).fetchone()
        return dict(row) if row else None


def start_draft(owner_id):
    with _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT * FROM site_posts WHERE owner_id=? AND status='draft'", (owner_id,)
        ).fetchone()
        if row:
            return dict(row)
        post_id = uuid.uuid4().hex
        conn.execute(
            "INSERT INTO site_posts(id,owner_id,slug,created_at) VALUES (?,?,?,?)",
            (post_id, owner_id, f"post-{post_id}", _now()),
        )
        return dict(conn.execute("SELECT * FROM site_posts WHERE id=?", (post_id,)).fetchone())


def _parts(conn, post_id):
    rows = conn.execute(
        "SELECT text,media_json FROM site_post_parts WHERE post_id=? ORDER BY id", (post_id,)
    ).fetchall()
    text = "\n\n".join(row["text"] for row in rows if row["text"])
    media = [item for row in rows for item in json.loads(row["media_json"])]
    return text, media


def draft_content(owner_id, post_id):
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM site_posts WHERE id=? AND owner_id=?", (post_id, owner_id)
        ).fetchone()
        if not row:
            raise ValueError("not_found")
        text, media = _parts(conn, post_id)
        return {**dict(row), "text": text, "media": media}


def has_source(source_id):
    with _connect() as conn:
        return conn.execute("SELECT 1 FROM site_post_parts WHERE source_id=?", (source_id,)).fetchone() is not None


def add_part(owner_id, post_id, source_id, text="", media=None):
    text = str(text or "").replace("\x00", "").strip()
    media = media or []
    for item in media:
        if item.get("type") not in {"image", "video"} or not MEDIA_NAME.fullmatch(item.get("file", "")):
            raise ValueError("invalid_media")
        if not (MEDIA_DIR / item["file"]).is_file():
            raise ValueError("missing_media")
    with _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM site_posts WHERE id=? AND owner_id=?", (post_id, owner_id)).fetchone()
        if not row or row["status"] != "draft":
            raise ValueError("not_draft")
        if conn.execute("SELECT 1 FROM site_post_parts WHERE source_id=?", (source_id,)).fetchone():
            return False
        old_text, old_media = _parts(conn, post_id)
        if len(old_text) + len(text) + (2 if old_text and text else 0) > MAX_TEXT:
            raise ValueError("text_too_long")
        if len(old_media) + len(media) > MAX_MEDIA:
            raise ValueError("too_many_media")
        conn.execute(
            "INSERT INTO site_post_parts(post_id,source_id,text,media_json) VALUES (?,?,?,?)",
            (post_id, source_id, text, json.dumps(media)),
        )
        return True


def cancel_draft(owner_id, post_id):
    with _connect() as conn:
        return conn.execute(
            "UPDATE site_posts SET status='cancelled' WHERE id=? AND owner_id=? AND status='draft'",
            (post_id, owner_id),
        ).rowcount > 0


def publish(owner_id, post_id):
    with _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM site_posts WHERE id=? AND owner_id=?", (post_id, owner_id)).fetchone()
        if not row or row["status"] == "cancelled":
            raise ValueError("not_draft")
        text, media = _parts(conn, post_id)
        if not text:
            raise ValueError("text_required")
        for item in media:
            if not (MEDIA_DIR / item["file"]).is_file():
                raise ValueError("missing_media")
        if row["status"] == "draft":
            conn.execute("UPDATE site_posts SET status='published',published_at=? WHERE id=?", (_now(), post_id))
        return row["slug"]


def _public_post(conn, row):
    text, media = _parts(conn, row["id"])
    # The first short line is an explicit title; otherwise preserve the whole post.
    lines = text.splitlines()
    explicit_title = len(lines) > 1 and len(lines[0]) <= 140
    title = lines[0] if explicit_title else text.split("\n", 1)[0][:100]
    body_text = "\n".join(lines[1:]).strip() if explicit_title else text
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body_text) if p.strip()]
    date = datetime.fromisoformat(row["published_at"])
    return {
        "slug": row["slug"], "title": title, "body": paragraphs,
        "excerpt": re.sub(r"\s+", " ", body_text)[:220],
        "category": "События", "publishedAt": row["published_at"],
        "dateLabel": date.strftime("%d.%m.%Y"),
        "readTime": f"{max(1, math.ceil(len(text.split()) / 180))} мин.",
        "attachments": [{key: value for key, value in item.items()
                         if key in {"type", "file", "poster", "width", "height"}} for item in media],
        "alt": title,
    }


def public_post(slug):
    with _connect() as conn:
        row = conn.execute("SELECT * FROM site_posts WHERE slug=? AND status='published'", (slug,)).fetchone()
        return _public_post(conn, row) if row else None


def list_posts(limit=12, offset=0):
    limit = max(1, min(int(limit), 30))
    offset = max(0, min(int(offset), 100000))
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM site_posts WHERE status='published' ORDER BY published_at DESC,id DESC LIMIT ? OFFSET ?",
            (limit + 1, offset),
        ).fetchall()
        return {"ok": True, "posts": [_public_post(conn, row) for row in rows[:limit]],
                "nextOffset": offset + limit if len(rows) > limit else None}


def public_media(name):
    if not MEDIA_NAME.fullmatch(name):
        return None
    with _connect() as conn:
        # Draft media stays private even if its content hash is known.
        rows = conn.execute("""SELECT media_json FROM site_post_parts parts
            JOIN site_posts posts ON posts.id=parts.post_id WHERE posts.status='published'""").fetchall()
        if not any(name in {item.get("file"), item.get("poster")}
                   for row in rows for item in json.loads(row["media_json"])):
            return None
    path = MEDIA_DIR / name
    return path if path.is_file() else None


def _store_file(path, suffix):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    name = digest.hexdigest() + suffix
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    os.replace(path, MEDIA_DIR / name)
    return name


def prepare_media(path, kind):
    """Validate content and strip metadata; never trust uploaded filenames/MIME."""
    from PIL import Image, ImageOps

    path = Path(path)
    if path.stat().st_size > MAX_DOWNLOAD:
        raise ValueError("file_too_large")
    with tempfile.TemporaryDirectory(prefix="site-post-") as directory:
        temp = Path(directory)
        if kind == "image":
            with Image.open(path) as image:
                if image.width * image.height > 40_000_000:
                    raise ValueError("image_too_large")
                image = ImageOps.exif_transpose(image).convert("RGB")
                image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
                output = temp / "photo.jpg"
                image.save(output, "JPEG", quality=94, optimize=True)
                return {"type": "image", "file": _store_file(output, ".jpg"),
                        "width": image.width, "height": image.height}
        if kind != "video":
            raise ValueError("unsupported_media")
        try:
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                check=True, capture_output=True, timeout=20,
            )
            data = json.loads(probe.stdout)
            stream = next(s for s in data["streams"] if s.get("codec_type") == "video")
            duration = float(data.get("format", {}).get("duration", 0))
            if not 0 < duration <= 600:
                raise ValueError("video_too_long")
            output = temp / "video.mp4"
            subprocess.run([
                "ffmpeg", "-v", "error", "-nostdin", "-i", str(path),
                "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1",
                "-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
                "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-threads", "2", str(output),
            ], check=True, capture_output=True, timeout=240)
            if output.stat().st_size > 100 * 1024 * 1024:
                raise ValueError("file_too_large")
            poster = temp / "poster.jpg"
            subprocess.run([
                "ffmpeg", "-v", "error", "-nostdin", "-i", str(output), "-frames:v", "1",
                "-vf", "scale=960:-2", "-q:v", "2", str(poster),
            ], check=True, capture_output=True, timeout=30)
            return {"type": "video", "file": _store_file(output, ".mp4"),
                    "poster": _store_file(poster, ".jpg"),
                    "width": stream["width"], "height": stream["height"]}
        except (subprocess.SubprocessError, StopIteration, KeyError, json.JSONDecodeError) as exc:
            raise ValueError("invalid_video") from exc


def post_url(slug):
    return f"{SITE_URL}/events/post/?slug={slug}"


def register_routes(app):
    from aiohttp import web

    async def posts(request):
        import asyncio
        try:
            result = await asyncio.to_thread(list_posts, request.query.get("limit", 12), request.query.get("offset", 0))
        except ValueError:
            raise web.HTTPBadRequest()
        return web.json_response(result, headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"})

    async def post(request):
        import asyncio
        result = await asyncio.to_thread(public_post, request.match_info["slug"])
        if not result:
            raise web.HTTPNotFound()
        return web.json_response({"ok": True, "post": result}, headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"})

    async def media(request):
        import asyncio
        path = await asyncio.to_thread(public_media, request.match_info["name"])
        if not path:
            raise web.HTTPNotFound()
        return web.FileResponse(path, headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*",
        })

    app.router.add_get("/api/site/posts", posts)
    app.router.add_get("/api/site/posts/{slug}", post)
    app.router.add_get("/api/site/post-media/{name}", media)
