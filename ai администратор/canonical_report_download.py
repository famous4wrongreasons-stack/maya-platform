"""R05 read-only report download. Input is an authorized immutable snapshot, never SQL analytics."""
from __future__ import annotations
import asyncio
import base64
import io
import re
from xml.sax.saxutils import escape


def _envelope(content: bytes, filename: str) -> dict:
    return {"ok": True, "filename": filename, "content_type": "application/pdf",
            "data_base64": base64.b64encode(content).decode("ascii"), "business_mutations": 0, "messages": 0}


def _render(snapshot: dict) -> dict:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from pathlib import Path
    font = "MayaReportUnicode"
    candidates = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"]
    available = next((p for p in candidates if Path(p).is_file()), None)
    if not available:
        raise ValueError("report_font_unavailable")
    if font not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(font, available))
    content = snapshot["content"]
    if not isinstance(content.get("title"), str) or not isinstance(content.get("bodyText"), str):
        raise ValueError("canonical_report_snapshot_invalid")
    buffer = io.BytesIO()
    style = ParagraphStyle("report", fontName=font, fontSize=11, leading=16)
    title = ParagraphStyle("title", parent=style, fontSize=16, leading=22)
    story = [Paragraph(escape(content["title"]), title), Spacer(1, 6*mm),
             Paragraph(escape(snapshot["periodLocalDate"] + " · " + snapshot["timezone"]), style), Spacer(1, 6*mm)]
    story.extend(Paragraph(escape(line) or "&#160;", style) for line in content["bodyText"].splitlines())
    SimpleDocTemplate(buffer, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm).build(story)
    return _envelope(buffer.getvalue(), "maya-report-" + snapshot["periodLocalDate"] + ".pdf")


async def report_snapshot(credential: str, run_id: str) -> dict:
    import aiohttp
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,160}", run_id):
        raise ValueError("canonical_report_snapshot_required")
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
        async with session.get("http://127.0.0.1:3107/api/owner-reports/" + run_id + "/snapshot",
                               headers={"Authorization": "Bearer " + credential, "Accept": "application/json"}) as response:
            if response.status != 200:
                raise ValueError("canonical_report_snapshot_unavailable")
            snapshot = await response.json()
    if not isinstance(snapshot, dict) or snapshot.get("contract") != "maya.owner-report-snapshot/1" or snapshot.get("runId") != run_id:
        raise ValueError("canonical_report_snapshot_invalid")
    return await asyncio.to_thread(_render, snapshot)


def static_help() -> dict:
    # Existing static command catalogue only; BytesIO leaves no permanent/temp business artifact.
    import generate_admin_pdf
    buffer = io.BytesIO()
    from contextlib import redirect_stdout
    with redirect_stdout(io.StringIO()):
        generate_admin_pdf.build_pdf(buffer)
    return _envelope(buffer.getvalue(), "maya-admin-help.pdf")


if __name__ == "__main__":
    import json
    import sys
    if sys.argv[1:] == ["--render-stdin"]:
        raw = sys.stdin.read(100001)
        if len(raw) > 100000:
            raise ValueError("canonical_report_payload_limit")
        result = _render(json.loads(raw))
    elif sys.argv[1:] == ["--static-help"]:
        result = static_help()
    else:
        raise ValueError("canonical_report_renderer_mode_required")
    print(json.dumps(result))
