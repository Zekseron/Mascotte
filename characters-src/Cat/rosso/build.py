"""Costruisce il pacchetto di Rosso (mascotte-pack/1) e le sue anteprime.

    python3 characters-src/Cat/rosso/build.py

scrive ROOT/characters/Cat/rosso/{character.json,sprites.png} e, in
ROOT/work/previews/rosso/, contact.png e una GIF per stato.
Da tools/build_all.py viene chiamata build(out_root, preview_root).
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
ROOT = _HERE.parents[2]
if str(ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(ROOT / "tools"))

from pixelkit import build_pack  # noqa: E402


def _load_sibling(name: str, filename: str):
    """Carica un file di questa cartella con un nome univoco (vedi animations.py)."""
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, _HERE / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def build(out_root, preview_root) -> dict:
    parts = _load_sibling("rosso_parts", "parts.py")
    anim = _load_sibling("rosso_animations", "animations.py")

    # controlli sul disegno: nessun pacchetto con pixel sporchi o contorni aperti
    for state, a in anim.ANIMATIONS.items():
        if len(a["frames"]) > 6:
            raise ValueError(f"{state}: piu' di 6 fotogrammi distinti")
        for i, frame in enumerate(a["frames"]):
            problems = parts.frame_problems(frame)
            if problems:
                raise ValueError(f"{state}[{i}]: {problems[:3]}")

    # il fumetto parte da sopra il centro della testa nella posa base:
    # asse tra le colonne 15 e 16 (x = 16), punte delle orecchie sulla riga 8
    meta = {"id": "rosso", "name": "Rosso", "author": "Mascotte", "scale": 4,
            "bubble": {"x": 16, "y": 7}}
    return build_pack(Path(out_root) / "Cat" / "rosso", meta=meta, palette=parts.PALETTE,
                      animations=anim.ANIMATIONS, frame_w=parts.W, frame_h=parts.H,
                      preview_dir=Path(preview_root) / "rosso")


if __name__ == "__main__":
    build(ROOT / "characters", ROOT / "work" / "previews")
    print("ok: characters/Cat/rosso e work/previews/rosso")
