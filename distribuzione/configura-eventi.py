#!/usr/bin/env python3
"""Configurazione locale macOS. Default: anteprima; --apply salva con backup."""
import argparse
import difflib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent
if not (ROOT / 'tools/prepare_integration.py').exists():
    ROOT = ROOT.parent
spec = importlib.util.spec_from_file_location('prepare', ROOT / 'tools/prepare_integration.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def read_config(path, default):
    if path.is_symlink():
        raise ValueError('Configurazione simbolica: configura manualmente gli hook.')
    return path.read_text() if path.exists() else default


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Applica agli account locali, conservando backup')
    parser.add_argument('--claude', type=Path, default=Path.home() / '.claude/settings.json')
    parser.add_argument('--codex', type=Path, default=Path.home() / '.codex/config.toml')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('Solo macOS: per Windows consulta WINDOWS.md. Nessuna modifica eseguita.')
    if args.claude.resolve() == args.codex.resolve():
        parser.error('I due file di configurazione devono essere distinti.')
    before = [read_config(args.claude, '{}\n'), read_config(args.codex, '')]
    after_claude, after_codex, _ = prepare.prepare(*before, ROOT / 'tools/mascotte-notify')
    after = [after_claude, after_codex]
    json.loads(after_claude)
    # Python 3.11 aggiunge la validazione TOML; Python 3.9 di macOS resta supportato.
    try:
        import tomllib
        tomllib.loads(after_codex)
    except ImportError:
        pass
    paths = [args.claude, args.codex]
    for path, old, new in zip(paths, before, after):
        print(''.join(difflib.unified_diff(old.splitlines(True), new.splitlines(True),
                                        fromfile=str(path), tofile=str(path))), end='')
    if not args.apply:
        print('\nSolo anteprima. Per applicare: python3 configura-eventi.py --apply')
        return
    # Ricontrolla entrambi prima di scrivere; nessuna autenticazione viene letta.
    for path, old, default in zip(paths, before, ['{}\n', '']):
        if read_config(path, default) != old:
            raise ValueError('Configurazione cambiata durante la preparazione: riprova.')
    stamp = time.strftime('%Y%m%d-%H%M%S') + '-' + str(os.getpid())
    backups = []
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            backup = path.with_name(path.name + '.before-mascotte-' + stamp)
            fd = os.open(str(backup), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as handle:
                handle.write(path.read_bytes())
            backups.append(backup)
    for path, text in zip(paths, after):
        fd, temporary = tempfile.mkstemp(prefix='.mascotte-', dir=path.parent)
        try:
            with os.fdopen(fd, 'w') as handle:
                handle.write(text)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
    print('\nHook applicati. Mantieni questa cartella nello stesso percorso.')
    print('Riapri le sessioni IA per caricare gli hook. Backup:')
    for path in backups: print(path)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, SyntaxError) as error:
        print('Configurazione non completata:', error, file=sys.stderr)
        sys.exit(1)
