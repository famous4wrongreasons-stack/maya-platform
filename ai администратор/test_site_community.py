import asyncio
import json
import logging
import sys
import tempfile
import time
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

import site_community as community
import site_engagement as events
import site_publications as publications

SLUG = "forma-kotoraya-rabotaet-kazhdy-den"
SECRET = "test-gateway-not-a-real-credential"
VISITOR = "a" * 64
NETWORK = "b" * 64


class CommunityTests(unittest.IsolatedAsyncioTestCase):
    def test_telegram_transport_logs_redact_credentials(self):
        record = logging.LogRecord("httpx", logging.INFO, "", 1, "HTTP Request: %s",
                                   ("https://api.telegram.org/bot123456:fake-test-token/sendMessage",), None)
        community.TelegramTokenFilter().filter(record)
        self.assertNotIn("fake-test-token", record.getMessage())
        self.assertIn("/bot[REDACTED]/sendMessage", record.getMessage())

    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.patches = [
            patch.object(events, "DB_PATH", str(Path(self.temp.name) / "test.db")),
            patch.object(publications, "DB_PATH", str(Path(self.temp.name) / "posts.db")),
            patch.dict(sys.modules, {
                "config": types.SimpleNamespace(TELEGRAM_TOKEN=SECRET),
                "database": types.SimpleNamespace(is_admin=lambda uid: uid == 42),
            }),
            patch.object(community, "notify_owner", new_callable=AsyncMock),
            patch.object(events, "moderate_comment", return_value=("approve", "clean")),
            patch.object(events, "generate_brand_reply", return_value="Спасибо за вопрос. Подскажем."),
        ]
        self.mocks = [p.start() for p in self.patches]
        app = web.Application()
        community.register_routes(app, lambda request, body: 42 if body.get("auth_data") == "valid-admin-test-session" else None)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    async def call(self, action, **extra):
        body = {"visitor": VISITOR, "network": NETWORK, "slug": SLUG, **extra}
        raw = json.dumps(body)
        stamp = str(int(time.time()))
        response = await self.client.post("/api/site/community/" + action, data=raw,
            headers={"Content-Type": "application/json", "X-Site-Time": stamp,
                     "X-Site-Signature": community.digest(SECRET, "site-gateway-v1:" + stamp + ":" + raw)})
        return response.status, await response.json()

    def submission(self, **extra):
        return {"text": "Какая укладка подходит для густых волос?", "display_name": "Посетитель",
                "consent": True, "request_key": "guest-request-00001",
                "form_token": community.form_token(SECRET, VISITOR, time.time() - 5), **extra}

    async def test_unsigned_direct_access_is_blocked(self):
        response = await self.client.post("/api/site/community/comment", json=self.submission())
        self.assertEqual(response.status, 403)

    async def test_guest_comment_and_reply_without_auth(self):
        status, result = await self.call("comment", **self.submission())
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "approved")
        self.assertEqual(result["stats"]["comments"], 1)
        self.assertTrue(result["comments"][0]["is_guest"])
        self.assertTrue(result["comments"][1]["is_brand_reply"])
        self.assertNotIn("visitor_hash", result["comments"][0])

    async def test_healthy_criticism_stays_public(self):
        status, result = await self.call("comment", **self.submission(text="Пришлось ждать двадцать минут, это неудобно."))
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "approved")

    async def test_profanity_and_personal_data_do_not_reach_model(self):
        for value in ["Ты идиот", "Мой номер +7 999 123-45-67"]:
            status, _ = await self.call("comment", **self.submission(text=value))
            self.assertEqual(status, 422)
        self.mocks[4].assert_not_called()

    async def test_honeypot_consent_and_forged_form(self):
        for changes, expected in [({"website": "spam"}, 422), ({"consent": False}, 403), ({"form_token": "forged"}, 403)]:
            status, _ = await self.call("comment", **self.submission(**changes))
            self.assertEqual(status, expected)
        self.mocks[4].assert_not_called()

    async def test_uncertain_comment_hidden_until_owner_decision(self):
        self.mocks[4].return_value = ("review", "ambiguous")
        status, result = await self.call("comment", **self.submission())
        self.assertEqual(status, 202)
        self.assertEqual(result["comments"], [])
        self.mocks[3].assert_awaited_once()
        self.assertEqual((await self.call("moderation"))[0], 401)
        status, inbox = await self.call("moderation", auth_data="valid-admin-test-session")
        self.assertEqual(status, 200)
        self.assertEqual(len(inbox["queue"]), 1)
        self.assertEqual((await self.call("resolve", comment_id=result["comment_id"], decision="approve"))[0], 401)
        await self.call("resolve", auth_data="valid-admin-test-session", comment_id=result["comment_id"], decision="approve")
        _, public = await self.call("status")
        self.assertEqual(public["stats"]["comments"], 1)

    async def test_serious_criticism_published_and_owner_alerted(self):
        _, result = await self.call("comment", **self.submission(text="Это жалоба: обслуживание разочаровало."))
        self.assertEqual(result["status"], "approved")
        self.mocks[3].assert_awaited_once()
        self.assertEqual(len(community.review_queue()), 1)

    async def test_repeated_delivery_is_idempotent(self):
        _, first = await self.call("comment", **self.submission())
        _, second = await self.call("comment", **self.submission())
        self.assertEqual(first["comment_id"], second["comment_id"])
        self.assertEqual(second["stats"]["comments"], 1)
        self.mocks[4].assert_called_once()

    async def test_guest_like_idempotence_and_isolation(self):
        await self.call("like", liked=True)
        _, result = await self.call("like", liked=True)
        self.assertEqual(result["stats"]["likes"], 1)
        self.assertTrue(result["stats"]["liked"])
        _, other = await self.call("status", visitor="c" * 64)
        self.assertFalse(other["stats"]["liked"])
        _, result = await self.call("like", liked=False)
        self.assertEqual(result["stats"]["likes"], 0)

    async def test_network_limit_survives_new_cookie(self):
        for i in range(3):
            visitor = str(i) * 64
            status, _ = await self.call("comment", **self.submission(text="Ты идиот", visitor=visitor,
                form_token=community.form_token(SECRET, visitor, time.time() - 5)))
            self.assertEqual(status, 422)
        status, _ = await self.call("comment", **self.submission())
        self.assertEqual(status, 429)
        community.spend_limits([("durable-network", 60, 1)])
        with self.assertRaises(community.CommunityError):
            community.spend_limits([("durable-network", 60, 1)])

    async def test_impersonation_blocked(self):
        for name in ["Администратор", "Мужская Эстетика", "MAYA"]:
            self.assertEqual((await self.call("comment", **self.submission(display_name=name)))[0], 400)

    async def test_generic_praise_does_not_generate_filler_reply(self):
        _, result = await self.call("comment", **self.submission(text="Спасибо!"))
        self.assertEqual(len(result["comments"]), 1)
        self.mocks[5].assert_not_called()

    async def test_model_failure_keeps_comment_pending(self):
        self.mocks[4].side_effect = RuntimeError("test failure")
        status, result = await self.call("comment", **self.submission())
        self.assertEqual(status, 202)
        self.assertEqual(result["comments"], [])

    async def test_gateway_tampering_and_expiration(self):
        raw = json.dumps({"visitor": VISITOR, "network": NETWORK})
        stamp = str(int(time.time()))
        headers = {"X-Site-Time": stamp, "X-Site-Signature": community.digest(SECRET, "site-gateway-v1:" + stamp + ":" + raw)}
        self.assertEqual(community.verify_gateway(raw, headers, SECRET)["visitor"], VISITOR)
        with self.assertRaises(community.CommunityError):
            community.verify_gateway(raw + " ", headers, SECRET)
        with self.assertRaises(community.CommunityError):
            community.verify_gateway(raw, headers, SECRET, time.time() + 200)


if __name__ == "__main__":
    unittest.main()
