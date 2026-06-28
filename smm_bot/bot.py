import asyncio
import os
import logging
from datetime import datetime, timedelta
from aiogram import Bot, Dispatcher, F
from aiogram.types import (
    Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton,
    ContentType
)
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage

import config
from publishers import publish_to_all
from ai_caption import generate_instagram_caption, generate_platform_captions
import schedule_db
import publer_analytics
import settings
import holidays as holiday_module

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("/opt/smm_bot/smm.log"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

bot = Bot(token=config.BOT_TOKEN)
dp  = Dispatcher(storage=MemoryStorage())

pending_posts      = {}   # одобрение постов
bulk_buffers       = {}   # массовая загрузка по user_id
media_group_buffer = {}   # сборка альбомов по media_group_id


class PostState(StatesGroup):
    waiting_caption     = State()
    waiting_schedule    = State()
    bulk_collecting     = State()
    bulk_distribution   = State()
    bulk_manual_datetime = State()


def is_admin(user_id: int) -> bool:
    return user_id in config.ADMIN_IDS


def approval_keyboard(post_id: str, has_caption: bool = False) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(text="✅ Опубликовать сейчас", callback_data=f"approve:{post_id}"),
        ],
        [
            InlineKeyboardButton(text="📅 Запланировать", callback_data=f"schedule:{post_id}"),
            InlineKeyboardButton(text="❌ Отклонить",     callback_data=f"reject:{post_id}"),
        ],
        [
            InlineKeyboardButton(text="🤖 Сгенерировать текст AI", callback_data=f"generate:{post_id}"),
        ],
        [
            InlineKeyboardButton(text="✏️ Написать текст вручную", callback_data=f"edit:{post_id}"),
        ],
    ]
    if has_caption:
        rows.append([
            InlineKeyboardButton(text="📋 Скопировать текст для Instagram", callback_data=f"copy:{post_id}"),
        ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def platforms_status() -> str:
    parts = []
    if config.TG_CHANNEL_ID:
        parts.append("📢 Telegram-канал")
    if config.TG_GROUP_ID:
        parts.append("👥 Telegram-группа")
    if config.VK_TOKEN:
        parts.append("🔵 ВКонтакте")
    if getattr(config, "PUBLER_IG_ACCOUNT", ""):
        parts.append("📸 Instagram (Publer)")
    if getattr(config, "PUBLER_TIKTOK_ACCOUNT", ""):
        parts.append("🎵 TikTok (Publer, только видео)")
    return "\n".join(parts) if parts else "⚠️ Нет подключённых платформ"


def md_escape(value: str) -> str:
    """Минимальное экранирование для Telegram Markdown."""
    if not value:
        return ""
    return (
        value.replace("\\", "\\\\")
        .replace("`", "\\`")
        .replace("*", "\\*")
        .replace("_", "\\_")
        .replace("[", "\\[")
    )


def build_preview_text(post: dict) -> str:
    media_type = post["media_type"]
    if media_type == "album":
        n = len(post.get("files", []))
        media_icon = f"🖼 Альбом ({n} файлов)"
    elif media_type == "photo":
        media_icon = "🖼 Фото"
    else:
        media_icon = "🎥 Видео"
    caption = post.get("caption", "")
    caption_display = md_escape(caption) if caption else "_(без текста)_"
    return (
        f"📋 *Предпросмотр поста*\n\n"
        f"{media_icon}\n\n"
        f"*Текст:*\n{caption_display}\n\n"
        f"*Куда опубликовать:*\n{platforms_status()}"
    )


async def send_preview(target, post: dict, post_id: str, has_caption: bool):
    preview_text = build_preview_text(post)
    kwargs = dict(
        caption=preview_text,
        parse_mode="Markdown",
        reply_markup=approval_keyboard(post_id, has_caption)
    )
    media_type = post["media_type"]
    if media_type == "album":
        # Для альбома берём первое фото как обложку
        first = post["files"][0]
        if first["media_type"] == "photo":
            await target.answer_photo(photo=first["file_id"], **kwargs)
        else:
            await target.answer_video(video=first["file_id"], **kwargs)
    elif media_type == "photo":
        await target.answer_photo(photo=post["file_id"], **kwargs)
    else:
        await target.answer_video(video=post["file_id"], **kwargs)


# ── Команды ──────────────────────────────────────────────────────────

@dp.message(Command("start"))
async def cmd_start(message: Message):
    if not is_admin(message.from_user.id):
        return
    await message.answer(
        "👋 Привет! Я SMM-бот «Мужская Эстетика».\n\n"
        "*Контент:*\n"
        "📸 Отправь фото/видео — подготовлю пост с AI-текстом\n"
        "📦 `/bulk` — массовая загрузка с автораспределением\n"
        "📅 `/queue` — посмотреть запланированные посты\n\n"
        "*Аналитика и тренды:*\n"
        "⏰ `/best_time` — лучшее время для постов\n"
        "🏷 `/top_hashtags` — топ хэштеги по охвату\n"
        "🥊 `/competitor` — анализ конкурентов\n\n"
        "*Настройки:*\n"
        "🤖 `/model` — выбрать AI модель (Claude / GPT-4o)\n"
        "⚙️ `/features` — включить/выключить умные функции\n\n"
        f"*Подключённые платформы:*\n{platforms_status()}",
        parse_mode="Markdown"
    )


@dp.message(Command("model"))
async def cmd_model(message: Message):
    if not is_admin(message.from_user.id):
        return

    active = settings.get_active_model()
    rows = []
    for key, name in settings.AVAILABLE_MODELS.items():
        prefix = "✅ " if key == active else ""
        rows.append([InlineKeyboardButton(text=f"{prefix}{name}", callback_data=f"setmodel:{key}")])

    kb = InlineKeyboardMarkup(inline_keyboard=rows)
    await message.answer(
        f"🤖 *Модель AI для генерации текстов*\n\n"
        f"Сейчас активна: *{settings.AVAILABLE_MODELS.get(active, active)}*\n\n"
        "Выбери модель — она будет использоваться для всех следующих постов:",
        parse_mode="Markdown",
        reply_markup=kb,
    )


@dp.message(Command("features"))
async def cmd_features(message: Message):
    if not is_admin(message.from_user.id):
        return
    await _show_features_menu(message)


async def _show_features_menu(message_or_callback, edit: bool = False):
    features = settings.get_features()
    rows = []
    for key, name in settings.FEATURES_LIST:
        enabled = features.get(key, False)
        icon = "✅" if enabled else "⬜"
        rows.append([InlineKeyboardButton(
            text=f"{icon} {name}",
            callback_data=f"togglefeat:{key}"
        )])

    kb = InlineKeyboardMarkup(inline_keyboard=rows)
    text = (
        "⚙️ *Умные функции*\n\n"
        "Включай/выключай — изменения сразу:\n\n"
        "✅ — включено\n"
        "⬜ — выключено"
    )

    if edit:
        await message_or_callback.message.edit_text(text, parse_mode="Markdown", reply_markup=kb)
    else:
        await message_or_callback.answer(text, parse_mode="Markdown", reply_markup=kb)


@dp.callback_query(F.data.startswith("togglefeat:"))
async def callback_toggle_feature(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        return
    name = callback.data.split(":")[1]
    new_state = settings.toggle_feature(name)
    await _show_features_menu(callback, edit=True)
    await callback.answer(f"{'✅ Включено' if new_state else '⬜ Выключено'}")


@dp.callback_query(F.data.startswith("setmodel:"))
async def callback_set_model(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        return
    new_model = callback.data.split(":")[1]
    if new_model not in settings.AVAILABLE_MODELS:
        await callback.answer("Неизвестная модель", show_alert=True)
        return
    settings.set_active_model(new_model)
    await callback.message.edit_text(
        f"✅ Модель переключена на *{settings.AVAILABLE_MODELS[new_model]}*\n\n"
        "Следующий пост будет сгенерирован этой моделью.",
        parse_mode="Markdown",
    )
    await callback.answer("Готово!")


@dp.message(Command("best_time"))
async def cmd_best_time(message: Message):
    if not is_admin(message.from_user.id):
        return
    if not getattr(config, "PUBLER_IG_ACCOUNT", ""):
        await message.answer("❌ Publer не подключён")
        return

    msg = await message.answer("📊 Получаю данные из Publer...")
    times = await publer_analytics.get_best_times(config.PUBLER_IG_ACCOUNT, force_refresh=True)

    if not times:
        await msg.edit_text(
            "📊 *Лучшее время для публикаций*\n\n"
            "Данных пока нет. Publer накапливает статистику в течение 2-4 недель публикаций.\n\n"
            "Как только данные появятся — бот сам начнёт использовать их для умного планирования.",
            parse_mode="Markdown"
        )
        return

    text = (
        "📊 *Лучшее время для публикации в Instagram*\n\n"
        f"{publer_analytics.format_best_time_slots(times, top_n=10)}\n\n"
        "_Бот автоматически предлагает эти слоты при планировании._"
    )
    await msg.edit_text(text, parse_mode="Markdown")


@dp.message(Command("top_hashtags"))
async def cmd_top_hashtags(message: Message):
    if not is_admin(message.from_user.id):
        return
    if not getattr(config, "PUBLER_IG_ACCOUNT", ""):
        await message.answer("❌ Publer не подключён")
        return

    msg = await message.answer("📊 Получаю данные из Publer...")
    records = await publer_analytics.get_top_hashtags(config.PUBLER_IG_ACCOUNT, force_refresh=True)

    if not records:
        await msg.edit_text(
            "📊 *Топ хэштеги*\n\n"
            "Данных пока нет. Publer накапливает статистику после нескольких недель публикаций.\n\n"
            "Как только появятся — бот сам подставит их в AI-сгенерированные посты вместо статических.",
            parse_mode="Markdown"
        )
        return

    text = "📊 *Топ хэштеги по охвату (Instagram)*\n\n"
    for h in records[:15]:
        name = h.get("name") or h.get("hashtag", "?")
        reach = h.get("reach", 0)
        posts = h.get("posts", 0)
        text += f"• `#{name}` — охват {reach}, постов {posts}\n"
    text += "\n_Бот автоматически использует эти хэштеги в AI-постах._"
    await msg.edit_text(text, parse_mode="Markdown")


@dp.message(Command("competitor"))
async def cmd_competitor(message: Message):
    if not is_admin(message.from_user.id):
        return
    if not getattr(config, "PUBLER_API_KEY", ""):
        await message.answer("❌ Publer не подключён")
        return

    msg = await message.answer("📊 Получаю данные из Publer...")
    competitors = await publer_analytics.get_competitor_analysis(force_refresh=True)

    if not competitors:
        await msg.edit_text(
            "📊 *Анализ конкурентов*\n\n"
            "Конкуренты не настроены в Publer. Открой Publer Dashboard → Analytics → Competitors → добавь страницы конкурентов вручную.\n\n"
            "После этого бот будет показывать их статистику здесь.",
            parse_mode="Markdown"
        )
        return

    text = "📊 *Анализ конкурентов*\n\n"
    for c in competitors[:10]:
        name = c.get("name") or c.get("username", "?")
        followers = c.get("followers", 0)
        engagement = c.get("engagement_rate", 0)
        text += f"• *{name}* — подписчиков {followers}, engagement {engagement}%\n"
    await msg.edit_text(text, parse_mode="Markdown")


@dp.message(Command("queue"))
async def cmd_queue(message: Message):
    if not is_admin(message.from_user.id):
        return
    rows = schedule_db.get_pending_queue()
    if not rows:
        await message.answer("📭 Очередь пуста.")
        return

    text = f"📅 *Запланировано постов: {len(rows)}*\n\n"
    for post_id, media_type, caption, scheduled_at in rows[:30]:
        icon = "🖼" if media_type == "photo" else "🎥"
        when = schedule_db.format_datetime(scheduled_at)
        preview = md_escape((caption or "_(без текста)_")[:60])
        text += f"`#{post_id}` {icon} {when} — {preview}\n"

    text += "\nОтменить пост: `/cancel <номер>`"
    await message.answer(text, parse_mode="Markdown")


@dp.message(Command("cancel"))
async def cmd_cancel(message: Message):
    if not is_admin(message.from_user.id):
        return
    try:
        post_id = int(message.text.split()[1])
    except (IndexError, ValueError):
        await message.answer("Используй: `/cancel <номер>`", parse_mode="Markdown")
        return

    if schedule_db.cancel(post_id):
        await message.answer(f"✅ Пост #{post_id} отменён.")
    else:
        await message.answer(f"❌ Пост #{post_id} не найден или уже опубликован.")


# ── Массовая загрузка ────────────────────────────────────────────────

@dp.message(Command("bulk"))
async def cmd_bulk(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return
    bulk_buffers[message.from_user.id] = []
    await state.set_state(PostState.bulk_collecting)
    await message.answer(
        "📦 *Массовая загрузка*\n\n"
        "Присылай фото и видео одно за другим. Под каждым можешь написать подпись или оставить пустым — потом сгенерим через AI.\n\n"
        "Когда закончишь — отправь `/done`",
        parse_mode="Markdown"
    )


@dp.message(PostState.bulk_collecting, F.content_type.in_({ContentType.PHOTO, ContentType.VIDEO}))
async def bulk_collect(message: Message):
    if not is_admin(message.from_user.id):
        return
    media_type = "photo" if message.photo else "video"
    file_id = message.photo[-1].file_id if message.photo else message.video.file_id
    bulk_buffers[message.from_user.id].append({
        "file_id":    file_id,
        "media_type": media_type,
        "caption":    message.caption or "",
    })
    count = len(bulk_buffers[message.from_user.id])
    await message.answer(f"✅ Добавлено ({count}). Жду следующее или `/done`.")


@dp.message(Command("done"), PostState.bulk_collecting)
async def cmd_done_bulk(message: Message, state: FSMContext):
    items = bulk_buffers.get(message.from_user.id, [])
    if not items:
        await message.answer("Пусто. Сначала пришли хотя бы один файл.")
        return
    await state.set_state(PostState.bulk_distribution)
    await message.answer(
        f"📦 Загружено: *{len(items)}* файлов.\n\n"
        "*Варианты распределения:*\n\n"
        "✨ *УМНО (рекомендую)*\n"
        "`умно` — бот сам рассчитает по лимитам Instagram, "
        "использует best times из Publer, чередует фото и видео\n\n"
        "🤖 *АВТО ЗА ПЕРИОД*\n"
        "`за неделю` `за 2 недели` `за месяц`\n"
        "`за месяц 18:00`\n"
        "`за месяц 12:00 и 19:00`\n\n"
        "🎯 *ВРУЧНУЮ КАЖДОМУ*\n"
        "`вручную`\n\n"
        "🔁 *РЕГУЛЯРНО*\n"
        "`25.05 18:00 каждый день`\n"
        "`25.05 18:00 через день`\n"
        "`01.06 12:00 раз в 3 дня`",
        parse_mode="Markdown"
    )


import re
from datetime import time as dtime

PERIOD_DAYS = {
    "за неделю":   7,
    "за 1 неделю": 7,
    "за 2 недели": 14,
    "за две недели": 14,
    "за 3 недели": 21,
    "за месяц":    30,
    "за 1 месяц":  30,
    "за 2 месяца": 60,
}


def parse_times_from_text(text: str) -> list:
    """Извлекает все времена в формате HH:MM из текста."""
    matches = re.findall(r"\b(\d{1,2}):(\d{2})\b", text)
    times = []
    for h, m in matches:
        h, m = int(h), int(m)
        if 0 <= h <= 23 and 0 <= m <= 59:
            times.append(dtime(h, m))
    return times if times else [dtime(18, 0)]  # дефолт 18:00


@dp.message(PostState.bulk_distribution)
async def bulk_distribute(message: Message, state: FSMContext):
    items = bulk_buffers.get(message.from_user.id, [])
    if not items:
        await state.clear()
        await message.answer("Пусто. Начни сначала с /bulk")
        return

    text = message.text.lower().strip()

    # ── Режим 0: УМНО (по лимитам соцсетей) ──────────────────────────
    if text.startswith("умно"):
        if not settings.is_feature_enabled("smart_distribution"):
            await message.answer("⚠️ Умное распределение выключено. Включи через /features")
            return
        await _smart_distribute(message, state, items)
        return

    # ── Режим 1: ВРУЧНУЮ ─────────────────────────────────────────────
    if text == "вручную":
        await state.update_data(manual_index=0)
        await state.set_state(PostState.bulk_manual_datetime)
        await message.answer(
            f"🎯 *Ручное распределение*\n\n"
            f"Покажу каждый файл по очереди — введи дату и время для каждого.\n\n"
            f"Команды:\n"
            f"`/skip` — пропустить файл\n"
            f"`/stop` — закончить и сохранить что есть",
            parse_mode="Markdown"
        )
        await _send_manual_item(message, state)
        return

    # ── Режим 2: АВТО ЗА ПЕРИОД ──────────────────────────────────────
    period_days = None
    for phrase, days in PERIOD_DAYS.items():
        if phrase in text:
            period_days = days
            break

    if period_days:
        times_of_day = parse_times_from_text(text)
        await _distribute_over_period(message, state, items, period_days, times_of_day)
        return

    # ── Режим 3: РЕГУЛЯРНО (старый формат) ───────────────────────────
    parts = text.split()
    start_dt = None
    if len(parts) >= 2:
        start_dt = schedule_db.parse_datetime(" ".join(parts[:2]))

    if not start_dt:
        await message.answer(
            "❌ Не понял. Используй один из вариантов:\n\n"
            "🤖 `за месяц`, `за неделю`, `за 2 недели`\n"
            "🎯 `вручную`\n"
            "🔁 `25.05 18:00 каждый день`",
            parse_mode="Markdown"
        )
        return

    rest = " ".join(parts[2:])
    if "каждый день" in rest or "ежедневно" in rest:
        interval = timedelta(days=1)
    elif "через день" in rest or "раз в 2" in rest:
        interval = timedelta(days=2)
    elif "раз в 3" in rest:
        interval = timedelta(days=3)
    elif "раз в 4" in rest:
        interval = timedelta(days=4)
    elif "2 раза в день" in rest or "два раза" in rest:
        interval = timedelta(hours=10)
    else:
        await message.answer(
            "❌ Не понял частоту. Используй: `каждый день`, `через день`, `раз в 3 дня`, `2 раза в день`",
            parse_mode="Markdown"
        )
        return

    scheduled_count = 0
    current = start_dt
    for item in items:
        schedule_db.add_post(
            file_id=item["file_id"],
            media_type=item["media_type"],
            caption=item["caption"],
            scheduled_at=current
        )
        scheduled_count += 1
        current += interval

    bulk_buffers.pop(message.from_user.id, None)
    await state.clear()

    last_dt = current - interval
    await message.answer(
        f"✅ Запланировано *{scheduled_count}* постов!\n\n"
        f"📅 Первый: {start_dt.strftime('%d.%m %H:%M')}\n"
        f"📅 Последний: {last_dt.strftime('%d.%m %H:%M')}\n\n"
        "Посмотреть очередь: /queue",
        parse_mode="Markdown"
    )


async def _distribute_over_period(message, state, items, period_days, times_of_day):
    """Раскидывает N постов равномерно за period_days, используя times_of_day слотов в день."""
    total = len(items)
    slots_per_day = len(times_of_day)
    total_slots = period_days * slots_per_day

    # Если файлов больше чем слотов — увеличим частоту
    if total > total_slots:
        # Несколько постов в один слот не делаем — увеличим количество дней
        period_days = (total + slots_per_day - 1) // slots_per_day

    # Сгенерируем все слоты
    now = datetime.now()
    start_date = now.date() + timedelta(days=1)  # начинаем с завтра
    all_slots = []
    for day_offset in range(period_days):
        for t in sorted(times_of_day, key=lambda x: (x.hour, x.minute)):
            slot_dt = datetime.combine(start_date + timedelta(days=day_offset), t)
            all_slots.append(slot_dt)

    # Берём первые `total` слотов
    chosen_slots = all_slots[:total]

    # Запланируем
    for item, slot_dt in zip(items, chosen_slots):
        schedule_db.add_post(
            file_id=item["file_id"],
            media_type=item["media_type"],
            caption=item["caption"],
            scheduled_at=slot_dt
        )

    bulk_buffers.pop(message.from_user.id, None)
    await state.clear()

    times_str = ", ".join(t.strftime("%H:%M") for t in times_of_day)
    await message.answer(
        f"✅ Запланировано *{len(chosen_slots)}* постов!\n\n"
        f"📅 Период: {chosen_slots[0].strftime('%d.%m')} — {chosen_slots[-1].strftime('%d.%m')}\n"
        f"⏰ Время публикаций: {times_str}\n"
        f"📊 Постов в день: {slots_per_day}\n\n"
        "Посмотреть очередь: /queue",
        parse_mode="Markdown"
    )


async def _smart_distribute(message, state, items):
    """Умное распределение по безопасным лимитам соцсетей + best times."""
    total = len(items)

    # Разделяем на видео и фото
    videos = [i for i in items if i["media_type"] == "video"]
    photos = [i for i in items if i["media_type"] == "photo"]

    # Безопасные лимиты:
    # - Instagram: max 3 поста в день (фото или видео)
    # - TikTok: max 2 видео в день
    # - Telegram/VK: безлимит, но не больше 4 в день для эстетики
    MAX_POSTS_PER_DAY = 3
    MAX_VIDEOS_PER_DAY = 2

    # Если видео много — растягиваем по 2/день
    days_needed_videos = (len(videos) + MAX_VIDEOS_PER_DAY - 1) // MAX_VIDEOS_PER_DAY
    days_needed_total = (total + MAX_POSTS_PER_DAY - 1) // MAX_POSTS_PER_DAY
    days = max(days_needed_videos, days_needed_total)

    # Время постов — берём из Publer best_times если есть
    times_of_day = []
    if getattr(config, "PUBLER_IG_ACCOUNT", ""):
        try:
            bt = await publer_analytics.get_best_times(config.PUBLER_IG_ACCOUNT)
            for slot in sorted(bt, key=lambda x: x.get("score", 0), reverse=True)[:MAX_POSTS_PER_DAY]:
                hour = slot.get("hour", 18)
                times_of_day.append(dtime(hour, 0))
        except Exception as e:
            log.error(f"smart distribute best_times error: {e}")

    # Фолбэк — стандартные слоты с разносом
    if not times_of_day:
        if MAX_POSTS_PER_DAY == 1:
            times_of_day = [dtime(18, 0)]
        elif MAX_POSTS_PER_DAY == 2:
            times_of_day = [dtime(12, 0), dtime(19, 0)]
        else:
            times_of_day = [dtime(10, 0), dtime(14, 0), dtime(19, 0)]

    # Чередуем категории: видео-фото-видео-фото
    interleaved = []
    vi, pi = 0, 0
    while vi < len(videos) or pi < len(photos):
        if vi < len(videos):
            interleaved.append(videos[vi]); vi += 1
        if pi < len(photos):
            interleaved.append(photos[pi]); pi += 1

    # Генерируем слоты
    start_date = datetime.now().date() + timedelta(days=1)
    all_slots = []
    for day_offset in range(days):
        for t in sorted(times_of_day, key=lambda x: (x.hour, x.minute)):
            all_slots.append(datetime.combine(start_date + timedelta(days=day_offset), t))
            if len(all_slots) >= total:
                break
        if len(all_slots) >= total:
            break

    chosen = all_slots[:total]
    for item, slot_dt in zip(interleaved, chosen):
        schedule_db.add_post(
            file_id=item["file_id"],
            media_type=item["media_type"],
            caption=item["caption"],
            scheduled_at=slot_dt
        )

    bulk_buffers.pop(message.from_user.id, None)
    await state.clear()

    times_str = ", ".join(t.strftime("%H:%M") for t in times_of_day)
    source = "лучшее время аудитории (Publer)" if getattr(config, "PUBLER_IG_ACCOUNT", "") and times_of_day else "стандартные слоты"
    await message.answer(
        f"🤖 *Умное распределение готово*\n\n"
        f"📦 Постов: {total} (видео: {len(videos)}, фото: {len(photos)})\n"
        f"📅 Период: {chosen[0].strftime('%d.%m')} — {chosen[-1].strftime('%d.%m')} ({days} дней)\n"
        f"⏰ Время: {times_str}\n"
        f"🎯 По расчёту из: {source}\n"
        f"📊 Чередование: видео-фото для разнообразия\n\n"
        f"Лимиты учтены: max {MAX_VIDEOS_PER_DAY} видео/день, max {MAX_POSTS_PER_DAY} постов/день — безопасно для Instagram алгоритма.\n\n"
        "Очередь: /queue",
        parse_mode="Markdown"
    )


async def _send_manual_item(message, state):
    """Показывает текущий файл в ручном режиме и просит дату."""
    data = await state.get_data()
    idx = data.get("manual_index", 0)
    items = bulk_buffers.get(message.from_user.id, [])

    if idx >= len(items):
        bulk_buffers.pop(message.from_user.id, None)
        scheduled = data.get("manual_scheduled", 0)
        await state.clear()
        await message.answer(
            f"✅ Готово! Запланировано *{scheduled}* постов.\n\n"
            "Посмотреть очередь: /queue",
            parse_mode="Markdown"
        )
        return

    item = items[idx]
    media_icon = "🖼" if item["media_type"] == "photo" else "🎥"
    caption_preview = (item.get("caption") or "_(без подписи)_")[:80]
    cap_text = (
        f"{media_icon} *Файл {idx + 1} из {len(items)}*\n\n"
        f"Подпись: {caption_preview}\n\n"
        f"📅 Введи дату и время публикации:\n"
        f"`25.05 18:00`, `завтра 19:00`, `сегодня 21:00`"
    )

    if item["media_type"] == "photo":
        await message.answer_photo(item["file_id"], caption=cap_text, parse_mode="Markdown")
    else:
        await message.answer_video(item["file_id"], caption=cap_text, parse_mode="Markdown")


@dp.message(Command("skip"), PostState.bulk_manual_datetime)
async def manual_skip(message: Message, state: FSMContext):
    data = await state.get_data()
    await state.update_data(manual_index=data.get("manual_index", 0) + 1)
    await _send_manual_item(message, state)


@dp.message(Command("stop"), PostState.bulk_manual_datetime)
async def manual_stop(message: Message, state: FSMContext):
    data = await state.get_data()
    scheduled = data.get("manual_scheduled", 0)
    bulk_buffers.pop(message.from_user.id, None)
    await state.clear()
    await message.answer(f"⏹ Остановлено. Запланировано *{scheduled}* постов.\n\nОчередь: /queue", parse_mode="Markdown")


@dp.message(PostState.bulk_manual_datetime)
async def manual_datetime(message: Message, state: FSMContext):
    dt = schedule_db.parse_datetime(message.text)
    if not dt:
        await message.answer("❌ Не понял формат. Пример: `25.05 18:00`", parse_mode="Markdown")
        return
    if dt < datetime.now():
        await message.answer("❌ Дата в прошлом. Введи будущую.")
        return

    data = await state.get_data()
    idx = data.get("manual_index", 0)
    scheduled = data.get("manual_scheduled", 0)
    items = bulk_buffers.get(message.from_user.id, [])

    if idx >= len(items):
        await state.clear()
        return

    item = items[idx]
    db_id = schedule_db.add_post(
        file_id=item["file_id"],
        media_type=item["media_type"],
        caption=item["caption"],
        scheduled_at=dt
    )
    await message.answer(f"✅ Пост #{db_id} запланирован на *{dt.strftime('%d.%m %H:%M')}*", parse_mode="Markdown")

    await state.update_data(manual_index=idx + 1, manual_scheduled=scheduled + 1)
    await _send_manual_item(message, state)


# ── Приём контента ────────────────────────────────────────────────────

async def finalize_album(group_id: str, message: Message):
    """Через паузу собирает все фото альбома в один пост."""
    await asyncio.sleep(1.5)
    group = media_group_buffer.pop(group_id, None)
    if not group:
        return

    post_id = f"{message.from_user.id}_{int(datetime.now().timestamp() * 1000)}"
    pending_posts[post_id] = {
        "media_type": "album",
        "files":      group["files"],
        "caption":    group["caption"],
        "from_user":  message.from_user.id,
        "created_at": datetime.now().isoformat(),
    }
    await send_preview(message, pending_posts[post_id], post_id, has_caption=bool(group["caption"]))


@dp.message(F.content_type.in_({ContentType.PHOTO, ContentType.VIDEO}))
async def receive_media(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return

    current_state = await state.get_state()
    if current_state == PostState.bulk_collecting:
        return

    caption = message.caption or ""
    if message.photo:
        media_type = "photo"
        file_id = message.photo[-1].file_id
    else:
        media_type = "video"
        file_id = message.video.file_id

    # Альбом — собираем по media_group_id
    group_id = message.media_group_id
    if group_id:
        if group_id not in media_group_buffer:
            media_group_buffer[group_id] = {"files": [], "caption": "", "task": None}
        media_group_buffer[group_id]["files"].append({
            "file_id": file_id,
            "media_type": media_type,
        })
        if caption:
            media_group_buffer[group_id]["caption"] = caption
        # Перезапускаем таймер сбора
        if media_group_buffer[group_id]["task"]:
            media_group_buffer[group_id]["task"].cancel()
        media_group_buffer[group_id]["task"] = asyncio.create_task(
            finalize_album(group_id, message)
        )
        return

    # Одиночный файл — как раньше, но post_id с миллисекундами
    post_id = f"{message.from_user.id}_{int(datetime.now().timestamp() * 1000)}"
    pending_posts[post_id] = {
        "media_type": media_type,
        "file_id":    file_id,
        "caption":    caption,
        "from_user":  message.from_user.id,
        "created_at": datetime.now().isoformat(),
    }
    await send_preview(message, pending_posts[post_id], post_id, has_caption=bool(caption))


# ── AI генерация ──────────────────────────────────────────────────────

@dp.callback_query(F.data.startswith("generate:"))
async def generate_caption(callback: CallbackQuery):
    post_id = callback.data.split(":")[1]
    post = pending_posts.get(post_id)
    if not post:
        await callback.answer("Пост не найден", show_alert=True)
        return

    await callback.answer("Анализирую...")
    thinking_msg = await callback.message.answer("🤖 Анализирую фото и генерирую текст...")

    if post["media_type"] == "album":
        first = post["files"][0]
        target_file_id = first["file_id"]
        target_type    = first["media_type"]
    else:
        target_file_id = post["file_id"]
        target_type    = post["media_type"]

    # Если включена фича разных текстов для платформ
    if settings.is_feature_enabled("platform_specific_captions"):
        captions = await generate_platform_captions(bot, target_file_id, target_type)
        if captions:
            pending_posts[post_id]["captions"] = captions
            pending_posts[post_id]["caption"] = captions.get("ig", "")
        else:
            generated = await generate_instagram_caption(bot, target_file_id, target_type)
            pending_posts[post_id]["caption"] = generated
    else:
        generated = await generate_instagram_caption(bot, target_file_id, target_type)
        pending_posts[post_id]["caption"] = generated

    await thinking_msg.delete()
    await send_preview(callback.message, pending_posts[post_id], post_id, has_caption=True)


# ── Копирование ───────────────────────────────────────────────────────

@dp.callback_query(F.data.startswith("copy:"))
async def copy_caption(callback: CallbackQuery):
    post_id = callback.data.split(":")[1]
    post = pending_posts.get(post_id)
    if not post or not post.get("caption"):
        await callback.answer("Текст не найден", show_alert=True)
        return
    await callback.message.answer(
        "📋 Текст для Instagram — нажми и удержи чтобы скопировать:\n\n"
        f"{post['caption']}"
    )
    await callback.answer("Текст отправлен ↑")


# ── Планирование одного поста ─────────────────────────────────────────

@dp.callback_query(F.data.startswith("schedule:"))
async def schedule_post(callback: CallbackQuery, state: FSMContext):
    post_id = callback.data.split(":")[1]
    if post_id not in pending_posts:
        await callback.answer("Пост не найден", show_alert=True)
        return
    await state.update_data(scheduling_post_id=post_id)
    await state.set_state(PostState.waiting_schedule)

    # Если есть аналитика лучшего времени — показываем подсказку
    suggestion = ""
    if getattr(config, "PUBLER_IG_ACCOUNT", ""):
        times = await publer_analytics.get_best_times(config.PUBLER_IG_ACCOUNT)
        if times:
            next_slot = publer_analytics.get_next_best_slot(times, datetime.now())
            if next_slot:
                suggestion = (
                    f"\n\n💡 *Рекомендую:* {next_slot.strftime('%d.%m %H:%M')} "
                    "— это лучшее время для твоей аудитории по статистике."
                )

    await callback.message.answer(
        "📅 *Когда опубликовать?*\n\n"
        "Напиши дату и время. Примеры:\n"
        "`25.05 18:00`\n"
        "`завтра 19:30`\n"
        "`сегодня 21:00`\n"
        "`01.06.2026 12:00`"
        + suggestion,
        parse_mode="Markdown"
    )
    await callback.answer()


@dp.message(PostState.waiting_schedule)
async def receive_schedule(message: Message, state: FSMContext):
    data = await state.get_data()
    post_id = data.get("scheduling_post_id")
    post = pending_posts.get(post_id)
    if not post:
        await state.clear()
        return

    dt = schedule_db.parse_datetime(message.text)
    if not dt:
        await message.answer("❌ Не понял формат. Пример: `25.05 18:00`", parse_mode="Markdown")
        return
    if dt < datetime.now():
        await message.answer("❌ Дата в прошлом. Введи будущую.")
        return

    db_id = schedule_db.add_post_payload(post, dt)
    del pending_posts[post_id]
    await state.clear()

    await message.answer(
        f"✅ Пост #{db_id} запланирован на *{dt.strftime('%d.%m.%Y %H:%M')}*\n\n"
        "Очередь: /queue",
        parse_mode="Markdown"
    )


# ── Публикация сейчас ─────────────────────────────────────────────────

@dp.callback_query(F.data.startswith("approve:"))
async def approve_post(callback: CallbackQuery):
    post_id = callback.data.split(":")[1]
    post = pending_posts.get(post_id)
    if not post:
        await callback.answer("Пост не найден", show_alert=True)
        return

    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.answer("Публикую...")
    status_msg = await callback.message.answer("⏳ Публикую во все платформы...")
    results = await publish_to_all(bot, post)

    report_lines = ["✅ *Публикация завершена*\n"]
    for platform, ok, detail in results:
        icon = "✅" if ok else "❌"
        report_lines.append(f"{icon} {platform}: {detail}")
    await status_msg.edit_text("\n".join(report_lines), parse_mode="Markdown")
    del pending_posts[post_id]


@dp.callback_query(F.data.startswith("reject:"))
async def reject_post(callback: CallbackQuery):
    post_id = callback.data.split(":")[1]
    if post_id in pending_posts:
        del pending_posts[post_id]
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.message.answer("❌ Пост отклонён.")
    await callback.answer()


@dp.callback_query(F.data.startswith("edit:"))
async def edit_post(callback: CallbackQuery, state: FSMContext):
    post_id = callback.data.split(":")[1]
    if post_id not in pending_posts:
        await callback.answer("Пост не найден", show_alert=True)
        return
    await state.update_data(editing_post_id=post_id)
    await state.set_state(PostState.waiting_caption)
    await callback.message.answer("✏️ Введи новый текст для поста:")
    await callback.answer()


@dp.message(PostState.waiting_caption)
async def receive_new_caption(message: Message, state: FSMContext):
    data = await state.get_data()
    post_id = data.get("editing_post_id")
    if post_id and post_id in pending_posts:
        pending_posts[post_id]["caption"] = message.text
        await state.clear()
        await send_preview(message, pending_posts[post_id], post_id, has_caption=True)


# ── Фоновый планировщик ──────────────────────────────────────────────

async def scheduler_loop():
    log.info("Scheduler loop запущен")
    while True:
        try:
            due = schedule_db.get_due_post_dicts()
            for post_id, post in due:
                log.info(f"Публикую запланированный пост #{post_id}")
                media_type = post.get("media_type", "photo")
                caption = post.get("caption", "")

                if media_type == "album":
                    first = post.get("files", [{}])[0]
                    target_file_id = first.get("file_id", "")
                    target_type = first.get("media_type", "photo")
                else:
                    target_file_id = post.get("file_id", "")
                    target_type = media_type

                # Если текста нет — генерируем через AI
                if not caption or not caption.strip():
                    log.info(f"Пост #{post_id} без текста, генерирую AI...")
                    try:
                        if settings.is_feature_enabled("platform_specific_captions"):
                            captions = await generate_platform_captions(bot, target_file_id, target_type)
                            if captions:
                                post["captions"] = captions
                                caption = captions.get("ig", "")
                            else:
                                caption = await generate_instagram_caption(bot, target_file_id, target_type)
                        else:
                            caption = await generate_instagram_caption(bot, target_file_id, target_type)
                        post["caption"] = caption or ""
                        log.info(f"Текст сгенерирован для поста #{post_id}")
                    except Exception as ex:
                        log.error(f"Ошибка генерации текста для #{post_id}: {ex}")
                        caption = ""

                try:
                    results = await publish_to_all(bot, post)
                    success = all(ok for _, ok, _ in results) if results else False
                    schedule_db.mark_done(post_id, success=success)

                    for admin_id in config.ADMIN_IDS:
                        try:
                            lines = [f"📅 *Опубликован запланированный пост #{post_id}*\n"]
                            for platform, ok, detail in results:
                                icon = "✅" if ok else "❌"
                                lines.append(f"{icon} {platform}: {detail}")
                            await bot.send_message(admin_id, "\n".join(lines), parse_mode="Markdown")
                        except Exception as ex:
                            log.error(f"Не отправил уведомление {admin_id}: {ex}")
                except Exception as ex:
                    log.error(f"Ошибка публикации поста {post_id}: {ex}")
                    schedule_db.mark_done(post_id, success=False, error=str(ex))
        except Exception as ex:
            log.error(f"Scheduler loop error: {ex}")
        await asyncio.sleep(30)


# ── Фоновые проверки очереди и праздников ───────────────────────────

async def queue_health_loop():
    """Раз в 6 часов проверяет здоровье очереди."""
    log.info("Queue health loop запущен")
    await asyncio.sleep(60)  # стартовая задержка
    while True:
        try:
            if settings.is_feature_enabled("queue_health_alerts"):
                queue = schedule_db.get_pending_queue()
                last_alert = settings.get_meta("last_queue_alert", "")
                today = datetime.now().strftime("%Y-%m-%d")

                if not queue:
                    if last_alert != today:
                        for admin_id in config.ADMIN_IDS:
                            try:
                                await bot.send_message(
                                    admin_id,
                                    "🚨 *Очередь публикаций ПУСТАЯ*\n\n"
                                    "Загрузи новые посты через `/bulk`",
                                    parse_mode="Markdown"
                                )
                            except Exception as e:
                                log.error(f"queue alert error: {e}")
                        settings.set_meta("last_queue_alert", today)
                else:
                    last_post = queue[-1]
                    last_dt = datetime.fromisoformat(last_post[3])
                    days_left = (last_dt - datetime.now()).days

                    if days_left < 7 and last_alert != today:
                        for admin_id in config.ADMIN_IDS:
                            try:
                                await bot.send_message(
                                    admin_id,
                                    f"⚠️ *Очередь заканчивается*\n\n"
                                    f"Осталось *{days_left} дней* контента.\n"
                                    f"В очереди: {len(queue)} постов\n"
                                    f"Последний: {last_dt.strftime('%d.%m %H:%M')}\n\n"
                                    f"Загрузи новые через `/bulk`",
                                    parse_mode="Markdown"
                                )
                            except Exception as e:
                                log.error(f"queue alert error: {e}")
                        settings.set_meta("last_queue_alert", today)
        except Exception as e:
            log.error(f"queue_health_loop error: {e}")
        await asyncio.sleep(6 * 3600)


async def holiday_loop():
    """Раз в день в 9:00 проверяет ближайшие праздники."""
    log.info("Holiday loop запущен")
    while True:
        try:
            now = datetime.now()
            target = now.replace(hour=9, minute=0, second=0, microsecond=0)
            if target <= now:
                target += timedelta(days=1)
            wait_sec = (target - now).total_seconds()
            await asyncio.sleep(wait_sec)

            if not settings.is_feature_enabled("holiday_posts"):
                continue

            today = datetime.now().date()
            last_alert = settings.get_meta("last_holiday_alert", "")
            today_str = today.strftime("%Y-%m-%d")
            if last_alert == today_str:
                continue

            upcoming = holiday_module.get_upcoming_holidays(today, days_ahead=3)
            if not upcoming:
                continue

            lines = ["📅 *Праздники в ближайшие 3 дня:*\n"]
            for date, name, hint in upcoming:
                days_until = (date - today).days
                if days_until == 0:
                    when = "СЕГОДНЯ"
                elif days_until == 1:
                    when = "ЗАВТРА"
                else:
                    when = f"через {days_until} дн ({date.strftime('%d.%m')})"
                lines.append(f"\n*{when}* — {name}")
                lines.append(f"_{hint}_")

            lines.append("\n\nПодумай об отдельном посте — обычные праздники дают +30-50% к охвату.")

            for admin_id in config.ADMIN_IDS:
                try:
                    await bot.send_message(admin_id, "\n".join(lines), parse_mode="Markdown")
                except Exception as e:
                    log.error(f"holiday alert error: {e}")
            settings.set_meta("last_holiday_alert", today_str)
        except Exception as e:
            log.error(f"holiday_loop error: {e}")
            await asyncio.sleep(3600)


# ── Запуск ───────────────────────────────────────────────────────────

async def main():
    os.makedirs(config.MEDIA_DIR, exist_ok=True)
    schedule_db.init_db()
    log.info("SMM-бот запущен")
    asyncio.create_task(scheduler_loop())
    asyncio.create_task(queue_health_loop())
    asyncio.create_task(holiday_loop())
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
