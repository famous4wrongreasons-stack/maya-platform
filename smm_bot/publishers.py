import logging
import aiohttp
from aiogram import Bot
from aiogram.types import InputMediaPhoto, InputMediaVideo

import config

log = logging.getLogger(__name__)


def _post_for_platform(post: dict, platform: str) -> dict:
    """Если есть платформенные тексты, возвращает копию поста с нужным caption."""
    captions = post.get("captions")
    if not captions:
        return post
    new_post = dict(post)
    new_post["caption"] = captions.get(platform) or post.get("caption", "")
    return new_post


async def publish_to_all(bot: Bot, post: dict) -> list:
    """Публикует пост во все подключённые платформы. Возвращает список (платформа, успех, детали)."""
    results = []
    tasks = []

    if config.TG_CHANNEL_ID:
        tasks.append(("Telegram-канал", publish_telegram(bot, _post_for_platform(post, "tg"), config.TG_CHANNEL_ID)))

    if config.TG_GROUP_ID:
        tasks.append(("Telegram-группа", publish_telegram(bot, _post_for_platform(post, "tg"), config.TG_GROUP_ID)))

    if config.VK_TOKEN and config.VK_GROUP_ID:
        tasks.append(("ВКонтакте", publish_vk(bot, _post_for_platform(post, "vk"))))

    if getattr(config, "PUBLER_API_KEY", "") and getattr(config, "PUBLER_IG_ACCOUNT", ""):
        tasks.append(("Instagram", publish_publer(bot, _post_for_platform(post, "ig"), config.PUBLER_IG_ACCOUNT)))

    if getattr(config, "PUBLER_API_KEY", "") and getattr(config, "PUBLER_TIKTOK_ACCOUNT", ""):
        mt = post.get("media_type")
        if mt == "video":
            tasks.append(("TikTok", publish_publer(bot, _post_for_platform(post, "tiktok"), config.PUBLER_TIKTOK_ACCOUNT)))
        elif mt == "album" and any(f["media_type"] == "video" for f in post.get("files", [])):
            tasks.append(("TikTok", publish_publer(bot, _post_for_platform(post, "tiktok"), config.PUBLER_TIKTOK_ACCOUNT)))

    for platform, coro in tasks:
        try:
            detail = await coro
            results.append((platform, True, detail))
        except Exception as e:
            log.error(f"Ошибка публикации в {platform}: {e}")
            results.append((platform, False, str(e)))

    return results


# ── Telegram ──────────────────────────────────────────────────────────

async def publish_telegram(bot: Bot, post: dict, chat_id: str) -> str:
    caption = post.get("caption", "")
    if post["media_type"] == "album":
        media = []
        for i, f in enumerate(post["files"]):
            cap = caption if i == 0 else None
            if f["media_type"] == "photo":
                media.append(InputMediaPhoto(media=f["file_id"], caption=cap))
            else:
                media.append(InputMediaVideo(media=f["file_id"], caption=cap))
        await bot.send_media_group(chat_id=chat_id, media=media)
    elif post["media_type"] == "photo":
        await bot.send_photo(chat_id=chat_id, photo=post["file_id"], caption=caption)
    else:
        await bot.send_video(chat_id=chat_id, video=post["file_id"], caption=caption)
    return "опубликовано"


# ── ВКонтакте ────────────────────────────────────────────────────────

async def _vk_upload_one_photo(session, bot, file_id_tg):
    """Загружает одну фотку на стену VK и возвращает attachment строку."""
    file = await bot.get_file(file_id_tg)
    file_url = f"https://api.telegram.org/file/bot{config.BOT_TOKEN}/{file.file_path}"
    async with session.get(file_url) as r:
        file_bytes = await r.read()

    async with session.get(
        "https://api.vk.com/method/photos.getWallUploadServer",
        params={"access_token": config.VK_TOKEN, "group_id": config.VK_GROUP_ID, "v": "5.131"}
    ) as r:
        data = await r.json()
    if "error" in data:
        raise Exception(data["error"]["error_msg"])

    form = aiohttp.FormData()
    form.add_field("photo", file_bytes, filename="photo.jpg", content_type="image/jpeg")
    async with session.post(data["response"]["upload_url"], data=form) as r:
        up = await r.json()

    async with session.get(
        "https://api.vk.com/method/photos.saveWallPhoto",
        params={
            "access_token": config.VK_TOKEN,
            "group_id": config.VK_GROUP_ID,
            "v": "5.131",
            "server": up["server"], "photo": up["photo"], "hash": up["hash"],
        }
    ) as r:
        save = await r.json()
    if "error" in save:
        raise Exception(save["error"]["error_msg"])
    p = save["response"][0]
    return f"photo{p['owner_id']}_{p['id']}"


async def publish_vk(bot: Bot, post: dict) -> str:
    """Публикация в VK через пользовательский токен."""
    # Альбом — публикуем несколько фото в один пост
    if post["media_type"] == "album":
        async with aiohttp.ClientSession() as session:
            attachments = []
            for f in post["files"]:
                if f["media_type"] == "photo":
                    att = await _vk_upload_one_photo(session, bot, f["file_id"])
                    attachments.append(att)
            async with session.get(
                "https://api.vk.com/method/wall.post",
                params={
                    "access_token": config.VK_TOKEN,
                    "owner_id": f"-{config.VK_GROUP_ID}",
                    "message": post.get("caption", ""),
                    "attachments": ",".join(attachments),
                    "from_group": 1,
                    "v": "5.131"
                }
            ) as r:
                wd = await r.json()
            if "error" in wd:
                raise Exception(wd["error"]["error_msg"])
        return "опубликовано"

    file = await bot.get_file(post["file_id"])
    file_url = f"https://api.telegram.org/file/bot{config.BOT_TOKEN}/{file.file_path}"

    async with aiohttp.ClientSession() as session:
        # Скачиваем файл из Telegram
        async with session.get(file_url) as file_resp:
            file_bytes = await file_resp.read()

        if post["media_type"] == "photo":
            # Шаг 1: Получаем сервер загрузки фото на стену
            async with session.get(
                "https://api.vk.com/method/photos.getWallUploadServer",
                params={"access_token": config.VK_TOKEN, "group_id": config.VK_GROUP_ID, "v": "5.131"}
            ) as resp:
                data = await resp.json()

            if "error" in data:
                raise Exception(data["error"]["error_msg"])

            upload_url = data["response"]["upload_url"]

            # Шаг 2: Загружаем фото
            form = aiohttp.FormData()
            form.add_field("photo", file_bytes, filename="photo.jpg", content_type="image/jpeg")
            async with session.post(upload_url, data=form) as upload_resp:
                upload_data = await upload_resp.json()

            # Шаг 3: Сохраняем фото
            async with session.get(
                "https://api.vk.com/method/photos.saveWallPhoto",
                params={
                    "access_token": config.VK_TOKEN,
                    "group_id": config.VK_GROUP_ID,
                    "v": "5.131",
                    "server": upload_data["server"],
                    "photo": upload_data["photo"],
                    "hash": upload_data["hash"],
                }
            ) as save_resp:
                save_data = await save_resp.json()

            if "error" in save_data:
                raise Exception(save_data["error"]["error_msg"])

            photo = save_data["response"][0]
            attachment = f"photo{photo['owner_id']}_{photo['id']}"

        else:
            # Видео: получаем сервер загрузки
            async with session.get(
                "https://api.vk.com/method/video.save",
                params={
                    "access_token": config.VK_TOKEN,
                    "group_id": config.VK_GROUP_ID,
                    "name": post.get("caption", "")[:100],
                    "description": post.get("caption", ""),
                    "wallpost": 1,
                    "v": "5.131"
                }
            ) as resp:
                data = await resp.json()

            if "error" in data:
                raise Exception(data["error"]["error_msg"])

            upload_url = data["response"]["upload_url"]
            video_owner = data["response"]["owner_id"]
            video_id = data["response"]["video_id"]

            form = aiohttp.FormData()
            form.add_field("video_file", file_bytes, filename="video.mp4", content_type="video/mp4")
            async with session.post(upload_url, data=form) as upload_resp:
                await upload_resp.read()

            attachment = f"video{video_owner}_{video_id}"

        # Публикуем на стену группы
        async with session.get(
            "https://api.vk.com/method/wall.post",
            params={
                "access_token": config.VK_TOKEN,
                "owner_id": f"-{config.VK_GROUP_ID}",
                "message": post.get("caption", ""),
                "attachments": attachment,
                "from_group": 1,
                "v": "5.131"
            }
        ) as wall_resp:
            wall_data = await wall_resp.json()

        if "error" in wall_data:
            raise Exception(wall_data["error"]["error_msg"])

    return "опубликовано"


# ── Publer (Instagram + TikTok) ──────────────────────────────────────

async def _publer_upload_media(session, bot: Bot, file_id_tg: str, media_type: str) -> str:
    """Загружает медиа в Publer и возвращает media_id."""
    # Скачиваем из Telegram
    file = await bot.get_file(file_id_tg)
    tg_url = f"https://api.telegram.org/file/bot{config.BOT_TOKEN}/{file.file_path}"
    async with session.get(tg_url) as r:
        file_bytes = await r.read()

    filename = "media.mp4" if media_type == "video" else "media.jpg"
    content_type = "video/mp4" if media_type == "video" else "image/jpeg"

    form = aiohttp.FormData()
    form.add_field("file", file_bytes, filename=filename, content_type=content_type)

    headers = {
        "Authorization": f"Bearer-API {config.PUBLER_API_KEY}",
        "Publer-Workspace-Id": config.PUBLER_WORKSPACE_ID,
    }

    async with session.post(
        "https://app.publer.com/api/v1/media",
        headers=headers,
        data=form,
    ) as resp:
        data = await resp.json()
        if resp.status not in (200, 201):
            raise Exception(f"Publer media upload: {data}")
        return data["id"]


async def publish_publer(bot: Bot, post: dict, account_id: str) -> str:
    """Публикация через Publer API: загружаем медиа → создаём пост."""
    caption = post.get("caption", "")
    media_type = post["media_type"]

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=120)) as session:
        # Шаг 1: загружаем все медиа в Publer и получаем ID
        media_refs = []
        if media_type == "album":
            for f in post["files"]:
                mid = await _publer_upload_media(session, bot, f["file_id"], f["media_type"])
                publer_type = "image" if f["media_type"] == "photo" else "video"
                media_refs.append({"id": mid, "type": publer_type})
            post_type = "carousel" if len(media_refs) > 1 else ("photo" if media_refs[0]["type"] == "image" else "video")
        else:
            mid = await _publer_upload_media(session, bot, post["file_id"], media_type)
            publer_type = "image" if media_type == "photo" else "video"
            media_refs.append({"id": mid, "type": publer_type})
            post_type = "photo" if media_type == "photo" else "video"

        # Шаг 2: формируем тело запроса
        # Определяем платформу (instagram или tiktok)
        if account_id == getattr(config, "PUBLER_IG_ACCOUNT", ""):
            network_key = "instagram"
        elif account_id == getattr(config, "PUBLER_TIKTOK_ACCOUNT", ""):
            network_key = "tiktok"
        else:
            network_key = "instagram"  # дефолт

        body = {
            "bulk": {
                "state": "scheduled",
                "posts": [{
                    "networks": {
                        network_key: {
                            "type": post_type,
                            "text": caption,
                            "media": media_refs,
                        }
                    },
                    "accounts": [{
                        "id": account_id,
                        # scheduled_at не указываем — Publer опубликует сразу/в авто-режиме
                    }]
                }]
            }
        }

        headers = {
            "Authorization": f"Bearer-API {config.PUBLER_API_KEY}",
            "Publer-Workspace-Id": config.PUBLER_WORKSPACE_ID,
            "Content-Type": "application/json",
        }

        async with session.post(
            "https://app.publer.com/api/v1/posts/schedule/publish",
            headers=headers,
            json=body,
        ) as resp:
            data = await resp.json()
            if resp.status not in (200, 201):
                raise Exception(f"Publer publish: status={resp.status}, body={data}")

    return "отправлено через Publer"
