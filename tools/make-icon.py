"""Draw the PaperTeX icon: a sheet of paper with a rule of text and a formula,
in the app's own palette. Writes desktop/papertex.ico (multi-resolution).

Run:  python tools/make-icon.py
"""
from PIL import Image, ImageDraw
import os

PAPER = (255, 254, 251)
INK = (35, 38, 43)
AMBER = (154, 91, 6)
EDGE = (206, 200, 190)
DESK = (228, 226, 222)


def draw(size):
    s = size * 4  # supersample, then downscale for clean edges
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # rounded desk tile
    pad = int(s * 0.04)
    d.rounded_rectangle([pad, pad, s - pad, s - pad],
                        radius=int(s * 0.18), fill=DESK)

    # the sheet, slightly inset, portrait
    m = int(s * 0.17)
    top = int(s * 0.11)
    bot = s - int(s * 0.11)
    d.rounded_rectangle([m, top, s - m, bot], radius=int(s * 0.03),
                        fill=PAPER, outline=EDGE, width=max(1, int(s * 0.006)))

    # lines of text
    left = m + int(s * 0.08)
    right = s - m - int(s * 0.08)
    y = top + int(s * 0.13)
    lh = int(s * 0.075)
    th = max(1, int(s * 0.022))
    for i, frac in enumerate((1.0, 0.82, 0.93)):
        d.rounded_rectangle([left, y, left + (right - left) * frac, y + th],
                            radius=th // 2, fill=INK)
        y += lh

    # a centred display equation: the fraction bar plus its terms, in amber
    y += int(s * 0.02)
    bw = int((right - left) * 0.44)
    bx = left + ((right - left) - bw) // 2
    d.rounded_rectangle([bx + bw * 0.18, y, bx + bw * 0.82, y + th],
                        radius=th // 2, fill=AMBER)                    # numerator
    y += int(lh * 0.55)
    d.rectangle([bx, y, bx + bw, y + max(1, int(s * 0.014))], fill=AMBER)  # rule
    y += int(lh * 0.45)
    d.rounded_rectangle([bx + bw * 0.3, y, bx + bw * 0.7, y + th],
                        radius=th // 2, fill=AMBER)                    # denominator

    # two more lines below
    y += int(lh * 1.15)
    for frac in (0.95, 0.6):
        d.rounded_rectangle([left, y, left + (right - left) * frac, y + th],
                            radius=th // 2, fill=INK)
        y += lh

    return img.resize((size, size), Image.LANCZOS)


here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, "..", "desktop", "papertex.ico")
sizes = [16, 24, 32, 48, 64, 128, 256]
imgs = [draw(n) for n in sizes]
imgs[-1].save(out, format="ICO", sizes=[(n, n) for n in sizes])
imgs[-1].save(os.path.join(here, "..", "desktop", "papertex.png"))
print("desktop/papertex.ico  " + ", ".join(str(n) for n in sizes))
