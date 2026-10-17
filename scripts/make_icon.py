"""ピントのアプリアイコンを描く。小さいサイズでも輪と瞳が残る。"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MASTER = 1024

CREAM = (246, 240, 230, 255)
INK = (28, 22, 18, 255)
TRACK = (255, 236, 220, 70)


def lerp(a, b, t):
    return int(a + (b - a) * t)


def background(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    center = (196, 86, 48)
    edge = (138, 42, 22)
    cx = cy = (size - 1) / 2
    max_r = math.hypot(cx, cy)
    for y in range(size):
        for x in range(size):
            dist = math.hypot(x - cx, y - cy) / max_r
            t = dist ** 1.2
            light = math.exp(-((x - cx * 0.72) ** 2 + (y - cy * 0.62) ** 2) / (size * size * 0.18))
            rgb = [lerp(c, e, t) for c, e in zip(center, edge)]
            rgb = [min(255, int(channel + light * 28)) for channel in rgb]
            px[x, y] = tuple(rgb)
    return img.convert("RGBA")


def annulus_mask(size, radius, width, gap_deg=0):
    """4倍で描いてから縮め、輪の縁を滑らかにする。"""
    scale = 4
    canvas = size * scale
    mask = Image.new("L", (canvas, canvas), 0)
    draw = ImageDraw.Draw(mask)
    cx = cy = canvas / 2
    outer = (radius + width / 2) * scale
    inner = max(1, (radius - width / 2) * scale)
    draw.ellipse([cx - outer, cy - outer, cx + outer, cy + outer], fill=255)
    draw.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=0)
    if gap_deg > 0:
        pad = width * scale
        draw.pieslice(
            [cx - outer - pad, cy - outer - pad, cx + outer + pad, cy + outer + pad],
            270 - gap_deg / 2,
            270 + gap_deg / 2,
            fill=0,
        )
        cap = (width * scale) / 2
        ring_r = radius * scale
        for deg in (270 - gap_deg / 2, 270 + gap_deg / 2):
            angle = math.radians(deg)
            x = cx + ring_r * math.cos(angle)
            y = cy + ring_r * math.sin(angle)
            draw.ellipse([x - cap, y - cap, x + cap, y + cap], fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def paint(mask, color):
    layer = Image.new("RGBA", mask.size, color)
    layer.putalpha(mask)
    return layer


def compose(size):
    icon = background(size)
    radius = size * 0.30
    width = size * 0.078
    gap = 52

    shadow_mask = annulus_mask(size, radius, width, gap)
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(radius=size * 0.016))
    shadow_mask = shadow_mask.point(lambda px: int(px * 0.38))
    shadow = paint(shadow_mask, (90, 28, 12, 255))
    shifted = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shifted.paste(shadow, (0, int(size * 0.014)), shadow)
    icon = Image.alpha_composite(icon, shifted)

    track_mask = annulus_mask(size, radius, width * 0.78)
    track_mask = track_mask.point(lambda px: int(px * 0.34))
    track = paint(track_mask, (255, 236, 220, 255))
    icon = Image.alpha_composite(icon, track)
    arc = paint(annulus_mask(size, radius, width, gap), CREAM)
    icon = Image.alpha_composite(icon, arc)

    pupil_r = size * 0.055
    cx = cy = size / 2
    draw = ImageDraw.Draw(icon)
    draw.ellipse(
        [cx - pupil_r, cy - pupil_r, cx + pupil_r, cy + pupil_r],
        fill=INK,
    )
    return icon.convert("RGB")


def main():
    master = compose(MASTER)
    outputs = {
        "icon-512.png": 512,
        "icon-192.png": 192,
        "apple-touch-icon.png": 180,
        "favicon-32.png": 32,
    }
    for name, size in outputs.items():
        image = master if size == MASTER else master.resize((size, size), Image.Resampling.LANCZOS)
        image.save(ROOT / name, "PNG", optimize=True)
        print(name, size)


if __name__ == "__main__":
    main()
