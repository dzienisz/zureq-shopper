#!/usr/bin/env python3
"""Regenerate icons/icon{16,48,128}.png (needs Pillow: pip install pillow)."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
S = 1024  # supersampled canvas


def gradient(size, top, bottom):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        for x in range(size):
            px[x, y] = c
    return img


def render():
    bg = gradient(S, (37, 121, 235), (16, 77, 168))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=S * 0.22, fill=255)
    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(bg, mask=mask)
    d = ImageDraw.Draw(icon)

    # magnifier lens
    cx, cy, r, ring = 450, 450, 250, 62
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline="white", width=ring)
    # handle
    d.line((cx + r * 0.68, cy + r * 0.68, 830, 830), fill="white", width=ring + 8)
    d.ellipse((830 - (ring + 8) // 2, 830 - (ring + 8) // 2, 830 + (ring + 8) // 2, 830 + (ring + 8) // 2), fill="white")
    # shopping bag inside the lens
    bw, bh = 200, 190
    bx, by = cx - bw // 2, cy - bh // 2 + 30
    d.rounded_rectangle((bx, by, bx + bw, by + bh), radius=34, fill="white")
    d.arc((bx + 45, by - 80, bx + bw - 45, by + 60), start=180, end=360, fill="white", width=30)
    return icon


def main():
    icon = render()
    out = ROOT / "icons"
    for size in (16, 48, 128):
        icon.resize((size, size), Image.LANCZOS).save(out / f"icon{size}.png")
        print(f"wrote icons/icon{size}.png")


if __name__ == "__main__":
    main()
