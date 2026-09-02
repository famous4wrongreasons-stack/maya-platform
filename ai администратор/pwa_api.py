"""Run the legacy-compatible PWA HTTP API without Telegram polling or jobs.

This is a temporary compatibility boundary while the production PWA moves to
the canonical MAYA OS API. The full legacy bot must remain disabled after the
Action Engine cutover; only request-driven HTTP handlers are started here.
"""

from __future__ import annotations

import asyncio
import logging
import signal

from telegram.ext import Application

import database
import webhook_server
from bot import TELEGRAM_TOKEN, _telegram_httpx_request


logger = logging.getLogger(__name__)


async def serve() -> None:
    database.init_db()
    app = (
        Application.builder()
        .token(TELEGRAM_TOKEN)
        .request(_telegram_httpx_request())
        .get_updates_request(_telegram_httpx_request(for_updates=True))
        .build()
    )
    if not webhook_server.install_staff_telegram_chat_mirror(app.bot):
        raise RuntimeError("Telegram executor initialization failed")
    await webhook_server.start_webhook_server(
        app,
        start_background_tasks=False,
    )

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except (NotImplementedError, RuntimeError, ValueError):
            pass

    logger.info("PWA compatibility API is ready; Telegram polling and jobs are disabled")
    try:
        await stop_event.wait()
    finally:
        runner = getattr(webhook_server, "_WEBHOOK_RUNNER", None)
        if runner is not None:
            await runner.cleanup()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )
    asyncio.run(serve())


if __name__ == "__main__":
    main()
