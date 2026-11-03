"""Bakes Path Painter's chapter worlds, reveal paintings and UI icons with PIL.

Every chapter has one illustrated world: a full-screen backdrop (muted, so the
board pops) and the same world as a 4:3 painting the player reveals piece by
piece on the Levels screen. Icons are white silhouettes (tinted in-app via
tintColor) plus a few full-colour pieces (stars, sunburst). Deterministic.
Run:  python3 scripts/art/bake.py  (from the game root)
"""
import math, random, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT = os.path.join(ROOT, "assets", "art")
CANVAS = Image.open(os.path.join(OUT, "bg_paper_canvas.png")).convert("RGB")

def hexc(h, a=255):
    h = h.lstrip("#"); return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), a)

def lerp(a, b, t): return tuple(int(a[i] + (b[i]-a[i]) * t) for i in range(len(a)))

def vgrad(w, h, top, bottom):
    im = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bottom, y / max(1, h-1)))
    return im

def hill(w, h, base, amp, seed, freq=1.0):
    r = random.Random(seed)
    ph = [r.random()*6.28 for _ in range(3)]
    pts = [(0, h)]
    for x in range(0, w+1, max(2, w//240)):
        u = x / w
        y = base + amp*(0.55*math.sin(u*6.28*freq*0.8+ph[0]) + 0.3*math.sin(u*6.28*freq*1.9+ph[1]) + 0.15*math.sin(u*6.28*freq*4.3+ph[2]))
        pts.append((x, y))
    pts.append((w, h))
    return pts

def hill_y(pts, x):
    for i in range(1, len(pts)-1):
        if pts[i][0] >= x: return pts[i][1]
    return pts[-2][1]

def layer(w, h, rgb=(0, 0, 0)): return Image.new("RGBA", (w, h), rgb + (0,))

def blob(d, cx, cy, r, col):
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=col)

def cloud(d, cx, cy, s, col):
    for dx, dy, rr in [(-1.1,0.15,0.55),(-0.45,-0.2,0.75),(0.35,-0.1,0.7),(1.05,0.18,0.5),(0,0.25,0.6)]:
        blob(d, cx+dx*s, cy+dy*s, rr*s, col)

def tree(d, x, y, s, leaf, trunk):
    d.rounded_rectangle([x-s*0.09, y-s*0.55, x+s*0.09, y], radius=s*0.05, fill=trunk)
    blob(d, x, y-s*0.85, s*0.42, leaf)
    blob(d, x-s*0.25, y-s*0.62, s*0.3, leaf)
    blob(d, x+s*0.26, y-s*0.65, s*0.3, leaf)
    hl = lerp(leaf, (255,255,255,255), 0.28)
    blob(d, x-s*0.12, y-s*1.0, s*0.16, hl)

def pine(d, x, y, s, col):
    for k in range(3):
        top = y - s*(1.0 - k*0.22); wdt = s*(0.24 + k*0.1)
        d.polygon([(x, top - s*0.25), (x-wdt, top+s*0.2), (x+wdt, top+s*0.2)], fill=col)
    d.rectangle([x-s*0.04, y-s*0.2, x+s*0.04, y+s*0.05], fill=lerp(col, (40,30,30,255), 0.5))

def splats(im, seed, cols, n, rmin, rmax, alpha=150):
    """Soft paint splats — the painter's studio leaking into every world."""
    r = random.Random(seed); w, h = im.size
    lay = layer(w, h, (255, 255, 255)); d = ImageDraw.Draw(lay)
    for _ in range(n):
        cx, cy = r.random()*w, r.random()*h; rad = r.uniform(rmin, rmax)
        c = hexc(r.choice(cols), alpha)
        blob(d, cx, cy, rad, c)
        for _ in range(7):
            a = r.random()*6.28; dist = rad*r.uniform(0.9, 1.7); rr = rad*r.uniform(0.12, 0.3)
            blob(d, cx+math.cos(a)*dist, cy+math.sin(a)*dist, rr, c)
    return Image.alpha_composite(im, lay)

THEMES = [
    # 1 Basics — spring meadow morning
    dict(sky=("#BFE8F2", "#FFF3D6"), sun=("#FFE08A", 0.78, 0.2), hills=["#B7E3B0", "#8FD19A", "#5DBB7E", "#3F9E6B"],
         feat="meadow", splat=["#6D8BFF", "#FF8FB1", "#FFD166"]),
    # 2 Switches & Gates — lakeside dawn
    dict(sky=("#FFD3C2", "#FFF1DE"), sun=("#FFB38A", 0.3, 0.3), hills=["#C9B6E4", "#A08BD1", "#7C6BC0", "#5D7FC9"],
         feat="lake", splat=["#38D9A9", "#FF8A5B", "#6D8BFF"]),
    # 3 Color Sequencing — lavender fields
    dict(sky=("#E5D9FF", "#FFE6EE"), sun=("#FFF0B8", 0.7, 0.24), hills=["#D9C4F2", "#B79BE6", "#9C7AD8", "#7E5CC6"],
         feat="lavender", splat=["#FFC53B", "#38D9A9", "#FF6B9A"]),
    # 4 Crumble Hazards — autumn canyon
    dict(sky=("#FFE1B8", "#FFF4E2"), sun=("#FFC36B", 0.25, 0.22), hills=["#F5C48E", "#E9A16B", "#D17F55", "#B05F45"],
         feat="canyon", splat=["#6D8BFF", "#38D9A9", "#FFD166"]),
    # 5 Timed Trials — twilight
    dict(sky=("#7C86D9", "#F4B6C8"), sun=("#FFF4D6", 0.74, 0.18), hills=["#9A8CD6", "#7A6CC2", "#5C54A8", "#433F8C"],
         feat="twilight", splat=["#FFD166", "#FF8FB1", "#38D9A9"]),
    # 6 Master Mazes — aurora peaks
    dict(sky=("#6FC3D8", "#E8F6F2"), sun=("#FFFFFF", 0.5, 0.16), hills=["#C4E4EE", "#8CC6DA", "#5E9FC2", "#3F7BA8"],
         feat="peaks", splat=["#FF8A5B", "#6D8BFF", "#FFD166"]),
]

def scene(t, w, h, seed, compact=False):
    S = 2  # supersample
    W, H = w*S, h*S
    im = vgrad(W, H, hexc(t["sky"][0]), hexc(t["sky"][1]))
    d = ImageDraw.Draw(im)
    r = random.Random(seed)
    feat = t["feat"]
    hz = 0.42 if compact else 0.5  # horizon height (fraction)
    if feat in ("twilight",):
        for _ in range(140 if not compact else 60):
            x, y = r.random()*W, r.random()*H*hz*0.9
            rad = r.uniform(1.2, 3.4)*S
            blob(d, x, y, rad, (255, 255, 240, r.randint(120, 230)))
    if feat == "peaks":
        aur = layer(W, H, (170, 240, 220)); ad = ImageDraw.Draw(aur)
        for k, col in enumerate(["#8CF2C8", "#B7A6FF", "#7EE0F5"]):
            pts = []
            for x in range(0, W+1, 8):
                pts.append((x, H*(0.12+k*0.06) + math.sin(x/W*9+k)*H*0.03))
            for x in range(W, -1, -8):
                pts.append((x, H*(0.2+k*0.06) + math.sin(x/W*7+k*2)*H*0.035))
            ad.polygon(pts, fill=hexc(col, 110))
        aur = aur.filter(ImageFilter.GaussianBlur(14*S))
        im = Image.alpha_composite(im, aur); d = ImageDraw.Draw(im)
    # sun / moon with halo
    sc, sx, sy = t["sun"]
    halo = layer(W, H, hexc(sc)[:3]); hd = ImageDraw.Draw(halo)
    sr = min(W, H) * (0.11 if compact else 0.09)
    blob(hd, sx*W, sy*H, sr*2.4, hexc(sc, 90))
    halo = halo.filter(ImageFilter.GaussianBlur(sr*0.8))
    im = Image.alpha_composite(im, halo); d = ImageDraw.Draw(im)
    blob(d, sx*W, sy*H, sr, hexc(sc))
    if feat == "twilight":  # full moon with soft craters
        for cx_, cy_, cr_ in [(-0.3, -0.2, 0.22), (0.25, 0.1, 0.16), (-0.05, 0.4, 0.12)]:
            blob(d, sx*W + sr*cx_, sy*H + sr*cy_, sr*cr_, hexc("#EADFC0"))
    # clouds
    cl = layer(W, H, (255, 255, 255)); cd = ImageDraw.Draw(cl)
    for k in range(3 if compact else 5):
        cloud(cd, r.uniform(0.05, 0.95)*W, r.uniform(0.08, hz*0.75)*H, r.uniform(0.05, 0.09)*min(W, H)*1.6, (255, 255, 255, 170))
    cl = cl.filter(ImageFilter.GaussianBlur(2*S))
    im = Image.alpha_composite(im, cl); d = ImageDraw.Draw(im)
    # far mountains (peaks / canyon)
    if feat == "peaks":
        for k in range(7):
            cx = (k/6)*W + r.uniform(-0.05, 0.05)*W; ph = H*r.uniform(0.17, 0.26); base = H*(hz+0.06)
            hw = W*r.uniform(0.16, 0.24)
            col = hexc(t["hills"][1 if k % 2 else 2])
            d.polygon([(cx-hw, base), (cx, base-ph), (cx+hw, base)], fill=col)
            d.polygon([(cx-hw*0.28, base-ph*0.72), (cx, base-ph), (cx+hw*0.28, base-ph*0.72), (cx+hw*0.08, base-ph*0.66), (cx-hw*0.1, base-ph*0.7)], fill=(255, 255, 255, 235))
    if feat == "canyon":
        for k in range(4):
            x0 = r.uniform(-0.1, 0.8)*W; wd = W*r.uniform(0.22, 0.4); top = H*(hz - r.uniform(0.04, 0.12))
            col = hexc(t["hills"][1 + k % 2])
            d.rounded_rectangle([x0, top, x0+wd, H*(hz+0.1)], radius=W*0.02, fill=col)
            for s in range(3):
                yy = top + (s+1)*H*0.025
                d.line([(x0+W*0.01, yy), (x0+wd-W*0.01, yy)], fill=lerp(col, (255, 255, 255, 255), 0.25), width=max(2, S*3))
    # rolling hills (back to front)
    n = len(t["hills"])
    fronts = []
    for k, col in enumerate(t["hills"]):
        base = H*(hz + 0.04 + k*(0.1 if not compact else 0.12))
        pts = hill(W, H, base, H*0.035*(1+k*0.3), seed*10+k, freq=1.0+k*0.25)
        d.polygon(pts, fill=hexc(col))
        # soft top highlight
        d.line(pts[1:-1], fill=lerp(hexc(col), (255, 255, 255, 255), 0.25), width=max(2, int(S*2.5)))
        fronts.append(pts)
        if feat == "lake" and k == 1:
            ly = H*(hz+0.17)
            d.rectangle([0, ly, W, ly+H*0.09], fill=hexc("#9FD3F0"))
            for s in range(9):
                yy = ly + H*0.01 + s*H*0.009; xx = r.uniform(0.05, 0.8)*W
                d.line([(xx, yy), (xx+W*r.uniform(0.06, 0.16), yy)], fill=(255, 255, 255, 170), width=S*2)
            blob(d, sc and t["sun"][1]*W, ly + H*0.03, sr*0.6, hexc(sc, 140))
        if feat == "meadow" and k in (1, 2):
            for _ in range(5 if compact else 7):
                x = r.uniform(0.03, 0.97)*W
                tree(d, x, hill_y(pts, x)+S*4, min(W, H)*r.uniform(0.07, 0.11), hexc(["#4FAE6E", "#3E9C63", "#69C27F"][r.randint(0, 2)]), hexc("#8A5A3C"))
        if feat in ("peaks", "twilight") and k in (1, 2):
            for _ in range(8 if compact else 12):
                x = r.uniform(0.0, 1.0)*W
                pine(d, x, hill_y(pts, x)+S*6, min(W, H)*r.uniform(0.05, 0.08), lerp(hexc(col), (20, 30, 60, 255), 0.35))
        if feat == "lavender" and k >= 1:
            dotc = hexc(["#8E6BE0", "#A786F0", "#6F4CCB"][k-1])
            for row in range(5):
                for x in range(0, W, int(W/(22 + k*6))):
                    yy = hill_y(pts, x) + H*0.012*(row+1)*(1+k*0.4)
                    if yy < H: d.ellipse([x-S*3*(1+k*0.4), yy-S*5*(1+k*0.4), x+S*3*(1+k*0.4), yy+S*2], fill=dotc)
        if feat == "canyon" and k >= 2:
            for _ in range(6):
                x = r.uniform(0, 1)*W; y = hill_y(pts, x) + H*r.uniform(0.02, 0.08)
                d.polygon([(x-S*10, y), (x, y-S*14), (x+S*12, y+S*2)], fill=lerp(hexc(col), (60, 30, 20, 255), 0.3))
    # flowers on the nearest hill
    if feat in ("meadow", "lake", "lavender"):
        pts = fronts[-1]
        for _ in range(40 if not compact else 22):
            x = r.uniform(0, 1)*W; y = hill_y(pts, x) + H*r.uniform(0.01, 0.12)
            if y < H:
                c = hexc(r.choice(["#FFFFFF", "#FFD166", "#FF8FB1", "#FFB4A2"]))
                for a in range(5):
                    blob(d, x+math.cos(a*1.26)*S*4, y+math.sin(a*1.26)*S*4, S*3.2, c)
                blob(d, x, y, S*2.4, hexc("#FFB703"))
    im = splats(im, seed+99, t["splat"], 4 if compact else 7, min(W, H)*0.015, min(W, H)*0.035, alpha=95)
    im = im.resize((w, h), Image.LANCZOS)
    # canvas weave so it reads as painted, not vector
    tex = CANVAS.resize((w, h)).convert("L")
    tex = ImageChops.subtract(Image.new("L", (w, h), 255), tex)
    tex = tex.point(lambda v: min(255, v*3))
    shade = Image.new("RGBA", (w, h), (60, 40, 30, 0)); shade.putalpha(tex.point(lambda v: int(v*0.16)))
    im = Image.alpha_composite(im, shade)
    return im

def soften(im, wash=0.28, col=(255, 252, 246)):
    over = Image.new("RGBA", im.size, col + (int(255*wash),))
    return Image.alpha_composite(im, over)

for i, t in enumerate(THEMES, 1):
    bg = scene(t, 1080, 1920, i*7)
    soften(bg, 0.22).convert("RGB").save(os.path.join(OUT, f"world_{i}.jpg"), quality=86)
    paint = scene(t, 720, 540, i*7+3, compact=True)
    paint.convert("RGB").save(os.path.join(OUT, f"painting_{i}.jpg"), quality=88)

# ---------------------------------- icons ---------------------------------
def icon(name, draw_fn, size=192):
    S = 4; W = size*S
    im = layer(W, W); d = ImageDraw.Draw(im)
    draw_fn(d, W)
    im.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"icon_{name}.png"))

WHITE = (255, 255, 255, 255)

def arc_arrow(d, W, start, end, head_at_end=True, width=0.13):
    c = W/2; r = W*0.3; lw = int(W*width)
    d.arc([c-r, c-r, c+r, c+r], start, end, fill=WHITE, width=lw)
    a = math.radians(end if head_at_end else start)
    px, py = c + r*math.cos(a), c + r*math.sin(a)
    tang = a + (math.pi/2 if head_at_end else -math.pi/2)
    hl = W*0.2
    tip = (px + math.cos(tang)*hl*0.75, py + math.sin(tang)*hl*0.75)
    nx, ny = math.cos(a), math.sin(a)
    d.polygon([tip, (px + nx*hl*0.62, py + ny*hl*0.62), (px - nx*hl*0.62, py - ny*hl*0.62)], fill=WHITE)

def undo(d, W):
    c = W/2; lw = int(W*0.13)
    d.arc([W*0.22, W*0.28, W*0.82, W*0.84], 200, 90, fill=WHITE, width=lw)  # hook
    d.line([(W*0.52, W*0.84 - lw/2), (W*0.34, W*0.84 - lw/2)], fill=WHITE, width=lw)
    # arrow head pointing left at the top
    d.polygon([(W*0.1, W*0.38), (W*0.36, W*0.18), (W*0.38, W*0.6)], fill=WHITE)
def reset(d, W): arc_arrow(d, W, -60, 250)
def bulb(d, W):
    c = W/2
    d.ellipse([W*0.24, W*0.1, W*0.76, W*0.62], fill=WHITE)
    d.polygon([(W*0.32, W*0.5), (W*0.68, W*0.5), (W*0.62, W*0.7), (W*0.38, W*0.7)], fill=WHITE)
    d.rounded_rectangle([W*0.36, W*0.72, W*0.64, W*0.8], radius=W*0.03, fill=WHITE)
    d.rounded_rectangle([W*0.39, W*0.83, W*0.61, W*0.9], radius=W*0.03, fill=WHITE)
    for a in (-150, -110, -70, -30):
        ar = math.radians(a)
        d.line([(c+math.cos(ar)*W*0.36, W*0.36+math.sin(ar)*W*0.36), (c+math.cos(ar)*W*0.46, W*0.36+math.sin(ar)*W*0.46)], fill=WHITE, width=int(W*0.06))
def gear(d, W):
    c = W/2
    for k in range(8):
        a = k*math.pi/4
        pts = []
        for da, rr in [(-0.2, 0.3), (-0.13, 0.46), (0.13, 0.46), (0.2, 0.3)]:
            pts.append((c+math.cos(a+da)*W*rr, c+math.sin(a+da)*W*rr))
        d.polygon(pts, fill=WHITE)
    blob(d, c, c, W*0.33, WHITE)
    blob(d, c, c, W*0.13, (0, 0, 0, 0))
def back(d, W):
    lw = int(W*0.15)
    d.line([(W*0.62, W*0.18), (W*0.3, W*0.5), (W*0.62, W*0.82)], fill=WHITE, width=lw, joint="curve")
    blob(d, W*0.62, W*0.18, lw/2, WHITE); blob(d, W*0.62, W*0.82, lw/2, WHITE); blob(d, W*0.3, W*0.5, lw/2, WHITE)
def lock(d, W):
    lw = int(W*0.11)
    d.arc([W*0.28, W*0.1, W*0.72, W*0.58], 180, 360, fill=WHITE, width=lw)
    d.line([(W*0.28+lw/2, W*0.34), (W*0.28+lw/2, W*0.48)], fill=WHITE, width=lw)
    d.line([(W*0.72-lw/2, W*0.34), (W*0.72-lw/2, W*0.48)], fill=WHITE, width=lw)
    d.rounded_rectangle([W*0.18, W*0.44, W*0.82, W*0.9], radius=W*0.09, fill=WHITE)
    blob(d, W*0.5, W*0.62, W*0.065, (0, 0, 0, 0))
    d.rectangle([W*0.475, W*0.62, W*0.525, W*0.76], fill=(0, 0, 0, 0))
def key(d, W):
    lw = int(W*0.12)
    blob(d, W*0.32, W*0.36, W*0.22, WHITE)
    blob(d, W*0.32, W*0.36, W*0.09, (0, 0, 0, 0))
    d.line([(W*0.44, W*0.48), (W*0.84, W*0.88)], fill=WHITE, width=lw)
    d.line([(W*0.66, W*0.7), (W*0.76, W*0.6)], fill=WHITE, width=lw)
    d.line([(W*0.76, W*0.8), (W*0.86, W*0.7)], fill=WHITE, width=lw)
def drop(d, W):
    d.polygon([(W*0.5, W*0.06), (W*0.2, W*0.55), (W*0.8, W*0.55)], fill=WHITE)
    blob(d, W*0.5, W*0.6, W*0.31, WHITE)
def calendar(d, W):
    d.rounded_rectangle([W*0.12, W*0.2, W*0.88, W*0.88], radius=W*0.12, fill=WHITE)
    d.rectangle([W*0.12, W*0.38, W*0.88, W*0.42], fill=(0, 0, 0, 0))
    for x in (0.32, 0.68): d.rounded_rectangle([W*(x-0.05), W*0.08, W*(x+0.05), W*0.3], radius=W*0.04, fill=WHITE)
    for k in range(3):
        for j in range(2):
            d.rounded_rectangle([W*(0.24+k*0.2), W*(0.5+j*0.16), W*(0.36+k*0.2), W*(0.6+j*0.16)], radius=W*0.02, fill=(0, 0, 0, 0))
def bag(d, W):
    lw = int(W*0.09)
    d.arc([W*0.32, W*0.1, W*0.68, W*0.5], 180, 360, fill=WHITE, width=lw)
    d.rounded_rectangle([W*0.16, W*0.3, W*0.84, W*0.9], radius=W*0.1, fill=WHITE)
def mapi(d, W):
    d.polygon([(W*0.1, W*0.22), (W*0.36, W*0.12), (W*0.64, W*0.24), (W*0.9, W*0.14), (W*0.9, W*0.8), (W*0.64, W*0.9), (W*0.36, W*0.78), (W*0.1, W*0.88)], fill=WHITE)
    d.line([(W*0.36, W*0.12), (W*0.36, W*0.78)], fill=(0, 0, 0, 0), width=int(W*0.04))
    d.line([(W*0.64, W*0.24), (W*0.64, W*0.9)], fill=(0, 0, 0, 0), width=int(W*0.04))

def gift(d, W):
    lw = int(W*0.08)
    # bow loops
    d.ellipse([W*0.2, W*0.08, W*0.5, W*0.34], outline=WHITE, width=lw)
    d.ellipse([W*0.5, W*0.08, W*0.8, W*0.34], outline=WHITE, width=lw)
    # lid + box with a ribbon gap
    d.rounded_rectangle([W*0.1, W*0.3, W*0.9, W*0.48], radius=W*0.05, fill=WHITE)
    d.rounded_rectangle([W*0.16, W*0.52, W*0.84, W*0.92], radius=W*0.07, fill=WHITE)
    d.rectangle([W*0.455, W*0.3, W*0.545, W*0.92], fill=(0, 0, 0, 0))
def helpq(d, W):
    lw = int(W*0.14)
    d.arc([W*0.24, W*0.06, W*0.76, W*0.58], 180, 400, fill=WHITE, width=lw)
    ex, ey = W*0.5 + W*0.26*math.cos(math.radians(40)) - lw*0.35, W*0.32 + W*0.26*math.sin(math.radians(40)) - lw*0.3
    d.line([(ex, ey), (W*0.5, W*0.58), (W*0.5, W*0.68)], fill=WHITE, width=lw, joint="curve")
    blob(d, ex, ey, lw/2, WHITE); blob(d, W*0.5, W*0.68, lw/2, WHITE)
    blob(d, W*0.5, W*0.85, W*0.085, WHITE)

for name, fn in [("gift", gift), ("help", helpq), ("undo", undo), ("reset", reset), ("hint", bulb), ("gear", gear), ("back", back), ("lock", lock),
                 ("key", key), ("drop", drop), ("daily", calendar), ("shop", bag), ("map", mapi)]:
    icon(name, fn)

def star(path, fill_top, fill_bot, edge, size=256):
    S = 4; W = size*S
    im = layer(W, W)
    pts = []
    for k in range(10):
        a = -math.pi/2 + k*math.pi/5
        rr = W*0.47 if k % 2 == 0 else W*0.22
        pts.append((W/2 + math.cos(a)*rr, W*0.53 + math.sin(a)*rr))
    mask = layer(W, W); ImageDraw.Draw(mask).polygon(pts, fill=WHITE)
    grad = vgrad(W, W, hexc(fill_top), hexc(fill_bot))
    edge_im = layer(W, W); ed = ImageDraw.Draw(edge_im)
    ed.polygon(pts, fill=hexc(edge)); ed.line(pts + [pts[0]], fill=hexc(edge), width=int(W*0.07), joint="curve")
    inner = mask.filter(ImageFilter.MinFilter(int(W*0.03)//2*2+1))
    im = Image.alpha_composite(im, edge_im)
    body = layer(W, W); body.paste(grad, (0, 0), inner.split()[3])
    im = Image.alpha_composite(im, body)
    gl = layer(W, W); gd = ImageDraw.Draw(gl)
    gd.ellipse([W*0.3, W*0.2, W*0.55, W*0.42], fill=(255, 255, 255, 120))
    gl = gl.filter(ImageFilter.GaussianBlur(W*0.02))
    gl.putalpha(ImageChops.multiply(gl.split()[3], inner.split()[3]))
    im = Image.alpha_composite(im, gl)
    im.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, path))

star("star_gold.png", "#FFE769", "#FFA41B", "#C2600E")
star("star_empty.png", "#D9DDEA", "#B3B9CC", "#8D93A8")

def sunburst(size=512):
    S = 2; W = size*S
    im = layer(W, W); d = ImageDraw.Draw(im); c = W/2
    for k in range(16):
        a = k*math.pi/8
        d.polygon([(c, c), (c+math.cos(a-0.09)*W, c+math.sin(a-0.09)*W), (c+math.cos(a+0.09)*W, c+math.sin(a+0.09)*W)], fill=(255, 240, 180, 170))
    rad = Image.radial_gradient("L").resize((W, W))
    alpha = ImageChops.multiply(im.split()[3], ImageChops.invert(rad))
    im.putalpha(alpha)
    im.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, "fx_sunburst.png"))
sunburst()
print("baked")
