"""python3 -m unittest discover -s tools/test -v
Con MASCOTTE_TEST_BINARY, controlla anche il server Swift vero (senza GUI).
"""
import http.client
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import select
import socket
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'tools/mascotte-notify'
loader = importlib.machinery.SourceFileLoader('mascotte_notify', str(SCRIPT))
spec = importlib.util.spec_from_loader(loader.name, loader)
notify = importlib.util.module_from_spec(spec)
loader.exec_module(notify)


class NotifyTests(unittest.TestCase):
    def run_hook(self, *args, payload='', endpoint='/tmp/mascotte-nonexistent-review-endpoint'):
        return subprocess.run([sys.executable, str(SCRIPT), *args], input=payload.encode(),
            env=dict(os.environ, MASCOTTE_EVENT_FILE=str(endpoint)), capture_output=True, timeout=3)

    def assert_quiet(self, result):
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b'')
        self.assertEqual(result.stderr, b'')

    def test_mapping(self):
        for tool, state in [('Read', 'reading'), ('Bash', 'running'), ('apply_patch', 'writing'),
                            ('mcp__drive__list_files', 'reading'), ('mcp__drive__update_file', 'writing'),
                            ('Agent', 'working')]:
            self.assertEqual(notify.hook_state({'hook_event_name': 'PreToolUse', 'tool_name': tool}), state)
        self.assertEqual(notify.hook_state({'hook_event_name': 'PermissionRequest'}), 'waiting')
        self.assertEqual(notify.hook_state({'hook_event_name': 'PostToolUseFailure'}), 'error')
        self.assertEqual(notify.hook_state({'hook_event_name': 'PostToolUse', 'tool_response': {'exit_code': 1}}), 'error')
        self.assertEqual(notify.hook_state({'hook_event_name': 'PostToolUse', 'tool_response': {'isError': True}}), 'error')
        self.assertEqual(notify.hook_state({'hook_event_name': 'PostToolUse', 'tool_response': {'exit_code': 0}}), 'thinking')
        self.assertIsNone(notify.hook_state({'hook_event_name': 'Notification', 'notification_type': 'auth_success'}))
        self.assertIsNone(notify.hook_state({'hook_event_name': 'PostToolUseFailure', 'is_interrupt': True}))

    def test_missing_app_invalid_and_oversize_inputs_are_quiet(self):
        for payload in ['', '{broken', '[]', 'x' * 65537, '{"hook_event_name":"Stop"}']:
            self.assert_quiet(self.run_hook('--claude-hook', payload=payload))
        self.assert_quiet(self.run_hook('--bad-option'))
        self.assert_quiet(self.run_hook('--state', 'done'))

    def test_stdin_that_stays_open_has_deadline(self):
        process = subprocess.Popen([sys.executable, str(SCRIPT), '--claude-hook'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            started = time.monotonic()
            process.wait(timeout=1)
            self.assertLess(time.monotonic() - started, 0.8)
            self.assertEqual(process.stdout.read(), b'')
            self.assertEqual(process.stderr.read(), b'')
            self.assertEqual(process.returncode, 0)
        finally:
            process.stdin.close(); process.stdout.close(); process.stderr.close()
            if process.poll() is None: process.kill()

    def test_forward_preserves_argument_even_when_app_or_json_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'forwarded.json'
            command = [sys.executable, '-c', 'import pathlib,sys;pathlib.Path(sys.argv[1]).write_text(sys.argv[2])', str(path)]
            for payload in ['{"type":"agent-turn-complete","last-assistant-message":"private"}', '{broken']:
                self.assert_quiet(self.run_hook('--codex-notify', '--forward-command', json.dumps(command), payload))
                self.assertEqual(path.read_text(), payload)


@unittest.skipUnless(os.environ.get('MASCOTTE_TEST_BINARY'), 'MASCOTTE_TEST_BINARY non impostato')
class ServerTests(unittest.TestCase):
    run_hook = NotifyTests.run_hook
    assert_quiet = NotifyTests.assert_quiet
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.endpoint = Path(cls.temporary.name) / 'events.json'
        cls.server = subprocess.Popen([os.environ['MASCOTTE_TEST_BINARY'], '--event-server-test', str(cls.endpoint)],
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        deadline = time.monotonic() + 5
        while not cls.endpoint.exists() and time.monotonic() < deadline and cls.server.poll() is None:
            time.sleep(0.02)
        if not cls.endpoint.exists():
            cls.server.terminate(); cls.server.wait(timeout=2)
            raise RuntimeError('Server non pronto: ' + cls.server.stderr.read().decode())
        cls.credentials = json.loads(cls.endpoint.read_text())

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate(); cls.server.wait(timeout=2)
        cls.server.stdout.close(); cls.server.stderr.close()
        removed = not cls.endpoint.exists()
        cls.temporary.cleanup()
        if not removed:
            raise AssertionError('Endpoint non rimosso allo stop')

    def request(self, body, token=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.credentials['port'], timeout=2)
        try:
            connection.request('POST', '/event', body, dict({'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (self.credentials['token'] if token is None else token)}, **(headers or {})))
            response = connection.getresponse()
            response.read()
            return response.status
        finally:
            connection.close()

    def test_endpoint_permissions_and_bad_requests(self):
        self.assertEqual(self.endpoint.stat().st_mode & 0o777, 0o600)
        body = '{"state":"idle","source":"manual"}'
        self.assertEqual(self.request(body, token='wrong'), 401)
        self.assertEqual(self.request(body, headers={'Origin': 'http://example.test'}), 403)
        self.assertEqual(self.request('{"state":"unknown","source":"manual"}'), 400)
        self.assertEqual(self.request('{"state":"idle","source":"manual","prompt":"private"}'), 400)
        self.assertEqual(self.request('x' * 513), 413)

    def test_hook_reaches_swift_server_without_private_fields(self):
        self.assert_quiet(self.run_hook('--claude-hook', payload=json.dumps({
            'hook_event_name': 'PreToolUse', 'tool_name': 'Read',
            'prompt': 'private', 'tool_input': {'file_path': '/private/example'}}), endpoint=self.endpoint))
        self.assertTrue(select.select([self.server.stdout], [], [], 2)[0])
        self.assertEqual(json.loads(self.server.stdout.readline()), {'state': 'reading', 'source': 'claude'})
        self.assert_quiet(self.run_hook('--codex-notify', '{"type":"agent-turn-complete"}', endpoint=self.endpoint))
        self.assertTrue(select.select([self.server.stdout], [], [], 2)[0])
        self.assertEqual(json.loads(self.server.stdout.readline()), {'state': 'done', 'source': 'codex'})

    def test_split_request_and_slow_connection(self):
        body = b'{"state":"working","source":"manual"}'
        header = ('POST /event HTTP/1.1\r\nContent-Type: application/json\r\nAuthorization: Bearer ' +
                  self.credentials['token'] + '\r\nContent-Length: ' + str(len(body)) + '\r\n\r\n').encode()
        with socket.create_connection(('127.0.0.1', self.credentials['port']), timeout=2) as connection:
            connection.sendall(header + body[:4]); time.sleep(0.02); connection.sendall(body[4:])
            self.assertIn(b'204', connection.recv(512))
        self.assertTrue(select.select([self.server.stdout], [], [], 2)[0])
        self.assertEqual(json.loads(self.server.stdout.readline())['state'], 'working')
        with socket.create_connection(('127.0.0.1', self.credentials['port']), timeout=2) as connection:
            connection.sendall(b'POST ')
            self.assertEqual(connection.recv(512), b'')


if __name__ == '__main__':
    unittest.main()
