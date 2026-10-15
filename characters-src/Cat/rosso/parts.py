"""Rosso: gattino tigrato arancione, frontale chibi, costruito a parti.

Ogni parte (testa, busto, zampe, coda, occhi, bocca...) e' una piccola griglia
di testo. kitten(...) le compone su una tela 32x32 e ritorna la griglia.

Convenzioni:
  - le parti "di sagoma" (testa, busto, braccia, coda) sono disegnate SENZA
    contorno: lo aggiunge outline() (1 pixel, solo dove c'e' trasparenza
    accanto a un pixel pieno). Cosi' il contorno e' sempre chiuso, continuo
    e mai spesso 2 pixel.
  - le parti "interne" (occhi, bocca, strisce, guance, zampine) si
    sovrappongono dopo.
  - il gattino e' appoggiato alla riga 31 e occupa le righe 8-31; la testa e'
    centrata sull'asse tra le colonne 15 e 16 (le parti simmetriche nascono da
    una meta' specchiata, quindi non possono sbilanciarsi).
  - le braccia sono disegnate per il lato sinistro della tela e specchiate per
    il destro: paw = braccio a sinistra, paw_r = braccio a destra.

Uso:
    from parts import kitten, PALETTE, BASE
    g = kitten(eyes="happy", mouth="open", tail=2, paw="wave", blush=True)
    # g e' una lista di 32 stringhe; ogni carattere e' una chiave di PALETTE

Per i controlli automatici su tutte le combinazioni: python3 parts.py --check
Per il foglio di controllo delle parti: python3 parts.py  (scrive parts-contact.png
nella cartella di lavoro, vedi __main__).
"""
from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parents[2]                      # ROOT del progetto
for _p in (_ROOT / "tools", _ROOT / "characters-src" / "common"):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from pixelkit import (T, blank, contact_sheet, dims, erase, mirror, overlay,  # noqa: E402
                      put, save_gif, shift)
from effects import EFFECT_PALETTE, EFFECTS, add_effect, dots, outlined  # noqa: E402,F401

W = H = 32

# ------------------------------------------------------------------ palette
KITTEN_PALETTE = {
    "o": "#3a2238",  # contorno (viola-marrone scuro), pupille, bocca
    "f": "#f0a04b",  # arancione base
    "F": "#cf6d2e",  # arancione scuro: strisce e ombre
    "c": "#fdebc8",  # crema: muso, petto, guanti delle zampe
    "C": "#e6c493",  # crema in ombra
    "p": "#f58aa3",  # rosa: interno orecchie, naso, lingua
    "b": "#f2688a",  # rosa acceso: guance (blush)
    "w": "#ffffff",  # luce degli occhi
    "S": "#3a223840",  # ombra a terra, semitrasparente (drag)
}
PALETTE = {**KITTEN_PALETTE, **EFFECT_PALETTE}
assert not set(KITTEN_PALETTE) & set(EFFECT_PALETTE), "collisione tra palette"


# ------------------------------------------------------------------ utilita'
def outline(g, ch="o"):
    """Aggiunge il contorno di 1 pixel attorno ai pixel pieni (4 vicini)."""
    w, h = dims(g)
    out = [list(r) for r in g]
    for y in range(h):
        for x in range(w):
            if g[y][x] != T:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and g[ny][nx] != T:
                    out[y][x] = ch
                    break
    return ["".join(r) for r in out]


def sym(half):
    """Specchia una meta' sinistra per ottenere la griglia simmetrica."""
    return [r + r[::-1] for r in half]


def at(part, x, y):
    """Mette una parte su una tela vuota 32x32 alla posizione (x, y)."""
    return overlay(blank(W, H), part, x, y)


def flip(g):
    """Specchia l'intera tela rispetto all'asse del gattino (x -> 31 - x)."""
    return mirror(g)


# ------------------------------------------------------------------ testa
# Meta' sinistra, 11 colonne x 13 righe (l'indice 0 e' il margine sinistro, la
# faccia parte dalla colonna 2). Con il contorno la testa e' 20x15.
# Le righe r0-r3 sono le orecchie e cambiano con ears=...
HEAD_BODY = [               # r4 ... r12: faccia, uguale per tutte le orecchie
    "..fffffffff",          # r4  bordo alto tra le orecchie
    "..fffffffff",
    "..fffffffff",
    "..fffffffff",
    "..fffffffff",
    "..fffffffff",
    "..fffffffff",          # r10
    "...ffffffff",          # r11 guancia che si stringe
    "....fffffff",          # r12 mento
]
EARS_L = {
    "up": [
        ".....f.....",
        "....fpf....",
        "...fpppf...",
        "..fpppppf..",
    ],
    # orecchio piu' basso e piu' largo: serve per il "twitch"
    "twitch": [
        "...........",
        "....f......",
        "...fpf.....",
        "..fpppppf..",
    ],
    # orecchie abbassate all'indietro: due cunei bassi sugli angoli della
    # testa, alti solo 2 righe, che scivolano verso l'esterno. Non escono mai
    # dalla colonna 7: la sagoma della testa resta quella di prima.
    "flat": [
        "...........",
        "..f........",
        "..ffp......",
        "..fFppFff..",
    ],
}
HEAD_X, HEAD_Y = 5, 9      # posizione della meta' sinistra sulla tela (r0)
EARS_KINDS = ["up", "flat", "twitch", "twitch_l"]


def head_fill(ears="up", blush=False):
    def half(kind):
        return list(EARS_L[kind]) + HEAD_BODY
    left_kind = {"twitch": "up", "twitch_l": "twitch"}.get(ears, ears)
    right_kind = {"twitch_l": "up"}.get(ears, ears)
    left, right = half(left_kind), half(right_kind)
    rows = [l + r[::-1] for l, r in zip(left, right)]
    g = at(rows, HEAD_X, HEAD_Y)
    # muso crema
    for y, (a, b) in {18: (14, 17), 19: (13, 18), 20: (13, 18), 21: (14, 17)}.items():
        g = put(g, [(x, y) for x in range(a, b + 1)], "c")
    return g


# ------------------------------------------------------------------ busto
# righe y=22..30 (canvas). Meta' sinistra: colonne x=8..15.
TORSO_HALF = [
    "...ffccc",   # y22 (coperta dal mento)
    "...FFccc",   # y23 ombra sotto il mento
    "...ffccc",   # y24   <- riga "elastica" per il respiro
    "..Ffffcc",   # y25
    "..Ffffcc",   # y26
    ".fffffcc",   # y27
    ".fffffcc",   # y28
    ".fffffcc",   # y29
    "...fffcc",   # y30 (piu' stretta: il contorno fa da lato alla zampa)
]
TORSO_STRETCH = 2  # indice della riga che sparisce con body_dy=1


def torso_fill(dy):
    rows = sym(TORSO_HALF)
    if dy:
        rows = rows[:TORSO_STRETCH] + rows[TORSO_STRETCH + 1:]
    return at(rows, 8, 22 + dy)


# ------------------------------------------------------------------ zampine
# toppa 5x4 (x=10..14, y=27..30): linea d'ombra della gamba + punta crema
LEG_PATCH = [
    "Ffff.",
    "Ffff.",
    "occco",
    ".CCCo",
]


def leg_patch(side):
    if side == "left":
        return at(LEG_PATCH, 10, 27)
    return at(mirror(LEG_PATCH), 17, 27)


# ------------------------------------------------------------------ coda
# (x0, y0, righe) - solo riempimento, il contorno e' automatico.
# La base entra sotto il busto (viene coperta), cosi' non ci sono doppi contorni.
TAILS = {
    0: (22, 26, [          # bassa, appoggiata a terra con la punta in su
        ".....FF",
        ".....ff",
        ".....FF",
        "..fffff",
        "ffffff.",
    ]),
    1: (22, 22, [          # rilassata, a meta' altezza
        "....FF.",
        "....FFF",
        "....fff",
        "....fff",
        "...FFFF",
        "..ffff.",
        "..ffff.",
        "..FFFF.",
        "fffff..",
    ]),
    2: (22, 20, [          # alzata
        ".....FF",
        ".....FF",
        "....fff",
        "....fff",
        "....FFF",
        "....fff",
        "...ffff",
        "..FFFF.",
        "..ffff.",
        "..ffff.",
        "fffff..",
    ]),
    # gonfia (spavento): dritta, molto piu' spessa, con il pelo ritto (max colonna 29:
    # con il contorno arriva a 30, cosi' un tremolio di 1 px non esce dalla tela)
    3: (22, 14, [
        ".....FF.",
        "....FFFF",
        "....fFFf",
        ".....FFF",
        "....ffff",
        "....FFFF",
        "....fffF",
        "...FFFFf",
        "...fffff",
        "..FFFFFF",
        "..ffffff",
        ".FFFFFFF",
        ".fffffff",
        ".FFFFFFf",
        ".ffffff.",
        "ffffff..",
        "fffff...",
    ]),
    4: (22, 22, [          # alta, con la punta ricurva verso il corpo (per scodinzolare)
        "...FF..",
        "....FF.",
        "....fff",
        "....FFF",
        "...ffff",
        "..ffff.",
        "..FFFF.",
        "..ffff.",
        "fffff..",
    ]),
}


@lru_cache(maxsize=None)
def _tail_layer(tail):
    x0, y0, rows = TAILS[tail]
    return tuple(outline(at(rows, x0, y0)))


def tail_layer(tail):
    return list(_tail_layer(tail))


# ------------------------------------------------------------------ occhi
EYES = {
    "open": [
        ".oo.",
        "owoo",
        "oooo",
        ".oo.",
    ],
    "wide": [
        ".oo.",
        "owwo",
        "owoo",
        "oooo",
        ".oo.",
    ],
    "half": [
        "oooo",
        "owoo",
        ".oo.",
    ],
    "closed": [
        "o..o",
        ".oo.",
    ],
    "happy": [
        ".oo.",
        "o..o",
    ],
    "x": [
        "o..o",
        ".oo.",
        ".oo.",
        "o..o",
    ],
}
EYE_L_X, EYE_R_X, EYE_Y = 9, 19, 15
# riga alta di ogni variante rispetto a EYE_Y (allineate in basso)
EYE_DY = {"open": 0, "wide": -1, "half": 1, "closed": 2, "happy": 2, "x": 0}
# sguardi: occhi "open" spostati di 1 pixel
EYE_LOOK = {
    "look_left": (-1, 0), "look_right": (1, 0),
    "look_up": (0, -1), "look_up_left": (-1, -1), "look_up_right": (1, -1),
    "look_down": (0, 1), "look_down_left": (-1, 1), "look_down_right": (1, 1),
}


@lru_cache(maxsize=None)
def _eyes_layer(kind):
    ox = oy = 0
    base = kind
    if kind in EYE_LOOK:
        base = "open"
        ox, oy = EYE_LOOK[kind]
    g = blank(W, H)
    dy = EYE_DY[base]
    for ex in (EYE_L_X, EYE_R_X):
        g = overlay(g, EYES[base], ex + ox, EYE_Y + dy + oy)
    return tuple(g)


def eyes_layer(kind):
    return list(_eyes_layer(kind))


# ------------------------------------------------------------------ muso
@lru_cache(maxsize=None)
def _face_layer(mouth):
    g = blank(W, H)
    g = put(g, [(15, 18), (16, 18)], "p")          # naso
    if mouth == "smile":
        g = put(g, [(14, 19), (17, 19), (15, 20), (16, 20)], "o")
    elif mouth == "open":
        g = put(g, [(14, 19), (15, 19), (16, 19), (17, 19)], "o")
        g = put(g, [(15, 20), (16, 20)], "p")
    elif mouth == "o":
        g = put(g, [(15, 19), (16, 19), (15, 20), (16, 20)], "o")
    elif mouth == "frown":
        g = put(g, [(15, 19), (16, 19), (14, 20), (17, 20)], "o")
    elif mouth == "tongue":                         # sorriso con la lingua fuori
        g = put(g, [(14, 19), (17, 19), (15, 20)], "o")
        g = put(g, [(16, 20), (17, 20), (16, 21)], "p")
    return tuple(g)


def face_layer(mouth):
    return list(_face_layer(mouth))


@lru_cache(maxsize=None)
def _markings_layer():
    """Strisce tigrate di fronte e guance."""
    g = blank(W, H)
    g = put(g, [(15, 13), (16, 13), (15, 14), (16, 14)], "F")
    g = put(g, [(12, 13), (12, 14), (19, 13), (19, 14)], "F")
    g = put(g, [(9, 21), (10, 21), (11, 21), (12, 21), (13, 21), (18, 21), (19, 21), (20, 21), (21, 21), (22, 21)], "F")
    return tuple(g)


def markings_layer():
    return list(_markings_layer())


@lru_cache(maxsize=None)
def _blush_layer():
    """Guance rosa sotto gli occhi."""
    g = blank(W, H)
    left = [(9, 19), (10, 19), (11, 19), (9, 20), (10, 20)]
    right = [(31 - x, y) for x, y in left]
    return tuple(put(g, left + right, "b"))


def blush_layer():
    return list(_blush_layer())


# ------------------------------------------------------------------ braccia
# (x0, y0, righe, riga dalla quale il contorno sul busto sparisce).
# Braccio SINISTRO (lato sinistro della tela); il destro e' lo specchio.
# Il guanto crema e' sempre almeno 4x3 con il contorno intorno, il braccio 3-4 px.
ARMS = {
    # zampa alzata: avambraccio dritto accanto al corpo, guanto all'altezza della guancia
    "raised": (4, 21, [
        "cccc...",
        "cccc...",
        "ccCC...",
        ".ffff..",
        ".fffffff",
    ], 4),
    # braccio alzato in alto lungo la testa (saluto)
    "wave": (2, 15, [
        "cccc......",
        "cccc......",
        "cccc......",
        "ccCC......",
        "ffff......",
        ".ffff.....",
        "..ffff....",
        "...ffff...",
        "....ffff..",
        ".....ffff.",
    ], 6),
    # saluto, posizione piu' bassa e piu' aperta
    "wave2": (1, 20, [
        "cccc......",
        "cccc......",
        "cccc......",
        "ccCC......",
        ".ffff.....",
        "..ffff....",
        "...ffff...",
        "....ffff..",
    ], 4),
}
PAWS = [None, "raised", "wave", "wave2"]


@lru_cache(maxsize=None)
def _arm_layer(paw, dy):
    if paw is None:
        return tuple(blank(W, H))
    x0, y0, rows, merge = ARMS[paw]
    top = y0 + dy                  # il braccio segue il busto quando respira
    g = at(rows, x0, top)
    g = outline(g)
    body = torso_fill(dy)
    # dove il braccio entra nel busto il contorno sparisce (si fonde)
    for y in range(H):
        for x in range(W):
            if g[y][x] == "o" and body[y][x] != T and y >= top + merge:
                g = put(g, [(x, y)], T)
    return tuple(g)


def arm_layer(paw, dy=0, side="left"):
    g = list(_arm_layer(paw, dy))
    return g if side == "left" else flip(g)


# ------------------------------------------------------------------ composizione
VARIANTS = {
    "eyes": ["open", "closed", "half", "happy", "wide", "x"] + list(EYE_LOOK),
    "mouth": ["none", "smile", "open", "o", "frown", "tongue"],
    "ears": EARS_KINDS,                        # up, flat (basse), twitch (destra), twitch_l (sinistra)
    "tail": [0, 1, 2, 3, 4],                   # 0 bassa, 1 rilassata, 2 alzata, 3 gonfia, 4 alzata con punta ricurva
    "paw": PAWS,                               # braccio sinistro (della tela)
    "paw_r": PAWS,                             # braccio destro (della tela)
    "body_dy": [0, 1],                         # 1 = corpo abbassato di 1 px (respiro)
    "blush": [False, True],                    # guance rosa
}


@lru_cache(maxsize=None)
def _head_layer(ears, dy, blush):
    head = outline(head_fill(ears) if dy == 0 else shift(head_fill(ears), 0, dy))
    head = overlay(head, markings_layer(), 0, dy)
    return tuple(head)


def kitten(eyes="open", mouth="none", ears="up", tail=1, paw=None, body_dy=0, paw_r=None, blush=False):
    """Compone il gattino e ritorna una griglia 32x32 (lista di 32 stringhe).

    eyes    open | closed | half | happy | wide | x
            | look_left | look_right | look_up | look_up_left | look_up_right
            | look_down | look_down_left | look_down_right
    mouth   none | smile | open | o | frown | tongue
    ears    up | flat | twitch (orecchio destro piu' basso) | twitch_l (sinistro)
    tail    0 bassa | 1 rilassata | 2 alzata | 3 gonfia (spavento) | 4 alzata ricurva
    paw     braccio sinistro della tela: None | raised | wave | wave2
    paw_r   braccio destro della tela: stessi valori
    body_dy 0 | 1
    blush   False | True (guance rosa)
    """
    for name, value in (("eyes", eyes), ("mouth", mouth), ("ears", ears), ("tail", tail),
                        ("paw", paw), ("paw_r", paw_r), ("body_dy", body_dy), ("blush", blush)):
        if value not in VARIANTS[name]:
            raise ValueError(f"{name}={value!r} non valido, scegli tra {VARIANTS[name]}")
    c = blank(W, H)
    c = overlay(c, tail_layer(tail))
    c = overlay(c, outline(torso_fill(body_dy)))
    # Le toppe crema sono le zampe ANTERIORI appoggiate: se quella zampa è
    # alzata, viene sostituita dal braccio, non duplicata. Le anche posteriori
    # restano nella sagoma arancione del busto.
    if paw is None:
        c = overlay(c, leg_patch("left"))
    if paw_r is None:
        c = overlay(c, leg_patch("right"))
    c = overlay(c, arm_layer(paw, body_dy, "left"))
    c = overlay(c, arm_layer(paw_r, body_dy, "right"))
    c = overlay(c, list(_head_layer(ears, body_dy, False)))
    if blush:
        c = overlay(c, blush_layer(), 0, body_dy)
    c = overlay(c, eyes_layer(eyes), 0, body_dy)
    c = overlay(c, face_layer(mouth), 0, body_dy)
    return c


BASE = kitten()      # posa seduta di riposo: occhi aperti, coda rilassata


# ------------------------------------------------------------------ controlli
def frame_problems(g, palette=PALETTE):
    """Controlli su un fotogramma qualsiasi (anche con effetti e oggetti).
    Ritorna la lista dei problemi (vuota = ok)."""
    problems = []
    if len(g) != H or any(len(r) != W for r in g):
        return [f"misura {dims(g)} invece di {(W, H)}"]
    for y in range(H):
        for x in range(W):
            ch = g[y][x]
            if ch == T:
                continue
            if ch not in palette:
                problems.append(f"({x},{y}): carattere {ch!r} fuori palette")
                continue
            near = [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
            vals = [g[ny][nx] if 0 <= nx < W and 0 <= ny < H else None for nx, ny in near]
            if all(v in (None, T) for v in vals):
                problems.append(f"({x},{y}): pixel isolato {ch!r}")
            # contorno chiuso: un pixel non 'o' non confina mai con il vuoto
            # (l'ombra a terra 'S' è volutamente senza contorno)
            if ch not in ("o", "S") and any(v == T for v in vals):
                problems.append(f"({x},{y}): contorno aperto vicino a {ch!r}")
    return problems


def kitten_problems(g):
    """Controlli specifici del gattino (posa a terra)."""
    problems = frame_problems(g)
    if any(ch != T for r in g[:8] for ch in r):
        problems.append("righe 0-7 non libere")
    if all(ch == T for ch in g[31]):
        problems.append("riga 31 vuota")
    return problems


def _all_combos():
    import itertools
    keys = ["eyes", "mouth", "ears", "tail", "paw", "paw_r", "body_dy", "blush"]
    for vals in itertools.product(*(VARIANTS[k] for k in keys)):
        yield dict(zip(keys, vals))


def _check_chunk(chunk):
    bad = []
    for kw in chunk:
        pr = kitten_problems(kitten(**kw))
        if pr:
            bad.append((kw, pr[:3]))
    return bad


def check_all(workers=8):
    """Controlla TUTTE le combinazioni di parametri. Ritorna (totale, errori)."""
    from multiprocessing import Pool
    combos = list(_all_combos())
    size = 2000
    chunks = [combos[i:i + size] for i in range(0, len(combos), size)]
    bad = []
    with Pool(workers) as pool:
        for part in pool.imap_unordered(_check_chunk, chunks):
            bad.extend(part)
    return len(combos), bad


def contact_rows():
    return [
        ("idle", [BASE, kitten(eyes="closed"), kitten(tail=2), kitten(body_dy=1)]),
        ("occhi", [kitten(eyes=e) for e in VARIANTS["eyes"]]),
        ("bocca", [kitten(mouth=m) for m in VARIANTS["mouth"]]),
        ("orecchie", [kitten(ears=e) for e in EARS_KINDS]),
        ("coda", [kitten(tail=t) for t in VARIANTS["tail"]]),
        ("braccia", [kitten(paw=p) for p in PAWS[1:]] + [kitten(paw_r=p) for p in PAWS[1:]]
                    + [kitten(paw="wave", paw_r="wave"), kitten(blush=True, eyes="happy", mouth="smile")]),
    ]


if __name__ == "__main__":
    if "--check" in sys.argv:
        total, bad = check_all()
        print(f"combinazioni controllate: {total}; con problemi: {len(bad)}")
        for kw, pr in bad[:20]:
            print(kw, pr)
        sys.exit(1 if bad else 0)
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else _ROOT / "work" / "previews" / "rosso" / "parts-contact.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    contact_sheet(contact_rows(), PALETTE, scale=6).save(out)
    print("ok", out)
