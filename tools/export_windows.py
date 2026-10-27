#!/usr/bin/env python3
"""Copia la build Windows e le guide nello spazio condivisibile, senza HOME."""
from pathlib import Path
import hashlib
import json
import shutil
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
version = json.loads((ROOT / 'windows/package.json').read_text())['version']
name = 'Mascotte-Windows-' + version + '-x64.zip'
source = ROOT / 'windows/dist' / name
installer_name = 'Mascotte-Setup-' + version + '-x64.exe'
installer_source = ROOT / 'windows/dist' / installer_name
destination = ROOT / 'esportabile/Windows'
destination.mkdir(parents=True, exist_ok=True)
target = destination / name
installer_target = destination / installer_name
sources = destination / ('Mascotte-Windows-' + version + '-sorgenti.zip')
if not source.is_file() or not installer_source.is_file():
    raise SystemExit('ZIP e installer Windows mancanti: esegui prima npm run build:win.')
if any(item.exists() for item in (target, installer_target, sources)):
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
shutil.copyfile(installer_source, installer_target)
with installer_target.open('rb') as handle:
    sha = hashlib.sha256()
    for data in iter(lambda: handle.read(1048576), b''): sha.update(data)
(destination / (installer_name + '.sha256')).write_text(sha.hexdigest() + '  ' + installer_name + '\n')
print('Installer:', installer_target)

with zipfile.ZipFile(sources, 'w', zipfile.ZIP_DEFLATED) as output:
    for directory in ['windows/lib', 'windows/renderer', 'windows/scripts', 'windows/test', 'characters', 'characters-src', 'spec', 'viewer']:
        for file in sorted((ROOT / directory).rglob('*')):
            if file.is_file() and not file.is_symlink() and '__pycache__' not in file.parts and 'node_modules' not in file.parts and file.suffix in {'.cjs', '.js', '.css', '.html', '.json', '.py', '.ps1', '.png', '.md'}:
                output.write(file, file.relative_to(ROOT).as_posix())
    for name in ['windows/main.cjs', 'windows/preload.cjs', 'windows/package.json', 'windows/package-lock.json', 'windows/README.md', 'windows/PROVA-STASERA.md', 'tools/export_windows.py', 'tools/build_all.py', 'tools/pixelkit.py', '.github/workflows/windows-release.yml']:
        output.write(ROOT / name, name)
print('Sorgenti:', sources)
