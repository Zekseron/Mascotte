#!/usr/bin/env python3
"""Verifica il contenuto rispetto al manifest, senza rete né account."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
expected = manifest['files']
actual = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and p.name != 'manifest.json'}
errors = []
for name, record in expected.items():
    p = root / name
    if p.is_symlink() or not p.is_file() or root not in p.resolve().parents:
        errors.append('File mancante o link: ' + name)
    elif p.stat().st_size != record['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest() != record['sha256']:
        errors.append('Contenuto diverso: ' + name)
for name in sorted(actual - expected.keys()): errors.append('File extra: ' + name)
if errors:
    print('\n'.join(errors))
    sys.exit(1)
print('Integrità OK:', len(expected), 'file; versione', manifest['version'])
