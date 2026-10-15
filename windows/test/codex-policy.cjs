'use strict';
// Verifica gli strumenti offerti dalla CLI reale contro un server finto locale.
// Nessun login, modello remoto o lettura di credenziali: CODEX_HOME temporaneo.
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { findCLI, argumentsFor, runCLI } = require('../lib/cli.cjs');
async function main() {
  const command = findCLI('codex');
  if (!command) throw new Error('Installa Codex per questa verifica opzionale.');
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mascotte policy '));
  let tools, authorization;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', data => { body += data; if (body.length > 1048576) req.destroy(); });
    req.on('end', () => {
      if (req.url.includes('responses')) {
        tools = JSON.parse(body).tools || []; authorization = req.headers.authorization;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Fine della verifica locale intenzionale', type: 'invalid_request_error' } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/v1';
  const extra = ['-m', 'mock-model', '-c', 'model_provider="mascotte_mock"', '-c', 'model_providers.mascotte_mock.name="Mascotte mock"',
    '-c', 'model_providers.mascotte_mock.base_url=' + JSON.stringify(url), '-c', 'model_providers.mascotte_mock.wire_api="responses"',
    '-c', 'model_providers.mascotte_mock.requires_openai_auth=false'];
  command.env = { ...command.env, CODEX_HOME: directory };
  try {
    const output = await runCLI(command, [...argumentsFor('codex').slice(0, -1), ...extra, '-'], 'Prova locale.', directory, 20000).promise;
    if (!tools) throw new Error('Nessuna richiesta al mock: ' + output.stderr.slice(-1200));
    const names = tools.map(t => t.name || t.type);
    if (authorization) throw new Error('Autenticazione inattesa nel mock.');
    const forbidden = names.filter(n => !['update_plan', 'request_user_input'].includes(n));
    if (forbidden.length) throw new Error('Strumenti non consentiti ancora offerti: ' + forbidden.join(', '));
    console.log('Policy Codex verificata con CLI reale e backend finto. Strumenti:', names.join(', ') || 'nessuno');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
