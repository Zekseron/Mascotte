"""Animazioni di Rosso: i 15 stati della ricetta (characters-src/ANIMAZIONI.md).

ANIMATIONS = {stato: {"frames": [griglie], "sequence": [colonne]?, "fps": n?,
                      "durations": [ms]?, "loop": bool?}}, nell'ordine della tabella.

Gli oggetti di scena (portatile, libro, foglio con matita, lente) sono parti
riutilizzabili: ognuno ritorna un livello 32x32 da sovrapporre al gattino con
overlay(). Usano le cifre di EFFECT_PALETTE (7 vetro, 8 carta, 9 e 0 grigi,
2 giallo, 3 rosa) e il contorno 'o'; le zampe che li toccano sono guanti crema
con il loro contorno (paw_blob).
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent


def _load_sibling(name: str, filename: str):
    """Carica un file di questa cartella con un nome univoco: piu' personaggi
    hanno ciascuno il proprio parts.py e non devono confondersi in sys.modules."""
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, _HERE / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


P = _load_sibling("rosso_parts", "parts.py")
kitten, outline, dots, add_effect, EFFECTS = P.kitten, P.outline, P.dots, P.add_effect, P.EFFECTS
T, W, H = P.T, P.W, P.H
blank, overlay, put, shift, mirror = P.blank, P.overlay, P.put, P.shift, P.mirror


# ================================================================== oggetti di scena
def rect(g, x0, y0, x1, y1, ch):
    """Rettangolo pieno (estremi compresi)."""
    return put(g, [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)], ch)


def paw_blob(x, y, w=3, h=2):
    """Guanto crema w x h con il suo contorno (angolo alto-sinistro del riempimento
    in (x, y)). L'ultima riga e' in ombra (C). Ritorna un livello 32x32."""
    g = blank(W, H)
    g = rect(g, x, y, x + w - 1, y + h - 1, "c")
    g = rect(g, x, y + h - 1, x + w - 1, y + h - 1, "C")
    return outline(g)


# ---------------------------------------------------------------- portatile
def laptop(left="down", right="down", step=0):
    """Piccolo portatile davanti al gattino, schermo acceso verso chi guarda.
    left/right: posizione delle zampe sui tasti ("down" appoggiata, "up" sollevata).
    step: 0-3, cambia le righe di testo sullo schermo e il cursore.
    Il bordo alto del coperchio coincide con il contorno del mento (riga 22): nessun
    contorno doppio."""
    g = blank(W, H)
    g = rect(g, 8, 22, 23, 26, "o")                 # coperchio (contorno)
    g = rect(g, 9, 23, 22, 25, "7")                 # schermo
    g = put(g, [(9, 23), (10, 23)], "1")            # riflesso
    g = rect(g, 6, 26, 25, 29, "o")                 # base (contorno)
    g = rect(g, 7, 27, 24, 28, "9")                 # tastiera
    g = put(g, [(x, 27) for x in range(8, 24, 2)] + [(x, 28) for x in range(9, 24, 2)], "0")
    # righe di testo: (lunghezza riga alta, lunghezza riga bassa, cursore acceso)
    a, b, cur = [(5, 3, True), (7, 5, False), (4, 7, True), (6, 4, False)][step % 4]
    g = put(g, [(11 + i, 23) for i in range(a)], "0")
    g = put(g, [(11 + i, 25) for i in range(b)], "0")
    if cur:
        g = put(g, [(11 + b, 25)], "9")
    # zampe
    for x, state in ((9, left), (19, right)):
        y = 27 if state == "down" else 25
        g = overlay(g, paw_blob(x, y, 4, 2))
    return g


# ---------------------------------------------------------------- libro
BOOK_ROWS = [
    ".8888888008888888.",   # y23 (angoli alti arrotondati)
    "088888880088888880",   # y24
    "088888880088888880",   # y25
    "088888880088888880",   # y26
    "088888880088888880",   # y27
    "000000000000000000",   # y28 copertina
]
# righe di testo sulle pagine: (x, y, lunghezza)
BOOK_TEXT = [
    (9, 24, 5), (9, 26, 4), (19, 24, 5), (19, 26, 5),
]


def book(page=0):
    """Libro aperto davanti al gattino, tenuto per gli angoli bassi. Il bordo alto
    coincide con il contorno del mento (riga 22), come per il portatile.
    page: 0 pagine ferme, 1 pagina che si alza a destra, 2 pagina che cade a sinistra."""
    g = blank(W, H)
    for j, row in enumerate(BOOK_ROWS):
        for i, ch in enumerate(row):
            if ch != ".":
                g = put(g, [(7 + i, 23 + j)], ch)
    for x, y, n in BOOK_TEXT:
        g = put(g, [(x + i, y) for i in range(n)], "9")
    g = outline(g)
    if page:
        # pagina in volo: rettangolo piu' stretto e piu' alto, a destra o a sinistra
        x0 = 17 if page == 1 else 10
        flap = rect(blank(W, H), x0, 22, x0 + 4, 26, "8")
        for y in (24,):
            flap = put(flap, [(x0 + 1 + i, y) for i in range(3)], "9")
        g = overlay(g, outline(flap))
    g = overlay(g, paw_blob(5, 26))
    g = overlay(g, paw_blob(24, 26))
    return g


# ---------------------------------------------------------------- foglio e matita
def paper_pencil(tip=3, wobble=0, written=6):
    """Foglio tenuto con la zampa sinistra e matita nella zampa destra.
    Il foglio poggia sul fondo (il suo contorno basso e' la riga 31 del gattino) e
    lascia libera la riga 23 sotto il mento: nessun contorno doppio.
    tip: posizione (px dall'inizio della riga) della punta della matita, che scrive
    sulla seconda riga; written: lunghezza della seconda riga gia' scritta;
    wobble: 0/1, solleva la punta di 1 px (il tratto della scrittura)."""
    g = rect(blank(W, H), 8, 25, 18, 30, "8")
    g = put(g, [(9 + i, 26) for i in range(8)], "9")
    g = put(g, [(9 + i, 28) for i in range(written)], "9")
    g = outline(g)
    tx, ty = 9 + tip, 28 - wobble
    g = overlay(g, paw_blob(5, 28))                   # zampa sinistra sul bordo del foglio
    g = overlay(g, paw_blob(tx + 7, ty - 1))          # zampa destra, che regge la matita da sotto
    pencil = blank(W, H)
    for t in range(10):
        x, y = tx + t, ty - (t + 1) // 2
        ch = "0" if t == 0 else "2" if t < 8 else "9" if t == 8 else "3"
        pencil = put(pencil, [(x, y)] + ([(x, y + 1)] if t else []), ch)
    return overlay(g, outline(pencil))


# ---------------------------------------------------------------- lente
LENS = [
    ".99999.",
    "9777779",
    "9777779",
    "9777779",
    "9777779",
    "9777779",
    ".99999.",
]


def lens_on(frame, dx=0, dy=0):
    """Appoggia una lente d'ingrandimento davanti all'occhio sinistro (della tela)
    e la tiene con la zampa sinistra. Il vetro (7) copre il pelo ma lascia vedere
    l'occhio (pixel 'o' e 'w'). dx in {-1, 0} (piu' a destra coprirebbe il naso);
    dy sposta la lente in su o in giu' di 1 px."""
    x0, y0 = 7 + dx, 13 + dy
    rim = blank(W, H)
    glass = []
    for j, row in enumerate(LENS):
        for i, ch in enumerate(row):
            if ch == "9":
                rim = put(rim, [(x0 + i, y0 + j)], "9")
            elif ch == "7":
                glass.append((x0 + i, y0 + j))
    # manico: diagonale in basso a sinistra, tenuto dalla zampa
    hx, hy = x0 + 1, y0 + 7
    handle = blank(W, H)
    for t in range(4):
        handle = put(handle, [(hx - t, hy + t), (hx - t + 1, hy + t)], "0")
    body = overlay(outline(put(rim, glass, "7")), outline(handle))
    out = [list(r) for r in frame]
    for x, y in glass:
        if out[y][x] not in ("o", "w"):
            out[y][x] = "7"
    # contorno e manico sopra il gattino, ma mai sopra i pixel dell'occhio
    for y in range(H):
        for x in range(W):
            ch = body[y][x]
            if ch != T and (x, y) not in glass:
                out[y][x] = ch
    out = ["".join(r) for r in out]
    out = overlay(out, put(blank(W, H), [(x0 + 1, y0 + 1), (x0 + 1, y0 + 2)], "1"))
    out = overlay(out, paw_blob(hx - 6, hy + 3, 3, 3))
    return out


# ================================================================== stati
def K(**kw):
    return kitten(**kw)


def fx(frame, name, x, y):
    """Effetto (nome in EFFECTS, o griglia) con l'angolo alto-sinistro in (x, y)."""
    return add_effect(frame, name, x, y)


def with_prop(frame, prop):
    return overlay(frame, prop)


def lift(frame, dy=0, dx=0):
    """Sposta tutto il gattino (salti, trascinamento, tremolio)."""
    return shift(frame, dx, dy)


# ---------------------------------------------------------------- idle
IDLE_FRAMES = [
    K(),                        # 0 base
    K(eyes="closed"),           # 1 ammiccare
    K(tail=2),                  # 2 coda alzata
    K(body_dy=1),               # 3 respiro (corpo abbassato di 1 px)
    K(ears="twitch"),           # 4 orecchio che fremette
]
# 6 fps, circa 6 secondi: respiro lento, coda ogni tanto, ammicco raro, un fremito
IDLE_SEQUENCE = [0, 0, 0, 3, 3, 3, 0, 0, 0, 3, 3, 3, 2, 2, 0, 0, 3, 3, 3, 0, 0, 0, 1, 1, 0, 0,
                 3, 3, 3, 0, 0, 4, 4, 0, 0, 0, 3, 3, 3, 0, 0, 2, 2, 0]

# ---------------------------------------------------------------- sleep
_SLEEP = dict(eyes="closed", tail=0)
SLEEP_FRAMES = [
    fx(K(**_SLEEP), "z_s", 26, 8),
    fx(K(body_dy=1, **_SLEEP), "z_s", 26, 5),
    fx(K(**_SLEEP), "z_l", 24, 2),
    fx(K(body_dy=1, **_SLEEP), "z_l", 25, 0),
]

# ---------------------------------------------------------------- listening
# Sobbalzo di attenzione: si drizza di 1 px con le orecchie che fremono e la
# coda alta, così non si confonde con idle.
LISTENING_FRAMES = [
    K(eyes="wide", tail=2),
    lift(K(eyes="wide", ears="twitch", tail=3), -1),
    K(eyes="wide", ears="twitch_l", tail=2),
]

# ---------------------------------------------------------------- thinking
THINKING_FRAMES = [
    fx(K(eyes="look_up_right"), dots(1), 22, 3),
    fx(K(eyes="look_up_right"), dots(2), 22, 3),
    fx(K(eyes="look_up_right"), dots(3), 22, 3),
    fx(K(eyes="look_up"), dots(3), 22, 3),
]

# ---------------------------------------------------------------- working
WORKING_FRAMES = [
    with_prop(K(eyes="half"), laptop("up", "down", 0)),
    with_prop(K(eyes="half"), laptop("down", "down", 1)),
    with_prop(K(eyes="half"), laptop("down", "up", 2)),
    with_prop(K(eyes="half"), laptop("down", "down", 3)),
]

# ---------------------------------------------------------------- reading
READING_FRAMES = [
    with_prop(K(eyes="look_down_left"), book(0)),
    with_prop(K(eyes="look_down"), book(0)),
    with_prop(K(eyes="look_down_right"), book(0)),
    with_prop(K(eyes="look_down_right"), book(1)),
    with_prop(K(eyes="look_down"), book(2)),
]
READING_SEQUENCE = [0, 0, 1, 1, 2, 2, 3, 4]

# ---------------------------------------------------------------- writing
WRITING_FRAMES = [
    with_prop(K(eyes="look_down", mouth="tongue"), paper_pencil(2, 0)),
    with_prop(K(eyes="look_down", mouth="tongue"), paper_pencil(3, 1)),
    with_prop(K(eyes="look_down", mouth="tongue"), paper_pencil(4, 0)),
    with_prop(K(eyes="look_down", mouth="tongue"), paper_pencil(5, 1)),
]
WRITING_SEQUENCE = [0, 1, 2, 3, 2, 1]

# ---------------------------------------------------------------- running
RUNNING_FRAMES = [
    fx(K(eyes="wide", mouth="open", tail=2), "bolt", 25, 0),
    K(eyes="wide", tail=4, body_dy=1),
    fx(K(eyes="wide", mouth="open", tail=4), "bolt", 25, 0),
    K(eyes="wide", tail=2, body_dy=1),
]

# ---------------------------------------------------------------- waiting
WAITING_FRAMES = [
    fx(K(eyes="open", mouth="o", tail=0, paw="raised"), "exclaim", 25, 1),
    fx(K(eyes="open", mouth="o", tail=0, paw="raised", body_dy=1), "exclaim", 25, 2),
    fx(K(eyes="half", mouth="o", tail=0, paw="raised"), "exclaim", 25, 2),
    fx(K(eyes="open", mouth="o", tail=0, paw="raised", body_dy=1), "exclaim", 25, 1),
]

# ---------------------------------------------------------------- done
_DONE = dict(eyes="happy", mouth="smile", blush=True)
DONE_FRAMES = [
    fx(K(tail=2, **_DONE), "sparkle_s", 26, 5),
    fx(K(tail=4, **_DONE), "sparkle_l", 25, 3),
    fx(K(tail=2, **_DONE), "sparkle_s", 27, 7),
    K(tail=4, **_DONE),
]

# ---------------------------------------------------------------- celebrate
_HAPPY = dict(eyes="happy", mouth="open", blush=True)
CELEBRATE_FRAMES = [
    K(body_dy=1, tail=4, **_HAPPY),                                               # 0 accovacciato
    lift(K(tail=0, paw="wave", paw_r="wave", **_HAPPY), -2),                      # 1 stacco
    fx(fx(lift(K(tail=0, paw="wave", paw_r="wave", **_HAPPY), -4), "heart", 23, 0), "sparkle_l", 1, 3),   # 2 in alto
    fx(fx(lift(K(tail=0, paw="wave", paw_r="wave", **_HAPPY), -2), "sparkle_s", 25, 4), "sparkle_s", 3, 6),  # 3 scende
    fx(K(body_dy=1, tail=2, eyes="happy", mouth="smile", blush=True), "sparkle_s", 26, 6),   # 4 atterraggio
    fx(fx(K(tail=4, eyes="happy", mouth="smile", blush=True), "sparkle_s", 26, 4), "sparkle_s", 2, 6),   # 5 posa finale
]

# ---------------------------------------------------------------- error
_ERR = dict(eyes="x", mouth="frown", ears="flat", tail=3)
ERROR_FRAMES = [
    fx(lift(K(**_ERR), 0, -1), "sweat", 0, 4),
    fx(lift(K(**_ERR), 0, 1), "sweat", 0, 4),
    fx(lift(K(**_ERR), 0, -1), "sweat", 0, 5),
    fx(lift(K(**_ERR), 0, 1), "sweat", 0, 5),
]

# ---------------------------------------------------------------- talk
TALK_FRAMES = [
    K(mouth="open"),
    K(mouth="none"),
    K(mouth="o"),
    K(mouth="none", eyes="closed"),
]
TALK_SEQUENCE = [0, 1, 2, 1, 0, 2, 1, 0, 1, 2, 1, 3, 1]

# ---------------------------------------------------------------- look
LOOK_FRAMES = [
    lens_on(K(eyes="look_left", tail=0), -1, 0),
    lens_on(K(eyes="open", tail=0), 0, 0),
    lens_on(K(eyes="look_up", tail=0), 0, -1),
    lens_on(K(eyes="look_down", tail=0), 0, 1),
]
LOOK_SEQUENCE = [0, 1, 2, 1, 3, 1]

# ---------------------------------------------------------------- drag
_DRAG = dict(eyes="wide", mouth="o", tail=0)
# Ombra a terra ferma mentre il gattino, sollevato, oscilla: si capisce che
# è in aria anche se la finestra si sposta insieme a lui.
_SHADOW = ["..SSSSSSSSSSSS..", "SSSSSSSSSSSSSSSS", "..SSSSSSSSSSSS.."]


def _with_shadow(frame):
    return overlay(blank(W, H), _SHADOW, 8, 29) if frame is None else overlay(overlay(blank(W, H), _SHADOW, 8, 29), frame)


DRAG_FRAMES = [
    _with_shadow(lift(K(**_DRAG), -3, -1)),
    _with_shadow(lift(K(**_DRAG), -3, 0)),
    _with_shadow(lift(K(**_DRAG), -3, 1)),
]
DRAG_SEQUENCE = [0, 1, 2, 1]


ANIMATIONS = {
    "idle": {"frames": IDLE_FRAMES, "sequence": IDLE_SEQUENCE, "fps": 6},
    "sleep": {"frames": SLEEP_FRAMES, "durations": [600, 600, 600, 600]},
    "listening": {"frames": LISTENING_FRAMES, "sequence": [0, 1, 0, 2], "fps": 6},
    "thinking": {"frames": THINKING_FRAMES, "fps": 3},
    "working": {"frames": WORKING_FRAMES, "fps": 8},
    "reading": {"frames": READING_FRAMES, "sequence": READING_SEQUENCE, "fps": 4},
    "writing": {"frames": WRITING_FRAMES, "sequence": WRITING_SEQUENCE, "fps": 6},
    "running": {"frames": RUNNING_FRAMES, "fps": 8},
    "waiting": {"frames": WAITING_FRAMES, "fps": 6},
    "done": {"frames": DONE_FRAMES, "fps": 6},
    "celebrate": {"frames": CELEBRATE_FRAMES, "durations": [160, 100, 100, 100, 120, 400], "loop": False},
    "error": {"frames": ERROR_FRAMES, "fps": 10},
    "talk": {"frames": TALK_FRAMES, "sequence": TALK_SEQUENCE, "fps": 6},
    "look": {"frames": LOOK_FRAMES, "sequence": LOOK_SEQUENCE, "fps": 4},
    "drag": {"frames": DRAG_FRAMES, "sequence": DRAG_SEQUENCE, "fps": 6},
}
