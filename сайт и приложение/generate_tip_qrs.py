#!/usr/bin/env python3
"""
Генерация персональных QR-кодов для чаевых.

QR ведёт на tips.html?master=<slug>, а сумма выбирается уже в мини-приложении.
После изменения baseUrl или списка мастеров в tips-data.js запустите:
  python3 generate_tip_qrs.py
"""
from __future__ import annotations

import re
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "tips-data.js"
OUT_DIR = ROOT / "tips-qrs"


def read_config() -> tuple[str, list[tuple[str, str]]]:
    data = DATA_FILE.read_text(encoding="utf-8")
    base_match = re.search(r"baseUrl:\s*'([^']+)'", data)
    if not base_match:
        raise RuntimeError("Не найден baseUrl в tips-data.js")
    base_url = base_match.group(1)

    masters: list[tuple[str, str]] = []
    for block in re.finditer(r"\{[^{}]*slug:\s*'([^']+)'[^{}]*name:\s*'([^']+)'[^{}]*\}", data, re.S):
        masters.append((block.group(1), block.group(2)))
    if not masters:
        raise RuntimeError("Не найдены мастера в tips-data.js")
    return base_url, masters


def with_master(base_url: str, slug: str) -> str:
    sep = "&" if "?" in base_url else "?"
    return f"{base_url}{sep}master={slug}"


def make_qr(url: str, path: Path) -> None:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=14,
        border=3,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#050505", back_color="#ffffff").convert("RGB")

    pad = 18
    canvas = Image.new("RGB", (img.width + pad * 2, img.height + pad * 2), "#ffffff")
    canvas.paste(img, (pad, pad))

    draw = ImageDraw.Draw(canvas)
    draw.rectangle([0, 0, canvas.width - 1, canvas.height - 1], outline="#050505", width=2)
    canvas.save(path, optimize=True)


def main() -> None:
    base_url, masters = read_config()
    OUT_DIR.mkdir(exist_ok=True)

    for slug, name in masters:
        url = with_master(base_url, slug)
        path = OUT_DIR / f"{slug}.png"
        make_qr(url, path)
        print(f"{name}: {url} -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
