"""Ricostruisce tutti i personaggi e scrive characters/index.json.

    python3 tools/build_all.py            # tutti
    python3 tools/build_all.py rosso fumo # solo alcuni

Ogni personaggio ha la sua cartella in characters-src/<id>/ con un build.py
che espone build(out_root, preview_root). L'indice elenca i pacchetti
presenti in characters/, nell'ordine di ORDER e poi in ordine alfabetico.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "characters-src"
OUT = ROOT / "characters"
PREVIEWS = ROOT / "work" / "previews"

DEFAULT = "rosso"
ORDER = ["rosso", "fumo", "biscotto"]


def build_one(char_id: str) -> None:
    matches = [p for p in SRC.rglob('build.py') if p.parent.name == char_id]
    if len(matches) != 1: raise SystemExit(f'Sorgente non univoca o assente: {char_id}')
    path = matches[0]
    spec = importlib.util.spec_from_file_location(f"build_{char_id}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.build(OUT, PREVIEWS)
    print(f"✓ {char_id}")


def write_index() -> dict:
    packs = []
    for folder in sorted(p.parent for p in OUT.rglob('character.json')):
        data = json.loads((folder / "character.json").read_text(encoding="utf-8"))
        packs.append({"id": data.get("id", folder.name), "name": data["name"], "category":folder.parent.name, "path": folder.relative_to(OUT).as_posix()+'/'})
    rank = {cid: i for i, cid in enumerate(ORDER)}
    packs.sort(key=lambda p: (rank.get(p["id"], len(ORDER)), p["id"]))
    ids = [p["id"] for p in packs]
    index = {"format": "mascotte-index/1", "default": DEFAULT if DEFAULT in ids else ids[0], "characters": packs}
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return index


if __name__ == "__main__":
    wanted = sys.argv[1:] or sorted({p.parent.name for p in SRC.rglob('build.py')})
    for char_id in wanted:
        build_one(char_id)
    index = write_index()
    print("index.json:", ", ".join(p["id"] for p in index["characters"]), "· predefinito:", index["default"])
