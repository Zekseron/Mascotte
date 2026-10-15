import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('prepare_integration', ROOT / 'tools/prepare_integration.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class PrepareTests(unittest.TestCase):
    def test_clean_account_without_notify(self):
        _, result, plan = prepare.prepare('{}', '[features]\nhooks = true\n', Path('/repo/notify'))
        self.assertTrue(result.startswith('notify = '))
        self.assertEqual(plan['previous_notify'], [])
        self.assertNotIn('--forward-command', plan['codex_notify'])
        self.assertIn('[features]\nhooks = true', result)

    def test_preserves_existing_values_and_notify_with_spaces(self):
        original = {'env': {'CUSTOM': 'keep-me'}, 'permissions': {'allow': ['Read']},
                    'hooks': {'SessionStart': [{'hooks': [{'type': 'command', 'command': 'existing-hook'}]}],
                              'Stop': [{'hooks': [{'type': 'command', 'command': 'existing-stop'}]}]}}
        codex = 'notify = ["/path with spaces/helper", "turn-ended"]\n\n[features]\nhooks = true\n'
        claude, result, plan = prepare.prepare(json.dumps(original, indent=2), codex, Path('/repo with spaces/tools/mascotte-notify'))
        parsed = json.loads(claude)
        self.assertEqual(parsed['env'], original['env'])
        self.assertEqual(parsed['permissions'], original['permissions'])
        self.assertEqual(parsed['hooks']['SessionStart'], original['hooks']['SessionStart'])
        self.assertEqual(parsed['hooks']['Stop'][0], original['hooks']['Stop'][0])
        self.assertEqual(len(parsed['hooks']['Stop']), 2)
        self.assertEqual(plan['previous_notify'], ['/path with spaces/helper', 'turn-ended'])
        self.assertEqual(json.loads(plan['codex_notify'][-1]), plan['previous_notify'])
        self.assertIn("'/repo with spaces/tools/mascotte-notify'", result)
        self.assertIn('[features]\nhooks = true', result)

    def test_absent_hooks_property_is_added_without_changing_other_bytes(self):
        text = '{ "permissions": {"allow": ["Read"]} }\n'
        result, _, _ = prepare.prepare(text, 'notify = ["helper"]\n', Path('/repo/notify'))
        self.assertEqual(json.loads(result)['permissions'], json.loads(text)['permissions'])
        self.assertTrue(result.startswith('{ "permissions": {"allow": ["Read"]}'))
        empty, _, _ = prepare.prepare('{}', 'notify = ["helper"]\n', Path('/repo/notify'))
        self.assertIn('hooks', json.loads(empty))

    def test_refuses_duplicate_installation(self):
        claude, codex, _ = prepare.prepare('{"hooks": {}}', 'notify = ["helper"]\n', Path('/repo/notify'))
        with self.assertRaises(ValueError):
            prepare.prepare(claude, codex, Path('/repo/notify'))


if __name__ == '__main__': unittest.main()
