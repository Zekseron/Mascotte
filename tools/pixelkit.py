"""pixelkit: disegnare pixel art come testo e trasformarla in un pacchetto personaggio.

Un fotogramma ("grid") è una lista di stringhe tutte lunghe uguali.
Ogni carattere rimanda a un colore della palette; '.' (o lo spazio) è trasparente.

    PALETTE = {"o": "#2b1d2a", "f": "#f2a65a"}
    testa = grid('''
        .oooo.
        offffo
        .oooo.
    ''')
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image, ImageDraw

T = "."  # pixel trasparente

LIGHT_BG = "#f4f1ea"
DARK_BG = "#1e1f24"


# ---------------------------------------------------------------- griglie

def grid(src, w: int | None = None, h: int | None = None) -> list[str]:
    """Crea una griglia da testo multilinea o da una lista di righe.

    Toglie le righe vuote in testa e in coda e il rientro comune; gli spazi
    diventano trasparenti. Con w/h completa la griglia fino a quella misura.
    """
    if isinstance(src, str):
        lines = src.split("\n")
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and not lines[-1].strip():
            lines.pop()
        indent = min((len(l) - len(l.lstrip()) for l in lines if l.strip()), default=0)
        lines = [l[indent:].rstrip() for l in lines]
    else:
        lines = list(src)
    width = max([len(l) for l in lines] + [w or 0])
    if w is not None and width > w:
        raise ValueError(f"griglia larga {width}, massimo {w}")
    if h is not None and len(lines) > h:
        raise ValueError(f"griglia alta {len(lines)}, massimo {h}")
    lines = [l.replace(" ", T).ljust(width, T) for l in lines]
    if h is not None:
        lines += [T * width] * (h - len(lines))
    return lines


def blank(w: int, h: int) -> list[str]:
    return [T * w for _ in range(h)]


def dims(g: list[str]) -> tuple[int, int]:
    return (len(g[0]) if g else 0, len(g))


def overlay(base: list[str], part: list[str], x: int = 0, y: int = 0) -> list[str]:
    """Copia `part` sopra `base` a partire da (x, y); i pixel trasparenti non coprono."""
    out = [list(r) for r in base]
    bw, bh = dims(base)
    for j, row in enumerate(part):
        for i, ch in enumerate(row):
            if ch != T and 0 <= x + i < bw and 0 <= y + j < bh:
                out[y + j][x + i] = ch
    return ["".join(r) for r in out]


def place(part: list[str], w: int, h: int, x: int | None = None, y: int | None = None) -> list[str]:
    """Mette `part` su una tela w×h vuota: di default centrata e appoggiata in basso."""
    pw, ph = dims(part)
    x = (w - pw) // 2 if x is None else x
    y = h - ph if y is None else y
    return overlay(blank(w, h), part, x, y)


def shift(g: list[str], dx: int = 0, dy: int = 0) -> list[str]:
    w, h = dims(g)
    return overlay(blank(w, h), g, dx, dy)


def mirror(g: list[str]) -> list[str]:
    return [r[::-1] for r in g]


def recolor(g: list[str], mapping: dict[str, str]) -> list[str]:
    """Sostituisce caratteri: utile per varianti (occhi chiusi, colori diversi)."""
    return ["".join(mapping.get(c, c) for c in r) for r in g]


def put(g: list[str], points, ch: str) -> list[str]:
    """Colora i punti [(x, y), ...] con il carattere `ch`."""
    out = [list(r) for r in g]
    w, h = dims(g)
    for x, y in points:
        if 0 <= x < w and 0 <= y < h:
            out[y][x] = ch
    return ["".join(r) for r in out]


def erase(g: list[str], x: int, y: int, w: int, h: int) -> list[str]:
    """Rende trasparente il rettangolo indicato."""
    gw, gh = dims(g)
    out = [list(r) for r in g]
    for j in range(max(0, y), min(gh, y + h)):
        for i in range(max(0, x), min(gw, x + w)):
            out[j][i] = T
    return ["".join(r) for r in out]


def crop(g: list[str], x: int, y: int, w: int, h: int) -> list[str]:
    return [row[x:x + w].ljust(w, T) for row in (g[y:y + h] + blank(w, max(0, y + h - len(g))))][:h]


# ---------------------------------------------------------------- immagini

def _rgba(color: str) -> tuple[int, int, int, int]:
    c = color.lstrip("#")
    if len(c) == 6:
        c += "ff"
    if len(c) != 8:
        raise ValueError(f"colore non valido: {color!r}")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4, 6))  # type: ignore[return-value]


def render(g: list[str], palette: dict[str, str]) -> Image.Image:
    """Griglia → immagine RGBA a grandezza reale (1 carattere = 1 pixel)."""
    w, h = dims(g)
    if any(len(r) != w for r in g):
        raise ValueError("righe di lunghezza diversa nella griglia")
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(g):
        for x, ch in enumerate(row):
            if ch == T:
                continue
            if ch not in palette:
                raise KeyError(f"carattere {ch!r} non presente nella palette (x={x}, y={y})")
            px[x, y] = _rgba(palette[ch])
    return img


def upscale(img: Image.Image, scale: int) -> Image.Image:
    return img.resize((img.width * scale, img.height * scale), Image.NEAREST)


def on_background(img: Image.Image, color: str) -> Image.Image:
    bg = Image.new("RGBA", img.size, _rgba(color))
    bg.alpha_composite(img)
    return bg


def contact_sheet(rows, palette: dict[str, str], scale: int = 6) -> Image.Image:
    """Foglio di controllo ingrandito: per ogni riga (nome, [griglie]) mostra i
    fotogrammi su sfondo chiaro e su sfondo scuro, per verificare il contorno."""
    rows = list(rows)
    fw, fh = dims(rows[0][1][0])
    cols = max(len(frames) for _, frames in rows)
    cell_w, cell_h = fw * scale, fh * scale
    label_w, gap = 110, 4
    strip_w = cols * (cell_w + gap)
    sheet = Image.new("RGBA", (label_w + 2 * strip_w + gap, len(rows) * (cell_h + gap) + gap), _rgba("#888888"))
    draw = ImageDraw.Draw(sheet)
    for r, (name, frames) in enumerate(rows):
        y = gap + r * (cell_h + gap)
        draw.text((6, y + cell_h // 2 - 6), name, fill=(255, 255, 255, 255))
        for strip, bg in enumerate((LIGHT_BG, DARK_BG)):
            for c, g in enumerate(frames):
                x = label_w + strip * (strip_w + gap) + c * (cell_w + gap)
                tile = upscale(on_background(render(g, palette), bg), scale)
                sheet.paste(tile, (x, y))
    return sheet


def save_gif(frames, palette: dict[str, str], path, scale: int = 8, durations=150, bg: str = LIGHT_BG):
    """Salva un'animazione GIF (su sfondo pieno: la trasparenza GIF è scadente)."""
    imgs = [upscale(on_background(render(g, palette), bg), scale).convert("P", palette=Image.ADAPTIVE)
            for g in frames]
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=durations, loop=0, disposal=2)


# ---------------------------------------------------------------- pacchetto

def _compact_json(data) -> str:
    """JSON leggibile con le liste di numeri su una riga sola."""
    text = json.dumps(data, ensure_ascii=False, indent=2)
    return re.sub(r"\[\s+([\d,\s]+?)\s+\]", lambda m: "[" + re.sub(r"\s+", " ", m.group(1)).replace(" ,", ",") + "]", text)


def build_pack(out_dir, *, meta: dict, palette: dict[str, str], animations: dict,
               frame_w: int, frame_h: int, preview_dir=None) -> dict:
    """Scrive un pacchetto personaggio `mascotte-pack/1`.

    animations: {stato: {"frames": [griglie], "sequence": [colonne]?, "fps": n?,
                          "durations": [ms]?, "loop": bool?}}
    Ogni stato occupa una riga del foglio sprite, nell'ordine del dizionario.
    `sequence` permette di ripetere o tenere fotogrammi senza duplicarli.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cols = max(len(a["frames"]) for a in animations.values())
    sheet = Image.new("RGBA", (cols * frame_w, len(animations) * frame_h), (0, 0, 0, 0))
    entries = {}
    for row, (state, anim) in enumerate(animations.items()):
        for col, g in enumerate(anim["frames"]):
            if dims(g) != (frame_w, frame_h):
                raise ValueError(f"{state}[{col}]: misura {dims(g)}, attesa {(frame_w, frame_h)}")
            sheet.paste(render(g, palette), (col * frame_w, row * frame_h))
        seq = anim.get("sequence")
        if seq is not None and any(not 0 <= i < len(anim["frames"]) for i in seq):
            raise ValueError(f"{state}: sequence punta a fotogrammi inesistenti")
        entry = {"row": row, "frames": seq if seq is not None else len(anim["frames"]), "fps": anim.get("fps", 8)}
        if "durations" in anim:
            entry["durations"] = anim["durations"]
        if not anim.get("loop", True):
            entry["loop"] = False
        entries[state] = entry
    sheet.save(out_dir / "sprites.png")
    character = {"format": "mascotte-pack/1", **meta, "sheet": "sprites.png",
                 "frame": {"width": frame_w, "height": frame_h}, "animations": entries}
    (out_dir / "character.json").write_text(_compact_json(character) + "\n", encoding="utf-8")
    if preview_dir is not None:
        preview_dir = Path(preview_dir)
        preview_dir.mkdir(parents=True, exist_ok=True)
        contact_sheet([(s, a["frames"]) for s, a in animations.items()], palette).save(preview_dir / "contact.png")
        for state, anim in animations.items():
            seq = anim.get("sequence") or list(range(len(anim["frames"])))
            frames = [anim["frames"][i] for i in seq]
            dur = anim.get("durations") or round(1000 / anim.get("fps", 8))
            save_gif(frames, palette, preview_dir / f"{state}.gif", durations=dur)
    return character
