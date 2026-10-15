#!/usr/bin/env python3
"""Esporta solo file autorizzati della repo; mai configurazioni del computer."""
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import stat
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'esportabile'
APP = ROOT / 'app/build.noindex/Mascotte.app'
SUFFIXES = {'.swift', '.py', '.sh', '.md', '.json', '.png', '.html', '.css', '.js', '.cjs'}
TREES = ['app/Sources', 'app/scripts', 'characters', 'characters-src', 'spec', 'viewer', 'tools/test', 'distribuzione']
FILES = ['app/Package.swift', 'app/README.md', 'README.md', 'DESIGN.md', 'tools/README.md',
         'tools/mascotte-notify', 'tools/prepare_integration.py', 'tools/pixelkit.py', 'tools/build_all.py',
         'tools/export_package.py']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy_file(source, target):
    if source.is_symlink() or not source.is_file():
        raise ValueError('File non regolare: ' + str(source.relative_to(ROOT)))
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    target.chmod(0o755 if source.stat().st_mode & 0o111 else 0o644)


def main():
    if not APP.is_dir():
        raise ValueError('Prima compila: bash app/scripts/bundle.sh')
    info = plistlib.loads((APP / 'Contents/Info.plist').read_bytes())
    version = info['CFBundleShortVersionString']
    if any(c not in '0123456789.' for c in version): raise ValueError('Versione non valida')
    arch = subprocess.check_output(['/usr/bin/lipo', '-archs', str(APP / 'Contents/MacOS/Mascotte')], text=True).strip()
    if arch not in {'arm64', 'x86_64'}: raise ValueError('Architettura non gestita: ' + arch)
    subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(APP)], check=True)
    # Il bundle deve contenere gli asset correnti, non quelli di una build precedente.
    resource = APP / 'Contents/Resources'
    for directory in ['characters', 'spec']:
        for source in (ROOT / directory).rglob('*'):
            if source.is_file() and source.suffix in {'.json', '.png'}:
                bundled = resource / (source.relative_to(ROOT) if directory == 'characters' else source.name)
                if not bundled.is_file() or digest(source) != digest(bundled):
                    raise ValueError('Bundle non aggiornato: ' + source.relative_to(ROOT).as_posix())
    OUT.mkdir(exist_ok=True)
    name = 'Mascotte-' + version
    destination = OUT / name
    archive = OUT / (name + '.zip')
    # Non sovrascrivere una cartella che il destinatario potrebbe aver configurato.
    if destination.exists() or archive.exists():
        raise ValueError('Esportazione già presente: spostala o rinominala prima di rigenerare.')
    with tempfile.TemporaryDirectory(prefix='.export-', dir=OUT) as tmp:
        package = Path(tmp) / name
        package.mkdir()
        for namefile in FILES:
            copy_file(ROOT / namefile, package / namefile)
        for tree in TREES:
            for source in sorted((ROOT / tree).rglob('*')):
                if '__pycache__' in source.parts or 'node_modules' in source.parts or source.name == '.DS_Store': continue
                if source.is_file() and source.suffix in SUFFIXES:
                    copy_file(source, package / source.relative_to(ROOT))
        for source in (ROOT / 'distribuzione').iterdir():
            if source.is_file() and source.suffix in {'.md', '.py'}:
                copy_file(source, package / source.name)
        for source in APP.rglob('*'):
            if source.name == '.DS_Store': continue
            if source.is_file():
                copy_file(source, package / ('macOS-' + arch) / 'Mascotte.app' / source.relative_to(APP))
        # Nessuna lettura di HOME, credenziali, cronologie o config del creatore.
        records = {}
        for path in sorted(package.rglob('*')):
            if path.is_file():
                records[path.relative_to(package).as_posix()] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
        manifest = {'format': 'mascotte-export/1', 'version': version, 'macos_architecture': arch,
                    'windows_desktop_app': False, 'files': records}
        (package / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        subprocess.run([os.sys.executable, str(package / 'verifica-pacchetto.py')], check=True)
        zippath = Path(tmp) / archive.name
        with zipfile.ZipFile(zippath, 'w', zipfile.ZIP_DEFLATED) as zipped:
            for path in sorted(package.rglob('*')):
                if path.is_file():
                    entry = zipfile.ZipInfo((Path(name) / path.relative_to(package)).as_posix())
                    entry.create_system = 3
                    entry.external_attr = (stat.S_IFREG | stat.S_IMODE(path.stat().st_mode)) << 16
                    entry.compress_type = zipfile.ZIP_DEFLATED
                    zipped.writestr(entry, path.read_bytes())
        package.rename(destination)
        zippath.rename(archive)
    print('Cartella:', destination)
    print('Da condividere:', archive)
    print('ZIP SHA-256:', digest(archive))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit('Esportazione non completata: ' + str(error))
