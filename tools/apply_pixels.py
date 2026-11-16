"""Applica a un PNG RGBA un elenco di pixel ({"width": W, "edits": [[indice, r, g, b, a], ...]}) senza toccare gli altri.
Usato da tools/clear-holes.cjs. Salva con optimize=True come il generatore di Luma."""
import json
import sys
from PIL import Image

png, listing = sys.argv[1], sys.argv[2]
data = json.load(open(listing))
image = Image.open(png).convert('RGBA')
width = image.size[0]
if width != data['width']:
    raise SystemExit('larghezza diversa dal foglio')
pixels = image.load()
for index, r, g, b, a in data['edits']:
    pixels[index % width, index // width] = (r, g, b, a)
image.save(png, optimize=True)
print(f"{len(data['edits'])} pixel aggiornati in {png}")
