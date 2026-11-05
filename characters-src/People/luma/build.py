"""Costruisce il pacchetto di Luma (mascotte-pack/1) e le sue anteprime.

    python3 characters-src/People/luma/build.py

scrive ROOT/characters/People/luma/{character.json,sprites.png}, aggiorna
preview.png qui accanto e mette in ROOT/work/previews/luma/ contact.png e
una GIF per stato. Da tools/build_all.py viene chiamata build(out_root,
preview_root). Serve solo Pillow.

Luma parte dai due disegni approvati (occhi aperti e chiusi, in source.png):
ogni posa nasce deformando quei pixel (respiro, testa, inclinazione, salti),
innestando bocche e sguardi disegnati da Codex (disegni/A5-espressioni/),
sostituendo il braccio sinistro con quello alzato delle sue pose di saluto
(disegni/B-waiting/) e aggiungendo effetti con lo stesso contorno scuro. Le pose uguali diventano
una sola cella del foglio.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, replace
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

# Ritagli dei due disegni in source.png (il secondo a x=949 conserva la
# correzione di allineamento approvata) e loro misura in pixel sorgente.
CROP_W, CROP_H = 480, 937
OPEN_X, CLOSED_X = 250, 949
# Spazio di lavoro in pixel sorgente: margini per salti ed effetti sopra e ai
# lati. Alla fine viene centrato in FRAMED e ridotto a 8/17, il fotogramma più
# grande ammesso (512 di altezza); con pixelRatio 7 Luma resta alta come prima.
# FRAMED è più largo della tela per il salto di celebrate, a braccia e gambe
# aperte, che si compone direttamente lì (_whole_frame).
CANVAS = (600, 1080)
OFFSET = (60, 138)
FRAMED = (680, 1088)
TILE = (320, 512)
COLS = 16   # 16 × 320 = 5120 px: con le pose sedute le righe restano ben sotto gli 8192 px

# Punti di riferimento nello spazio di lavoro.
FEET = (300, 1063)
NECK = (300, 538)
HEAD_TOP = (300, 174)
HAND_R = (478, 760)
HOLD = (300, 60)  # dove la si tiene mentre la trascini

INK = (48, 18, 14)
SKIN = (252, 207, 181)
CREAM = (255, 246, 222)
YELLOW = (250, 204, 72)
ORANGE = (236, 128, 52)
PINK = (240, 112, 128)
SKY = (132, 204, 240)
TEAL = (52, 112, 118)


def smooth(e0: float, e1: float, v: float) -> float:
    t = min(1.0, max(0.0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def rotate(x: float, y: float, cx: float, cy: float, deg: float) -> tuple[float, float]:
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    x, y = x - cx, y - cy
    return cx + x * c - y * s, cy + x * s + y * c


@dataclass(frozen=True)
class Pose:
    breath: float = 0.0   # 0..1 respiro (oltre 1 nel sonno)
    head: float = 0.0     # gradi, positivo verso destra di chi guarda
    head_dx: float = 0.0
    head_dy: float = 0.0
    lean: float = 0.0     # gradi attorno ai piedi, piedi fermi
    squash: float = 1.0   # <1 schiacciata, >1 allungata, ancorata ai piedi
    dx: float = 0.0
    dy: float = 0.0
    swing: float = 0.0    # pendolo attorno a HOLD, gambe che penzolano
    eyes: str = "open"    # open | closed | wink | half | uno sguardo di EXPRESSIONS
    mouth: str = ""       # "" (sorriso originale) | small | mid | open | worried | una bocca di EXPRESSIONS
    arm: str = ""          # braccio sinistro: "" | lift (si scosta) | wave0..wave2 (alzato, mano inclinata)
    arm_angle: float = 0.0  # gradi attorno alla spalla
    hand: str = ""         # braccio destro: "" | chin (mano al mento) | book0..book2 (le due braccia col libro) | pad0..pad2 (blocco e matita) | tool0..tool3 (meccanismo e chiave) | lens0..lens1 (lente) | cheeks0..cheeks1 (mani alle guance) | jump0..3, nap0, dangle0..2, ear0..1, jog0..3 (pose intere di Codex) | perch-<gambe>, sing0..2, seat-<stato>-<cella> (seduta sul bordo)
    fx: tuple = ()        # effetti disegnati sopra: tuple di tuple


# ---------------------------------------------------------------- disegni base

# Espressioni disegnate da Codex (disegni/A5-espressioni/): teste intere, di
# cui si innesta solo la bocca o solo gli occhi. Scala e spostamento portano
# la cella sul ritaglio originale; sono stati trovati confrontando pelle, naso
# e contorno attorno alla zona (work/previews/luma/espressioni/registra.py).
# nome: (foglio, riquadro della cella, zona, scala, dx, dy)
EXPRESSIONS = {
    "sorpresa": ("bocca-sorpresa-sguardo-sinistra-2-celle", (133, 55, 863, 887), "mouth", 0.5754, -6, -1),
    "sinistra": ("bocca-sorpresa-sguardo-sinistra-2-celle", (944, 54, 1675, 887), "eyes", 0.5673, -3, 1),
    "a": ("bocche-a-felice-2-celle", (126, 40, 873, 887), "mouth", 0.5609, -8, 4),
    "felice": ("bocche-a-felice-2-celle", (921, 40, 1665, 887), "mouth", 0.5447, -2, 14),
    "e": ("bocche-e-preoccupata-2-celle", (168, 56, 860, 851), "mouth", 0.6161, -7, -3),
    "preoccupata": ("bocche-e-preoccupata-2-celle", (992, 56, 1681, 851), "mouth", 0.6172, -5, -4),
    "sorriso": ("bocche-sorriso-o-2-celle", (124, 63, 843, 938), "mouth", 0.5754, -3, 5),
    "o": ("bocche-sorriso-o-2-celle", (878, 63, 1594, 938), "mouth", 0.5808, -3, 2),
    "assonnati": ("occhi-assonnati", (258, 51, 1183, 1086), "eyes", 0.4472, 0, 1),
    "sorpresi": ("occhi-sorpresi-preoccupati-2-celle", (254, 45, 914, 789), "eyes", 0.6175, -5, 7),
    "preoccupati": ("occhi-sorpresi-preoccupati-2-celle", (1075, 45, 1739, 789), "eyes", 0.6153, -4, 6),
    "destra": ("sguardi-destra-alto-2-celle", (86, 63, 827, 950), "eyes", 0.5486, -8, 7),
    "alto": ("sguardi-destra-alto-2-celle", (874, 63, 1605, 950), "eyes", 0.5516, -3, 6),
    # sguardo sul libro, dalle teste di B-reading: pagina sinistra, destra, giro
    "libro0": ("B-reading/reading-3-celle", (239, 8, 554, 709), "eyes", 1.3509, -7, -12),
    "libro1": ("B-reading/reading-3-celle", (925, 8, 1240, 709), "eyes", 1.3385, -5, -10),
    "libro2": ("B-reading/reading-3-celle", (1577, 9, 1895, 709), "eyes", 1.3289, -9, -3),
    # sguardo sul blocco, dalla prima posa di B-writing (nelle altre il sopracciglio non combacia)
    "blocco": ("B-writing/writing-3-celle-v3", (203, 22, 519, 709), "eyes", 1.3554, -6, -29),
}
# nomi brevi usati negli stati, distinti per occhi e bocca ("open" vale per entrambi)
EYE_ALIASES = {"half": "assonnati"}
MOUTH_ALIASES = {"small": "o", "mid": "a", "open": "felice", "worried": "preoccupata"}
# zone nel ritaglio 480 × 937, con il loro bordo sfumato
ZONES = {"mouth": ("ellipse", (176, 314, 258, 360)), "eyes": ("round", (112, 196, 324, 308))}

_CACHE: dict = {}


def _crops() -> tuple[Image.Image, Image.Image]:
    if "crops" not in _CACHE:
        sheet = Image.open(HERE / "source.png").convert("RGBA")
        if sheet.size != (1678, 937) or sheet.getpixel((0, 0))[3] != 0:
            raise ValueError("source.png deve essere il foglio trasparente 1678 × 937")
        opened = sheet.crop((OPEN_X, 0, OPEN_X + CROP_W, CROP_H))
        closed = sheet.crop((CLOSED_X, 0, CLOSED_X + CROP_W, CROP_H))
        # Solo gli occhi chiusi vengono innestati sul disegno aperto: i due disegni
        # differiscono di poco anche nei contorni e lo scambio intero tremolava.
        mask = Image.new("L", (CROP_W, CROP_H), 0)
        ImageDraw.Draw(mask).rounded_rectangle((116, 229, 320, 306), radius=30, fill=255)
        _CACHE["crops"] = (opened, Image.composite(closed, opened, mask.filter(ImageFilter.GaussianBlur(6))))
    return _CACHE["crops"]


def _zone_mask(zone: str) -> Image.Image:
    shape, box = ZONES[zone]
    m = Image.new("L", (CROP_W, CROP_H), 0)
    d = ImageDraw.Draw(m)
    if shape == "ellipse":
        d.ellipse(box, fill=255)
    else:
        d.rounded_rectangle(box, radius=34, fill=255)
    return m.filter(ImageFilter.GaussianBlur(5))


def _expression(name: str) -> tuple[Image.Image, Image.Image]:
    """La cella di Codex portata sul ritaglio originale, con il tono della pelle
    pareggiato sul bordo della zona, e la maschera con cui innestarla."""
    key = ("expr", name)
    if key in _CACHE:
        return _CACHE[key]
    sheet, box, zone, scale, dx, dy = EXPRESSIONS[name]
    folder = "" if "/" in sheet else "A5-espressioni/"   # gli occhi sul libro vengono da B-reading
    cell = Image.open(HERE / "disegni" / f"{folder}{sheet}-trasparente.png").convert("RGBA").crop(box)
    small = cell.convert("RGBa").resize((round(cell.width * scale), round(cell.height * scale)), Image.LANCZOS).convert("RGBA")
    patch = Image.new("RGBA", (CROP_W, CROP_H), (0, 0, 0, 0))
    patch.alpha_composite(small, (34 + dx, 36 + dy))  # 34, 36: angolo della figura nel ritaglio
    mask = _zone_mask(zone)
    inner = mask.point(lambda v: 255 if v > 10 else 0)
    ring = ImageChops.subtract(inner.filter(ImageFilter.MaxFilter(15)), inner).load()
    src, pp = _crops()[0].load(), patch.load()
    skin = lambda c: c[3] > 250 and c[0] > 225 and 165 < c[1] < 225
    a, b = [0.0] * 3, [0.0] * 3
    for y in range(180, 380):
        for x in range(90, 360):
            if ring[x, y] and skin(src[x, y]) and skin(pp[x, y]):
                for i in range(3):
                    a[i] += src[x, y][i]
                    b[i] += pp[x, y][i]
    gain = [a[i] / b[i] if b[i] else 1.0 for i in range(3)]
    bands = [band.point(lambda v, g=g: min(255, round(v * g))) for band, g in zip(patch.split()[:3], gain)]
    patch = Image.merge("RGBA", bands + [patch.getchannel("A")])
    _CACHE[key] = (patch, ImageChops.multiply(mask, patch.getchannel("A")))
    return _CACHE[key]


def _face(eyes: str, mouth: str) -> Image.Image:
    """Il ritaglio con gli occhi e la bocca richiesti, già nello spazio di lavoro."""
    key = ("face", eyes, mouth)
    if key not in _CACHE:
        opened, shut = _crops()
        img = (shut if eyes == "closed" else opened).copy()
        if eyes == "wink":   # solo l'occhio destro (per chi guarda) chiuso
            m = Image.new("L", opened.size, 0)
            ImageDraw.Draw(m).rounded_rectangle((214, 229, 320, 306), radius=26, fill=255)
            img = Image.composite(shut, opened, m.filter(ImageFilter.GaussianBlur(5)))
        for name in (EYE_ALIASES.get(eyes, eyes), MOUTH_ALIASES.get(mouth, mouth)):
            if name in EXPRESSIONS:
                patch, mask = _expression(name)
                img.paste(patch, (0, 0), mask)
            elif name not in ("", "open", "closed", "wink"):
                raise ValueError(f"espressione sconosciuta: {name}")
        canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        canvas.paste(img, OFFSET)
        _CACHE[key] = canvas
    return _CACHE[key]


# ---------------------------------------------------------------- braccio che saluta

# Taglio che separa il braccio sinistro di Luma (a destra per chi guarda) dal
# busto: punti (y, x) nel ritaglio 480 × 937, interpolati riga per riga.
ARM_CUT = ((400, 340), (430, 346), (470, 334), (520, 334), (560, 344), (600, 362), (640, 368), (720, 368))
SHOULDER_PIVOT = (366, 452)
# Spalla e fianco ridipinti da Codex per un braccio staccato (disegni/A1-corpo/):
# combaciano con l'originale spostati di 1 px e coprono il moncone.
SHOULDER_ZONE = ((326, 384), (392, 378), (452, 420), (470, 520), (450, 600), (420, 660), (330, 660),
                 (296, 600), (296, 520), (318, 470))
# Braccio alzato dalle pose disegnate da Codex (disegni/B-waiting/), una per
# inclinazione della mano. Le figure intere sono ridisegnate più grandi, quindi
# se ne prende solo braccio e spalla, registrati su colletto, bretella e fianco
# originali: riquadro della cella, scala e posizione nel ritaglio.
WAVE_CELLS = (((240, 17, 568, 705), 1.237, 43, 58),
              ((904, 17, 1230, 705), 1.2597, 38, 48),
              ((1560, 17, 1910, 705), 1.2629, 37, 48))
WAVE_ZONE = ((300, 372), (360, 330), (420, 250), (470, 200), (560, 200), (600, 300), (560, 420), (470, 540),
             (380, 575), (338, 560), (318, 470), (300, 410))
CUFF_Y = 388        # sopra questa riga del ritaglio, nelle pose di Codex, c'è solo la mano
PALM = (395, 362)   # centro del palmo, da cui si riempie la mano


def _canvas(points) -> list[tuple[int, int]]:
    return [(x + OFFSET[0], y + OFFSET[1]) for x, y in points]


def _cut_x(y: float) -> float:
    for (y0, x0), (y1, x1) in zip(ARM_CUT, ARM_CUT[1:]):
        if y0 <= y <= y1:
            return x0 + (x1 - x0) * (y - y0) / (y1 - y0)
    raise ValueError(y)


def _masked(img: Image.Image, mask: Image.Image) -> Image.Image:
    out = img.copy()
    out.putalpha(ImageChops.multiply(img.getchannel("A"), mask))
    return out


def _pivot() -> tuple[int, int]:
    return SHOULDER_PIVOT[0] + OFFSET[0], SHOULDER_PIVOT[1] + OFFSET[1]


def _arm_mask(img: Image.Image) -> Image.Image:
    ox, oy = OFFSET
    m = Image.new("L", img.size, 0)
    px, a = m.load(), img.getchannel("A").load()
    for y in range(400, 720):
        for x in range(int(_cut_x(y)) + ox, img.size[0]):
            if a[x, y + oy] > 0:
                px[x, y + oy] = 255
    return m.filter(ImageFilter.GaussianBlur(0.8))


def _body(eyes: str, mouth: str, codex: bool) -> tuple[Image.Image, Image.Image]:
    """Busto senza il braccio sinistro e figura intera, con l'espressione data."""
    key = ("body", eyes, mouth, codex)
    if key in _CACHE:
        return _CACHE[key]
    ox, oy = OFFSET
    whole = _face(eyes, mouth)
    body = _masked(whole, ImageChops.invert(_arm_mask(whole)))
    zone = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(zone).polygon(_canvas(SHOULDER_ZONE), fill=255)
    zone = zone.filter(ImageFilter.GaussianBlur(5))
    if codex:
        body = Image.composite(_armless(eyes), body, zone)
    # contorno lungo il taglio, fuori dalla zona già ridipinta
    ink = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(ink).line([(_cut_x(y) + ox, y + oy) for y in range(418, 700, 4)
                              if whole.getpixel((int(_cut_x(y) + ox) - 3, y + oy))[3] > 200],
                             fill=255, width=6, joint="curve")
    keep = body.getchannel("A").point(lambda v: 255 if v else 0).filter(ImageFilter.MaxFilter(9))
    if codex:
        keep = ImageChops.multiply(keep, ImageChops.invert(zone))
    line = Image.new("RGBA", CANVAS, INK + (0,))
    line.putalpha(ImageChops.multiply(ink, keep))
    body.alpha_composite(line)
    _CACHE[key] = (body, whole)
    return _CACHE[key]


def _wave_arm(cell: int) -> Image.Image:
    """Braccio e spalla di una posa B-waiting, già al loro posto sulla tela."""
    key = ("wave", cell)
    if key in _CACHE:
        return _CACHE[key]
    ox, oy = OFFSET
    W, H = CANVAS
    box, scale, x, y = WAVE_CELLS[cell]
    sheet = Image.open(HERE / "disegni" / "B-waiting" / "waiting-3-celle-trasparente.png").convert("RGBA")
    c = sheet.crop(box)
    small = c.convert("RGBa").resize((round(c.width * scale), round(c.height * scale)), Image.LANCZOS).convert("RGBA")
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layer.alpha_composite(small, (ox + x, oy + y))
    m = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(m).polygon(_canvas(WAVE_ZONE), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(6))
    # Sopra il polsino tieni solo la mano: l'area chiusa dal suo contorno che
    # contiene il centro del palmo, più il contorno stesso. Così restano fuori i
    # capelli della posa di Codex che si vedono fra le dita.
    lp = layer.load()
    inside = Image.new("L", CANVAS, 0)
    ip = inside.load()
    for yy in range(oy + 120, oy + CUFF_Y + 30):
        for xx in range(ox + 280, min(W, ox + 640)):
            r, g, b, a = lp[xx, yy]
            if a > 40 and (r + g + b) / 3 > 95:
                ip[xx, yy] = 255
    cx, cy = ox + PALM[0], oy + PALM[1]
    seed = min(((xx, yy) for yy in range(cy - 30, cy + 31) for xx in range(cx - 30, cx + 31)
                if ip[xx, yy] and lp[xx, yy][1] > 170), key=lambda q: (q[0] - cx) ** 2 + (q[1] - cy) ** 2)
    ImageDraw.floodfill(inside, seed, 128)
    hand = inside.point(lambda v: 255 if v == 128 else 0)
    dark = layer.convert("L").point(lambda v: 255 if v <= 95 else 0)
    hand = ImageChops.lighter(hand, ImageChops.multiply(hand.filter(ImageFilter.MaxFilter(9)), dark))
    top = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(top).rectangle((0, 0, W, oy + CUFF_Y), fill=255)
    top = top.filter(ImageFilter.GaussianBlur(2))
    m = ImageChops.add(ImageChops.multiply(m, ImageChops.invert(top)),
                       ImageChops.multiply(hand.filter(ImageFilter.GaussianBlur(0.7)), top))
    _CACHE[key] = _masked(layer, m)
    return _CACHE[key]


def _lift_parts(eyes: str, mouth: str) -> tuple[Image.Image, Image.Image]:
    """Busto e braccio sinistro interi per il braccio che si scosta. Il braccio è
    ritagliato lungo la sua linea interna (LIFT_ARM), contorno compreso, così si
    muove tutto; sotto, il corpo senza braccia di A1 ridipinge la giacca."""
    key = ("lift", eyes, mouth)
    if key in _CACHE:
        return _CACHE[key]
    whole = _face(eyes, mouth)
    body = Image.composite(_armless(eyes), whole, _zone(BOOK_FLANKS[1], 3))
    arm = _masked(whole, _zone(LIFT_ARM, 0.8))
    # Sopra il borsello manica e giacca sono dipinte senza una linea fra loro: il
    # lato verso il busto prende un contorno come quello esterno, che sfuma verso
    # la spalla, dove il braccio resta attaccato.
    ox, oy = OFFSET
    W, H = CANVAS
    ss = 3
    line = Image.new("L", (W * ss, H * ss), 0)
    pts = [((x + ox + 2) * ss, (y + oy) * ss) for x, y in LIFT_ARM[LIFT_EDGE[0]:LIFT_EDGE[1]]]
    ImageDraw.Draw(line).line(pts, fill=255, width=6 * ss, joint="curve")
    line = line.resize(CANVAS, Image.LANCZOS)
    fade = Image.new("L", CANVAS, 0)
    fd = ImageDraw.Draw(fade)
    for yy in range(H):
        fd.line((0, yy, W, yy), fill=round(255 * smooth(oy + 430, oy + 480, yy)))
    ink = Image.new("RGBA", CANVAS, INK + (0,))
    ink.putalpha(ImageChops.multiply(ImageChops.multiply(line, fade), arm.getchannel("A")))
    arm.alpha_composite(ink)
    _CACHE[key] = (body, arm)
    return _CACHE[key]


# braccio sinistro nel ritaglio: in alto la spalla, a sinistra 3 px oltre la linea
# scura interna della manica (misurata riga per riga), così il contorno resta
# tutto col braccio; poi fra borsello e mano fino in fondo
LIFT_ARM = ((300, 380), (480, 380), (480, 724), (379, 724), (378, 644), (373, 624), (352, 611), (334, 602), (322, 592),
            (319, 576), (318, 560), (316, 544), (309, 528), (306, 504), (300, 484), (294, 468), (299, 456),
            (302, 440), (306, 428), (312, 418), (306, 400))
LIFT_EDGE = (7, 21)   # tratto di LIFT_ARM lungo il busto, dal borsello alla spalla


def _with_arm(p: Pose) -> Image.Image:
    """La figura col braccio sinistro nella posa data, prima della deformazione."""
    px, py = _pivot()
    if p.arm == "lift":
        # Braccio originale che si scosta dal fianco piegandosi: fermo alla spalla,
        # sempre più ruotato verso la mano, così l'attacco resta quello disegnato.
        body, arm = _lift_parts(p.eyes, p.mouth)
        ox, oy = OFFSET
        W = CANVAS[0]

        def f(x, y):
            return rotate(x, y, px, py, -p.arm_angle * smooth(py - 20, py + 110, y))
        step = 6
        mesh = []
        for y in range(oy + 380, oy + 720, step):
            for x in range(ox + 300, W, step):
                x1, y1 = min(x + step, W), y + step
                mesh.append(((x, y, x1, y1), (*f(x, y), *f(x, y1), *f(x1, y1), *f(x1, y))))
        arm = arm.convert("RGBa").transform(CANVAS, Image.MESH, mesh, Image.BICUBIC).convert("RGBA")
    else:
        body, _ = _body(p.eyes, p.mouth, codex=True)
        arm = _wave_arm(int(p.arm[-1]))
        if p.arm_angle:
            arm = arm.rotate(-p.arm_angle, center=(px, py), resample=Image.BICUBIC)
    img = body.copy()
    img.alpha_composite(arm)
    return img


# Mano al mento (thinking): braccio destro, a sinistra di chi guarda, preso da
# B-thinking. Quella posa combacia con l'originale scalata di poco, quindi il
# braccio entra al suo posto senza ruotarlo; dove pendeva il braccio originale
# si usa il corpo senza braccia di A1, che dipinge fianco e pantaloncini.
CHIN_CELL = ((292, 23, 684, 867), 1.0372, 47, 54)   # riquadro, scala, posizione nel ritaglio
CHIN_FLANK = ((30, 400), (120, 380), (200, 392), (204, 470), (200, 560), (190, 720), (20, 720))
CHIN_ZONE = ((142, 366), (170, 350), (206, 350), (230, 370), (228, 414), (210, 444), (206, 480), (202, 526),
             (188, 560), (150, 576), (100, 574), (60, 552), (48, 500), (70, 456), (110, 432), (132, 416))
CHIN_HAND = (180, 425)   # centro della mano


def _chin_arm() -> Image.Image:
    """Manica, polsino e mano di B-thinking col loro contorno, al loro posto sulla tela."""
    if "chin" in _CACHE:
        return _CACHE["chin"]
    ox, oy = OFFSET
    box, scale, x, y = CHIN_CELL
    c = Image.open(HERE / "disegni" / "B-thinking" / "thinking-2-celle-trasparente.png").convert("RGBA").crop(box)
    small = c.convert("RGBa").resize((round(c.width * scale), round(c.height * scale)), Image.LANCZOS).convert("RGBA")
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layer.alpha_composite(small, (ox + x, oy + y))
    zone = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(zone).polygon(_canvas(CHIN_ZONE), fill=255)
    # Le aree chiare chiuse dal contorno che contengono la mano o un pixel senape
    # della manica (i capelli sono più rossi), più il contorno attorno: restano
    # fuori i capelli e il mento della posa di Codex.
    lp = layer.load()
    inside = Image.new("L", CANVAS, 0)
    ip = inside.load()
    for yy in range(oy + 330, oy + 600):
        for xx in range(ox + 30, ox + 250):
            r, g, b, a = lp[xx, yy]
            if a > 40 and (r + g + b) / 3 > 95:
                ip[xx, yy] = 255
    inside = ImageChops.multiply(inside, zone)
    ip = inside.load()
    seeds = [(ox + CHIN_HAND[0], oy + CHIN_HAND[1])]
    seeds += [(xx, yy) for yy in range(oy + 400, oy + 590, 3) for xx in range(ox + 40, ox + 240, 3)
              if ip[xx, yy] == 255 and lp[xx, yy][0] > 200 and 140 < lp[xx, yy][1] < 195 and lp[xx, yy][2] < 100]
    for q in seeds:
        if ip[q] == 255:
            ImageDraw.floodfill(inside, q, 128)
    fill = inside.point(lambda v: 255 if v == 128 else 0)
    dark = layer.convert("L").point(lambda v: 255 if v <= 95 else 0)
    ring = ImageChops.multiply(ImageChops.multiply(fill.filter(ImageFilter.MaxFilter(11)), dark), zone)
    m = ImageChops.lighter(fill, ring).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    _CACHE["chin"] = _masked(layer, m)
    return _CACHE["chin"]


def _armless(eyes: str) -> Image.Image:
    """Il corpo senza braccia di A1 sulla tela, con gli occhi aperti o chiusi."""
    key = ("armless", eyes == "closed")
    if key not in _CACHE:
        sheet = Image.open(HERE / "disegni" / "A1-corpo" / "corpo-senza-braccia-trasparente.png").convert("RGBA")
        x0 = CLOSED_X if eyes == "closed" else OPEN_X
        _CACHE[key] = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        _CACHE[key].paste(sheet.crop((x0, 0, x0 + CROP_W, CROP_H)), (OFFSET[0] + 1, OFFSET[1]))
    return _CACHE[key]


def _zone(points, blur: float = 0) -> Image.Image:
    m = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(m).polygon(_canvas(points), fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


def _with_chin(img: Image.Image, eyes: str) -> Image.Image:
    img = Image.composite(_armless(eyes), img, _zone(CHIN_FLANK, 3))
    img.alpha_composite(_chin_arm())
    return img


# Libro (reading): braccia, mani e libro di B-reading, registrati su colletto e
# cintura (le figure intere hanno la testa più grande). La cella del giro di
# pagina è allineata invece sul libro delle altre due e ruotata di 2,5°, così il
# libro non salta; di lei si tengono sopra le pagine solo la mano e la pagina
# alzata, senza la scia sfumata disegnata da Codex.
BOOK_CELLS = (((239, 8, 554, 709), 1.2263, 36, 60, 0.0),
              ((925, 8, 1240, 709), 1.2394, 32, 55, 0.0),
              ((1577, 9, 1895, 709), 1.2296, 18, 41, -2.5))
BOOK_FLANKS = (CHIN_FLANK, ((460, 400), (360, 380), (282, 392), (276, 470), (282, 560), (292, 720), (470, 720)))
BOOK_SLEEVES = ((60, 392), (150, 380), (330, 380), (430, 392), (440, 500), (430, 600), (60, 600), (50, 500))
BOOK_SHAPE = ((112, 400), (350, 396), (352, 540), (110, 544))
TURN_HAND = ((60, 380), (150, 380), (172, 410), (150, 440), (60, 446))
TURN_PAGE = ((146, 384), (162, 387), (176, 397), (186, 413), (194, 433), (200, 452), (176, 438), (160, 421), (150, 402))
TURN_EDGE = TURN_PAGE[:6]   # bordo alto e destro della pagina, senza contorno nel disegno
TURN_ABOVE = ((40, 330), (440, 330), (440, 412), (330, 416), (260, 428), (200, 444), (150, 424), (100, 420), (40, 420))


def _book_arms(cell: int) -> Image.Image:
    key = ("book", cell)
    if key in _CACHE:
        return _CACHE[key]
    ox, oy = OFFSET
    box, scale, x, y, rot = BOOK_CELLS[cell]
    c = Image.open(HERE / "disegni" / "B-reading" / "reading-3-celle-trasparente.png").convert("RGBA").crop(box)
    small = c.convert("RGBa").resize((round(c.width * scale), round(c.height * scale)), Image.LANCZOS)
    if rot:
        small = small.rotate(rot, resample=Image.BICUBIC, center=(small.width * 0.45, small.height * 0.62))
    layer = Image.new("RGBa", CANVAS, (0, 0, 0, 0))
    layer.paste(small, (ox + x, oy + y), small)
    layer = layer.convert("RGBA")
    zone = _zone(BOOK_SLEEVES)
    # come per la mano al mento: aree chiare chiuse dal contorno con un seme di
    # manica o di pelle, più il libro intero e il contorno attorno
    lp = layer.load()
    inside = Image.new("L", CANVAS, 0)
    ip = inside.load()
    for yy in range(oy + 370, oy + 610):
        for xx in range(ox + 40, ox + 450):
            r, g, b, a = lp[xx, yy]
            if a > 40 and (r + g + b) / 3 > 95:
                ip[xx, yy] = 255
    inside = ImageChops.multiply(inside, zone)
    ip = inside.load()
    for yy in range(oy + 390, oy + 600, 3):
        for xx in range(ox + 50, ox + 440, 3):
            r, g, b, a = lp[xx, yy]
            if ip[xx, yy] == 255 and ((r > 200 and 140 < g < 195 and b < 100) or (r > 215 and g > 165 and 135 < b < 200)):
                ImageDraw.floodfill(inside, (xx, yy), 128)
    filled = inside.point(lambda v: 255 if v == 128 else 0)
    fill = ImageChops.lighter(filled, _zone(BOOK_SHAPE))
    if cell == 2:
        above = _zone(TURN_ABOVE)
        white = layer.convert("L").point(lambda v: 255 if v > 236 else 0)
        hand = ImageChops.multiply(ImageChops.multiply(_zone(TURN_HAND), filled), ImageChops.invert(white))
        keep = ImageChops.lighter(hand, _zone(TURN_PAGE))
        fill = ImageChops.lighter(ImageChops.multiply(fill, ImageChops.invert(above)), ImageChops.multiply(keep, above))
    dark = layer.convert("L").point(lambda v: 255 if v <= 95 else 0)
    ring = ImageChops.multiply(ImageChops.multiply(fill.filter(ImageFilter.MaxFilter(11)), dark), zone)
    m = ImageChops.lighter(fill, ring).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    # niente alone bianco dello scontorno (le pagine sono crema, non bianche)
    white = Image.merge("RGB", layer.split()[:3]).convert("L").point(lambda v: 255 if v > 244 else 0)
    grey = ImageChops.subtract(layer.getchannel("R"), layer.getchannel("B")).point(lambda v: 255 if v < 16 else 0)
    halo = ImageChops.multiply(ImageChops.multiply(white, grey),
                               ImageChops.invert(ImageChops.lighter(_zone(BOOK_SHAPE), _zone(TURN_PAGE))))
    m = ImageChops.multiply(m, ImageChops.invert(halo))
    if cell == 2:
        m = ImageChops.multiply(m, ImageChops.invert(ImageChops.multiply(
            _zone(TURN_ABOVE), ImageChops.invert(keep.filter(ImageFilter.MaxFilter(7))))))
    out = _masked(layer, m)
    if cell == 2:
        W, H = CANVAS
        line = Image.new("L", (W * 3, H * 3), 0)
        ImageDraw.Draw(line).line([((px + ox) * 3, (py + oy) * 3) for px, py in TURN_EDGE], fill=255, width=10, joint="curve")
        ink = Image.new("RGBA", CANVAS, INK + (0,))
        ink.putalpha(line.resize(CANVAS, Image.LANCZOS))
        out.alpha_composite(ink)
    _CACHE[key] = out
    return out


# Blocco (writing): braccia, blocco e matita di B-writing. La prima posa è
# registrata su colletto, cintura e gambe, le altre sul blocco della prima, così
# il blocco resta fermo e si muove la mano con la matita. Viso, collo e colletto
# di Codex restano fuori: sopra il colletto passa solo la matita, in cima al
# blocco solo la spirale.
PAD_CELLS = (((203, 22, 519, 709), 1.3163, 33, 27, 0.0),
             ((927, 22, 1243, 709), 1.3359, 27, 16, -2.0),
             ((1651, 22, 1967, 709), 1.3031, 36, 30, -1.0))
PAD_SLEEVES = ((50, 392), (140, 350), (240, 350), (330, 380), (430, 392), (440, 500), (430, 600), (60, 600), (44, 500))
PAD_SHAPE = ((195, 400), (336, 396), (340, 550), (148, 554), (150, 470))
PAD_TOP = 424      # sopra questa riga del blocco restano solo gli anelli della spirale
PAD_NECK = ((140, 320), (330, 320), (330, 422), (240, 422), (215, 401), (150, 399))
PAD_COLLAR = 398   # la pelle sotto questa riga è delle mani, sopra è il mento di Codex
PENCILS = (((140, 362), (163, 360), (234, 450), (222, 464), (138, 384)),
           ((145, 381), (174, 381), (227, 455), (212, 467), (145, 407)),
           ((135, 416), (164, 414), (187, 470), (148, 470)))


def _pad_arms(cell: int) -> Image.Image:
    key = ("pad", cell)
    if key in _CACHE:
        return _CACHE[key]
    ox, oy = OFFSET
    box, scale, x, y, rot = PAD_CELLS[cell]
    c = Image.open(HERE / "disegni" / "B-writing" / "writing-3-celle-v3-trasparente.png").convert("RGBA").crop(box)
    small = c.convert("RGBa").resize((round(c.width * scale), round(c.height * scale)), Image.LANCZOS)
    if rot:
        small = small.rotate(rot, resample=Image.BICUBIC, center=(small.width * 0.45, small.height * 0.55))
    layer = Image.new("RGBa", CANVAS, (0, 0, 0, 0))
    layer.paste(small, (ox + x, oy + y), small)
    layer = layer.convert("RGBA")
    zone = _zone(PAD_SLEEVES)
    lp = layer.load()
    inside = Image.new("L", CANVAS, 0)
    ip = inside.load()
    for yy in range(oy + 340, oy + 610):
        for xx in range(ox + 40, ox + 450):
            r, g, b, a = lp[xx, yy]
            if a > 40 and (r + g + b) / 3 > 95:
                ip[xx, yy] = 255
    inside = ImageChops.multiply(inside, zone)
    ip = inside.load()
    for yy in range(oy + 350, oy + 600, 3):
        for xx in range(ox + 50, ox + 440, 3):
            r, g, b, a = lp[xx, yy]
            pencil = (r > 230 and g > 170 and b < 120) or (r > 220 and g < 170 and b > 130)
            body = (r > 200 and 140 < g < 195 and b < 100) or (r > 215 and g > 165 and 135 < b < 200)
            if ip[xx, yy] == 255 and (pencil or (body and yy > oy + PAD_COLLAR)):
                ImageDraw.floodfill(inside, (xx, yy), 128)
    filled = inside.point(lambda v: 255 if v == 128 else 0)
    neck = _zone(PAD_NECK)
    pen = ImageChops.multiply(_zone(PENCILS[cell]), layer.getchannel("A").point(lambda v: 255 if v > 40 else 0))
    filled = ImageChops.lighter(ImageChops.multiply(filled, ImageChops.invert(neck)), ImageChops.multiply(pen, neck))
    band = ImageChops.multiply(_zone(PAD_SHAPE), _zone(((100, 380), (360, 380), (360, PAD_TOP), (100, PAD_TOP))))
    rings = ImageChops.multiply(band, layer.getchannel("B").point(lambda v: 255 if v < 140 else 0)).filter(ImageFilter.MaxFilter(3))
    fill = ImageChops.lighter(filled, ImageChops.lighter(ImageChops.multiply(_zone(PAD_SHAPE), ImageChops.invert(band)), rings))
    dark = layer.convert("L").point(lambda v: 255 if v <= 95 else 0)
    ring = ImageChops.multiply(ImageChops.multiply(fill.filter(ImageFilter.MaxFilter(11)), dark), zone)
    ring = ImageChops.multiply(ring, ImageChops.invert(ImageChops.multiply(neck, ImageChops.invert(pen.filter(ImageFilter.MaxFilter(3))))))
    m = ImageChops.lighter(fill, ring).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    white = Image.merge("RGB", layer.split()[:3]).convert("L").point(lambda v: 255 if v > 244 else 0)
    grey = ImageChops.subtract(layer.getchannel("R"), layer.getchannel("B")).point(lambda v: 255 if v < 16 else 0)
    m = ImageChops.multiply(m, ImageChops.invert(ImageChops.multiply(ImageChops.multiply(white, grey), ImageChops.invert(_zone(PAD_SHAPE)))))
    _CACHE[key] = _masked(layer, m)
    return _CACHE[key]


# Chiave (working): braccia, meccanismo e chiave di B-working. La prima posa è
# registrata su colletto, cintura e gambe, le altre sulla parte bassa del
# meccanismo, così gira solo la chiave. Restano originali colletto e pettorina
# (TOOL_NECK), il ricciolo davanti alla spalla (TOOL_CURL), la cima della spalla
# (TOOL_SHOULDER) e il borsello (via il cacciavite di Codex, TOOL_SCREWDRIVER).
TOOL_CELLS = (((123, 21, 451, 708), 1.2513, 38, 68), ((664, 21, 993, 708), 1.2699, 31, 59),
              ((1217, 21, 1536, 708), 1.2263, 51, 78), ((1768, 21, 2079, 708), 1.2324, 59, 75))
TOOL_SLEEVES = ((20, 380), (110, 336), (186, 346), (240, 380), (330, 380), (430, 392), (440, 500), (430, 600), (30, 600), (20, 500))
TOOL_GADGET = ((150, 468), (296, 462), (300, 578), (150, 582))
TOOL_NECK = ((190, 320), (300, 320), (300, 466), (190, 466))
TOOL_CURL = ((20, 320), (200, 320), (200, 400), (160, 410), (140, 446), (20, 446))
TOOL_SHOULDER = ((140, 432), (150, 425), (160, 416), (170, 408), (180, 399), (190, 391), (206, 384))
TOOL_GAP = ((112, 448), (126, 441), (140, 433), (152, 425), (156, 450))   # fra ricciolo e spalla
TOOL_SCREWDRIVER = ((334, 576), (374, 570), (374, 608), (332, 608))
TOOL_FLANK = ((20, 452), (120, 448), (200, 446), (204, 470), (200, 560), (190, 720), (20, 720))
TOOL_COLLAR = 398   # i semi del riempimento partono sotto il colletto


def _is_skin(r: int, g: int, b: int) -> bool:
    return r > 215 and g > 165 and 135 < b < 200


def _tool_arms(cell: int) -> Image.Image:
    key = ("tool", cell)
    if key in _CACHE:
        return _CACHE[key]
    ox, oy = OFFSET
    box, scale, x, y = TOOL_CELLS[cell]
    c = Image.open(HERE / "disegni" / "B-working" / "working-4-celle-trasparente.png").convert("RGBA").crop(box)
    small = c.convert("RGBa").resize((round(c.width * scale), round(c.height * scale)), Image.LANCZOS).convert("RGBA")
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layer.alpha_composite(small, (ox + x, oy + y))
    zone = _zone(TOOL_SLEEVES)
    neck = _zone(TOOL_NECK)
    lp = layer.load()
    inside = Image.new("L", CANVAS, 0)
    ip = inside.load()
    for yy in range(oy + 340, oy + 610):
        for xx in range(ox + 20, ox + 450):
            r, g, b, a = lp[xx, yy]
            if a > 40 and (r + g + b) / 3 > 95:
                ip[xx, yy] = 255
    inside = ImageChops.multiply(inside, zone)
    ip = inside.load()
    for yy in range(oy + TOOL_COLLAR + 2, oy + 600, 3):
        for xx in range(ox + 30, ox + 440, 3):
            r, g, b, a = lp[xx, yy]
            steel = max(r, g, b) - min(r, g, b) < 24 and 110 < (r + g + b) / 3 < 235
            sleeve = r > 200 and 140 < g < 195 and b < 100
            if ip[xx, yy] == 255 and (steel or sleeve or _is_skin(r, g, b)):
                ImageDraw.floodfill(inside, (xx, yy), 128)
    filled = ImageChops.multiply(inside.point(lambda v: 255 if v == 128 else 0), ImageChops.invert(neck))
    fill = ImageChops.lighter(filled, _zone(TOOL_GADGET))
    dark = layer.convert("L").point(lambda v: 255 if v <= 95 else 0)
    ring = ImageChops.multiply(ImageChops.multiply(fill.filter(ImageFilter.MaxFilter(11)), dark),
                               ImageChops.multiply(zone, ImageChops.invert(neck)))
    m = ImageChops.lighter(fill, ring).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    white = Image.merge("RGB", layer.split()[:3]).convert("L").point(lambda v: 255 if v > 244 else 0)
    grey = ImageChops.subtract(layer.getchannel("R"), layer.getchannel("B")).point(lambda v: 255 if v < 16 else 0)
    m = ImageChops.multiply(m, ImageChops.invert(ImageChops.multiply(ImageChops.multiply(white, grey),
                                                                     ImageChops.invert(_zone(TOOL_GADGET)))))
    # Sulla cima della spalla resta il contorno originale: sopra la sua linea via
    # tutto quello di Codex, appena sotto via il suo contorno; mano e chiave restano.
    keep = Image.new("L", CANVAS, 0)
    kp = keep.load()
    for yy in range(oy + 360, oy + 426):
        for xx in range(ox + 20, ox + 450):
            r, g, b, a = lp[xx, yy]
            steel = max(r, g, b) - min(r, g, b) < 20 and 160 < (r + g + b) / 3 < 235
            if a > 200 and (_is_skin(r, g, b) or steel):
                kp[xx, yy] = 255
    keep = keep.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(9))
    line = _canvas(TOOL_SHOULDER)
    above = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(above).polygon(line + [(line[-1][0], oy + 330), (line[0][0], oy + 330)], fill=255)
    band = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(band).polygon(line + [(px, py + 14) for px, py in reversed(line)], fill=255)
    drop = ImageChops.lighter(above, ImageChops.multiply(band, dark.filter(ImageFilter.MaxFilter(3))))
    m = ImageChops.multiply(m, ImageChops.invert(ImageChops.multiply(drop.filter(ImageFilter.GaussianBlur(0.8)), ImageChops.invert(keep))))
    m = ImageChops.multiply(m, ImageChops.invert(_zone(TOOL_SCREWDRIVER, 0.8)))
    _CACHE[key] = _masked(layer, m)
    return _CACHE[key]


def _with_tool(face: Image.Image, eyes: str, cell: int) -> Image.Image:
    ox, oy = OFFSET
    flanks = ImageChops.lighter(_zone(TOOL_FLANK), _zone(BOOK_FLANKS[1])).filter(ImageFilter.GaussianBlur(3))
    img = Image.composite(_armless(eyes), face, flanks)
    arm = _tool_arms(cell)
    img.alpha_composite(arm)
    # il ricciolo originale resta davanti alla spalla, la mano davanti al ricciolo
    skin = Image.new("L", CANVAS, 0)
    sp, ap = skin.load(), arm.load()
    for yy in range(oy + 330, oy + 450):
        for xx in range(ox + 20, ox + 200):
            r, g, b, a = ap[xx, yy]
            if a > 200 and _is_skin(r, g, b):
                sp[xx, yy] = 255
    hair = ImageChops.multiply(_zone(TOOL_CURL), ImageChops.invert(skin.filter(ImageFilter.MaxFilter(13))))
    img.alpha_composite(_masked(face, hair.filter(ImageFilter.GaussianBlur(1))))
    # il vuoto fra ricciolo e spalla, coperto dai capelli nel disegno di Codex, si
    # riempie col colore della manica attorno
    hole = ImageChops.multiply(_zone(TOOL_GAP), img.getchannel("A").point(lambda v: 255 if v < 250 else 0))
    soft = img.convert("RGBa")
    for _ in range(4):
        soft = soft.filter(ImageFilter.GaussianBlur(3))
    soft = soft.convert("RGBA")
    soft.putalpha(255)
    out = Image.composite(soft, Image.new("RGBA", CANVAS, (0, 0, 0, 0)), hole.filter(ImageFilter.GaussianBlur(0.8)))
    out.alpha_composite(img)
    return out


# Lente (look): braccio, mano e lente di B-look, che combacia col corpo originale
# quasi senza ritocchi. Della lente si prende il disco dentro l'anello dorato,
# con l'occhio ingrandito disegnato da Codex; fuori restano i suoi capelli.
LENS_CELLS = (((292, 21, 710, 874), 1.0078, 32, 64, (148, 302)),
              ((1040, 21, 1459, 874), 1.0185, 30, 58, (130, 298)))   # ..., centro dell'anello
LENS_R = 61
LENS_SLEEVE = ((20, 330), (150, 360), (200, 380), (210, 470), (200, 560), (30, 560), (10, 450))
LENS_HANDLE = ((96, 344), (126, 348), (110, 420), (84, 418))


def _lens_arm(cell: int) -> Image.Image:
    key = ("lens", cell)
    if key in _CACHE:
        return _CACHE[key]
    ox, oy = OFFSET
    box, scale, x, y, (cx, cy) = LENS_CELLS[cell]
    c = Image.open(HERE / "disegni" / "B-look" / "look-2-celle-trasparente.png").convert("RGBA").crop(box)
    small = c.convert("RGBa").resize((round(c.width * scale), round(c.height * scale)), Image.LANCZOS).convert("RGBA")
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layer.alpha_composite(small, (ox + x, oy + y))
    neck = _zone(TOOL_NECK)
    lp = layer.load()
    inside = Image.new("L", CANVAS, 0)
    ip = inside.load()
    for yy in range(oy + 300, oy + 580):
        for xx in range(ox + 10, ox + 260):
            r, g, b, a = lp[xx, yy]
            if a > 40 and (r + g + b) / 3 > 95:
                ip[xx, yy] = 255
    inside = ImageChops.multiply(inside, ImageChops.multiply(_zone(LENS_SLEEVE), ImageChops.invert(neck)))
    ip = inside.load()
    for yy in range(oy + 360, oy + 570, 3):
        for xx in range(ox + 10, ox + 250, 3):
            r, g, b, a = lp[xx, yy]
            if ip[xx, yy] == 255 and ((r > 200 and 140 < g < 195 and b < 100) or _is_skin(r, g, b)):
                ImageDraw.floodfill(inside, (xx, yy), 128)
    fill = inside.point(lambda v: 255 if v == 128 else 0)
    disk = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(disk).ellipse((ox + cx - LENS_R, oy + cy - LENS_R, ox + cx + LENS_R, oy + cy + LENS_R), fill=255)
    fill = ImageChops.lighter(ImageChops.lighter(fill, disk), _zone(LENS_HANDLE))
    dark = layer.convert("L").point(lambda v: 255 if v <= 95 else 0)
    ring = ImageChops.multiply(ImageChops.multiply(fill.filter(ImageFilter.MaxFilter(11)), dark), ImageChops.invert(neck))
    m = ImageChops.lighter(fill, ring).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    _CACHE[key] = _masked(layer, m)
    return _CACHE[key]


def _with_lens(face: Image.Image, eyes: str, cell: int) -> Image.Image:
    img = Image.composite(_armless(eyes), face, _zone(TOOL_FLANK, 3))
    img.alpha_composite(_lens_arm(cell))
    return img


# Spavento (error): mani alle guance e maniche di B-error, che combacia col corpo
# originale. Le mani hanno una sagoma ciascuna (le dita sono aree separate dal
# contorno), le maniche si riempiono dal loro colore e tengono il loro contorno;
# originali restano viso, colletto e pettorina.
CHEEK_CELLS = (((266, 19, 668, 872), 1.0288, 40, 50), ((1092, 16, 1494, 872), 1.0201, 40, 54))
CHEEK_HANDS = ((((148, 362), (165, 352), (200, 358), (210, 380), (205, 418), (190, 436), (158, 430), (146, 400)),
                ((250, 360), (275, 352), (308, 368), (314, 400), (302, 434), (270, 436), (246, 412), (242, 386))),
               (((146, 354), (170, 344), (202, 352), (210, 380), (204, 418), (176, 430), (148, 408), (144, 376)),
                ((242, 352), (266, 344), (292, 352), (306, 385), (298, 424), (264, 426), (242, 402), (234, 374))))
CHEEK_SLEEVES = ((10, 360), (150, 380), (205, 440), (245, 440), (320, 380), (470, 360), (470, 600), (10, 600))
CHEEK_BIB = ((208, 380), (254, 380), (256, 444), (263, 450), (263, 520), (208, 520))   # colletto e pettorina


def _cheek_arms(cell: int) -> Image.Image:
    key = ("cheeks", cell)
    if key in _CACHE:
        return _CACHE[key]
    ox, oy = OFFSET
    box, scale, x, y = CHEEK_CELLS[cell]
    c = Image.open(HERE / "disegni" / "B-error" / "error-2-celle-trasparente.png").convert("RGBA").crop(box)
    small = c.convert("RGBa").resize((round(c.width * scale), round(c.height * scale)), Image.LANCZOS).convert("RGBA")
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layer.alpha_composite(small, (ox + x, oy + y))
    zone = ImageChops.multiply(_zone(CHEEK_SLEEVES), ImageChops.invert(_zone(CHEEK_BIB)))
    lp = layer.load()
    inside = Image.new("L", CANVAS, 0)
    ip = inside.load()
    for yy in range(oy + 380, oy + 610):
        for xx in range(ox + 10, ox + 470):
            r, g, b, a = lp[xx, yy]
            if a > 40 and (r + g + b) / 3 > 95:
                ip[xx, yy] = 255
    inside = ImageChops.multiply(inside, zone)
    ip = inside.load()
    for yy in range(oy + 400, oy + 600, 3):
        for xx in range(ox + 10, ox + 470, 3):
            r, g, b, a = lp[xx, yy]
            if ip[xx, yy] == 255 and r > 200 and 140 < g < 195 and b < 100:
                ImageDraw.floodfill(inside, (xx, yy), 128)
    fill = inside.point(lambda v: 255 if v == 128 else 0)
    hands = ImageChops.lighter(_zone(CHEEK_HANDS[cell][0]), _zone(CHEEK_HANDS[cell][1]))
    dark = layer.convert("L").point(lambda v: 255 if v <= 95 else 0)
    ring = ImageChops.multiply(ImageChops.multiply(fill.filter(ImageFilter.MaxFilter(11)), dark), zone)
    m = ImageChops.lighter(ImageChops.lighter(fill, ring).filter(ImageFilter.MaxFilter(3)), hands).filter(ImageFilter.GaussianBlur(0.8))
    _CACHE[key] = _masked(layer, m)
    return _CACHE[key]


def _with_book(img: Image.Image, eyes: str, cell: int, arms=None) -> Image.Image:
    """Le due braccia davanti al busto (libro o blocco), con i fianchi di A1."""
    flanks = ImageChops.lighter(_zone(BOOK_FLANKS[0]), _zone(BOOK_FLANKS[1])).filter(ImageFilter.GaussianBlur(3))
    img = Image.composite(_armless(eyes), img, flanks)
    img.alpha_composite((arms or _book_arms)(cell))
    return img

# ---------------------------------------------------------------- deformazione

def _inverse(p: Pose):
    """Per un punto del fotogramma restituisce il punto del disegno da campionare."""
    ox, oy = OFFSET
    fx, fy = FEET
    nx, ny = NECK

    def f(x: float, y: float) -> tuple[float, float]:
        x, y = x - p.dx, y - p.dy
        if p.swing:
            w = 1 + 0.7 * smooth(800, 1040, y)
            x, y = rotate(x, y, HOLD[0], HOLD[1], -p.swing * w)
        if p.lean:
            x, y = rotate(x, y, fx, fy, -p.lean * (1 - smooth(900, 1050, y)))
        if p.squash != 1:
            y = fy + (y - fy) / p.squash
            x = fx + (x - fx) * math.sqrt(p.squash)
        wh = 1 - smooth(505, 590, y)
        if wh and (p.head or p.head_dx or p.head_dy):
            x, y = x - p.head_dx * wh, y - p.head_dy * wh
            x, y = rotate(x, y, nx, ny, -p.head * wh)
        if p.breath:
            yc = y - oy
            # testa e spalle salgono appena, il busto si allunga (respiro approvato)
            y += p.breath * 1.5 * (1 - smooth(380, 650, yc))
            if 380 <= yc < 650:
                y += p.breath * 4 * math.sin(math.pi * (yc - 380 + 0.5) / 270) ** 2
        return x, y
    return f


def _warp(img: Image.Image, p: Pose, step: int = 6) -> Image.Image:
    f = _inverse(p)
    w, h = img.size
    mesh = []
    for y in range(0, h, step):
        for x in range(0, w, step):
            x1, y1 = min(x + step, w), min(y + step, h)
            quad = (*f(x, y), *f(x, y1), *f(x1, y1), *f(x1, y))
            mesh.append(((x, y, x1, y1), quad))
    # colori premoltiplicati: niente aloni scuri sui bordi trasparenti
    return img.convert("RGBa").transform(img.size, Image.MESH, mesh, Image.BICUBIC).convert("RGBA")


# ---------------------------------------------------------------- effetti

def _sticker(size: int, paint, alpha: float = 1.0, outline: float = 5.5) -> Image.Image:
    """Disegna un effetto a 3x con contorno arrotondato e lo riduce."""
    ss = 3
    big = size * ss
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    paint(ImageDraw.Draw(layer), big / 2, ss)
    ring = layer.getchannel("A").filter(ImageFilter.GaussianBlur(outline * ss / 2))
    ring = ring.point(lambda v: 255 if v > 18 else 0)
    base = Image.new("RGBA", (big, big), INK + (0,))
    base.putalpha(ring)
    base.alpha_composite(layer)
    out = base.resize((size, size), Image.LANCZOS)
    if alpha < 1:
        out.putalpha(out.getchannel("A").point(lambda v: int(v * alpha)))
    return out


def _star(r: float, rot: float = 0.0, inner: float = 0.38):
    def paint(d, c, ss):
        pts = []
        for i in range(8):
            a = math.radians(rot + i * 45)
            rr = (r if i % 2 == 0 else r * inner) * ss
            pts.append((c + math.sin(a) * rr, c - math.cos(a) * rr))
        d.polygon(pts, fill=YELLOW + (255,))
        d.ellipse((c - r * 0.18 * ss, c - r * 0.18 * ss, c + r * 0.18 * ss, c + r * 0.18 * ss), fill=CREAM + (255,))
    return paint


def _heart(r: float):
    def paint(d, c, ss):
        pts = []
        for i in range(60):
            t = 2 * math.pi * i / 60
            x = 16 * math.sin(t) ** 3
            y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
            pts.append((c + x / 16 * r * ss, c - (y + 2) / 16 * r * ss))
        d.polygon(pts, fill=PINK + (255,))
        d.ellipse((c - r * 0.55 * ss, c - r * 0.6 * ss, c - r * 0.25 * ss, c - r * 0.3 * ss), fill=(255, 210, 214, 255))
    return paint


def _zee(r: float):
    def paint(d, c, ss):
        s = r * ss
        pts = [(c - s, c - s * 0.9), (c + s, c - s * 0.9), (c - s, c + s * 0.9), (c + s, c + s * 0.9)]
        d.line(pts, fill=CREAM + (255,), width=int(r * 0.42 * ss), joint="curve")
    return paint


# nuvoletta: lobi tondi con un'ombra in basso a destra e un riflesso; la più
# grande porta i tre puntini del pensiero
CLOUD_LOBES = {
    "puff": ((0, 0.08, 0.82), (-0.42, 0.22, 0.58), (0.4, -0.2, 0.6)),
    "cloud": ((0, 0.12, 0.62), (-0.62, 0.22, 0.5), (0.62, 0.2, 0.52), (-0.3, -0.28, 0.5), (0.3, -0.36, 0.56),
              (-0.86, 0.06, 0.32), (0.88, 0.02, 0.34)),
}
SHADE = (238, 220, 190)


def _cloud(r: float, kind: str = "puff", dots: int = 0):
    lobes = CLOUD_LOBES[kind]
    def paint(d, c, ss):
        s = r * ss
        def blob(dx, dy, k, fill):
            for x, y, rr in lobes:
                rr = rr * s * k
                cx, cy = c + x * s + dx, c + y * s + dy
                d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=fill)
        blob(0, 0, 1, SHADE + (255,))
        blob(-s * 0.08, -s * 0.1, 0.9, CREAM + (255,))
        for x, y, rr in lobes[:2]:
            hx, hy, hr = c + (x - rr * 0.35) * s, c + (y - rr * 0.4) * s, rr * s * 0.22
            d.ellipse((hx - hr, hy - hr * 0.7, hx + hr, hy + hr * 0.7), fill=(255, 255, 250, 255))
        for i in range(dots):
            dx = (i - 1) * s * 0.42   # posti fissi: i puntini compaiono uno alla volta
            dr = s * 0.1
            d.ellipse((c + dx - dr, c + s * 0.06 - dr, c + dx + dr, c + s * 0.06 + dr), fill=INK + (255,))
    return paint


def _drop(r: float):
    def paint(d, c, ss):
        s = r * ss
        pts = [(c, c - s * 1.6)]
        for i in range(31):
            a = math.pi * (-0.15 + 1.3 * i / 30)
            pts.append((c + math.cos(a) * s, c + s * 0.25 + math.sin(a) * s))
        d.polygon(pts, fill=SKY + (255,))
        d.ellipse((c - s * 0.5, c - s * 0.1, c - s * 0.15, c + s * 0.35), fill=(235, 248, 255, 255))
    return paint


def _exclaim(h: float):
    def paint(d, c, ss):
        s = h * ss
        d.polygon([(c - s * 0.2, c - s * 0.5), (c + s * 0.2, c - s * 0.5), (c + s * 0.09, c + s * 0.18), (c - s * 0.09, c + s * 0.18)],
                  fill=ORANGE + (255,))
        d.ellipse((c - s * 0.2, c - s * 0.62, c + s * 0.2, c - s * 0.38), fill=ORANGE + (255,))
        d.ellipse((c - s * 0.13, c + s * 0.3, c + s * 0.13, c + s * 0.56), fill=ORANGE + (255,))
    return paint


def _bolt(r: float, bright: bool):
    def paint(d, c, ss):
        s = r * ss
        pts = [(c + 0.25 * s, c - s), (c - 0.55 * s, c + 0.12 * s), (c - 0.02 * s, c + 0.12 * s),
               (c - 0.3 * s, c + s), (c + 0.55 * s, c - 0.18 * s), (c + 0.04 * s, c - 0.18 * s)]
        d.polygon(pts, fill=(YELLOW if bright else (238, 176, 60)) + (255,))
    return paint


def _arcs(n: int, zoom: float = 1.9, left: bool = False):
    # onde sonore; left: aperte verso sinistra, arrivano da sinistra
    def paint(d, c, ss):
        ss *= zoom
        cx, a0, a1 = (c + 40 * ss, 130, 230) if left else (c - 40 * ss, -50, 50)
        for i in range(n):
            r = (14 + i * 13) * ss
            d.arc((cx - r, c - r, cx + r, c + r), a0, a1, fill=YELLOW + (255,), width=int(8 * ss))
    return paint


PAINTERS = {"star": _star, "heart": _heart, "z": _zee, "drop": _drop, "exclaim": _exclaim,
            "bolt": _bolt, "arcs": _arcs, "cloud": _cloud}
SIZES = {"star": 2.5, "heart": 2.6, "z": 2.8, "drop": 4.2, "exclaim": 1.3,
         "bolt": 2.6, "arcs": 250, "cloud": 2.9}


def _effect(img: Image.Image, spec: tuple) -> None:
    kind, x, y, *args = spec
    alpha = 1.0
    if args and isinstance(args[-1], tuple) and args[-1][0] == "alpha":
        alpha = args[-1][1]
        args = args[:-1]
    painter = PAINTERS[kind](*args)
    factor = SIZES[kind]
    size = factor if isinstance(factor, int) else int(args[0] * factor) + 16
    img.alpha_composite(_sticker(size, painter, alpha), (int(x - size / 2), int(y - size / 2)))


# ---------------------------------------------------------------- resa

# Festa (celebrate): le quattro pose intere di B-celebrate (carica, salto,
# atterraggio, pugno con occhiolino), alla scala che porta la loro testa sulla
# testa originale, coi piedi sulla linea. I fotogrammi intermedi le schiacciano o
# le allungano ancorate ai piedi (squash) e le alzano (dy). Il salto è più largo
# della tela: si compone direttamente nel fotogramma.
JUMP_CELLS = (((99, 102, 450, 721), 1.236, 31), ((531, 12, 1058, 630), 1.22, -86),   # salto: 2,5% più piccolo e centrato, entra nel fotogramma
              ((1127, 110, 1574, 723), 1.248, -2), ((1637, 33, 2067, 728), 1.2375, -37))
JUMP_BASE = 927   # piedi nel ritaglio
# Sonno (sleep): la prima posa di B-sleep, seduta a terra con la testa sulle
# braccia, alla scala della testa originale a occhi chiusi. Le due celle sono
# ridisegnate per intero (scambiarle farebbe tremolare i contorni): il respiro
# alza solo schiena e testa (nap_breath), ferma da terra fin sopra le ginocchia.
NAP_CELLS = (((223, 49, 744, 881), 0.864, 22),)
# Trascinata (drag): le tre pose di B-drag, appese con le gambe che pendono a
# sinistra, al centro e a destra. Combaciano con la testa originale alla stessa
# scala del corpo: la testa resta dov'è (quarto valore: alto della posa nel
# ritaglio) e la posa ruota un poco attorno al punto in cui la si tiene.
DANGLE_CELLS = (((264, 18, 614, 701), 1.3365, 10, 32), ((909, 18, 1250, 703), 1.326, 27, 32),
                ((1543, 18, 1914, 699), 1.339, 28, 32))
DANGLE_PIVOT = (300, 150)   # nella tela: in cima alla testa
# Ascolto (listening): le due pose di B-listening (mano dietro l'orecchio, occhi
# aperti e socchiusi), alla scala dell'altezza originale, piedi sulla linea.
EAR_CELLS = (((152, 29, 624, 1039), 0.8822, 42), ((824, 29, 1296, 1039), 0.8822, 42))
# Corsa (running): le quattro pose di B-running, corsa sul posto, alla scala della
# testa originale e con la testa al suo posto (quarto valore); il corpo rimbalza.
JOG_CELLS = (((92, 29, 442, 769), 1.2375, 35, 32), ((575, 29, 918, 764), 1.236, 23, 32),
             ((1072, 29, 1414, 769), 1.236, 26, 32), ((1574, 29, 1918, 747), 1.236, 34, 32))
WHOLE = {"jump": ("B-celebrate/celebrate-4-celle-trasparente.png", JUMP_CELLS),
         "ear": ("B-listening/ascolto-2-celle-trasparente.png", EAR_CELLS),
         "jog": ("B-running/corsa-4-celle-trasparente.png", JOG_CELLS),
         "nap": ("B-sleep/sleep-2-celle-trasparente.png", NAP_CELLS),
         "dangle": ("B-drag/drag-3-celle-trasparente.png", DANGLE_CELLS)}
NAP_BREATH = (0.40, 0.70)   # da questa frazione d'altezza (dall'alto) il respiro sfuma a zero


def _whole_frame(p: Pose) -> Image.Image:
    """Una posa intera di Codex composta direttamente nel fotogramma."""
    kind = p.hand.rstrip("0123456789")
    key = ("whole", p.hand)
    if key not in _CACHE:
        sheet, cells = WHOLE[kind]
        box, scale, x, *top_y = cells[int(p.hand[len(kind):])]
        c = Image.open(HERE / "disegni" / sheet).convert("RGBA").crop(box)
        _CACHE[key] = (c.convert("RGBa").resize((round(c.width * scale), round(c.height * scale)), Image.LANCZOS), x,
                       top_y[0] if top_y else None)
    img, x, top_y = _CACHE[key]
    full_w = img.width
    w, h = round(img.width / p.squash ** 0.3), round(img.height * p.squash)   # si allarga meno di quanto si schiaccia
    if (w, h) != img.size:
        img = img.resize((w, h), Image.LANCZOS)
    if kind == "nap" and p.breath:
        img = _nap_breath(img, p.breath)
    left, top = (FRAMED[0] - CANVAS[0]) // 2, FRAMED[1] - CANVAS[1]    # dove cade la tela nel fotogramma
    cx = left + OFFSET[0] + x + full_w / 2   # centro della posa a misura piena
    framed = Image.new("RGBa", FRAMED, (0, 0, 0, 0))
    y = top + OFFSET[1] + (top_y if top_y is not None else JUMP_BASE - h) + p.dy   # alto fissato o piedi a terra
    framed.paste(img, (round(cx - w / 2), round(y)), img)
    if p.swing:
        framed = framed.rotate(p.swing, center=(left + DANGLE_PIVOT[0], top + DANGLE_PIVOT[1]), resample=Image.BICUBIC)
    framed = framed.convert("RGBA")
    for kind_, fx, fy, *args in p.fx:
        _effect(framed, (kind_, fx + left, fy + top, *args))
    return framed.resize(TILE, Image.LANCZOS)


def _nap_breath(img: Image.Image, b: float) -> Image.Image:
    """Schiena e testa salgono fino a 6 px; gambe e stivali restano fermi."""
    W, H = img.size
    y0, y1 = NAP_BREATH[0] * H, NAP_BREATH[1] * H

    def f(x, y):
        return x, y + 6 * b * (1 - smooth(y0, y1, y))
    step = 8
    mesh = []
    for y in range(0, H, step):
        for x in range(0, W, step):
            x1, yy1 = min(x + step, W), min(y + step, H)
            mesh.append(((x, y, x1, yy1), (*f(x, y), *f(x, yy1), *f(x1, yy1), *f(x1, y))))
    return img.transform((W, H), Image.MESH, mesh, Image.BICUBIC)


# Seduta sul bordo (perch): la prima posa di B-sitting alla scala della testa
# originale. Le altre celle sono ridisegnate per intero, quindi se ne prendono solo
# le parti: occhi chiusi dalla seconda, stinchi e stivali (sotto PERCH_LEGS_Y)
# dalla terza (calcio in avanti) e dalla quarta (gambe indietro). I passaggi verso
# il calcio accorciano gli stinchi della prima verso il ginocchio. Il canto prende
# da B-singing tutto ciò che sta sopra PERCH_JOIN (testa, colletto, spalle) e lo
# posa sul corpo della seduta, allineato su busto, mani e pantaloncini.
PERCH_CELLS = (((96, 17, 447, 726), 1.25, 18, 20), ((622, 17, 973, 726), 1.2562, 18, 18),
               ((1148, 17, 1497, 703), 1.2562, 19, 17), ((1672, 17, 2022, 711), 1.2562, 17, 17))
SING_CELLS = (((104, 25, 526, 831), 1.0884, -1, 29), ((707, 23, 1108, 831), 1.0857, 22, 28),
              ((1300, 34, 1721, 831), 1.0952, 19, 35))
PERCH_EYES = ((118, 222), (328, 222), (328, 300), (118, 300))
PERCH_LEGS_Y = 668   # sotto il bordo
PERCH_KNEE = 690
PERCH_JOIN = 480     # sopra questa riga, nel canto, testa e spalle di B-singing
PERCH_SEAT = 655     # il bordo, all'altezza delle mani appoggiate
# Residui dello sfondo bianco nei vuoti fra gambe/stivali delle quattro celle.
# Coordinate del foglio sorgente; la zona esclude viso, camicia e pelle.
PERCH_GAPS = ((241, 510, 271, 697), (765, 510, 796, 697),
              (1267, 508, 1320, 668), (1812, 510, 1844, 682))


def _clear_perch_gaps(img: Image.Image, box) -> Image.Image:
    img = img.copy()
    pixels = img.load()
    for x0, y0, x1, y1 in PERCH_GAPS:
        for y in range(max(0, y0 - box[1]), min(img.height, y1 - box[1])):
            for x in range(max(0, x0 - box[0]), min(img.width, x1 - box[0])):
                r, g, b, a = pixels[x, y]
                if a and min(r, g, b) >= 220 and max(r, g, b) - min(r, g, b) < 24:
                    pixels[x, y] = (0, 0, 0, 0)
    return img


def _sheet_cell(sheet: str, cell) -> Image.Image:
    """Una cella di un foglio di Codex alla sua scala, nel ritaglio 480 × 937."""
    key = ("cell", sheet, cell)
    if key not in _CACHE:
        box, scale, x, y = cell
        c = Image.open(HERE / "disegni" / sheet).convert("RGBA").crop(box)
        if sheet == "B-sitting/seduta-4-celle-trasparente.png":
            c = _clear_perch_gaps(c, box)
        small = c.convert("RGBa").resize((round(c.width * scale), round(c.height * scale)), Image.LANCZOS)
        can = Image.new("RGBa", (CROP_W, CROP_H), (0, 0, 0, 0))
        can.paste(small, (round(x), round(y)), small)
        _CACHE[key] = can.convert("RGBA")
    return _CACHE[key]


def _perch_shins(k: float) -> Image.Image:
    """Prima posa seduta con stinchi e stivali accorciati verso il ginocchio."""
    base = _sheet_cell("B-sitting/seduta-4-celle-trasparente.png", PERCH_CELLS[0])

    def f(x, y):
        return x, (PERCH_KNEE + (y - PERCH_KNEE) / k) if y > PERCH_KNEE else y
    mesh = []
    for y in range(PERCH_KNEE - 10, CROP_H, 8):
        for x in range(0, CROP_W, 8):
            x1, y1 = min(x + 8, CROP_W), min(y + 8, CROP_H)
            mesh.append(((x, y, x1, y1), (*f(x, y), *f(x, y1), *f(x1, y1), *f(x1, y))))
    low = base.convert("RGBa").transform((CROP_W, CROP_H), Image.MESH, mesh, Image.BICUBIC).convert("RGBA")
    out = base.copy()
    out.paste((0, 0, 0, 0), (0, PERCH_KNEE - 6, CROP_W, CROP_H))
    keep = Image.new("L", (CROP_W, CROP_H), 0)
    ImageDraw.Draw(keep).rectangle((0, PERCH_KNEE - 6, CROP_W, CROP_H), fill=255)
    out.alpha_composite(_masked(low, keep))
    return out


def _perch_crop(p: Pose) -> Image.Image:
    """La seduta nel ritaglio: hand è perch-<gambe> (0, 2, 3 o un accorciamento) o sing0..2."""
    sit = "B-sitting/seduta-4-celle-trasparente.png"
    if p.hand.startswith("sing"):
        head = _sheet_cell("B-singing/canto-seduta-3-celle-trasparente.png", SING_CELLS[int(p.hand[-1])])
        body = _masked(_sheet_cell(sit, PERCH_CELLS[0]), _band(PERCH_JOIN - 6, CROP_H, 0))
        out = Image.new("RGBA", (CROP_W, CROP_H), (0, 0, 0, 0))
        out.alpha_composite(body)
        out.alpha_composite(_masked(head, _band(0, PERCH_JOIN + 6, 4)))
        return out
    legs = p.hand.split("-", 1)[1]
    img = _sheet_cell(sit, PERCH_CELLS[0])
    if legs in ("2", "3"):
        img = Image.composite(_sheet_cell(sit, PERCH_CELLS[int(legs)]), img, _band(PERCH_LEGS_Y, CROP_H, 5))
    elif legs != "0":
        img = Image.composite(_perch_shins(float(legs)), img, _band(PERCH_LEGS_Y, CROP_H, 5))
    if p.eyes == "closed":
        eyes = Image.new("L", (CROP_W, CROP_H), 0)
        ImageDraw.Draw(eyes).polygon(PERCH_EYES, fill=255)
        img = Image.composite(_sheet_cell(sit, PERCH_CELLS[1]), img, eyes.filter(ImageFilter.GaussianBlur(6)))
    return img


def _band(y0: int, y1: int, blur: float) -> Image.Image:
    m = Image.new("L", (CROP_W, CROP_H), 0)
    ImageDraw.Draw(m).rectangle((0, y0, CROP_W, y1), fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


# Pose sedute per stato (perch.states): dai fogli C-seduta di Codex si prende
# la parte sopra il bordo, alla scala che porta la testa sulla seduta e
# allineata sui fianchi; sotto restano le gambe della seduta, così il punto
# d'appoggio non cambia. Si compone su una tela più larga del ritaglio: braccia
# alzate e mani aperte ne escono ai lati.
SEATED_CELLS = {
    "waiting": (((86, 18, 535, 821), 1.1302, -44, 8), ((713, 18, 1151, 821), 1.12, -29, 13),
                ((1345, 17, 1766, 821), 1.1407, -15, 1)),
    "thinking": (((163, 23, 644, 1008), 0.9079, 22, 15), ((901, 24, 1379, 1008), 0.9004, 27, 21)),
    "working": (((125, 19, 506, 848), 1.0848, 31, 6), ((728, 19, 1105, 848), 1.0956, 29, 0),
                ((1331, 20, 1708, 848), 1.0807, 33, 9)),
    "celebrate": (((182, 19, 567, 725), 1.2738, -21, 12), ((788, 19, 1284, 725), 1.2011, -53, 49),
                  ((1509, 28, 1917, 725), 1.1585, 20, 67)),
    "error": (((488, 24, 813, 723), 1.3102, 32, 10), ((1291, 24, 1616, 723), 1.3292, 29, 8)),
    "sleep": (((226, 16, 578, 726), 1.2601, 17, 14), ((860, 21, 1220, 726), 1.2693, 4, 16),
              ((1487, 34, 1863, 726), 1.2798, -17, 27)),
}
SEAT_PAD = 100         # margine ai lati del ritaglio
SEAT_LEGS = (114, 344)  # larghezza delle gambe della seduta sotto il bordo


def _seated_crop(p: Pose) -> Image.Image:
    """Posa seduta per stato (hand seat-<stato>-<cella>, o seat-base) su una tela
    larga 480 + 2 × SEAT_PAD; squash allunga il busto verso l'alto, ancorato al bordo."""
    key = ("seated", p.hand)
    if key not in _CACHE:
        W = CROP_W + 2 * SEAT_PAD
        low = Image.new("RGBA", (W, CROP_H), (0, 0, 0, 0))
        low.alpha_composite(_perch_crop(Pose(hand="perch-0")), (SEAT_PAD, 0))
        if p.hand == "seat-base":
            _CACHE[key] = low
        else:
            _, state, i = p.hand.split("-")
            box, scale, x, y = SEATED_CELLS[state][int(i)]
            c = Image.open(HERE / "disegni" / "C-seduta" / f"{state}-trasparente.png").convert("RGBA").crop(box)
            small = c.convert("RGBa").resize((round(c.width * scale), round(c.height * scale)), Image.LANCZOS)
            top = Image.new("RGBa", (W, CROP_H), (0, 0, 0, 0))
            top.paste(small, (round(x) + SEAT_PAD, round(y)), small)
            top = top.convert("RGBA")
            # le nostre gambe piene da poco sopra la giunzione, la parte di Codex
            # sfuma sopra di loro: niente fascia semitrasparente
            under = Image.new("L", (W, CROP_H), 0)
            ImageDraw.Draw(under).rectangle((SEAT_PAD + SEAT_LEGS[0], PERCH_LEGS_Y - 14, SEAT_PAD + SEAT_LEGS[1], CROP_H), fill=255)
            fade = Image.new("L", (W, CROP_H), 255)
            ImageDraw.Draw(fade).rectangle((0, PERCH_LEGS_Y, W, CROP_H), fill=0)
            out = Image.new("RGBA", (W, CROP_H), (0, 0, 0, 0))
            out.alpha_composite(_masked(low, under))
            out.alpha_composite(_masked(top, fade.filter(ImageFilter.GaussianBlur(3))))
            _CACHE[key] = out
    img = _CACHE[key]
    if p.squash != 1:
        W, H = img.size
        legs = img.crop((0, PERCH_SEAT, W, H))
        w2, h2 = round(W / p.squash ** 0.3), round(PERCH_SEAT * p.squash)
        top = img.crop((0, 0, W, PERCH_SEAT)).convert("RGBa").resize((w2, h2), Image.LANCZOS).convert("RGBA")
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        img.alpha_composite(legs, (0, PERCH_SEAT))
        img.alpha_composite(top, ((W - w2) // 2, PERCH_SEAT - h2))
    return img


def _seated_frame(p: Pose) -> Image.Image:
    left, top = (FRAMED[0] - CANVAS[0]) // 2, FRAMED[1] - CANVAS[1]
    framed = Image.new("RGBA", FRAMED, (0, 0, 0, 0))
    framed.alpha_composite(_seated_crop(p), (left + OFFSET[0] - SEAT_PAD, top + OFFSET[1]))
    return framed.resize(TILE, Image.LANCZOS)


def _perch_frame(p: Pose) -> Image.Image:
    left, top = (FRAMED[0] - CANVAS[0]) // 2, FRAMED[1] - CANVAS[1]
    framed = Image.new("RGBA", FRAMED, (0, 0, 0, 0))
    framed.alpha_composite(_perch_crop(p), (left + OFFSET[0], top + OFFSET[1]))
    return framed.resize(TILE, Image.LANCZOS)


def render(p: Pose) -> Image.Image:
    if p.hand.startswith("seat"):
        return _seated_frame(p)
    if p.hand.startswith(("perch", "sing")):
        return _perch_frame(p)
    if p.hand.startswith(("jump", "nap", "dangle", "ear", "jog")):
        return _whole_frame(p)
    img = _with_arm(p) if p.arm else _face(p.eyes, p.mouth).copy()
    if p.hand == "chin":
        img = _with_chin(img, p.eyes)
    elif p.hand.startswith("book"):
        img = _with_book(img, p.eyes, int(p.hand[-1]))
    elif p.hand.startswith("cheeks"):
        img = _with_book(img, p.eyes, int(p.hand[-1]), _cheek_arms)
    elif p.hand.startswith("lens"):
        img = _with_lens(img, p.eyes, int(p.hand[-1]))
    elif p.hand.startswith("tool"):
        img = _with_tool(img, p.eyes, int(p.hand[-1]))
    elif p.hand.startswith("pad"):
        img = _with_book(img, p.eyes, int(p.hand[-1]), _pad_arms)
    img = _warp(img, p)
    for spec in p.fx:
        _effect(img, spec)
    framed = Image.new("RGBA", FRAMED, (0, 0, 0, 0))
    framed.paste(img, ((FRAMED[0] - CANVAS[0]) // 2, FRAMED[1] - CANVAS[1]))
    return framed.resize(TILE, Image.LANCZOS)


def head_point(p: Pose, x: float, y: float) -> tuple[float, float]:
    """Dove finisce un punto della testa dopo gli spostamenti principali."""
    return x + p.dx + p.head_dx, y + p.dy + p.head_dy


# ---------------------------------------------------------------- stati
# Ogni stato è una lista di (posa, millisecondi). I tempi sono pensati per
# leggere bene a 96 × 192 punti: gesti lenti, effetti grandi e pochi.

def breath_at(t: float, period: float = 4000, inhale: float = 0.4) -> float:
    """Inspirazione 40% del ciclo, espirazione 60%, come nell'idle approvato."""
    phase = (t % period) / period
    if phase < inhale:
        return 0.5 - 0.5 * math.cos(math.pi * phase / inhale)
    return 0.5 + 0.5 * math.cos(math.pi * (phase - inhale) / (1 - inhale))


def q(v: float, levels: int = 8) -> float:
    return round(v * levels) / levels


def sampled(total: int, pose_at, step: int = 50, marks=()) -> list[tuple[Pose, int]]:
    times = sorted(set(range(0, total, step)) | {m for m in marks if 0 <= m < total})
    seq = []
    for i, t in enumerate(times):
        dur = (times[i + 1] if i + 1 < len(times) else total) - t
        pose = pose_at(t)
        if seq and seq[-1][0] == pose:
            seq[-1] = (pose, seq[-1][1] + dur)
        else:
            seq.append((pose, dur))
    if len(seq) > 1 and seq[0][0] == seq[-1][0]:
        # il ciclo riparte dalla stessa posa: la si unisce in testa
        first = seq.pop()
        seq[0] = (seq[0][0], seq[0][1] + first[1])
    return seq


# Battiti d'occhi irregolari (ms dall'inizio del ciclo di 24 s), uno doppio.
BLINKS = (2600, 7100, 7480, 12900, 17300, 21700)


def eyes_at(t: int) -> str:
    for b in BLINKS:
        if b <= t < b + 40 or b + 140 <= t < b + 190:
            return "half"
        if b + 40 <= t < b + 140:
            return "closed"
    return "open"


def idle():
    marks = [m for b in BLINKS for m in (b, b + 40, b + 140, b + 190)]
    return sampled(24000, lambda t: Pose(breath=q(breath_at(t)), eyes=eyes_at(t)), 50, marks), True


# Area degli effetti e degli oggetti: in alto a destra, sopra la spalla,
# dove a 96 punti di larghezza si leggono senza coprire il viso.
SLOT = (462, 118)


def sleep():
    # seduta a terra con la testa sulle braccia: respiro lento e profondo, z che
    # salgono dalla testa e svaniscono
    seq = []
    n = 10   # passi di 600 ms su un respiro di 6 s
    for i in range(n):
        b = breath_at(i * 6000 / n, 6000, 0.45)
        z = []
        for off in (0.0, 0.5):
            u = (i / n + off) % 1
            x = 420 + u * 110 + math.sin(u * 5) * 10
            y = 380 - u * 220
            a = 1.0 if u < 0.65 else (1 - u) / 0.35
            z.append(("z", x, y, 18 + u * 22, ("alpha", round(max(0.0, a), 2))))
        seq.append((Pose(hand="nap0", breath=round(b, 2), fx=tuple(z)), 600))
    return seq, True


def thinking():
    # mano al mento; dalla testa salgono due sbuffi e poi la nuvola, che si
    # gonfia e si riempie di puntini uno alla volta
    p1, p2 = ("cloud", 410, 196, 11, "puff"), ("cloud", 456, 150, 18, "puff")

    def big(k=1.0, dy=0, n=3):
        return ("cloud", 506, 78 + dy, 46 * k, "cloud", n)

    def pose(eyes="alto", breath=0.6, fx=()):
        return Pose(hand="chin", eyes=eyes, breath=breath, fx=fx)
    seq = [(pose(breath=0.3), 500), (pose(breath=0.4, fx=(p1,)), 380), (pose(breath=0.5, fx=(p1, p2)), 380),
           (pose(breath=0.55, fx=(p1, p2, big(0.8, n=0))), 70), (pose(fx=(p1, p2, big(1.06, n=0))), 70),
           (pose(fx=(p1, p2, big(n=0))), 200)]
    seq += [(pose(fx=(p1, p2, big(n=n))), 260 if n < 3 else 500) for n in (1, 2, 3)]
    up = (p1, p2, big(dy=-2))
    seq += [(pose("half", fx=up), 40), (pose("closed", fx=up), 90), (pose("half", fx=up), 40),
            (pose(breath=0.5, fx=up), 600), (pose("destra", breath=0.4, fx=(p1, p2, big())), 900),
            (pose(breath=0.3, fx=up), 600)]
    return seq, True


def listening():
    # mano dietro l'orecchio, sguardo verso chi parla; le onde arrivano alla mano,
    # e a metà si concentra socchiudendo gli occhi
    seq = [(Pose(hand="ear0", fx=(("arcs", 92, 448, n, 1.9, True),)), 260) for n in (1, 2, 3)]
    seq += [(Pose(hand="ear1", fx=(("arcs", 92, 448, 3, 1.9, True),)), 420), (Pose(hand="ear0"), 340)]
    return seq, True


def working():
    # cricchetto: la chiave avanza in quattro scatti e torna indietro veloce, tre
    # volte; poi una pausa con un battito di ciglia
    def pose(cell, breath, eyes="open"):
        return Pose(hand=f"tool{cell}", eyes=eyes, breath=breath)
    seq = []
    for _ in range(3):
        seq += [(pose(0, 0.3), 150), (pose(1, 0.35), 150), (pose(2, 0.4), 150), (pose(3, 0.45), 220),
                (pose(2, 0.4), 80), (pose(1, 0.35), 80)]
    seq += [(pose(0, 0.4), 300), (pose(0, 0.4, "closed"), 110), (pose(0, 0.3), 300)]
    return seq, True


def reading():
    # legge la pagina sinistra, sbatte le ciglia, passa alla destra e la gira
    def pose(cell, breath, eyes=None):
        return Pose(hand=f"book{cell}", eyes=eyes or f"libro{cell}", breath=breath)
    seq = [(pose(0, 0.3), 900), (pose(0, 0.5), 500), (pose(0, 0.5, "closed"), 110), (pose(0, 0.4), 300),
           (pose(1, 0.3), 900), (pose(1, 0.5), 600), (pose(2, 0.4), 160), (pose(2, 0.3), 200)]
    return seq, True


def writing():
    # tre passate di matita sul blocco, poi una pausa con un battito di ciglia
    seq = [(Pose(hand=f"pad{c}", eyes="blocco", breath=0.3 + 0.1 * (k % 2)), 130) for k in range(3) for c in (0, 1, 2, 1)]
    seq += [(Pose(hand="pad0", eyes="blocco", breath=0.5), 400), (Pose(hand="pad0", eyes="closed", breath=0.5), 110),
            (Pose(hand="pad0", eyes="blocco", breath=0.4), 300)]
    return seq, True


def running():
    # corsa sul posto: quattro pose di Codex, il corpo rimbalza nelle fasi di volo
    seq = []
    # le pose di Codex sono un po' più alte: -20 porta il piede d'appoggio sulla linea
    for cell, dy, bright in ((0, -20, True), (1, -26, False), (2, -20, True), (3, -30, False)):
        seq.append((Pose(hand=f"jog{cell}", dy=dy, fx=(("bolt", SLOT[0], SLOT[1] + dy, 74, bright),)), 110))
    return seq, True


def waiting():
    # Ti saluta: il braccio si scosta dal fianco, poi entra il braccio alzato
    # disegnato da Codex, che si raddrizza e saluta con le tre inclinazioni
    # della mano, con un piccolo dondolio, e riscende.
    rise = [(Pose(arm="lift", arm_angle=-12, mouth="o", breath=0.3, head=0.2, lean=0.2), 55),
            (Pose(arm="lift", arm_angle=-26, mouth="a", breath=0.35, head=0.5, lean=0.5, dy=-1), 55),
            (Pose(arm="wave1", arm_angle=30, mouth="a", breath=0.45, head=1.0, lean=0.8, dy=-2), 55),
            (Pose(arm="wave1", arm_angle=14, mouth="felice", breath=0.5, head=1.6, lean=1.1, dy=-3), 60),
            (Pose(arm="wave1", arm_angle=-4, mouth="felice", breath=0.6, head=2.2, lean=1.3, dy=-3), 75),
            (Pose(arm="wave1", arm_angle=2, mouth="felice", breath=0.6, head=2.4, lean=1.3, dy=-1), 90)]
    seq = [(Pose(breath=0.2), 450)] + rise
    for k in range(3):
        for j, (cell, ang, lean) in enumerate(((0, -2, 1.6), (1, 0, 1.3), (2, 2, 1.0), (1, 0, 1.3))):
            eyes = "closed" if k == 1 and j in (1, 2) else "open"
            seq.append((Pose(arm=f"wave{cell}", arm_angle=ang, eyes=eyes, mouth="felice" if j % 2 == 0 else "a",
                             breath=0.6, head=2.4, lean=lean), 150 if eyes == "open" else 90))
    seq += [(Pose(arm="wave1", arm_angle=14, mouth="a", breath=0.5, head=1.6, lean=1.1), 60),
            (Pose(arm="wave1", arm_angle=30, mouth="sorriso", breath=0.45, head=1.0, lean=0.8), 55),
            (Pose(arm="lift", arm_angle=-26, mouth="sorriso", breath=0.35, head=0.5, lean=0.5), 55),
            (Pose(arm="lift", arm_angle=-12, breath=0.3, head=0.2, lean=0.2), 55),
            (Pose(breath=0.2), 800)]
    return seq, True


def done():
    seq = []
    for i, (lean, star_r) in enumerate(((-1.8, 40), (0, 50), (1.8, 40), (0, 30))):
        small = (("star", 128, 214, (22, 16, 26, 30)[i], -lean * 5),)
        seq.append((Pose(lean=lean, eyes="closed", mouth="open", breath=0.4,
                         fx=(("star", 470, 140, star_r, lean * 5),) + small), 230))
    return seq, True


def celebrate():
    # carica, slancio, salita, sospensione, discesa, atterraggio e pugno con
    # occhiolino; stelline e cuore compaiono durante il salto
    s1, s2, s3 = ("star", 96, 236, 30, 10), ("star", 506, 170, 38, -12), ("heart", 486, 318, 30)
    steps = ((0, 1.00, 0, (), 70), (0, 0.96, 0, (), 70), (0, 0.92, 0, (), 100), (0, 1.07, 12, (), 50),
             (1, 1.07, 40, (), 45), (1, 1.04, 78, (s1,), 55), (1, 1.01, 100, (s1,), 70),
             (1, 0.99, 108, (s1, s2), 140), (1, 1.00, 100, (s1, s2), 60), (1, 1.03, 70, (s1, s2), 50),
             (1, 1.06, 30, (s1, s2), 45), (2, 0.90, 0, (s1, s2, s3), 70), (2, 0.96, 0, (s1, s2, s3), 70),
             (2, 1.00, 0, (s1, s2, s3), 90), (3, 1.04, 8, (s1, s2, s3), 70), (3, 0.98, 0, (s1, s2, s3), 70),
             (3, 1.00, 0, (s1, s2, s3), 900))
    return [(Pose(hand=f"jump{cell}", squash=sq, dy=-lift, fx=fx), ms) for cell, sq, lift, fx, ms in steps], False


def error():
    # mani alle guance; sobbalza tremando mentre la goccia scende, poi un battito
    def pose(cell, mouth, dx=0, eyes="sorpresi", drop=None):
        fx = (("drop", 150 + dx, drop, 24),) if drop else ()
        return Pose(hand=f"cheeks{cell}", eyes=eyes, mouth=mouth, dx=dx, breath=0.2, fx=fx)
    seq = [(pose(0, "o"), 260)]
    for i, dx in enumerate((-3, 3, -2, 2, 0)):
        seq.append((pose(1, "sorpresa", dx, drop=292 + 7 * i), 90 if dx else 420))
    seq += [(pose(0, "o", eyes="closed", drop=320), 110), (pose(0, "o"), 500)]
    return seq, True


def talk():
    # vocali disegnate da Codex e piccoli cenni del capo; sulle parole centrali la
    # mano si scosta dal fianco come chi spiega, poi torna giù. Un battito a metà.
    pattern = (("sorriso", "open", 0, 0, 140), ("a", "open", -1.5, -8, 110), ("o", "open", -1, -16, 110),
               ("e", "open", -1, -22, 120), ("a", "open", -1.5, -22, 130), ("sorriso", "open", 0, -16, 90),
               ("sorriso", "half", 0, -10, 45), ("sorriso", "closed", 0, -6, 90), ("sorriso", "half", 0, -3, 45),
               ("felice", "open", -1.5, 0, 150), ("o", "open", -1, 0, 100), ("e", "open", -1, 0, 110),
               ("", "open", 0, 0, 320))
    seq = []
    for mouth, eyes, bob, angle, ms in pattern:
        p = Pose(mouth=mouth, eyes=eyes, head_dy=bob, head=0.8 if bob else 0, breath=0.4)
        if angle:
            p = replace(p, arm="lift", arm_angle=angle, lean=-angle / 40)
        seq.append((p, ms))
    return seq, True


def look():
    # lente davanti a un occhio e l'altro strizzato; la sposta appena, poi una
    # piccola «o» di stupore
    def pose(cell, breath, mouth=""):
        return Pose(hand=f"lens{cell}", eyes="wink", mouth=mouth, breath=breath)
    seq = [(pose(0, 0.3), 900), (pose(1, 0.4), 500), (pose(0, 0.5), 700), (pose(1, 0.5, "o"), 600),
           (pose(1, 0.4, "o"), 300), (pose(0, 0.3), 500)]
    return seq, True


def drag():
    # appesa per la testa: le gambe dondolano da un lato all'altro (tre pose di
    # Codex) e la figura ruota appena attorno alla presa; goccia ai due estremi
    steps = ((0, -1.8), (0, -1.2), (1, -0.6), (1, 0.6), (2, 1.2), (2, 1.8), (2, 1.2), (1, 0.6), (1, -0.6), (0, -1.2))
    seq = []
    for cell, swing in steps:
        fx = (("drop", 160, 266, 20),) if abs(swing) == 1.8 else ()
        seq.append((Pose(hand=f"dangle{cell}", dy=-34, swing=swing, fx=fx), 110))
    return seq, True



def _drag_toward(cell: int, sign: float):
    # trascinata in una direzione: le gambe restano indietro dal lato opposto e
    # oscillano appena, finché non ti fermi
    return [(Pose(hand=f"dangle{cell}", dy=-34, swing=sign * a), 140) for a in (1.4, 1.8, 2.2, 1.8)], True


def drag_left():
    return _drag_toward(2, 1.0)    # verso sinistra: gambe che pendono a destra


def drag_right():
    return _drag_toward(0, -1.0)   # verso destra: gambe che pendono a sinistra


def perch():
    # seduta sul bordo: dondola le gambe (in avanti per gradi fino al calcio,
    # indietro con la quarta cella) e sbatte le ciglia fra un dondolio e l'altro
    def legs(v, ms, eyes="open"):
        return Pose(hand=f"perch-{v}", eyes=eyes), ms
    swing = [legs(0.95, 120), legs(0.88, 120), legs(2, 260), legs(0.88, 120), legs(0.95, 120),
             legs(0, 160), legs(3, 320), legs(0, 160)]
    return [legs(0, 600)] + swing + [legs(0, 500), legs(0, 110, "closed"), legs(0, 500)] + swing, True


def perch_singing():
    # canta a occhi chiusi, la testa ondeggia: «a» a sinistra, «o» dritta, aperta a destra
    return [(Pose(hand=f"sing{i}"), ms) for i, ms in ((0, 380), (1, 300), (2, 380), (1, 300))], True


def _seat(state, i, ms, k=1.0):
    return Pose(hand=f"seat-{state}-{i}" if state else "seat-base", squash=k), ms


def seated_states():
    """Pose sedute per stato, per perch.states."""
    cycle = lambda n, k: [_seat(n, i, 160) for i in (*range(k), *range(k - 2, 0, -1))] * 3
    seq = {
        "waiting": (cycle("waiting", 3), True),
        "thinking": ([_seat("thinking", 0, 900), _seat("thinking", 1, 900)], True),
        "working": (cycle("working", 3), True),
        # si carica, poi ogni posa entra con un piccolo slancio e si assesta
        "celebrate": ([_seat(None, 0, 300), _seat(None, 0, 120, 0.97), _seat("celebrate", 0, 90, 1.02),
                       _seat("celebrate", 0, 240), _seat("celebrate", 1, 90, 1.05), _seat("celebrate", 1, 90, 1.02),
                       _seat("celebrate", 1, 600), _seat("celebrate", 2, 90, 1.04), _seat("celebrate", 2, 90, 1.01),
                       _seat("celebrate", 2, 1200)], False),
        "error": ([_seat("error", 0, 260)] + [_seat("error", 1, 90), _seat("error", 0, 90)] * 2 + [_seat("error", 1, 520)], True),
        "sleep": ([_seat("sleep", 0, 1200), _seat("sleep", 1, 900), _seat("sleep", 2, 1400), _seat("sleep", 1, 700)], True),
    }
    # done da seduta: la stessa festa di celebrate (in piedi done ripiega su idle)
    seq["done"] = seq["celebrate"]
    return seq

STATES = {"idle": idle, "sleep": sleep, "listening": listening, "thinking": thinking, "working": working,
          "reading": reading, "writing": writing, "running": running, "waiting": waiting, "done": done,
          "celebrate": celebrate, "error": error, "talk": talk, "look": look, "drag": drag,
          "drag-left": drag_left, "drag-right": drag_right}


# ---------------------------------------------------------------- pacchetto

def _compact(sheet: Image.Image) -> Image.Image:
    """Foglio più leggero senza differenze visibili: colori arrotondati a multipli
    di 4 (al massimo 2 livelli su 255) e colore azzerato dove è tutto trasparente.
    Da 14,6 a circa 10,8 MB, sotto il limite di 16 del formato."""
    r, g, b, a = sheet.split()
    step = lambda v: min(252, (v + 2) & 0xFC) if v < 253 else 255
    out = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
    out.paste(Image.merge("RGBA", [c.point(step) for c in (r, g, b)] + [a]), (0, 0), a.point(lambda v: 255 if v else 0))
    return out


def build(out_root, preview_root) -> dict:
    out = Path(out_root) / "People" / "luma"
    previews = Path(preview_root) / "luma"
    out.mkdir(parents=True, exist_ok=True)
    previews.mkdir(parents=True, exist_ok=True)

    tiles: list[Image.Image] = []
    index: dict[Pose, int] = {}
    timelines = {}
    seated = {f"perch-{k}": (lambda v=v: v) for k, v in seated_states().items()}
    for state, make in {**STATES, "perch": perch, "perch-singing": perch_singing, **seated}.items():
        seq, loop = make()
        cells = []
        for pose, _ in seq:
            if pose not in index:
                index[pose] = len(tiles)
                tiles.append(render(pose))
            cells.append(index[pose])
        timelines[state] = (seq, cells, loop)

    rows = math.ceil(len(tiles) / COLS)
    sheet = Image.new("RGBA", (COLS * TILE[0], rows * TILE[1]), (0, 0, 0, 0))
    for i, tile in enumerate(tiles):
        sheet.paste(tile, ((i % COLS) * TILE[0], (i // COLS) * TILE[1]))
    compact = _compact(sheet)
    compact.save(out / "sprites.png", optimize=True)
    # rilettura completa: un salvataggio interrotto lascia un PNG che si apre ma
    # si decodifica solo in parte (un foglio così rende la mascotte invisibile)
    with Image.open(out / "sprites.png") as check:
        if check.convert("RGBA").tobytes() != compact.tobytes():
            raise RuntimeError("sprites.png salvato non corrisponde al foglio: rigenerare")
    tiles[0].save(HERE / "preview.png")

    animations = {}
    for state, (seq, cells, loop) in timelines.items():   # perch e perch-singing escono poi da animations
        anim = {"row": 0, "frames": [c % COLS for c in cells], "frameRows": [c // COLS for c in cells],
                "fps": 20, "durations": [ms for _, ms in seq]}
        if not loop:
            anim["loop"] = False
        animations[state] = anim
    pack = {"format": "mascotte-pack/1", "id": "luma", "name": "Luma", "author": "Mascotte", "sheet": "sprites.png",
            "frame": {"width": TILE[0], "height": TILE[1]}, "pixelRatio": 7, "scale": 3,
            "bubble": {"x": TILE[0] // 2, "y": 80}, "animations": animations,
            "perch": {"animation": animations.pop("perch"), "singing": animations.pop("perch-singing"),
                      "states": {k: animations.pop(f"perch-{k}") for k in seated_states()},
                      # il bacino sul bordo, in pixel del fotogramma
                      "anchor": {"x": round((FRAMED[0] / 2) * TILE[0] / FRAMED[0]),
                                 "y": round(((FRAMED[1] - CANVAS[1]) + OFFSET[1] + PERCH_SEAT) * TILE[1] / FRAMED[1])}}}
    (out / "character.json").write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    _previews(tiles, timelines, previews)
    return pack


def _previews(tiles, timelines, folder: Path) -> None:
    bg = (244, 241, 234, 255)
    thumb = (TILE[0] // 2, TILE[1] // 2)
    for state, (seq, cells, loop) in timelines.items():
        frames = []
        for c in cells:
            f = Image.new("RGBA", thumb, bg)
            f.alpha_composite(tiles[c].resize(thumb, Image.LANCZOS))
            frames.append(f.convert("RGB"))
        frames[0].save(folder / f"{state}.gif", save_all=True, append_images=frames[1:],
                       duration=[max(20, ms) for _, ms in seq], loop=0 if loop else 1, disposal=2)
    states = list(timelines)
    width = max(len(set(c)) for _, c, _ in timelines.values())
    contact = Image.new("RGBA", (width * thumb[0], len(states) * thumb[1]), bg)
    for r, state in enumerate(states):
        for i, c in enumerate(dict.fromkeys(timelines[state][1])):
            contact.alpha_composite(tiles[c].resize(thumb, Image.LANCZOS), (i * thumb[0], r * thumb[1]))
    contact.save(folder / "contact.png")


if __name__ == "__main__":
    pack = build(ROOT / "characters", ROOT / "work" / "previews")
    anims = [*pack["animations"].values(), pack["perch"]["animation"], pack["perch"]["singing"], *pack["perch"]["states"].values()]
    used = {(r, c) for a in anims for c, r in zip(a["frames"], a["frameRows"])}
    print(f"ok: characters/People/luma ({len(used)} celle) e work/previews/luma")
