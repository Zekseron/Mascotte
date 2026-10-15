#!/usr/bin/env python3
"""Prepara patch delle configurazioni; non le applica e non copia credenziali."""
import argparse
import ast
import difflib
import hashlib
import json
from pathlib import Path
import re
import shlex

ROOT = Path(__file__).resolve().parents[1]


def replace_top_value(text, wanted, replacement):
    decoder = json.JSONDecoder()
    pos = text.index('{') + 1
    while True:
        while text[pos].isspace() or text[pos] == ',':
            pos += 1
        if text[pos] == '}':
            raise ValueError('Campo ' + wanted + ' assente')
        key, pos = decoder.raw_decode(text, pos)
        while text[pos].isspace(): pos += 1
        if text[pos] != ':': raise ValueError('JSON non valido')
        pos += 1
        while text[pos].isspace(): pos += 1
        _, end = decoder.raw_decode(text, pos)
        if key == wanted:
            pretty = json.dumps(replacement, ensure_ascii=False, indent=2)
            pretty = pretty.replace('\n', '\n  ')
            return text[:pos] + pretty + text[end:]
        pos = end


def prepare(claude_text, codex_text, script):
    command_claude = '/usr/bin/python3 ' + shlex.quote(str(script)) + ' --claude-hook'
    command_codex = '/usr/bin/python3 ' + shlex.quote(str(script)) + ' --codex-hook'
    additions = {}
    for name in ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop']:
        entry = {'hooks': [{'type': 'command', 'command': command_claude, 'timeout': 1}]}
        if name in {'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'}:
            entry['matcher'] = '.*'
        elif name == 'Notification':
            entry['matcher'] = 'permission_prompt|idle_prompt|elicitation_dialog'
        additions[name] = [entry]
    claude = json.loads(claude_text)
    hooks = claude.get('hooks', {})
    if not isinstance(hooks, dict): raise ValueError('hooks Claude non è un oggetto')
    if str(script) in json.dumps(hooks): raise ValueError('Hook Mascotte già presente in Claude')
    merged = dict(hooks)
    for name, entries in additions.items():
        merged[name] = list(merged.get(name, [])) + entries
    if 'hooks' in claude:
        new_claude = replace_top_value(claude_text, 'hooks', merged)
    else:
        # Inserisce soltanto la nuova proprietà, preservando gli altri byte.
        end = claude_text.rfind('}')
        prefix = claude_text[:end].rstrip()
        new_claude = prefix + (',' if claude else '') + '\n  "hooks": ' + json.dumps(merged, ensure_ascii=False, indent=2).replace('\n', '\n  ') + '\n' + claude_text[end:]
    match = re.search(r'(?m)^notify\s*=\s*(\[.*\])\s*$', codex_text)
    if not match and re.search(r'(?m)^notify\s*=', codex_text):
        raise ValueError('notify Codex su più righe: occorre una proposta dedicata')
    previous = ast.literal_eval(match.group(1)) if match else []
    if not isinstance(previous, list) or not all(isinstance(v, str) for v in previous):
        raise ValueError('notify Codex deve essere un array di comandi')
    if str(script) in codex_text: raise ValueError('Hook Mascotte già presente in Codex')
    notify = ['/usr/bin/python3', str(script), '--codex-notify']
    if previous: notify += ['--forward-command', json.dumps(previous, ensure_ascii=False)]
    line = 'notify = ' + json.dumps(notify, ensure_ascii=False) + '\n'
    new_codex = codex_text[:match.start()] + line + codex_text[match.end():] if match else line + codex_text
    entries = []
    for name in ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Interrupt']:
        entries += ['[[hooks.' + name + ']]']
        if name in {'PreToolUse', 'PostToolUse', 'PermissionRequest'}: entries += ['matcher = ".*"']
        entries += ['', '[[hooks.' + name + '.hooks]]', 'type = "command"',
                    'command = ' + json.dumps(command_codex, ensure_ascii=False), 'timeout = 1', '']
    new_codex += '\n# Mascotte: reazioni locali, nessun output nel contesto.\n' + '\n'.join(entries)
    return new_claude, new_codex, {'claude_hooks': additions, 'codex_notify': notify, 'previous_notify': previous}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--claude', type=Path, default=Path.home() / '.claude/settings.json')
    parser.add_argument('--codex', type=Path, default=Path.home() / '.codex/config.toml')
    parser.add_argument('--output', type=Path, default=ROOT / 'work/integration')
    args = parser.parse_args()
    before_claude, before_codex = args.claude.read_text(), args.codex.read_text()
    after_claude, after_codex, plan = prepare(before_claude, before_codex, ROOT / 'tools/mascotte-notify')
    args.output.mkdir(parents=True, exist_ok=True)
    for label, path, before, after in [('claude-settings', args.claude, before_claude, after_claude), ('codex-config', args.codex, before_codex, after_codex)]:
        patch = ''.join(difflib.unified_diff(before.splitlines(keepends=True), after.splitlines(keepends=True),
                                           fromfile=str(path), tofile=str(path), n=0))
        (args.output / (label + '.patch')).write_text(patch)
        plan[label] = {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    (args.output / 'plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')
    print('Patch da approvare:', args.output)
    print('Configurazioni originali non modificate.')


if __name__ == '__main__': main()
