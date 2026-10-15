#!/usr/bin/python3
"""CLI simulata per i test della micro chat: non contatta nessuna IA."""
import json
import os
from pathlib import Path
import sys
import time

scenario = os.environ.get('MASCOTTE_CHAT_SCENARIO', 'success')
if scenario == 'early-exit':
    print('Accesso non disponibile', file=sys.stderr)
    sys.exit(3)
if scenario == 'slow':
    time.sleep(30)
prompt = sys.stdin.read()
if os.environ.get('MASCOTTE_CHAT_CAPTURE'):
    Path(os.environ['MASCOTTE_CHAT_CAPTURE']).write_text(json.dumps({'arguments': sys.argv[1:], 'input': prompt}))
if scenario == 'oversize':
    sys.stdout.write('x' * 2097153 + '\n')
    sys.stdout.flush()
    time.sleep(30)
    sys.exit(0)
session = '00000000-0000-0000-0000-000000000001'
reply = 'Risposta di prova: ' + prompt
if '--print' in sys.argv:
    print(json.dumps({'type': 'result', 'is_error': False, 'session_id': session, 'result': reply}))
else:
    for event in [{'type': 'thread.started', 'thread_id': session},
                  {'type': 'item.completed', 'item': {'type': 'agent_message', 'text': reply}},
                  {'type': 'turn.completed'}]:
        print(json.dumps(event), flush=True)
