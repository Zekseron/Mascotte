#!/usr/bin/env python3
"""Copia la build Windows e le guide nello spazio condivisibile, senza HOME."""
from pathlib import Path
import hashlib
import json
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
version = json.loads((ROOT / 'windows/package.json').read_text())['version']
name = 'Mascotte-Windows-' + version + '-x64.zip'
source = ROOT / 'windows/dist' / name
destination = ROOT / 'esportabile/Windows'
destination.mkdir(parents=True, exist_ok=True)
target = destination / name
if target.exists():
    raise SystemExit('Pacchetto Windows già presente: spostalo prima di rigenerare.')
with zipfile.ZipFile(source) as original, zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as output:
    if original.testzip() is not None:
        raise SystemExit('ZIP della build danneggiato.')
    exe = original.read('Mascotte.exe')
    pe = struct.unpack_from('<I', exe, 0x3c)[0]
    assert exe[:2] == b'MZ' and exe[pe:pe + 4] == b'PE\0\0' and struct.unpack_from('<H', exe, pe + 4)[0] == 0x8664
    for entry in original.infolist():
        if entry.is_dir(): continue
        with original.open(entry) as inp, output.open(entry, 'w') as out:
            while True:
                data = inp.read(1048576)
                if not data: break
                out.write(data)
    output.writestr('LEGGIMI-WINDOWS.md', (ROOT / 'windows/README.md').read_bytes())
    output.writestr('PROVA-STASERA.md', (ROOT / 'windows/PROVA-STASERA.md').read_bytes())
for doc in ['README.md', 'PROVA-STASERA.md']:
    (destination / ('LEGGIMI-WINDOWS.md' if doc == 'README.md' else doc)).write_bytes((ROOT / 'windows' / doc).read_bytes())
with target.open('rb') as handle:
    sha = hashlib.sha256()
    for data in iter(lambda: handle.read(1048576), b''): sha.update(data)
(destination / (name + '.sha256')).write_text(sha.hexdigest() + '  ' + name + '\n')
print('Build PE Windows x64 verificata. ZIP:', target)
print('SHA-256:', sha.hexdigest())

sources = destination / ('Mascotte-Windows-' + version + '-sorgenti.zip')
if sources.exists(): raise SystemExit('ZIP sorgenti già presente.')
with zipfile.ZipFile(sources, 'w', zipfile.ZIP_DEFLATED) as output:
    for directory in ['windows/lib', 'windows/renderer', 'windows/scripts', 'windows/test', 'characters', 'characters-src', 'spec', 'viewer']:
        for file in sorted((ROOT / directory).rglob('*')):
            if file.is_file() and not file.is_symlink() and '__pycache__' not in file.parts and 'node_modules' not in file.parts and file.suffix in {'.cjs', '.js', '.css', '.html', '.json', '.py', '.ps1', '.png', '.md'}:
                output.write(file, file.relative_to(ROOT).as_posix())
    for name in ['windows/main.cjs', 'windows/preload.cjs', 'windows/package.json', 'windows/package-lock.json', 'windows/README.md', 'windows/PROVA-STASERA.md', 'tools/export_windows.py', 'tools/build_all.py', 'tools/pixelkit.py']:
        output.write(ROOT / name, name)
print('Sorgenti:', sources)
