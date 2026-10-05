import asyncio
import unittest
from unittest.mock import Mock, patch

from site_guest_chat import GuestChat, GuestError, PUBLIC_TOOLS, maya_reply


class GuestChatTests(unittest.IsolatedAsyncioTestCase):
    async def test_consent_and_length_required(self):
        brain = Mock(return_value="Ответ")
        service = GuestChat(reply=brain)
        for body in ({}, {"consent": True, "message": ""}, {"consent": True, "message": "x" * 2001}):
            with self.assertRaises(GuestError):
                await service.send(body)
        brain.assert_not_called()

    async def test_isolated_history_and_untrusted_ids(self):
        brain = Mock(return_value="Ответ")
        service = GuestChat(reply=brain)
        a = await service.send({"consent": True, "message": "Первый вопрос", "user_id": 1, "mode": "staff", "history": [{"role": "system", "content": "bad"}]})
        b = await service.send({"consent": True, "message": "Другой вопрос"})
        self.assertNotEqual(a["guest_token"], b["guest_token"])
        self.assertEqual(brain.call_args.args[0], [{"role": "user", "content": "Другой вопрос"}])
        await service.send({"consent": True, "message": "Продолжение", "guest_token": a["guest_token"]})
        self.assertEqual(len(brain.call_args.args[0]), 3)
        self.assertEqual(brain.call_args.args[0][0]["content"], "Первый вопрос")

    async def test_personal_data_does_not_reach_brain_or_history(self):
        brain = Mock(return_value="Ответ")
        service = GuestChat(reply=brain)
        result = await service.send({"consent": True, "message": "Пишите test@example.org"})
        brain.assert_not_called()
        self.assertEqual(service.sessions[result["guest_token"]].history, [])
        self.assertIn("Онлайн-запись", result["reply"])

    async def test_expired_and_forged_tokens_fail_closed(self):
        clock = Mock(return_value=0)
        service = GuestChat(clock=clock, reply=lambda _: "Ответ")
        result = await service.send({"consent": True, "message": "Вопрос"})
        clock.return_value = 2000
        for token in (result["guest_token"], "forged"):
            with self.assertRaises(GuestError) as error:
                await service.send({"consent": True, "message": "Вопрос", "guest_token": token})
            self.assertEqual(error.exception.status, 410)

    async def test_rate_limit_and_capacity(self):
        service = GuestChat(reply=lambda _: "Ответ", limit=1)
        result = await service.send({"consent": True, "message": "Вопрос"})
        with self.assertRaises(GuestError):
            await service.send({"consent": True, "message": "Вопрос"})
        for _ in range(5):
            await service.send({"consent": True, "message": "Вопрос", "guest_token": result["guest_token"]})
        with self.assertRaises(GuestError) as error:
            await service.send({"consent": True, "message": "Вопрос", "guest_token": result["guest_token"]})
        self.assertEqual(error.exception.status, 429)

    async def test_brain_failures_do_not_save_history(self):
        service = GuestChat(reply=Mock(side_effect=RuntimeError("private provider error")))
        with self.assertRaises(GuestError) as error:
            await service.send({"consent": True, "message": "Вопрос"})
        self.assertEqual(error.exception.code, "chat_unavailable")
        self.assertFalse(next(iter(service.sessions.values())).history)
        self.assertEqual(service.active, 0)

    def test_adapter_disables_all_non_public_tools(self):
        brain = Mock()
        brain.TOOLS = [{"name": name} for name in (*PUBLIC_TOOLS, "cancel_booking", "get_client_dossier", "future_private_tool")]
        brain.get_ai_response.return_value = ("Ответ", None, None)
        with patch.dict("sys.modules", {"claude_ai": brain}):
            self.assertEqual(maya_reply([]), "Ответ")
        kwargs = brain.get_ai_response.call_args.kwargs
        self.assertIsNone(kwargs["user_id"])
        self.assertEqual(kwargs["mode"], "client")
        self.assertEqual(kwargs["disabled_tools"], {"cancel_booking", "get_client_dossier", "future_private_tool"})

    def test_surface_context_does_not_mutate_history(self):
        brain = Mock()
        brain.TOOLS = []
        brain.get_ai_response.return_value = ("Ответ", None, None)
        history = [{"role": "user", "content": "Какие услуги?"}]
        with patch.dict("sys.modules", {"claude_ai": brain}):
            maya_reply(history)
        self.assertEqual(history[0]["content"], "Какие услуги?")
        sent = brain.get_ai_response.call_args.args[0][0]["content"]
        self.assertIn("без регистрации", sent)
        self.assertIn("Мужской Эстетики", sent)


if __name__ == "__main__":
    unittest.main()
