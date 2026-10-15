#!/usr/bin/env python3
"""Rigenera viewer/test/fixtures/demo-pack/ (character.json + sprites.png).

Pacchetto di prova per il visore: 32x32, 4 stati, forme semplici. Le barre in
alto contano i fotogrammi (1 barra = colonna 0, 2 barre = colonna 1, ...), così
si vede subito quale colonna del foglio viene mostrata.

Uso, dalla cartella mascotte/:  python3 viewer/test/fixtures/make_demo_pack.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "tools"))  # mascotte/tools

import pixelkit as pk  # noqa: E402

W = H = 32
PALETTE = {
    "o": "#2b1d2a",  # contorno scuro (non nero puro)
    "f": "#f2a65a",  # idle
    "b": "#6aa6e8",  # sleep
    "p": "#b58be0",  # thinking
    "g": "#6cc788",  # done
    "k": "#3b3b98",  # barre del numero di fotogramma
}


def rect(x0, y0, x1, y1):
    return [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]


def frame(fill, index, eyes_dx=0, closed=False, smile=0):
    g = pk.blank(W, H)
    g = pk.put(g, rect(6, 12, 25, 29), "o")
    g = pk.put(g, rect(7, 13, 24, 28), fill)
    for k in range(index + 1):  # numero di barre = colonna + 1
        g = pk.put(g, rect(6 + k * 5, 3, 8 + k * 5, 8), "k")
    ey = rect(12 + eyes_dx, 20, 13 + eyes_dx, 20) if closed else rect(12 + eyes_dx, 18, 13 + eyes_dx, 20)
    ey += rect(18 + eyes_dx, 20, 19 + eyes_dx, 20) if closed else rect(18 + eyes_dx, 18, 19 + eyes_dx, 20)
    g = pk.put(g, ey, "o")
    if smile:
        g = pk.put(g, rect(16 - smile, 24, 15 + smile, 24), "o")
    return g


animations = {
    "idle": {
        "frames": [frame("f", i, eyes_dx=(i % 2)) for i in range(4)],
        "sequence": [0, 1, 2, 3, 2, 1],
        "fps": 6,
    },
    "sleep": {
        "frames": [frame("b", i, closed=True) for i in range(2)],
        "durations": [900, 700],
    },
    "thinking": {
        "frames": [frame("p", i, eyes_dx=i - 1) for i in range(3)],
        "fps": 8,
    },
    "done": {
        "frames": [frame("g", i, smile=i + 1) for i in range(4)],
        "fps": 10,
        "loop": False,
    },
}

out = HERE / "demo-pack"
character = pk.build_pack(
    out,
    meta={
        "id": "demo-pack",
        "name": "Demo",
        "author": "Mascotte",
        "license": "CC0-1.0",
        "scale": 4,
        "bubble": {"x": 16, "y": 8},
    },
    palette=PALETTE,
    animations=animations,
    frame_w=W,
    frame_h=H,
)
# build_pack non scrive i ripieghi: li aggiungiamo per provarli nel visore.
character["fallbacks"] = {"waiting": "thinking"}
(out / "character.json").write_text(pk._compact_json(character) + "\n", encoding="utf-8")
print(json.dumps(character, ensure_ascii=False)[:200])
