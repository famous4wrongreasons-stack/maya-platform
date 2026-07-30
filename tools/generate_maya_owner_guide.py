#!/usr/bin/env python3
"""Generate the Russian MAYA owner guide as a verified monochrome PDF."""

from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "MAYA_OWNER_GUIDE_RU.pdf"

FONT_DIR = Path("/Library/Fonts")
FONTS = {
    "Montserrat": FONT_DIR / "Montserrat-Regular.ttf",
    "MontserratMedium": FONT_DIR / "Montserrat-Medium.ttf",
    "MontserratSemiBold": FONT_DIR / "Montserrat-SemiBold.ttf",
    "Manrope": FONT_DIR / "Manrope-Regular.ttf",
    "ManropeMedium": FONT_DIR / "Manrope-Medium.ttf",
    "ManropeSemiBold": FONT_DIR / "Manrope-SemiBold.ttf",
}

PAGE_W, PAGE_H = A4
INK = colors.HexColor("#080808")
TEXT = colors.HexColor("#171717")
MID = colors.HexColor("#6A6A6A")
FAINT = colors.HexColor("#A8A8A8")
LINE = colors.HexColor("#D8D8D8")
SOFT = colors.HexColor("#F2F2F2")
PAPER = colors.white


def register_fonts() -> None:
    for name, path in FONTS.items():
        if not path.exists():
            raise FileNotFoundError(f"Missing font: {path}")
        pdfmetrics.registerFont(TTFont(name, str(path)))


class MayaDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(
            18 * mm,
            18 * mm,
            PAGE_W - 36 * mm,
            PAGE_H - 34 * mm,
            leftPadding=0,
            rightPadding=0,
            topPadding=7 * mm,
            bottomPadding=5 * mm,
            id="main",
        )
        self.addPageTemplates(PageTemplate(id="maya", frames=[frame], onPage=draw_page))
        self._bookmark_index = 0

    def beforeDocument(self):
        self._bookmark_index = 0
        return super().beforeDocument()

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        level = None
        if flowable.style.name == "H1":
            level = 0
        elif flowable.style.name == "H2":
            level = 1
        if level is None:
            return
        self._bookmark_index += 1
        key = f"heading-{self._bookmark_index}"
        text = flowable.getPlainText()
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=False)
        display_page = max(1, self.page - 1)
        self.notify("TOCEntry", (level, text, display_page, key))


def draw_flower(canvas, x: float, y: float, radius: float, stroke, width=1.2) -> None:
    canvas.saveState()
    canvas.setStrokeColor(stroke)
    canvas.setLineWidth(width)
    small = radius * 0.58
    offset = radius * 0.48
    for dx, dy in (
        (0, offset),
        (offset * 0.72, offset * 0.72),
        (offset, 0),
        (offset * 0.72, -offset * 0.72),
        (0, -offset),
        (-offset * 0.72, -offset * 0.72),
        (-offset, 0),
        (-offset * 0.72, offset * 0.72),
    ):
        canvas.circle(x + dx, y + dy, small, stroke=1, fill=0)
    canvas.restoreState()


def draw_page(canvas, doc) -> None:
    canvas.saveState()
    canvas.setTitle("MAYA OS - инструкция владельца")
    canvas.setAuthor("MAYA")
    if doc.page == 1:
        canvas.setFillColor(INK)
        canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
        canvas.setStrokeColor(colors.HexColor("#242424"))
        canvas.setLineWidth(0.45)
        for i in range(9):
            y = 18 * mm + i * 32 * mm
            canvas.line(0, y, PAGE_W, y)
        canvas.restoreState()
        return

    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, PAGE_H - 12 * mm, PAGE_W - 18 * mm, PAGE_H - 12 * mm)
    draw_flower(canvas, 22 * mm, PAGE_H - 8.2 * mm, 3.5 * mm, INK, width=0.55)
    canvas.setFont("MontserratMedium", 6.8)
    canvas.setFillColor(MID)
    canvas.drawString(28 * mm, PAGE_H - 9.4 * mm, "MAYA OS  |  ИНСТРУКЦИЯ ВЛАДЕЛЬЦА")
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 12 * mm, PAGE_W - 18 * mm, 12 * mm)
    canvas.setFont("Manrope", 7)
    canvas.setFillColor(MID)
    canvas.drawString(18 * mm, 7.4 * mm, "Версия 1.0  |  16 июля 2026")
    canvas.drawRightString(PAGE_W - 18 * mm, 7.4 * mm, str(doc.page - 1))
    canvas.restoreState()


def styles():
    base = getSampleStyleSheet()
    return {
        "CoverKicker": ParagraphStyle(
            "CoverKicker",
            parent=base["Normal"],
            fontName="MontserratMedium",
            fontSize=8.5,
            leading=12,
            textColor=colors.HexColor("#BEBEBE"),
            tracking=3,
            alignment=TA_CENTER,
            spaceAfter=8 * mm,
        ),
        "CoverTitle": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName="Montserrat",
            fontSize=36,
            leading=43,
            textColor=colors.white,
            alignment=TA_CENTER,
            spaceAfter=7 * mm,
        ),
        "CoverSub": ParagraphStyle(
            "CoverSub",
            parent=base["Normal"],
            fontName="Manrope",
            fontSize=12,
            leading=19,
            textColor=colors.HexColor("#D4D4D4"),
            alignment=TA_CENTER,
            spaceAfter=5 * mm,
        ),
        "CoverMeta": ParagraphStyle(
            "CoverMeta",
            parent=base["Normal"],
            fontName="Manrope",
            fontSize=8.5,
            leading=13,
            textColor=colors.HexColor("#8E8E8E"),
            alignment=TA_CENTER,
        ),
        "H1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="Montserrat",
            fontSize=25,
            leading=31,
            textColor=INK,
            spaceBefore=4 * mm,
            spaceAfter=6 * mm,
            keepWithNext=True,
        ),
        "H2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="MontserratSemiBold",
            fontSize=14,
            leading=19,
            textColor=INK,
            spaceBefore=6 * mm,
            spaceAfter=3 * mm,
            keepWithNext=True,
        ),
        "H3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName="MontserratSemiBold",
            fontSize=10.5,
            leading=14,
            textColor=INK,
            spaceBefore=4 * mm,
            spaceAfter=2 * mm,
            keepWithNext=True,
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Manrope",
            fontSize=9.25,
            leading=14.1,
            textColor=TEXT,
            spaceAfter=2.4 * mm,
        ),
        "BodySmall": ParagraphStyle(
            "BodySmall",
            parent=base["BodyText"],
            fontName="Manrope",
            fontSize=7.8,
            leading=11.5,
            textColor=TEXT,
        ),
        "Caption": ParagraphStyle(
            "Caption",
            parent=base["BodyText"],
            fontName="Manrope",
            fontSize=7.4,
            leading=10.5,
            textColor=MID,
        ),
        "Bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="Manrope",
            fontSize=9,
            leading=13.6,
            textColor=TEXT,
            leftIndent=4.5 * mm,
            firstLineIndent=-3.2 * mm,
            bulletIndent=0,
            spaceAfter=1.4 * mm,
        ),
        "Number": ParagraphStyle(
            "Number",
            parent=base["BodyText"],
            fontName="Manrope",
            fontSize=9.2,
            leading=14,
            textColor=TEXT,
            leftIndent=7 * mm,
            firstLineIndent=-7 * mm,
            spaceAfter=2.5 * mm,
        ),
        "Quote": ParagraphStyle(
            "Quote",
            parent=base["BodyText"],
            fontName="ManropeMedium",
            fontSize=10,
            leading=15,
            textColor=INK,
            leftIndent=5 * mm,
            rightIndent=5 * mm,
            spaceAfter=2 * mm,
        ),
        "TableHead": ParagraphStyle(
            "TableHead",
            parent=base["Normal"],
            fontName="MontserratSemiBold",
            fontSize=7.2,
            leading=9.5,
            textColor=colors.white,
        ),
        "TableBody": ParagraphStyle(
            "TableBody",
            parent=base["Normal"],
            fontName="Manrope",
            fontSize=7.5,
            leading=10.6,
            textColor=TEXT,
        ),
        "TableBodyStrong": ParagraphStyle(
            "TableBodyStrong",
            parent=base["Normal"],
            fontName="ManropeSemiBold",
            fontSize=7.5,
            leading=10.6,
            textColor=INK,
        ),
    }


S = styles()


class FlowerMark(Flowable):
    def __init__(self, size=30 * mm, color=colors.white):
        super().__init__()
        self.width = size
        self.height = size
        self.color = color

    def draw(self):
        draw_flower(
            self.canv,
            self.width / 2,
            self.height / 2,
            self.width * 0.28,
            self.color,
            width=1.05,
        )


class Rule(Flowable):
    def __init__(self, color=LINE, space=3 * mm):
        super().__init__()
        self.width = 100 * mm
        self.height = space
        self.color = color

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(0.6)
        self.canv.line(0, self.height / 2, self._availWidth, self.height / 2)

    def wrap(self, availWidth, availHeight):
        self._availWidth = availWidth
        return availWidth, self.height


def p(text: str, style="Body") -> Paragraph:
    return Paragraph(text, S[style])


def bullets(items: list[str]) -> list[Flowable]:
    return [Paragraph(f"- {item}", S["Bullet"]) for item in items]


def numbers(items: list[str]) -> list[Flowable]:
    return [Paragraph(f"<b>{i}.</b> {item}", S["Number"]) for i, item in enumerate(items, 1)]


def info_box(title: str, text: str, dark=False) -> Table:
    bg = INK if dark else SOFT
    fg = colors.white if dark else TEXT
    title_style = ParagraphStyle(
        "BoxTitle",
        parent=S["H3"],
        textColor=fg,
        spaceBefore=0,
        spaceAfter=1.5 * mm,
    )
    body_style = ParagraphStyle(
        "BoxBody",
        parent=S["Body"],
        textColor=fg,
        spaceAfter=0,
    )
    t = Table(
        [[Paragraph(title, title_style), Paragraph(text, body_style)]],
        colWidths=[42 * mm, 126 * mm],
        hAlign="LEFT",
    )
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 0.6, INK if not dark else colors.HexColor("#333333")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
            ]
        )
    )
    return t


def status_table(rows: list[tuple[str, str, str]], widths=None) -> Table:
    data = [[p("СТАТУС", "TableHead"), p("ЧТО ЭТО ЗНАЧИТ", "TableHead"), p("ДЕЙСТВИЕ", "TableHead")]]
    for status, meaning, action in rows:
        data.append([p(status, "TableBodyStrong"), p(meaning, "TableBody"), p(action, "TableBody")])
    t = Table(data, colWidths=widths or [40 * mm, 78 * mm, 50 * mm], repeatRows=1, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.4 * mm),
    ]
    for row in range(1, len(data)):
        if row % 2 == 0:
            commands.append(("BACKGROUND", (0, row), (-1, row), SOFT))
    t.setStyle(TableStyle(commands))
    return t


def capability_table(rows: list[tuple[str, str, str]], widths=None) -> Table:
    data = [[p("ВОЗМОЖНОСТЬ", "TableHead"), p("ЧТО ДЕЛАЕТ MAYA", "TableHead"), p("СТАТУС", "TableHead")]]
    for name, description, status in rows:
        data.append([p(name, "TableBodyStrong"), p(description, "TableBody"), p(status, "TableBody")])
    t = Table(data, colWidths=widths or [43 * mm, 95 * mm, 30 * mm], repeatRows=1, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2.4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
    ]
    for row in range(1, len(data)):
        if row % 2 == 0:
            commands.append(("BACKGROUND", (0, row), (-1, row), SOFT))
    t.setStyle(TableStyle(commands))
    return t


def command_box(command: str, result: str) -> Table:
    data = [
        [p("СКАЖИТЕ MAYA", "TableBodyStrong"), p(f"«{command}»", "Quote")],
        [p("ЧТО ПРОИЗОЙДЁТ", "TableBodyStrong"), p(result, "BodySmall")],
    ]
    t = Table(data, colWidths=[38 * mm, 130 * mm], hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), SOFT),
                ("BOX", (0, 0), (-1, -1), 0.55, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 2.8 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.8 * mm),
            ]
        )
    )
    return t


PRODUCTION_TOOL_ROWS = [
    ("Каталог и запись", "Услуги, мастера, графики, кто работает, свободные и ближайшие окна, создание записи.", "Клиент"),
    ("Управление визитом", "Мои записи, перенос, изменение состава услуги и отмена своей записи.", "Клиент"),
    ("Лояльность", "Баланс из YClients, ДР-промокод, реферальная ссылка и безопасная память предпочтений.", "Клиент"),
    ("Продажи", "Абонементы, сертификаты и релевантное дополнительное предложение.", "Клиент"),
    ("Личный день мастера", "Свои записи, чаевые, показатели и персональный план роста.", "Мастер"),
    ("Контекст клиента", "История услуг и безопасные предпочтения перед визитом без показа телефона модели.", "Мастер / владелец"),
    ("Отчёт бизнеса", "Выручка, визиты, средний чек, динамика и топ услуг за выбранный период.", "Администратор / владелец"),
    ("Аудитория MAYA", "Подключённые аккаунты, согласия и реальный доступный охват без персональных данных.", "Администратор / владелец"),
    ("Правила бизнеса", "Запомнить или отменить операционное правило, которое Майя применяет в следующих диалогах.", "Владелец"),
    ("Сводка директора", "Главный вывод дня, план-факт, загрузка, риски и следующий безопасный шаг.", "Владелец"),
    ("Центр управления", "Цели, задачи, контроль исполнения, память решений и безопасный операционный ритм.", "Владелец"),
    ("Возможности роста", "Пустые окна, возврат клиентов, просевшие услуги, истекающие активы и вклад мастеров.", "Владелец"),
    ("Подтверждаемое действие", "Готовит action-card для рассылки или задачи. Само действие выполняется только после нажатия владельца.", "Владелец"),
]


UNIVERSAL_TOOL_ROWS = [
    ("Каталог услуг и специалистов", "Чтение каталога и безопасных подписей сотрудников для любого авторизованного участника.", "RC"),
    ("Свободное время", "Чтение доступности по дате, специалисту, услугам и филиалу.", "RC"),
    ("Свои записи", "История записей авторизованного клиента.", "RC"),
    ("Свой баланс", "Авторитетный баланс лояльности текущего клиента.", "RC"),
    ("Аналитика сотрудника", "Личные операционные показатели за период.", "RC"),
    ("Аналитика бизнеса", "Показатели tenant или филиала за период.", "RC"),
    ("Расходы и число клиентов", "Агрегированные данные без расшифровки защищённых заметок и без PII.", "RC"),
    ("Предпросмотр записи", "Проверка выбранной записи без создания.", "RC"),
    ("Создание, перенос, отмена", "Изменение только собственной записи после явного подтверждения клиента.", "RC"),
    ("Корректировка внутренних баллов", "Только для владельца/администратора и только после owner approval.", "RC"),
]


TOOL_APPENDIX = [
    ("get_services", "Получить услуги, цены и длительность.", "клиент"),
    ("get_masters", "Получить список специалистов.", "клиент"),
    ("get_master_schedule", "Проверить график выбранного специалиста.", "клиент / staff"),
    ("who_works", "Проверить, кто работает в выбранный день.", "клиент / staff"),
    ("get_available_slots", "Получить свободные интервалы.", "клиент"),
    ("find_nearest_slots", "Найти ближайшие варианты времени.", "клиент"),
    ("request_booking", "Подготовить запись к оформлению.", "клиент"),
    ("remember_wanted_slot", "Запомнить желаемое окно при отсутствии мест.", "клиент"),
    ("check_loyalty_balance", "Показать авторитетный баланс лояльности.", "клиент"),
    ("get_my_bookings", "Показать собственные записи.", "клиент"),
    ("request_client_contact", "Запустить защищённый сбор контакта вне LLM.", "системный"),
    ("get_my_work_records", "Показать собственные рабочие записи.", "мастер"),
    ("get_my_tips", "Показать собственные чаевые.", "мастер"),
    ("get_my_stats", "Показать личные показатели.", "мастер"),
    ("start_gift_cert_purchase", "Открыть покупку сертификата.", "клиент"),
    ("show_subscription_plans", "Показать доступные абонементы.", "клиент"),
    ("check_birthday_promo", "Серверная проверка промокода ко дню рождения.", "системный"),
    ("get_referral_link", "Получить реферальную ссылку.", "клиент"),
    ("suggest_upsell", "Предложить релевантное дополнение без навязывания.", "клиент"),
    ("reschedule_booking", "Перенести собственную запись.", "клиент"),
    ("update_booking", "Изменить собственную запись.", "клиент"),
    ("cancel_booking", "Отменить собственную запись.", "клиент"),
    ("get_business_report", "Собрать отчёт бизнеса за период.", "админ / владелец"),
    ("get_maya_audience_stats", "Показать реальный охват MAYA.", "админ / владелец"),
    ("get_client_dossier", "Дать безопасный контекст клиента перед визитом.", "мастер / владелец"),
    ("remember_client_preference", "Запомнить явно названное предпочтение без PII.", "клиент"),
    ("barber_knowledge", "Legacy-инструмент техники; скрыт продуктовым решением и не считается активной функцией.", "внутренний"),
    ("remember_business_rule", "Сохранить операционное правило.", "владелец"),
    ("forget_business_rule", "Отменить правило по номеру.", "владелец"),
    ("get_daily_briefing", "Дать короткую сводку директора.", "владелец"),
    ("get_owner_command_center", "Собрать единый снимок MAYA OS.", "владелец"),
    ("get_growth_plan", "Показать ролевой план роста.", "мастер / админ / владелец"),
    ("set_growth_goal", "Поставить измеримую цель выручки.", "владелец"),
    ("run_autonomous_director_tick", "Создать безопасные внутренние автозадачи.", "владелец"),
    ("run_autopilot_supervision_tick", "Проверить исполнение и создать эскалации.", "владелец"),
    ("run_execution_loop_tick", "Замкнуть разрывы между задачей и результатом.", "владелец"),
    ("run_operating_rhythm_tick", "Запустить полный безопасный операционный цикл.", "владелец"),
    ("create_owner_control_task", "Создать контрольную задачу владельца.", "владелец"),
    ("update_owner_control_task", "Обновить статус контрольной задачи.", "владелец"),
    ("get_money_opportunities", "Приоритизировать возможности по денежному эффекту.", "владелец"),
    ("get_return_candidates", "Собрать очередь возврата клиентов без PII для модели.", "владелец"),
    ("get_empty_windows", "Найти пустые окна и оценить потенциал.", "владелец"),
    ("get_expiring_assets", "Показать истекающие абонементы и активные сертификаты.", "владелец"),
    ("get_service_insights", "Найти сильные и просевшие услуги.", "владелец"),
    ("get_master_performance", "Сравнить вклад специалистов после выплат.", "владелец"),
    ("get_risk_signals", "Собрать главные риски бизнеса.", "владелец"),
    ("salon_action", "Подготовить action-card, но не выполнить действие без подтверждения.", "владелец"),
]


def build_story() -> list[Flowable]:
    story: list[Flowable] = []

    story.extend(
        [
            Spacer(1, 23 * mm),
            Table([[FlowerMark(31 * mm)]], colWidths=[31 * mm], hAlign="CENTER"),
            Spacer(1, 10 * mm),
            p("MAYA OS", "CoverKicker"),
            p("Инструкция<br/>владельца", "CoverTitle"),
            p(
                "Что Майя умеет сегодня, как управлять бизнесом через чат,<br/>"
                "как подключать CRM и где проходят границы безопасной автономии.",
                "CoverSub",
            ),
            Spacer(1, 28 * mm),
            p("ФАКТИЧЕСКОЕ СОСТОЯНИЕ ПРОЕКТА", "CoverKicker"),
            p("Production + локальный multi-tenant release candidate", "CoverMeta"),
            Spacer(1, 5 * mm),
            p("Версия 1.0  |  16 июля 2026", "CoverMeta"),
            PageBreak(),
        ]
    )

    story.append(p("Содержание", "H1"))
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(
            "TOC1",
            fontName="MontserratMedium",
            fontSize=10,
            leading=15,
            leftIndent=0,
            firstLineIndent=0,
            textColor=INK,
            spaceBefore=2 * mm,
        ),
        ParagraphStyle(
            "TOC2",
            fontName="Manrope",
            fontSize=8.5,
            leading=13,
            leftIndent=6 * mm,
            firstLineIndent=0,
            textColor=MID,
        ),
    ]
    story.extend([toc, Spacer(1, 7 * mm)])
    story.append(
        info_box(
            "КАК ЧИТАТЬ ДОКУМЕНТ",
            "В MAYA сейчас существуют два контура: действующая production-версия «Мужской Эстетики» "
            "и универсальный multi-tenant MAYA OS, который собран как локальный release candidate. "
            "Функция не считается универсально готовой только потому, что её ключ есть в Feature Registry.",
        )
    )
    story.extend(
        [
            Spacer(1, 5 * mm),
            status_table(
                [
                    ("PRODUCTION", "Работает в действующем приложении «Мужской Эстетики».", "Можно проверять на реальных данных с осторожностью."),
                    ("LOCAL RC", "Реализовано и протестировано в универсальном MAYA OS локально.", "Тестировать на demo/staging до production cutover."),
                    ("НУЖНА НАСТРОЙКА", "Код готов, но требуется внешний аккаунт, ключ, домен или webhook.", "Настраивает владелец или провайдер."),
                    ("НЕ ГОТОВО", "Флаг зарезервирован или модуль частичный.", "Не продавать и не показывать как готовый."),
                ]
            ),
            PageBreak(),
        ]
    )

    story.append(p("1. Что произошло с чатом", "H1"))
    story.append(
        info_box(
            "ДИАГНОЗ",
            "Интерфейс отправлял сообщения правильно. Production-backend получал их, но AI-провайдер "
            "возвращал HTTP 429 для текста и распознавания аудио. Поэтому со стороны пользователя это выглядело "
            "как полное непонимание, хотя проблема возникала до генерации ответа.",
            dark=True,
        )
    )
    story.extend([Spacer(1, 4 * mm), p("Что исправлено", "H2")])
    story.extend(
        bullets(
            [
                "Production-текстовый мозг переключён на уже существующий общий ключ DeepSeek.",
                "Основная модель текста для приложения и Telegram теперь deepseek-v4-pro.",
                "Сервер перезапущен после проверки синтаксиса и активен.",
                "Живая проверка разговорной фразы и рабочей команды владельца прошла успешно.",
                "CRM, записи, база клиентов и существующие данные этим переключением не изменялись.",
            ]
        )
    )
    story.append(p("Как теперь работает голос", "H2"))
    story.extend(
        bullets(
            [
                "Приложение записывает WAV/WebM, а production-backend локально расшифровывает его через faster-whisper base CPU/int8.",
                "Аудио не отправляется в OpenAI или Google: в DeepSeek передаётся только текст после локальной расшифровки.",
                "DeepSeek понимает намерение, вызывает безопасные backend-инструменты и формирует ответ так же, как для текстового сообщения.",
                "Запись в iOS ограничена примерно 20 секундами; server-limit - 30 секунд и 8 МБ. Длинную команду лучше разделить на два сообщения.",
                "Озвучивание ответа пока выключено: голосовую команду уже можно дать, но MAYA ответит текстом до подключения production TTS.",
            ]
        )
    )
    story.append(
        info_box(
            "БЫСТРАЯ ПРОВЕРКА",
            "Напишите в чате: «Майя, коротко повтори, что ты поняла: сегодня нужен только отчёт по загрузке, "
            "ничего не запускай». Корректный ответ должен подтвердить намерение и не выполнять действие.",
        )
    )

    story.append(p("2. MAYA за одну минуту", "H1"))
    story.append(
        p(
            "MAYA - это единый AI-слой над безопасными backend-инструментами. Модель понимает намерение, "
            "но не получает прямой доступ к базе, CRM, деньгам или правам. Факты считает backend, а рискованные "
            "операции проходят серверную проверку и подтверждение человека."
        )
    )
    story.append(p("Роли", "H2"))
    story.append(
        capability_table(
            [
                ("Клиент", "Консультация, услуги, мастера, свободное время, запись, перенос, отмена, кабинет и лояльность.", "Production + RC"),
                ("Мастер", "Свой день, записи, чаевые, личная статистика, контекст клиента и личный план.", "Production; RC частично"),
                ("Администратор", "Операционная аналитика, загрузка, аудитория и исполнение без owner-полномочий.", "Production; RC частично"),
                ("Владелец", "Сводки, цели, риски, задачи, правила, рост и подтверждаемые действия.", "Production; RC частично"),
                ("Владелец платформы", "God Mode: tenant, trial, подписки, здоровье и агрегированная аналитика платформы.", "Local RC"),
            ]
        )
    )
    story.append(p("Главное правило", "H2"))
    story.append(
        info_box(
            "MAYA ПРЕДЛАГАЕТ - BACKEND ПРОВЕРЯЕТ - ЧЕЛОВЕК ПОДТВЕРЖДАЕТ",
            "Чтение данных может выполняться сразу в пределах роли. Создание, перенос, отмена, корректировка баллов, "
            "рассылка и другие последствия должны пройти политику доступа, идемпотентность, аудит и нужное подтверждение.",
            dark=True,
        )
    )

    story.append(p("3. Что умеет MAYA в production", "H1"))
    story.append(
        p(
            "Ниже перечислен фактический набор действующей single-business MAYA. Это самый глубокий и зрелый "
            "контур проекта, подключённый к данным «Мужской Эстетики» и YClients."
        )
    )
    story.append(capability_table(PRODUCTION_TOOL_ROWS))
    story.append(p("Возможности клиента", "H2"))
    story.extend(
        bullets(
            [
                "Понимать свободную фразу про услугу, дату, часть дня и предпочтение по мастеру.",
                "Показывать точные услуги, цены, длительность, специалистов и живые окна.",
                "Создавать запись через защищённый backend-контур и показывать её в кабинете.",
                "Показывать свои визиты, переносить или отменять собственную запись.",
                "Читать баланс лояльности из YClients как источника истины.",
                "Открывать покупку сертификата или абонемента в приложении.",
                "Запоминать безопасное предпочтение, которое клиент явно сообщил сам.",
            ]
        )
    )
    story.append(p("Возможности мастера и администратора", "H2"))
    story.extend(
        bullets(
            [
                "Мастер видит собственные записи, чаевые, статистику и план-факт.",
                "Перед визитом мастер может получить безопасное досье: история услуг, цикл и предпочтения без телефона в LLM.",
                "Администратор читает отчёт бизнеса, динамику и аудиторию MAYA, но не меняет правила владельца.",
                "Рабочий чат не превращается в клиентский флоу записи и не продаёт сотруднику услуги.",
            ]
        )
    )
    story.append(p("Возможности владельца", "H2"))
    story.extend(
        bullets(
            [
                "Короткая сводка дня и единый центр управления бизнесом.",
                "Выручка, визиты, средний чек, загрузка, услуги и вклад специалистов.",
                "Пустые окна, возврат клиентов, истекающие активы и основные риски.",
                "Постановка цели выручки и построение ролевого плана роста.",
                "Создание и обновление контрольных задач.",
                "Запуск безопасного операционного ритма, который создаёт внутренние задачи, но не трогает деньги и внешние коммуникации самовольно.",
                "Сохранение правил бизнеса простым текстом и отмена правила по номеру.",
                "Подготовка action-card рассылки или реактивации с обязательным ручным подтверждением.",
            ]
        )
    )

    story.append(p("4. Что готово в универсальном MAYA OS", "H1"))
    story.append(
        p(
            "Multi-tenant backend собран как локальный release candidate. Он изолирует бизнесы друг от друга и "
            "не меняет production «Мужской Эстетики» до отдельного cutover."
        )
    )
    story.append(p("Платформенная основа", "H2"))
    story.extend(
        bullets(
            [
                "Tenant, Membership и серверный TenantContext с deny-by-default изоляцией.",
                "Роли, сессии, refresh rotation, revoke, rate limits и защита auth-состояния.",
                "Plan, Entitlement, Feature Registry и проверка готовности функции отдельно от коммерческого доступа.",
                "10-дневный verified trial, который начинается только после завершённой регистрации бизнеса.",
                "Logo-only branding и tenant PWA manifest/icons.",
                "Авторизация email, Яндекс и Telegram на платформенном уровне; production credentials настраиваются отдельно.",
            ]
        )
    )
    story.append(p("Операционный контур", "H2"))
    story.extend(
        bullets(
            [
                "AI-onboarding с обычной русской речью, быстрыми ответами, уточнениями и редактируемой карточкой подтверждения.",
                "Шаблоны для индивидуальных специалистов и сервисных бизнесов.",
                "Внутренний календарь: услуги, специалисты, график на семь дней, time off и записи.",
                "YClients и Altegio: защищённый preview, проверка данных и явная активация.",
                "Кабинет клиента, собственные записи, создание, перенос и отмена.",
                "Профили клиентов, расходы, лояльность и role-scoped analytics на backend.",
                "YooKassa server flow, webhook и recurring foundation; реальные реквизиты магазина нужны до продаж.",
            ]
        )
    )
    story.append(p("Tenant-safe AI Core", "H2"))
    story.append(capability_table(UNIVERSAL_TOOL_ROWS))

    story.append(p("5. Быстрый старт владельца", "H1"))
    story.extend(
        numbers(
            [
                "Войдите как владелец. Проверяйте, что открыт рабочий кабинет, а не клиентская поверхность.",
                "Откройте чат MAYA и сформулируйте одну цель в одном сообщении.",
                "Для аналитики укажите период: сегодня, неделя, месяц или точные даты.",
                "Для филиала или сотрудника явно назовите область, если их несколько.",
                "Прочитайте вывод, источник и ограничения. Оценочные суммы не равны фактической прибыли.",
                "Если появилась карточка действия, проверьте содержание и только затем нажмите «Подтвердить».",
                "После изменения откройте соответствующий экран и убедитесь, что результат появился один раз.",
            ]
        )
    )
    story.append(p("Формула хорошей команды", "H2"))
    story.append(
        info_box(
            "ЦЕЛЬ + ПЕРИОД + ОБЛАСТЬ + ОГРАНИЧЕНИЕ",
            "Пример: «Покажи главные риски за последние 30 дней по всему бизнесу. Ничего не запускай, только анализ». "
            "Такая формулировка уменьшает неоднозначность и сразу задаёт допустимое действие.",
            dark=True,
        )
    )
    story.extend([Spacer(1, 4 * mm), command_box("Что у нас по бизнесу сегодня?", "MAYA вызовет дневной briefing и даст один главный вывод плюс следующий шаг.")])
    story.extend([Spacer(1, 3 * mm), command_box("Где мы теряем деньги за последние 30 дней?", "MAYA соберёт риски и приоритизирует возможности по ожидаемому эффекту.")])
    story.extend([Spacer(1, 3 * mm), command_box("Какие услуги просели и что сейчас тянет выручку?", "MAYA сравнит два 30-дневных периода и покажет динамику услуг.")])
    story.extend([Spacer(1, 3 * mm), command_box("Поставь цель 1 500 000 рублей к 31 августа, 4 рабочих места", "MAYA проверит физическую мощность и построит план. Цель создаётся только по явной команде владельца.")])
    story.extend([Spacer(1, 3 * mm), command_box("Запомни правило: при отмене всегда сначала предлагай перенос", "MAYA сохранит обезличенное операционное правило и применит его в следующих диалогах.")])
    story.extend([Spacer(1, 3 * mm), command_box("Запусти полный безопасный операционный ритм", "MAYA создаст и проверит внутренние задачи. Цены, зарплаты, записи и рассылки автоматически не изменятся.")])

    story.append(p("6. Настройка нового бизнеса", "H1"))
    story.append(p("AI-onboarding", "H2"))
    story.extend(
        numbers(
            [
                "Владелец проводит слайдер активации trial. Сам свайп ещё не считается подключённым бизнесом.",
                "В обычном чате MAYA отвечает, работает человек на себя или у него команда/бизнес.",
                "Выбирается профессия или тип бизнеса. Шаблон предлагает услуги, но они становятся реальными только после подтверждения.",
                "MAYA уточняет только обязательные недостающие факты: услуги, длительность/цены, число специалистов, график и способ календаря.",
                "Владелец проверяет редактируемую карточку и вводит контакты. Сырые контакты не отправляются в модель.",
                "После успешного provisioning создаётся tenant, владелец, филиал и нужный календарный контур.",
                "Только теперь начинается 10-дневный trial и бизнес попадает в метрику connected_businesses.",
                "Далее владелец загружает логотип и при необходимости открывает защищённый экран CRM.",
            ]
        )
    )
    story.append(p("Что можно отложить", "H2"))
    story.extend(
        bullets(
            [
                "Название можно добавить позже, если специалист работает под своим именем.",
                "Логотип необязателен для завершения provisioning.",
                "CRM можно подключить позже, но внешняя live-запись останется заблокирована до проверки.",
                "Дополнительные услуги, выходные и фотографии специалистов можно уточнить после быстрого запуска.",
            ]
        )
    )
    story.append(
        info_box(
            "НЕ ВСТАВЛЯЙТЕ API-ТОКЕН В ЧАТ",
            "CRM-ключ вводится только на защищённом tenant-scoped экране «Интеграции». Он шифруется сервером, "
            "не сохраняется во frontend и не передаётся AI-модели.",
            dark=True,
        )
    )

    story.append(p("7. Внутренний календарь или CRM", "H1"))
    story.append(p("Вариант A: внутренний календарь MAYA", "H2"))
    story.extend(
        bullets(
            [
                "Подходит индивидуальному специалисту и бизнесу без CRM.",
                "Владелец задаёт услуги, цену, длительность и активность.",
                "Для каждого специалиста настраивается реальный семидневный график и time off.",
                "MAYA рассчитывает доступность, создаёт записи и ведёт кабинет клиента внутри платформы.",
                "Trial может использовать live booking сразу после успешной регистрации.",
            ]
        )
    )
    story.append(p("Вариант B: YClients или Altegio", "H2"))
    story.extend(
        numbers(
            [
                "Откройте «Профиль владельца» -> «Интеграции» -> нужный провайдер.",
                "Введите tenant-specific API token и company ID только в защищённую форму.",
                "Нажмите проверку подключения. Backend получает нормализованный preview услуг, специалистов и филиалов.",
                "Сверьте preview с CRM. На этом шаге live-запись ещё не включается.",
                "Явно активируйте интеграцию. Только после успешной проверки внешний календарь становится источником истины.",
                "Сначала проверьте чтение и preview, затем одну тестовую запись, перенос и отмену.",
            ]
        )
    )
    story.append(
        capability_table(
            [
                ("YClients", "Каталог, специалисты, доступность, запись, отмена и неразрушающий перенос.", "Готово"),
                ("Altegio", "Тот же production-shaped adapter path.", "Готово"),
                ("DIKIDI", "Есть только каркас. Нужен официальный API-контракт и тестовый аккаунт.", "Не готово"),
                ("Whitelines", "Есть только каркас. Нужен официальный API-контракт и тестовый аккаунт.", "Не готово"),
                ("Salon Online", "Есть только каркас. Нужен официальный API-контракт и тестовый аккаунт.", "Не готово"),
            ]
        )
    )

    story.append(p("8. Контроль действий и безопасность", "H1"))
    story.append(p("MAYA может сделать сама", "H2"))
    story.extend(
        bullets(
            [
                "Прочитать разрешённые данные и объяснить их человеческим языком.",
                "Построить сводку, сравнение, приоритеты, план и внутреннюю задачу в пределах роли.",
                "Сохранить безопасное правило или предпочтение после явной команды.",
                "Подготовить проверяемый draft действия и карточку подтверждения.",
                "Выполнить низкорисковую внутреннюю операцию, если политика роли это разрешает.",
            ]
        )
    )
    story.append(p("MAYA не должна делать сама", "H2"))
    story.extend(
        bullets(
            [
                "Менять цены, зарплаты, роли и права доступа.",
                "Списывать, возвращать или переводить деньги.",
                "Запускать массовую рассылку без подтверждения владельца.",
                "Передавать модели телефоны, email, API-токены и другие персональные данные.",
                "Читать или менять данные другого tenant.",
                "Объявлять действие успешным до подтверждения backend.",
                "Включать live CRM только по факту введённого токена без preview и активации.",
            ]
        )
    )
    story.append(p("Как работает подтверждение", "H2"))
    story.extend(
        numbers(
            [
                "MAYA объясняет предлагаемое действие.",
                "Backend создаёт immutable approval с payload hash и сроком действия.",
                "Приложение показывает «Подтвердить» и «Отклонить».",
                "Повторный тап не создаёт повторную операцию благодаря idempotency.",
                "Истёкшая или уже обработанная карточка становится недействительной.",
                "Результат записывается в audit log.",
            ]
        )
    )

    story.append(p("9. Карта готовности продукта", "H1"))
    story.append(
        capability_table(
            [
                ("Tenant и изоляция", "Tenant, Membership, TenantContext, tenant resolution и negative-path tests.", "LOCAL RC готово"),
                ("Планы и trial", "Feature Registry, Entitlement, 10 дней, subscription fence и God Mode trial analytics.", "LOCAL RC готово"),
                ("Branding", "Logo-only onboarding, tenant manifest и icons.", "LOCAL RC готово"),
                ("Внутренний календарь", "Услуги, специалисты, график, time off и booking.", "LOCAL RC готово"),
                ("CRM", "YClients/Altegio готовы; остальные провайдеры planned.", "Частично"),
                ("Кабинет клиента", "Overview, история и собственные записи; внешний CRM detail и финальный polish частичны.", "Частично"),
                ("Лояльность", "В production работает; универсальный backend читает CRM source of truth, frontend binding частичный.", "Частично"),
                ("Customers / expenses", "Tenant-scoped backend и encrypted notes готовы; финальные экраны частичны.", "Частично"),
                ("Analytics", "Solo, employee, location и business endpoints готовы; финальные dashboard-визуализации частичны.", "Частично"),
                ("AI по ролям", "Production-мозг DeepSeek и локальный voice STT работают; озвучивание и universal provider setup частичные.", "Частично"),
                ("Shop / certificates / memberships", "Работают только в текущей single-business MAYA.", "Только production"),
                ("Team chat / notifications / referrals", "Работают только в текущей single-business MAYA.", "Только production"),
                ("YooKassa", "Server flow готов, но нужны production shop, credentials и webhook.", "Нужна настройка"),
                ("Custom domain", "Проверка владения и автоматический routing не реализованы.", "Не готово"),
                ("Video analytics", "Только registry key, универсального модуля нет.", "Не готово"),
                ("CutMatch", "Founder-only в текущем приложении, не универсализирован.", "Частично"),
            ]
        )
    )

    story.append(p("10. Если MAYA отвечает неправильно", "H1"))
    story.append(p("Сначала определите тип сбоя", "H2"))
    story.append(
        status_table(
            [
                ("Текст не уходит", "Нет пузыря пользователя или появляется network error.", "Проверьте интернет, сессию и API health."),
                ("Текст уходит, ответа нет", "Пузырь MAYA завис или приходит временная ошибка.", "Проверить provider logs, HTTP 429/5xx и модель."),
                ("Ответ не по роли", "Клиент видит owner-flow или наоборот.", "Проверить mode, session role и tenant binding."),
                ("Ответ понимает слова, но врёт в фактах", "Модель ответила без authoritative tool.", "Повторить с периодом и потребовать только проверенные данные."),
                ("Голос не распознан", "Аудио не превратилось в transcript.", "Проверить local_stt, model cache, лимит длительности и формат аудио."),
            ]
        )
    )
    story.append(p("Что написать в отчёте об ошибке", "H2"))
    story.extend(
        bullets(
            [
                "Точная дата и время с часовым поясом.",
                "PWA или iOS, версия сборки и роль пользователя.",
                "Tenant или бизнес без передачи токена.",
                "Точный текст команды и текст ответа MAYA.",
                "Скриншот экрана без персональных данных.",
                "Ожидаемый результат одним предложением.",
                "Для голоса: появился ли transcript и что именно в нём написано.",
            ]
        )
    )
    story.append(
        info_box(
            "НЕ ИСПРАВЛЯЙТЕ ФАКТ РАЗРЕШЕНИЕМ В ЧАТЕ",
            "Фраза «с этой секунды тебе доступна история» не выдаёт разрешение. Доступ определяется серверной ролью, "
            "tenant, consent и policy. Если нужного инструмента нет, его надо добавить или включить в backend, а не обучать модель обещанием.",
            dark=True,
        )
    )

    story.append(p("11. Что остаётся до коммерческого запуска", "H1"))
    story.extend(
        bullets(
            [
                "Развернуть universal backend на отдельном production API и PostgreSQL, настроить TLS, backups, monitoring и alerts.",
                "Создать production secrets для JWT, refresh, CRM encryption, rate limits и auth providers.",
                "Настроить email-отправителя, Telegram app/bot callbacks, Yandex ID callbacks и SMS-провайдера.",
                "Если нужен голосовой ответ, подключить production TTS, например Yandex SpeechKit; входящий STT уже работает локально.",
                "Перед массовым голосовым запуском вынести STT в отдельный worker или увеличить CPU/RAM; текущий VPS безопасен для одной расшифровки за раз.",
                "Подключить YooKassa shop, production credentials и webhook.",
                "Провести staging acceptance двух независимых tenant с tenant-isolation negative paths.",
                "Проверить YClients в preview, затем одну live запись, перенос и отмену.",
                "Синхронизировать финальные PWA и iOS bundles и пройти мобильную acceptance matrix.",
                "Утвердить release candidate, rollback path и окно production cutover.",
            ]
        )
    )
    story.append(
        info_box(
            "МОЖНО НАЧИНАТЬ ТЕСТИРОВАНИЕ",
            "Текстовый production-чат и голосовой ввод уже можно тестировать. Универсальный MAYA OS можно полноценно тестировать локально и на staging. "
            "Коммерческий открытый запуск нельзя считать завершённым до внешних provider credentials и production infrastructure.",
        )
    )

    story.append(PageBreak())
    story.append(p("Приложение A. Точный каталог AI-инструментов production", "H1"))
    story.append(
        p(
            "Каталог ниже отражает 47 серверных инструментов текущей MAYA. В интерфейсе пользователь видит не эти "
            "технические имена, а естественный диалог. Наличие инструмента не отменяет role gate, surface gate и подтверждение."
        )
    )
    appendix = [[p("ИНСТРУМЕНТ", "TableHead"), p("НАЗНАЧЕНИЕ", "TableHead"), p("РОЛЬ", "TableHead")]]
    for name, description, role in TOOL_APPENDIX:
        appendix.append([p(name, "TableBodyStrong"), p(description, "TableBody"), p(role, "TableBody")])
    t = Table(appendix, colWidths=[49 * mm, 85 * mm, 34 * mm], repeatRows=1, hAlign="LEFT")
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("GRID", (0, 0), (-1, -1), 0.3, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.8 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.8 * mm),
    ]
    for row in range(1, len(appendix)):
        if row % 2 == 0:
            cmds.append(("BACKGROUND", (0, row), (-1, row), SOFT))
    t.setStyle(TableStyle(cmds))
    story.append(t)

    story.append(p("Приложение B. Контрольный лист владельца", "H1"))
    story.extend(
        bullets(
            [
                "Текстовый чат отвечает через deepseek-v4-pro.",
                "Роль и tenant после входа определяются правильно.",
                "Две разные компании не видят данные друг друга.",
                "Внутренний график проверен на нестандартных выходных и работе без выходных.",
                "YClients/Altegio проходят preview до live activation.",
                "Лояльность совпадает с источником истины CRM.",
                "Создание, перенос и отмена не дублируются при повторном тапе.",
                "Email, Telegram и Yandex callbacks открывают приложение по правильному deep link.",
                "Trial начинается после завершённой регистрации и истекает через 10 дней.",
                "После trial появляется subscription_required и рабочий checkout path.",
                "Logo корректно обрезается и отображается в PWA/iOS manifest и интерфейсе.",
                "Локальный STT возвращает transcript, DeepSeek понимает команду, а при ошибке пользователь получает понятное сообщение.",
                "Рискованные действия требуют карточку подтверждения.",
                "В логах, AI prompts и PDF нет токенов и персональных данных.",
                "Есть backup, restore test, monitoring, alerts и rollback plan.",
            ]
        )
    )
    story.extend([Spacer(1, 10 * mm), Rule(INK, 4 * mm)])
    story.append(p("MAYA OS", "H2"))
    story.append(
        p(
            "AI-операционная система для сервисных компаний и индивидуальных специалистов. "
            "Минималистичный интерфейс, logo-only white label, tenant isolation и управляемая автономия.",
            "Caption",
        )
    )
    return story


def main() -> None:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = MayaDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        title="MAYA OS - инструкция владельца",
        author="MAYA",
        subject="Функции, эксплуатация и ограничения MAYA OS",
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
    )
    doc.multiBuild(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
