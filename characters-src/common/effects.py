"""Effetti e colori condivisi da tutti i gattini.

Gli effetti (z, puntini, !, ?, stelline, cuori, sudore, fulmine) sono glifi
con contorno 'o', il carattere del contorno di ogni gattino. I loro colori
usano solo cifre, che non collidono con le palette dei personaggi: basta
unire EFFECT_PALETTE alla PALETTE del gattino.

    from effects import EFFECT_PALETTE, EFFECTS, add_effect
    frame = add_effect(kitten(eyes="closed"), "z_s", 22, 4)
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from pixelkit import T, blank, dims, grid, overlay  # noqa: E402

# Cifre riservate a effetti e oggetti di scena (libro, portatile, matita, lente).
EFFECT_PALETTE = {
    "1": "#ffffff",  # luce, bianco puro
    "2": "#ffd23f",  # giallo: stelline, fulmine
    "3": "#ff5a7a",  # rosso-rosa: cuori
    "4": "#7cc8ff",  # azzurro: sudore, acqua
    "5": "#e8e4ff",  # lavanda chiarissimo: z del sonno
    "6": "#ff6a3d",  # arancio-rosso: punto esclamativo
    "7": "#bfe6ff",  # vetro, schermo acceso
    "8": "#fbf7ef",  # carta
    "9": "#8a8fa3",  # grigio metallo (oggetti)
    "0": "#5b6178",  # grigio scuro (oggetti, ombre degli oggetti)
}


def outlined(g: list[str], ch: str = "o", diagonal: bool = False) -> list[str]:
    """Aggiunge 1 px di contorno tutto intorno: il glifo si legge su sfondi
    chiari e scuri. Con 4 vicini (default) gli angoli restano morbidi; con
    diagonal=True si usano 8 vicini. La griglia cresce di 1 px per lato."""
    w, h = dims(g)
    src = overlay(blank(w + 2, h + 2), g, 1, 1)
    out = [list(r) for r in src]
    for y in range(h + 2):
        for x in range(w + 2):
            if src[y][x] != T:
                continue
            for dx, dy in (_NEIGHBOURS_8 if diagonal else _NEIGHBOURS_4):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w + 2 and 0 <= ny < h + 2 and src[ny][nx] not in (T, ch):
                    out[y][x] = ch
    return ["".join(r) for r in out]


_NEIGHBOURS_4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
_NEIGHBOURS_8 = _NEIGHBOURS_4 + ((1, 1), (1, -1), (-1, 1), (-1, -1))

# Glifi senza contorno: il contorno viene aggiunto da outlined().
_RAW = {
    "z_s": """
        5555
        ..5.
        .5..
        5555
    """,
    "z_l": """
        55555
        ...5.
        ..5..
        .5...
        55555
    """,
    "dot": """
        11
        11
    """,
    "exclaim": """
        66
        66
        66
        ..
        66
    """,
    "question": """
        .666.
        66.66
        ...66
        ..66.
        .....
        ..66.
    """,
    "sparkle_s": """
        .2.
        212
        .2.
    """,
    "sparkle_l": """
        ..2..
        ..2..
        22122
        ..2..
        ..2..
    """,
    "heart": """
        .33.33.
        3313333
        3333333
        .33333.
        ..333..
        ...3...
    """,
    "sweat": """
        .4.
        .4.
        444
        414
        .4.
    """,
    "bolt": """
        ...22
        ..22.
        .22..
        22222
        ..22.
        .22..
        .2...
    """,
}

EFFECTS = {name: outlined(grid(src)) for name, src in _RAW.items()}


def dots(n: int) -> list[str]:
    """Nuvoletta di pensiero con 1, 2 o 3 puntini in fila (contorno incluso)."""
    if not 1 <= n <= 3:
        raise ValueError("dots: da 1 a 3")
    row = grid(["11.11.11"[: 3 * n - 1], "11.11.11"[: 3 * n - 1]])
    return outlined(row)


def add_effect(frame: list[str], effect, x: int, y: int) -> list[str]:
    """Sovrappone un effetto (nome in EFFECTS o griglia) al fotogramma.
    (x, y) è l'angolo in alto a sinistra del glifo, contorno compreso."""
    g = EFFECTS[effect] if isinstance(effect, str) else effect
    return overlay(frame, g, x, y)


if __name__ == "__main__":
    # Anteprima degli effetti su sfondo chiaro e scuro: python3 effects.py <file.png>
    from pixelkit import contact_sheet

    names = list(EFFECTS)
    tiles = [overlay(blank(12, 12), EFFECTS[n], 2, 2) for n in names] + [
        overlay(blank(12, 12), dots(k), 1, 4) for k in (1, 2, 3)
    ]
    pal = {"o": "#3a2238", **EFFECT_PALETTE}
    contact_sheet([("effetti", tiles)], pal, scale=8).save(sys.argv[1] if len(sys.argv) > 1 else "effects.png")
    print(", ".join(names + ["dots(1)", "dots(2)", "dots(3)"]))
