#!/usr/bin/env python3
"""Generate CleanBG logo, favicon, PWA icons, and OG image."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public"
BG = (10, 10, 10, 255)
WHITE = (250, 250, 250, 255)
CHECK_A = (228, 228, 231, 255)
CHECK_B = (161, 161, 170, 255)
MUTED = (163, 163, 163, 255)


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius: int, fill) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def make_mark(size: int, *, padding_ratio: float = 0.18) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    pad = size * padding_ratio
    outer_r = (size - 2 * pad) / 2
    inner_r = outer_r * 0.58
    stroke = outer_r - inner_r
    cx = cy = size / 2
    gap = 42

    cell = max(8, int(inner_r / 2.6))
    checker = Image.new("RGBA", (size, size), BG)
    cd = ImageDraw.Draw(checker)
    origin = int(cx - inner_r)
    for y in range(origin - cell, int(cx + inner_r) + cell, cell):
        for x in range(origin - cell, int(cx + inner_r) + cell, cell):
            fill = CHECK_A if ((x + y) // cell) % 2 == 0 else CHECK_B
            cd.rectangle([x, y, x + cell, y + cell], fill=fill)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse(
        [cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill=255
    )
    img.paste(checker, (0, 0), mask)

    # White ring
    bbox = [cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r]
    draw.ellipse(bbox, outline=WHITE, width=max(2, round(stroke)))

    # Open the C on the right
    draw.pieslice(
        [cx - outer_r - stroke, cy - outer_r - stroke, cx + outer_r + stroke, cy + outer_r + stroke],
        start=-gap,
        end=gap,
        fill=BG,
    )

    # Round the terminals
    r_mid = (outer_r + inner_r) / 2
    cap = stroke / 2
    for sign in (-1, 1):
        a = math.radians(sign * gap)
        x = cx + r_mid * math.cos(a)
        y = cy + r_mid * math.sin(a)
        draw.ellipse([x - cap, y - cap, x + cap, y + cap], fill=WHITE)

    return img


def load_font(paths: list[str], size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in paths:
        p = Path(path)
        if not p.exists():
            continue
        try:
            return ImageFont.truetype(str(p), size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_og(logo: Image.Image) -> Image.Image:
    w, h = 1200, 630
    canvas = Image.new("RGBA", (w, h), BG)
    draw = ImageDraw.Draw(canvas)

    # Soft checkerboard fade on the right edge
    cell = 28
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for y in range(0, h, cell):
        for x in range(720, w, cell):
            fill = CHECK_A if ((x // cell) + (y // cell)) % 2 == 0 else CHECK_B
            fade = int(28 * ((x - 720) / (w - 720)))
            od.rectangle([x, y, x + cell, y + cell], fill=(*fill[:3], fade))
    canvas = Image.alpha_composite(canvas, overlay)
    draw = ImageDraw.Draw(canvas)

    mark = logo.resize((360, 360), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, (72, (h - 360) // 2))

    title_font = load_font(
        [
            "/System/Library/Fonts/Supplemental/Baskerville.ttc",
            "/System/Library/Fonts/NewYorkItalic.ttf",
            "/System/Library/Fonts/Supplemental/Georgia Italic.ttf",
        ],
        92,
    )
    sub_font = load_font(
        [
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            "/System/Library/Fonts/HelveticaNeue.ttc",
            "/System/Library/Fonts/Supplemental/Georgia.ttf",
        ],
        28,
    )

    tx, ty = 470, 210
    draw.text((tx, ty), "CleanBG", font=title_font, fill=WHITE)
    draw.text(
        (tx, ty + 130),
        "Remove backgrounds in your browser.",
        font=sub_font,
        fill=MUTED,
    )
    draw.text((tx, ty + 172), "Nothing is uploaded.", font=sub_font, fill=MUTED)
    return canvas


def save_png(img: Image.Image, path: Path, size: int | None = None) -> None:
    out = img.resize((size, size), Image.Resampling.LANCZOS) if size else img
    out.convert("RGBA").save(path, "PNG", optimize=True)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    logo = make_mark(1024)
    save_png(logo, OUT / "logo.png")
    save_png(logo, OUT / "icon-512.png", 512)
    save_png(logo, OUT / "icon-192.png", 192)
    save_png(make_mark(1024, padding_ratio=0.22), OUT / "icon-maskable.png", 512)
    save_png(logo, OUT / "apple-touch-icon.png", 180)
    save_png(logo, OUT / "favicon-32.png", 32)
    save_png(logo, OUT / "favicon-16.png", 16)

    ico_sizes = [16, 32, 48]
    ico_images = [logo.resize((s, s), Image.Resampling.LANCZOS) for s in ico_sizes]
    ico_images[0].save(
        OUT / "favicon.ico",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[1:],
        format="ICO",
    )

    og = make_og(logo).convert("RGB")
    og.save(OUT / "og.png", "PNG", optimize=True)
    print("wrote brand assets to", OUT)


if __name__ == "__main__":
    main()
