"""Anonymous website adapter to MAYA. No account, private tools or durable history."""

import asyncio
from collections import deque
from dataclasses import dataclass, field
import secrets
import time

import anonymizer


PUBLIC_TOOLS = frozenset({
    "get_services", "get_masters", "who_works", "get_available_slots",
    "find_nearest_slots", "show_subscription_plans", "barber_knowledge",
})
CONTACT_REPLY = (
    "Для записи откройте «Онлайн-запись» под сообщением. "
    "Имя и телефон укажите в форме записи, а не в переписке."
)
SITE_CONTEXT = (
    "\n\n[Контекст сайта: ты ИИ-администратор «Мужской Эстетики». "
    "Отвечай от имени барбершопа, не представляйся Майей или сотрудником-человеком. "
    "Это гостевая консультация без регистрации. Не проси войти для обычного вопроса. "
    "Личные записи и история клиента тебе недоступны. "
    "Не собирай имя, телефон и другие контакты в переписке. "
    "Для оформления записи направляй в «Онлайн-запись» под сообщением. "
    "Не утверждай, что запись создана, изменена или оплачена.]"
)


class GuestError(Exception):
    def __init__(self, code, status):
        self.code = code
        self.status = status


@dataclass
class Session:
    expires: float
    history: list = field(default_factory=list)
    calls: deque = field(default_factory=deque)
    busy: bool = False


def maya_reply(history):
    import claude_ai

    disabled = {tool["name"] for tool in claude_ai.TOOLS} - PUBLIC_TOOLS
    # Match the existing PWA surface nudge without modifying stored messages.
    messages = [dict(message) for message in history]
    if messages and messages[-1]["role"] == "user":
        messages[-1]["content"] += SITE_CONTEXT
    reply, _contact, _gift = claude_ai.get_ai_response(
        messages, user_id=None, mode="client", disabled_tools=disabled, max_tokens=600,
    )
    return reply


class GuestChat:
    def __init__(self, clock=time.monotonic, reply=maya_reply, limit=512):
        self.clock = clock
        self.reply = reply
        self.limit = limit
        self.sessions = {}
        self.calls = deque()
        self.active = 0

    async def send(self, body):
        if not isinstance(body, dict):
            raise GuestError("invalid_request", 400)
        if body.get("consent") is not True:
            raise GuestError("consent_required", 403)
        message = body.get("message")
        if not isinstance(message, str) or not 1 <= len(message.strip()) <= 2000:
            raise GuestError("invalid_message", 400)
        now = self.clock()
        self.sessions = {key: session for key, session in self.sessions.items()
                         if session.expires > now or session.busy}
        while self.calls and self.calls[0] <= now - 60:
            self.calls.popleft()
        if len(self.calls) >= 60 or self.active >= 4:
            raise GuestError("rate_limited", 429)
        token = body.get("guest_token") or ""
        if not isinstance(token, str) or len(token) > 100:
            raise GuestError("invalid_session", 400)
        if token and token not in self.sessions:
            # Never attach an unknown bearer token to a different conversation.
            raise GuestError("session_expired", 410)
        if not token:
            if len(self.sessions) >= self.limit:
                raise GuestError("capacity", 503)
            token = secrets.token_urlsafe(32)
            self.sessions[token] = Session(now + 1800)
        session = self.sessions[token]
        while session.calls and session.calls[0] <= now - 60:
            session.calls.popleft()
        if session.busy or len(session.calls) >= 6:
            raise GuestError("rate_limited", 429)
        self.calls.append(now)
        session.calls.append(now)
        safe = anonymizer.redact_pii(message.strip())
        if safe != message.strip():
            return {"ok": True, "reply": CONTACT_REPLY, "guest_token": token}

        # Ignore all supplied roles, IDs, history and tool arguments. The only
        # history used is this isolated, short-lived server-side conversation.
        history = session.history[-10:] + [{"role": "user", "content": safe}]
        session.busy = True
        self.active += 1
        task = asyncio.create_task(asyncio.to_thread(self.reply, history))

        def completed(future):
            session.busy = False
            self.active -= 1
            if future.cancelled():
                return
            try:
                text = future.result()
                if isinstance(text, str) and text.strip():
                    session.history = history + [{"role": "assistant", "content": text[:6000]}]
                    session.expires = self.clock() + 1800
            except Exception:
                pass  # Do not log chat text, tokens or provider error bodies.

        task.add_done_callback(completed)
        try:
            # Keep the capacity occupied until the worker really finishes,
            # including after a browser disconnect or a response timeout.
            text = await asyncio.wait_for(asyncio.shield(task), timeout=45)
        except Exception as exc:
            raise GuestError("chat_unavailable", 503) from exc
        if not isinstance(text, str) or not text.strip():
            raise GuestError("chat_unavailable", 503)
        return {"ok": True, "reply": text[:6000], "guest_token": token}


guest_chat = GuestChat()
