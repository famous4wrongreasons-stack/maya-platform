"""Publication mode inside the existing MAYA Telegram application, not a bot."""
from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ApplicationHandlerStop, TypeHandler

import database
import site_publications as posts

logger = logging.getLogger(__name__)

ERRORS = {
    "file_too_large": "Файл слишком большой. Отправьте фото или сжатое видео до 20 МБ.",
    "video_too_long": "Видео должно быть не длиннее 10 минут.",
    "too_many_media": "В одной публикации можно разместить до 10 фото и видео.",
    "text_too_long": "Текст превысил 50 000 знаков. Разделите его на две публикации.",
    "text_required": "Добавьте текст или подпись, прежде чем публиковать.",
    "missing_media": "Один из файлов недоступен. Отмените черновик и приложите его заново.",
    "not_draft": "Этот черновик уже закрыт. Начните новый командой /post.",
    "not_found": "Черновик не найден. Начните новый командой /post.",
}


def _buttons(draft_id):
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("Опубликовать на сайте", callback_data=f"sitepost:publish:{draft_id}")],
        [InlineKeyboardButton("Отменить черновик", callback_data=f"sitepost:cancel:{draft_id}")],
    ])


async def _preview(message, owner_id, draft):
    content = await asyncio.to_thread(posts.draft_content, owner_id, draft["id"])
    excerpt = content["text"][:1100]
    await message.reply_text(
        f"Черновик для ленты событий\n\n{excerpt or 'Текст пока не добавлен.'}"
        f"\n\nВложений: {len(content['media'])} из 10. Знаков: {len(content['text'])}."
        "\nМожно добавить ещё текст, фото или видео. Первая короткая строка станет заголовком."
        "\nКнопка ниже опубликует материал для всех посетителей сайта."
        " Добавляйте только материалы, на публикацию которых есть разрешение.",
        reply_markup=_buttons(draft["id"]),
        disable_web_page_preview=True,
    )


async def _download(message, context):
    if message.photo:
        attachment, kind = message.photo[-1], "image"
    elif message.video:
        attachment, kind = message.video, "video"
    elif message.document:
        attachment = message.document
        mime = attachment.mime_type or ""
        if mime in {"image/jpeg", "image/png", "image/webp"}:
            kind = "image"
        elif mime in {"video/mp4", "video/quicktime", "video/webm"}:
            kind = "video"
        else:
            raise ValueError("unsupported_media")
    else:
        return []
    if attachment.file_size and attachment.file_size > posts.MAX_DOWNLOAD:
        raise ValueError("file_too_large")
    remote = await context.bot.get_file(attachment.file_id)
    if not remote.file_size or remote.file_size > posts.MAX_DOWNLOAD:
        raise ValueError("file_too_large")
    with tempfile.TemporaryDirectory(prefix="maya-post-upload-") as directory:
        path = Path(directory) / "upload"
        await remote.download_to_drive(custom_path=path, read_timeout=120)
        return [await asyncio.to_thread(posts.prepare_media, path, kind)]


async def handle_update(update, context):
    """Consume only explicit owner publication sessions; other flows pass through."""
    query = update.callback_query
    message = update.effective_message
    user = update.effective_user
    chat = update.effective_chat
    if not message or not user or not chat:
        return
    data = str(query.data or "") if query else ""
    text = (message.text or "").strip() if not query else ""
    command = text.split(maxsplit=1)[0].split("@", 1)[0].lower() if text else ""
    requested = command in {"/post", "/publish"} or text.casefold() == "новый пост" or data.startswith("sitepost:")
    is_owner = chat.type == "private" and user.id == chat.id and await asyncio.to_thread(database.is_admin, user.id)
    if not is_owner:
        if requested:
            if query:
                await query.answer("Публикации доступны только администратору в личном чате.", show_alert=True)
            else:
                await message.reply_text("Публикации доступны только администратору в личном чате.")
            raise ApplicationHandlerStop
        return
    draft = await asyncio.to_thread(posts.active_draft, user.id)
    if not requested and not draft:
        return
    # Existing commands and booking callbacks remain available in publication mode.
    if query and not data.startswith("sitepost:"):
        return
    if command.startswith("/") and command not in {"/post", "/publish", "/cancel"}:
        return
    if message.contact or message.voice:
        return
    if update.edited_message:
        await message.reply_text("Редактирование сообщения не меняет черновик. Отмените его и отправьте исправленный текст заново.")
        raise ApplicationHandlerStop
    if query:
        await query.answer()
    try:
        if command == "/post" or text.casefold() == "новый пост" or data == "sitepost:new":
            draft = await asyncio.to_thread(posts.start_draft, user.id)
            await message.reply_text(
                "Новая публикация в ленту событий.\n\n"
                "Пришлите фото или видео с подписью, альбом или просто текст. "
                "Длинную статью можно отправить несколькими сообщениями. "
                "Первая короткая строка станет заголовком.\n\n"
                "Когда всё добавите, нажмите «Опубликовать на сайте». "
                "До этого материал виден только вам. /cancel — отмена.",
                reply_markup=_buttons(draft["id"]),
            )
        elif command == "/publish" or data.startswith("sitepost:publish:"):
            post_id = data.split(":")[-1] if query else draft["id"] if draft else ""
            slug = await asyncio.to_thread(posts.publish, user.id, post_id)
            if query:
                try:
                    await query.edit_message_reply_markup(reply_markup=None)
                except Exception:
                    pass  # An expired keyboard must not turn a committed post into a failure.
            await message.reply_text(
                "Опубликовано в ленте событий Мужской Эстетики.\n" + posts.post_url(slug),
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("Новый пост", callback_data="sitepost:new")]]),
                disable_web_page_preview=True,
            )
        elif command == "/cancel" or data.startswith("sitepost:cancel:"):
            post_id = data.split(":")[-1] if query else draft["id"]
            cancelled = await asyncio.to_thread(posts.cancel_draft, user.id, post_id)
            await message.reply_text("Черновик отменён. На сайте ничего не опубликовано." if cancelled else "Черновик уже закрыт.")
        elif draft and not query:
            if not (message.text or message.caption or message.photo or message.video or message.document):
                await message.reply_text("В режиме публикации принимаю текст, фото и видео. /cancel — выйти из режима.")
            else:
                source_id = f"{chat.id}:{message.message_id}"
                if not await asyncio.to_thread(posts.has_source, source_id):
                    content = await asyncio.to_thread(posts.draft_content, user.id, draft["id"])
                    if (message.photo or message.video or message.document) and len(content["media"]) >= posts.MAX_MEDIA:
                        raise ValueError("too_many_media")
                    media = await _download(message, context)
                    await asyncio.to_thread(posts.add_part, user.id, draft["id"], source_id,
                                            message.text or message.caption or "", media)
                    await _preview(message, user.id, draft)
    except ValueError as exc:
        await message.reply_text(ERRORS.get(str(exc), "Не удалось обработать файл. Пришлите фото или видео в формате MP4."))
    except Exception as exc:
        # Telegram exceptions can contain the bot token in a download URL.
        logger.warning("Publication operation failed: %s", type(exc).__name__)
        await message.reply_text("Не удалось завершить действие. Черновик сохранён; повторите отправку или публикацию.")
    raise ApplicationHandlerStop


def register_handlers(app):
    app.add_handler(TypeHandler(Update, handle_update), group=-2)
