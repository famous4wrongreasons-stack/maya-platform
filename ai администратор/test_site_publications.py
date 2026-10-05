import importlib
import json
import shutil
import subprocess
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from PIL import Image
from telegram.ext import ApplicationHandlerStop

import site_publications as posts
import site_engagement

# The integration tests must never import production config or use real identities.
with mock.patch.dict("sys.modules", {"database": types.SimpleNamespace(is_admin=lambda user_id: user_id == 101)}):
    publisher = importlib.import_module("site_publication_bot")


class PostStorage(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.patch_db = mock.patch.object(posts, "DB_PATH", str(self.root / "posts.db"))
        self.patch_media = mock.patch.object(posts, "MEDIA_DIR", self.root / "media")
        self.patch_db.start()
        self.patch_media.start()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.patch_db.stop)
        self.addCleanup(self.patch_media.stop)
        posts.init_schema()

    def photo(self):
        source = self.root / "input.png"
        Image.new("RGB", (120, 80), "green").save(source)
        return posts.prepare_media(source, "image")

    def test_draft_survives_reinitialization_and_deduplicates(self):
        draft = posts.start_draft(101)
        self.assertTrue(posts.add_part(101, draft["id"], "101:1", "Заголовок\n\nНачало статьи"))
        self.assertFalse(posts.add_part(101, draft["id"], "101:1", "Дубликат"))
        posts.add_part(101, draft["id"], "101:2", "Продолжение статьи", [self.photo()])
        posts.init_schema()
        self.assertEqual(posts.start_draft(101)["id"], draft["id"])
        content = posts.draft_content(101, draft["id"])
        self.assertIn("Продолжение статьи", content["text"])
        self.assertEqual(len(content["media"]), 1)
        slug = posts.publish(101, draft["id"])
        self.assertEqual(posts.publish(101, draft["id"]), slug)
        self.assertIsNone(posts.active_draft(101))
        self.assertEqual(len(posts.list_posts()["posts"]), 1)
        result = posts.public_post(slug)
        self.assertEqual(result["title"], "Заголовок")
        self.assertEqual(result["body"], ["Начало статьи", "Продолжение статьи"])
        self.assertNotIn("owner_id", json.dumps(result))
        self.assertNotIn("source_id", json.dumps(result))

    def test_draft_and_media_are_private_until_published(self):
        draft = posts.start_draft(101)
        photo = self.photo()
        posts.add_part(101, draft["id"], "101:1", "Публикация", [photo])
        self.assertIsNone(posts.public_post(draft["slug"]))
        self.assertEqual(posts.list_posts()["posts"], [])
        self.assertIsNone(posts.public_media(photo["file"]))
        posts.publish(101, draft["id"])
        self.assertTrue(posts.public_media(photo["file"]).is_file())
        self.assertIsNone(posts.public_media("../posts.db"))
        self.assertIsNone(posts.public_media("a" * 64 + ".jpg"))

    def test_other_owner_cannot_modify_cancel_or_publish(self):
        draft = posts.start_draft(101)
        posts.add_part(101, draft["id"], "101:1", "Статья")
        for operation in [lambda: posts.add_part(102, draft["id"], "102:1", "Подмена"),
                          lambda: posts.publish(102, draft["id"]),
                          lambda: posts.draft_content(102, draft["id"])]:
            with self.assertRaises(ValueError):
                operation()
        self.assertFalse(posts.cancel_draft(102, draft["id"]))
        self.assertTrue(posts.cancel_draft(101, draft["id"]))
        with self.assertRaises(ValueError):
            posts.publish(101, draft["id"])
        self.assertNotEqual(posts.start_draft(101)["id"], draft["id"])

    def test_validations(self):
        draft = posts.start_draft(101)
        with self.assertRaisesRegex(ValueError, "text_required"):
            posts.publish(101, draft["id"])
        with self.assertRaisesRegex(ValueError, "text_too_long"):
            posts.add_part(101, draft["id"], "101:1", "x" * (posts.MAX_TEXT + 1))
        with self.assertRaisesRegex(ValueError, "too_many_media"):
            posts.add_part(101, draft["id"], "101:1", "Post", [self.photo()] * 11)
        with self.assertRaisesRegex(ValueError, "invalid_media"):
            posts.add_part(101, draft["id"], "101:1", "Post", [{"type": "image", "file": "../../secret.jpg"}])

    def test_image_conversion_strips_metadata(self):
        source = self.root / "photo.jpg"
        exif = Image.Exif()
        exif[270] = "private metadata"
        Image.new("RGB", (2500, 1000), "red").save(source, exif=exif)
        media = posts.prepare_media(source, "image")
        with Image.open(posts.MEDIA_DIR / media["file"]) as image:
            self.assertEqual(image.size, (2400, 960))
            self.assertEqual(dict(image.getexif()), {})

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg required")
    def test_video_is_web_playable_and_has_poster(self):
        source = self.root / "clip.mov"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=blue:s=160x120:d=0.2",
                        "-c:v", "libx264", str(source)], check=True)
        media = posts.prepare_media(source, "video")
        self.assertTrue((posts.MEDIA_DIR / media["poster"]).is_file())
        result = subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(posts.MEDIA_DIR / media["file"])])
        self.assertEqual(json.loads(result)["streams"][0]["codec_name"], "h264")

    def test_pagination_and_dynamic_engagement(self):
        for i in range(4):
            draft = posts.start_draft(101)
            posts.add_part(101, draft["id"], f"101:{i}", f"Публикация {i}")
            posts.publish(101, draft["id"])
        first = posts.list_posts(2)
        second = posts.list_posts(2, first["nextOffset"])
        self.assertIsNone(second["nextOffset"])
        self.assertEqual(len({p["slug"] for p in first["posts"] + second["posts"]}), 4)
        with mock.patch.object(site_engagement, "DB_PATH", posts.DB_PATH):
            site_engagement.init_schema()
            slug = first["posts"][0]["slug"]
            self.assertEqual(site_engagement.normalize_slug(slug), slug)
            site_engagement.record_view(slug, "viewer")
            site_engagement.toggle_like(slug, 102)
            self.assertEqual(site_engagement.event_status(slug)["stats"]["likes"], 1)
            draft = posts.start_draft(101)
            self.assertIsNone(site_engagement.normalize_slug(draft["slug"]))


class PublicRoutes(unittest.IsolatedAsyncioTestCase):
    async def test_read_only_routes_media_ranges_and_missing_posts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with mock.patch.object(posts, "DB_PATH", str(root / "db")), mock.patch.object(posts, "MEDIA_DIR", root):
                posts.init_schema()
                draft = posts.start_draft(101)
                filename = "a" * 64 + ".mp4"
                (root / filename).write_bytes(b"0123456789")
                posts.add_part(101, draft["id"], "101:1", "Video", [{"type": "video", "file": filename}])
                app = web.Application()
                posts.register_routes(app)
                async with TestClient(TestServer(app)) as client:
                    response = await client.get(f"/api/site/post-media/{filename}")
                    self.assertEqual(response.status, 404)
                    posts.publish(101, draft["id"])
                    response = await client.get("/api/site/posts")
                    self.assertEqual(len((await response.json())["posts"]), 1)
                    self.assertEqual(response.headers["Cache-Control"], "no-store")
                    response = await client.get(f"/api/site/posts/{draft['slug']}")
                    self.assertEqual((await response.json())["post"]["slug"], draft["slug"])
                    response = await client.get(f"/api/site/post-media/{filename}", headers={"Range": "bytes=2-5"})
                    self.assertEqual(response.status, 206)
                    self.assertEqual(await response.read(), b"2345")
                    response = await client.post("/api/site/posts")
                    self.assertEqual(response.status, 405)
                    response = await client.get("/api/site/posts?limit=bad")
                    self.assertEqual(response.status, 400)


class BotPublicationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        patch = mock.patch.object(posts, "DB_PATH", str(Path(self.temp.name) / "db"))
        patch.start()
        self.addCleanup(patch.stop)
        posts.init_schema()
        self.counter = 0

    def update(self, text="", user=101, group=False, callback=None):
        self.counter += 1
        message = types.SimpleNamespace(text=text, caption=None, photo=[], video=None, document=None,
                                        voice=None, contact=None, message_id=self.counter, reply_text=mock.AsyncMock())
        query = types.SimpleNamespace(data=callback, answer=mock.AsyncMock(), edit_message_reply_markup=mock.AsyncMock()) if callback else None
        return types.SimpleNamespace(effective_user=types.SimpleNamespace(id=user), effective_message=message,
                                     effective_chat=types.SimpleNamespace(id=-123 if group else user, type="group" if group else "private"),
                                     callback_query=query, edited_message=None)

    async def consume(self, update):
        with self.assertRaises(ApplicationHandlerStop):
            await publisher.handle_update(update, types.SimpleNamespace(bot=mock.AsyncMock()))

    async def test_owner_end_to_end_and_repeated_publish(self):
        await self.consume(self.update("/post"))
        draft = posts.active_draft(101)
        update = self.update("Заголовок\n\nТекст статьи")
        await self.consume(update)
        await self.consume(update)
        await self.consume(self.update("Ещё абзац"))
        publish = self.update(callback=f"sitepost:publish:{draft['id']}")
        publish.callback_query.edit_message_reply_markup.side_effect = RuntimeError("expired")
        await self.consume(publish)
        self.assertIn("Опубликовано", publish.effective_message.reply_text.call_args.args[0])
        await self.consume(publish)
        self.assertEqual(len(posts.list_posts()["posts"]), 1)

    async def test_other_users_groups_and_forged_callbacks_cannot_publish(self):
        for update in [self.update("/post", user=102), self.update("/post", group=True),
                       self.update(callback="sitepost:publish:fake", user=102)]:
            await self.consume(update)
        self.assertIsNone(posts.active_draft(102))
        self.assertIsNone(posts.active_draft(101))

    async def test_existing_chat_commands_and_contacts_pass_through(self):
        await publisher.handle_update(self.update("Как записаться?"), None)
        await self.consume(self.update("/post"))
        for update in [self.update("/admin"), self.update(callback="booking:master"), self.update("Здравствуйте", user=102)]:
            await publisher.handle_update(update, None)
        contact = self.update()
        contact.effective_message.contact = object()
        await publisher.handle_update(contact, None)

    async def test_album_items_and_caption_then_cancel(self):
        await self.consume(self.update("/post"))
        for i in range(2):
            update = self.update()
            update.effective_message.caption = "Подпись" if i == 0 else None
            update.effective_message.photo = [object()]
            with mock.patch.object(publisher, "_download", mock.AsyncMock(return_value=[])):
                await self.consume(update)
        await self.consume(self.update("/cancel"))
        self.assertIsNone(posts.active_draft(101))
        self.assertEqual(posts.list_posts()["posts"], [])


if __name__ == "__main__":
    unittest.main()
