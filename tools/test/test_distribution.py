import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'distribuzione/configura-eventi.py'
if not SCRIPT.exists(): SCRIPT = ROOT / 'configura-eventi.py'


@unittest.skipUnless(sys.platform == 'darwin', 'Configuratore per macOS')
class DistributionTests(unittest.TestCase):
    def configure(self, claude, codex, apply=False):
        return subprocess.run([sys.executable, str(SCRIPT), '--claude', str(claude),
                               '--codex', str(codex)] + (['--apply'] if apply else []),
                              capture_output=True, text=True, timeout=5)

    def test_clean_machine_preview_then_install(self):
        with tempfile.TemporaryDirectory(prefix='mascotte setup ') as folder:
            claude = Path(folder) / 'claude/settings.json'
            codex = Path(folder) / 'codex/config.toml'
            preview = self.configure(claude, codex)
            self.assertEqual(preview.returncode, 0, preview.stderr)
            self.assertFalse(claude.exists())
            self.assertFalse(codex.exists())
            installed = self.configure(claude, codex, True)
            self.assertEqual(installed.returncode, 0, installed.stderr)
            self.assertIn('hooks', json.loads(claude.read_text()))
            self.assertIn('notify = ', codex.read_text())
            self.assertEqual(claude.stat().st_mode & 0o777, 0o600)
            self.assertEqual(codex.stat().st_mode & 0o777, 0o600)
            old = [claude.read_bytes(), codex.read_bytes()]
            duplicate = self.configure(claude, codex, True)
            self.assertNotEqual(duplicate.returncode, 0)
            self.assertEqual([claude.read_bytes(), codex.read_bytes()], old)

    def test_existing_config_is_preserved_and_backed_up(self):
        with tempfile.TemporaryDirectory() as folder:
            claude = Path(folder) / 'settings.json'
            codex = Path(folder) / 'config.toml'
            before_claude = '{"permissions":{"allow":["Read"]},"hooks":{"SessionStart":[]}}\n'
            before_codex = 'notify = ["/tool with spaces/helper", "turn-ended"]\n[features]\nhooks = true\n'
            claude.write_text(before_claude)
            codex.write_text(before_codex)
            result = self.configure(claude, codex, True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(claude.read_text())['permissions'], {'allow': ['Read']})
            self.assertEqual(json.loads(claude.read_text())['hooks']['SessionStart'], [])
            backups = list(Path(folder).glob('*.before-mascotte-*'))
            self.assertEqual(len(backups), 2)
            self.assertEqual({p.read_text() for p in backups}, {before_claude, before_codex})
            self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in backups))


if __name__ == '__main__': unittest.main()
