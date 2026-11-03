"""Re-bakes Path Painter's title logo (assets/art/logo.png) with PIL.

The generated logo drew its red brush over the 'N' of PAINTER, so on small
phones the title read 'PAI TER' (QA: layout_small). This bake keeps the same
look — chunky yellow letters with a light top rim, an amber extrusion and one
shared navy backing — in the game's display font (Fredoka Bold), and parks the
brush beside the shorter word PATH so no letter is ever covered.
Same canvas as before (900x445, transparent). The launcher/store icon is NOT
touched. Run:  python3 scripts/art/logo.py  (from the game root)
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT = os.path.join(ROOT, "assets", "art", "logo.png")
FONT = os.path.join(ROOT, "node_modules", "@expo-google-fonts", "fredoka", "700Bold", "Fredoka_700Bold.ttf")

W, H = 900, 445
S = 2  # supersample
NAVY = (12, 43, 80, 255)
NAVY_DEEP = (5, 23, 42, 255)
EXTRUDE = (176, 92, 0, 255)
RIM = (255, 250, 178, 255)
TOP = (255, 232, 70)
BOT = (255, 190, 10)


def text_mask(txt, size, spacing):
    font = ImageFont.truetype(FONT, size)
    widths = [font.getbbox(ch)[2] - font.getbbox(ch)[0] for ch in txt]
    total = sum(widths) + spacing * (len(txt) - 1)
    asc, desc = font.getmetrics()
    m = Image.new("L", (total + 40, asc + desc + 40), 0)
    d = ImageDraw.Draw(m)
    x = 20
    for ch, w in zip(txt, widths):
        bx = font.getbbox(ch)[0]
        d.text((x - bx, 20), ch, font=font, fill=255)
        x += w + spacing
    return m.crop(m.getbbox())


def grow(mask, r):
    return mask.filter(ImageFilter.MaxFilter(r * 2 + 1)) if r > 0 else mask


def shift(mask, dx, dy):
    out = Image.new("L", mask.size, 0)
    out.paste(mask, (dx, dy))
    return out


def vgrad(size, top, bot):
    w, h = size
    g = Image.new("RGBA", size)
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,))
    return g


def brush_layer(scale):
    """The red flat brush from the old logo: orange handle, silver ferrule, red bristles."""
    w, h = 150 * scale, 300 * scale
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = w // 2
    # handle
    d.rounded_rectangle([cx - 17 * scale, 0, cx + 17 * scale, 140 * scale], radius=17 * scale, fill=(232, 128, 30, 255))
    d.rounded_rectangle([cx - 9 * scale, 10 * scale, cx - 1 * scale, 120 * scale], radius=4 * scale, fill=(255, 190, 110, 255))
    # ferrule
    d.rounded_rectangle([cx - 46 * scale, 128 * scale, cx + 46 * scale, 172 * scale], radius=8 * scale, fill=(170, 186, 198, 255))
    d.rounded_rectangle([cx - 40 * scale, 133 * scale, cx + 40 * scale, 146 * scale], radius=5 * scale, fill=(232, 240, 246, 255))
    # bristles (paint-loaded, red)
    d.rounded_rectangle([cx - 52 * scale, 166 * scale, cx + 52 * scale, 288 * scale], radius=26 * scale, fill=(230, 46, 22, 255))
    d.rounded_rectangle([cx - 52 * scale, 236 * scale, cx + 52 * scale, 288 * scale], radius=26 * scale, fill=(196, 30, 14, 255))
    d.rounded_rectangle([cx - 40 * scale, 176 * scale, cx - 22 * scale, 250 * scale], radius=9 * scale, fill=(255, 120, 90, 255))
    return im


def main():
    big = (W * S, H * S)
    # Words: PAINTER fills the width, PATH (shorter) shares its line with the brush.
    painter = text_mask("PAINTER", 196 * S, 2 * S)
    path = text_mask("PATH", 196 * S, 2 * S)
    pad = 26 * S
    max_w = W * S - 2 * pad
    if painter.width > max_w:
        k = max_w / painter.width
        painter = painter.resize((int(painter.width * k), int(painter.height * k)), Image.LANCZOS)
        path = path.resize((int(path.width * k), int(path.height * k)), Image.LANCZOS)

    letters = Image.new("L", big, 0)
    top_y = 60 * S
    gap = -6 * S
    brush_room = 190 * S
    px = (W * S - (path.width + brush_room)) // 2
    letters.paste(path, (px, top_y), path)
    py = top_y + path.height + gap + 20 * S
    letters.paste(painter, ((W * S - painter.width) // 2, py), painter)

    # Brush: tilted, right of PATH, tip leaning toward the word.
    br = brush_layer(S).rotate(-24, resample=Image.BICUBIC, expand=True)
    bb = br.getbbox()
    br = br.crop(bb)
    # Fit the brush inside PATH's line height so it never reaches PAINTER.
    bh = path.height + 34 * S
    br = br.resize((int(br.width * bh / br.height), bh), Image.LANCZOS)
    bx = px + path.width + 40 * S
    by = top_y - 40 * S
    brush = Image.new("RGBA", big, (0, 0, 0, 0))
    brush.paste(br, (bx, by), br)
    brush_mask = brush.split()[3]

    extr = 14 * S
    extruded = letters
    for i in range(1, extr + 1, 2):
        extruded = ImageChops.lighter(extruded, shift(letters, 0, i))
    solid = ImageChops.lighter(extruded, brush_mask)
    backing = grow(solid, 15 * S).filter(ImageFilter.GaussianBlur(1.2 * S))
    shadow = shift(grow(solid, 15 * S), 0, 9 * S).filter(ImageFilter.GaussianBlur(2 * S))

    out = Image.new("RGBA", big, (0, 0, 0, 0))
    out.paste(Image.new("RGBA", big, NAVY_DEEP), (0, 0), shadow)
    out.paste(Image.new("RGBA", big, NAVY), (0, 0), backing)
    out.paste(Image.new("RGBA", big, EXTRUDE), (0, 0), extruded)
    # Fill: per-word vertical gradient.
    fill = Image.new("RGBA", big, (0, 0, 0, 0))
    fill.paste(vgrad((W * S, path.height), TOP, BOT), (0, top_y))
    fill.paste(vgrad((W * S, painter.height), TOP, BOT), (0, py))
    out.paste(fill, (0, 0), letters)
    # Light rim on the top edges + a soft gloss band.
    rim = ImageChops.subtract(letters, shift(letters, 0, 6 * S)).filter(ImageFilter.GaussianBlur(1 * S))
    out.paste(Image.new("RGBA", big, RIM), (0, 0), rim)
    gloss = Image.new("L", big, 0)
    gd = ImageDraw.Draw(gloss)
    for y0, hh in ((top_y, path.height), (py, painter.height)):
        gd.rectangle([0, y0 + int(hh * 0.32), W * S, y0 + int(hh * 0.46)], fill=70)
    gloss = ImageChops.multiply(gloss, grow(letters, 0).filter(ImageFilter.MinFilter(9 * S + 1 if (9 * S) % 2 == 0 else 9 * S)))
    out.paste(Image.new("RGBA", big, (255, 255, 230, 255)), (0, 0), gloss.filter(ImageFilter.GaussianBlur(3 * S)))
    out.alpha_composite(brush)

    out = out.crop(out.getbbox())
    # Fit back into the original 900x445 canvas (centred, transparent margin).
    k = min(W / out.width, H / out.height)
    out = out.resize((int(out.width * k), int(out.height * k)), Image.LANCZOS)
    final = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    final.paste(out, ((W - out.width) // 2, (H - out.height) // 2), out)
    final.save(OUT, optimize=True)
    print("wrote", OUT, final.size)


if __name__ == "__main__":
    main()
